import { NextResponse } from "next/server";
import type { ExchangeRateSnapshot } from "@/lib/exchangeRate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIG_URL = "https://mig.kz/";
const REQUEST_TIMEOUT_MS = 10_000;

const russianMonths: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11
};

function parseRateNumber(value: string) {
  const rate = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMigSourceUpdatedAt(text: string, fallback: string) {
  const match = text.match(/на\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);
  if (!match) return fallback;

  const day = Number(match[1]);
  const month = russianMonths[match[2].toLowerCase()];
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month === undefined || !day || !year || hour > 23 || minute > 59) return fallback;

  // Алматы использует UTC+05:00. Явный offset сохраняет время источника без
  // зависимости от региона выполнения Vercel Function.
  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : fallback;
}

function parseMigEurRate(html: string, checkedAt: string): ExchangeRateSnapshot {
  const text = htmlToText(html);
  const match = text.match(/(\d{2,4}(?:[.,]\d{1,4})?)\s+EUR\s+(\d{2,4}(?:[.,]\d{1,4})?)/i);
  if (!match) throw new Error("На mig.kz не найден курс EUR");

  const first = parseRateNumber(match[1]);
  const second = parseRateNumber(match[2]);
  if (!first || !second) throw new Error("mig.kz вернул некорректный курс EUR");

  const buy = Math.min(first, second);
  const sell = Math.max(first, second);

  return {
    currency: "EUR",
    baseCurrency: "KZT",
    rate: sell,
    buy,
    sell,
    rateType: "sell",
    source: "mig.kz",
    sourceUpdatedAt: parseMigSourceUpdatedAt(text, checkedAt),
    checkedAt
  };
}

async function fetchMigPage() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MIG_URL, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "User-Agent": "FinanceDiary/1.0"
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`mig.kz вернул HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const html = await fetchMigPage();
    const snapshot = parseMigEurRate(html, checkedAt);

    return NextResponse.json(snapshot, {
      headers: {
        // Курс запрашивается один раз в день клиентом, поэтому промежуточный edge-cache
        // не нужен: в 08:00 должен читаться фактический ответ mig.kz.
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Не удалось получить фактический курс EUR с mig.kz",
        details: error instanceof Error ? error.message : String(error),
        checkedAt
      },
      { status: 502 }
    );
  }
}
