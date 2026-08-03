"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Currency = "KZT" | "EUR";
type Country = "KZ" | "DE" | "OTHER";
type RowKind = "income" | "expense";
type Frequency = "monthly" | "quarterly" | "yearly" | "once";

type PlanRow = {
  id: string;
  kind: RowKind;
  title: string;
  country: Country;
  currency: Currency;
  amount: number;
  autoSource?: "partTimeNet" | "mainNet" | "";
  frequency: Frequency;
  startMonth: string;
  endMonth: string;
  active: boolean;
  group: string;
  comment?: string;
};

type MigrationPlan = {
  startMonth: string;
  months: number;
  baseCurrency: Currency;
  eurKzt: number;
  startBalanceKzt: number;
  startBalanceEur: number;
  grossPartTime: number;
  grossMain: number;
  kkAdditional: number;
  hasChildren: boolean;
  churchTax: boolean;
  rows: PlanRow[];
};

type MonthPlan = {
  month: string;
  incomeKzt: number;
  expenseKzt: number;
  netKzt: number;
  cumulativeKzt: number;
  incomeEur: number;
  expenseEur: number;
  netEur: number;
  cumulativeEur: number;
  byCountry: Record<Country, { incomeKzt: number; expenseKzt: number }>;
};

const supabase = createClient();

const countries: Record<Country, string> = {
  KZ: "Казахстан",
  DE: "Германия",
  OTHER: "Другое"
};

const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthIndex(m: string) {
  const [y, mm] = String(m || currentMonth()).split("-").map(Number);
  return y * 12 + (mm - 1);
}

function monthFromIndex(i: number) {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${pad(m)}`;
}

function addMonths(m: string, n: number) {
  return monthFromIndex(monthIndex(m) + n);
}

function monthLabel(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return `${monthNames[(mm || 1) - 1]} ${String(y).slice(2)}`;
}

function fmt(n: number, currency: Currency = "KZT") {
  const v = Math.round(Number(n || 0));
  const suffix = currency === "EUR" ? " €" : " ₸";
  return `${v.toLocaleString("ru-RU")}${suffix}`;
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultPlan(): MigrationPlan {
  const start = currentMonth();
  return {
    startMonth: start,
    months: 36,
    baseCurrency: "KZT",
    eurKzt: 650,
    startBalanceKzt: 0,
    startBalanceEur: 0,
    grossPartTime: 1300,
    grossMain: 4500,
    kkAdditional: 0.029,
    hasChildren: false,
    churchTax: false,
    rows: [
      {
        id: uuid(),
        kind: "income",
        title: "Зарплата / Казахстан",
        country: "KZ",
        currency: "KZT",
        amount: 720000,
        frequency: "monthly",
        startMonth: start,
        endMonth: "",
        active: true,
        group: "доход"
      },
      {
        id: uuid(),
        kind: "income",
        title: "Подработка / Германия",
        country: "DE",
        currency: "EUR",
        amount: 0,
        autoSource: "partTimeNet",
        frequency: "monthly",
        startMonth: addMonths(start, 8),
        endMonth: "",
        active: true,
        group: "доход"
      },
      {
        id: uuid(),
        kind: "income",
        title: "Основная работа / Германия",
        country: "DE",
        currency: "EUR",
        amount: 0,
        autoSource: "mainNet",
        frequency: "monthly",
        startMonth: addMonths(start, 12),
        endMonth: "",
        active: true,
        group: "доход"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Кредиты Казахстан",
        country: "KZ",
        currency: "KZT",
        amount: 404247,
        frequency: "monthly",
        startMonth: start,
        endMonth: "",
        active: true,
        group: "кредиты"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Аренда / жильё",
        country: "KZ",
        currency: "KZT",
        amount: 260000,
        frequency: "monthly",
        startMonth: start,
        endMonth: addMonths(start, 10),
        active: true,
        group: "жильё"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Питание Казахстан",
        country: "KZ",
        currency: "KZT",
        amount: 70000,
        frequency: "monthly",
        startMonth: start,
        endMonth: "",
        active: true,
        group: "питание"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Питание Германия",
        country: "DE",
        currency: "EUR",
        amount: 250,
        frequency: "monthly",
        startMonth: addMonths(start, 10),
        endMonth: "",
        active: true,
        group: "питание"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Транспорт Германия",
        country: "DE",
        currency: "EUR",
        amount: 80,
        frequency: "monthly",
        startMonth: addMonths(start, 10),
        endMonth: "",
        active: true,
        group: "транспорт"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Кошки",
        country: "KZ",
        currency: "KZT",
        amount: 60000,
        frequency: "monthly",
        startMonth: start,
        endMonth: "",
        active: true,
        group: "кошки"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Билеты",
        country: "DE",
        currency: "KZT",
        amount: 400000,
        frequency: "once",
        startMonth: addMonths(start, 10),
        endMonth: "",
        active: true,
        group: "переезд"
      }
    ]
  };
}

function rowApplies(row: PlanRow, month: string, planStart: string) {
  if (!row.active) return false;
  const startMonth = row.startMonth || planStart;
  if (monthIndex(month) < monthIndex(startMonth)) return false;
  if (row.endMonth && monthIndex(month) > monthIndex(row.endMonth)) return false;

  const diff = monthIndex(month) - monthIndex(startMonth);
  if (row.frequency === "once") return diff === 0;
  if (row.frequency === "monthly") return true;
  if (row.frequency === "quarterly") return diff % 3 === 0;
  if (row.frequency === "yearly") return diff % 12 === 0;
  return false;
}

function toKzt(amount: number, currency: Currency, eurKzt: number) {
  return currency === "EUR" ? amount * eurKzt : amount;
}

function toEur(amount: number, currency: Currency, eurKzt: number) {
  return currency === "EUR" ? amount : amount / eurKzt;
}

function calcGermanNet(gross: number, options: { kkAdditional: number; hasChildren: boolean; churchTax: boolean }) {
  const bbgRv = 8450;
  const bbgKv = 5812.5;
  const rv = Math.min(gross, bbgRv) * 0.093;
  const alv = Math.min(gross, bbgRv) * 0.013;
  const kv = Math.min(gross, bbgKv) * ((0.146 + Number(options.kkAdditional || 0)) / 2);
  const pvRate = options.hasChildren ? 0.018 : 0.024;
  const pv = Math.min(gross, bbgKv) * pvRate;

  const yearlyGross = gross * 12;
  const taxable = Math.max(0, yearlyGross - 1230 - 36);
  const incomeTaxYear = roughGermanIncomeTax2026(taxable);
  const lohnsteuer = incomeTaxYear / 12;
  const soli = Math.min(0.055 * lohnsteuer, 0.119 * Math.max(0, lohnsteuer - 1695.83));
  const church = options.churchTax ? lohnsteuer * 0.09 : 0;
  const deductions = rv + alv + kv + pv + lohnsteuer + soli + church;
  return {
    gross,
    net: Math.max(0, gross - deductions),
    deductions,
    rv,
    alv,
    kv,
    pv,
    lohnsteuer,
    soli,
    church
  };
}

function roughGermanIncomeTax2026(x: number) {
  if (x <= 12348) return 0;
  if (x <= 17799) {
    const y = (x - 12348) / 10000;
    return (932.3 * y + 1400) * y;
  }
  if (x <= 69878) {
    const z = (x - 17799) / 10000;
    return (176.64 * z + 2397) * z + 1015.13;
  }
  if (x <= 277825) return 0.42 * x - 10911.92;
  return 0.45 * x - 19246.67;
}


function normalizePlan(input: Partial<MigrationPlan> | null | undefined): MigrationPlan {
  const base = defaultPlan();
  const raw = input || {};
  const rows = Array.isArray(raw.rows) ? raw.rows : base.rows;
  return {
    ...base,
    ...raw,
    startMonth: raw.startMonth || base.startMonth,
    months: Math.min(Math.max(Number(raw.months || base.months), 1), 120),
    eurKzt: Number(raw.eurKzt || base.eurKzt || 1),
    rows: rows.map((row: any) => ({
      id: row.id || uuid(),
      kind: row.kind === "income" ? "income" : "expense",
      title: row.title || "Строка",
      country: ["KZ", "DE", "OTHER"].includes(row.country) ? row.country : "OTHER",
      currency: row.currency === "EUR" ? "EUR" : "KZT",
      amount: Number(row.amount || 0),
      autoSource: row.autoSource === "partTimeNet" || row.autoSource === "mainNet" ? row.autoSource : "",
      frequency: ["monthly", "quarterly", "yearly", "once"].includes(row.frequency) ? row.frequency : "monthly",
      startMonth: row.startMonth || raw.startMonth || base.startMonth,
      endMonth: row.endMonth || "",
      active: row.active !== false,
      group: row.group || (row.kind === "income" ? "доход" : "расход"),
      comment: row.comment || ""
    }))
  };
}

export default function MigrationPlanner({ userId }: { userId: string }) {
  const [plan, setPlan] = useState<MigrationPlan>(defaultPlan());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlan() {
    setLoading(true);
    const { data, error } = await supabase.from("relocation_plans").select("*").eq("user_id", userId).maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data?.data) {
      setPlan(normalizePlan(data.data));
    } else {
      const seed = defaultPlan();
      await supabase.from("relocation_plans").upsert({ user_id: userId, data: seed });
      setPlan(seed);
    }

    setLoading(false);
  }

  async function savePlan(next = plan) {
    const { error } = await supabase.from("relocation_plans").upsert({
      user_id: userId,
      data: next,
      updated_at: new Date().toISOString()
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setDirty(false);
    setMessage("План сохранён");
    window.setTimeout(() => setMessage(""), 2500);
  }

  function updatePlan(patch: Partial<MigrationPlan>) {
    setPlan((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function updateRow(id: string, patch: Partial<PlanRow>) {
    setPlan((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    }));
    setDirty(true);
  }

  function addRow(kind: RowKind) {
    const row: PlanRow = {
      id: uuid(),
      kind,
      title: kind === "income" ? "Новый доход" : "Новый расход",
      country: "DE",
      currency: kind === "income" ? "EUR" : "KZT",
      amount: 0,
      autoSource: "",
      frequency: "monthly",
      startMonth: plan.startMonth,
      endMonth: "",
      active: true,
      group: kind === "income" ? "доход" : "расход"
    };

    updatePlan({ rows: [row, ...plan.rows] });
  }

  function deleteRow(id: string) {
    updatePlan({ rows: plan.rows.filter((row) => row.id !== id) });
  }

  function duplicateRow(row: PlanRow) {
    updatePlan({ rows: [{ ...row, id: uuid(), title: `${row.title} копия` }, ...plan.rows] });
  }

  const data = useMemo(() => {
    const months = Array.from({ length: Number(plan.months || 1) }, (_, i) => addMonths(plan.startMonth, i));
    let cumulativeKzt = Number(plan.startBalanceKzt || 0) + Number(plan.startBalanceEur || 0) * Number(plan.eurKzt || 1);

    return months.map((month): MonthPlan => {
      const byCountry: MonthPlan["byCountry"] = {
        KZ: { incomeKzt: 0, expenseKzt: 0 },
        DE: { incomeKzt: 0, expenseKzt: 0 },
        OTHER: { incomeKzt: 0, expenseKzt: 0 }
      };

      let incomeKzt = 0;
      let expenseKzt = 0;

      const partTimeNetLocal = calcGermanNet(Number(plan.grossPartTime || 0), plan).net;
      const mainNetLocal = calcGermanNet(Number(plan.grossMain || 0), plan).net;

      plan.rows.forEach((row) => {
        if (!rowApplies(row, month, plan.startMonth)) return;
        const sourceAmount = row.autoSource === "partTimeNet" ? partTimeNetLocal : row.autoSource === "mainNet" ? mainNetLocal : Number(row.amount || 0);
        const amountKzt = toKzt(sourceAmount, row.currency, Number(plan.eurKzt || 1));
        if (row.kind === "income") {
          incomeKzt += amountKzt;
          byCountry[row.country].incomeKzt += amountKzt;
        } else {
          expenseKzt += amountKzt;
          byCountry[row.country].expenseKzt += amountKzt;
        }
      });

      const netKzt = incomeKzt - expenseKzt;
      cumulativeKzt += netKzt;

      return {
        month,
        incomeKzt,
        expenseKzt,
        netKzt,
        cumulativeKzt,
        incomeEur: incomeKzt / Number(plan.eurKzt || 1),
        expenseEur: expenseKzt / Number(plan.eurKzt || 1),
        netEur: netKzt / Number(plan.eurKzt || 1),
        cumulativeEur: cumulativeKzt / Number(plan.eurKzt || 1),
        byCountry
      };
    });
  }, [plan]);

  const summary = useMemo(() => {
    const min = Math.min(...data.map((m) => m.cumulativeKzt), 0);
    const firstNegative = data.find((m) => m.cumulativeKzt < 0)?.month || "";
    const firstPositiveAfterNegative = firstNegative ? data.find((m) => monthIndex(m.month) >= monthIndex(firstNegative) && m.cumulativeKzt >= 0)?.month || "" : "";
    const totalIncome = data.reduce((s, m) => s + m.incomeKzt, 0);
    const totalExpense = data.reduce((s, m) => s + m.expenseKzt, 0);
    const last = data.at(-1);
    const safeMonths = data.findIndex((m) => m.cumulativeKzt < 0);
    return {
      min,
      firstNegative,
      firstPositiveAfterNegative,
      totalIncome,
      totalExpense,
      endKzt: last?.cumulativeKzt || 0,
      safeMonths: safeMonths === -1 ? data.length : safeMonths
    };
  }, [data]);

  const partTimeNet = calcGermanNet(Number(plan.grossPartTime || 0), plan);
  const mainNet = calcGermanNet(Number(plan.grossMain || 0), plan);

  if (loading) return <section className="relocationPanel">Загрузка калькулятора…</section>;

  return (
    <section className="relocationPanel">
      <div className="relocationHead">
        <div>
          <h2>План переезда / мультивалютный калькулятор</h2>
          <p>Отдельный сценарный расчёт: Казахстан + Германия, KZT + EUR, доходы, расходы, разовые траты, накопительный остаток.</p>
        </div>
        <div className="relocationActions">
          <button type="button" className="btn" onClick={() => savePlan()}>{dirty ? "Сохранить *" : "Сохранено"}</button>
          <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(plan, null, 2))}>копировать JSON</button>
        </div>
      </div>

      {message && <div className="plannerMessage">{message}</div>}

      <div className="plannerGrid">
        <div className="plannerCard">
          <h3>Параметры</h3>
          <div className="plannerInputs">
            <label>Начало плана<input type="month" value={plan.startMonth} onChange={(e) => updatePlan({ startMonth: e.target.value || currentMonth() })} /></label>
            <label>Месяцев<input type="number" min="1" max="120" value={plan.months} onChange={(e) => updatePlan({ months: Number(e.target.value || 1) })} /></label>
            <label>EUR → KZT<input type="number" value={plan.eurKzt} onChange={(e) => updatePlan({ eurKzt: Number(e.target.value || 1) })} /></label>
            <label>Старт KZT<input type="number" value={plan.startBalanceKzt} onChange={(e) => updatePlan({ startBalanceKzt: Number(e.target.value || 0) })} /></label>
            <label>Старт EUR<input type="number" value={plan.startBalanceEur} onChange={(e) => updatePlan({ startBalanceEur: Number(e.target.value || 0) })} /></label>
          </div>
        </div>

        <div className="plannerCard salaryCard">
          <h3>Германия: брутто → плановое нетто</h3>
          <div className="salaryGrid">
            <label>Подработка gross, €<input type="number" value={plan.grossPartTime} onChange={(e) => updatePlan({ grossPartTime: Number(e.target.value || 0) })} /></label>
            <label>Основная gross, €<input type="number" value={plan.grossMain} onChange={(e) => updatePlan({ grossMain: Number(e.target.value || 0) })} /></label>
            <label>Доп. взнос KK<input type="number" step="0.001" value={plan.kkAdditional} onChange={(e) => updatePlan({ kkAdditional: Number(e.target.value || 0) })} /></label>
            <label className="checkLine"><input type="checkbox" checked={plan.hasChildren} onChange={(e) => updatePlan({ hasChildren: e.target.checked })} /> есть дети</label>
            <label className="checkLine"><input type="checkbox" checked={plan.churchTax} onChange={(e) => updatePlan({ churchTax: e.target.checked })} /> церковный налог</label>
          </div>
          <div className="salaryResults">
            <div><span>Подработка netto</span><b>{fmt(partTimeNet.net, "EUR")}</b></div>
            <div><span>Основная netto</span><b>{fmt(mainNet.net, "EUR")}</b></div>
            <div><span>Удержания основной</span><b>{fmt(mainNet.deductions, "EUR")}</b></div>
          </div>
          <p className="smallWarn">Это плановый расчёт по логике твоей таблицы, не официальный payroll. Для точности можно вручную указать нетто отдельной строкой дохода.</p>
        </div>

        <div className="plannerCard summaryWide">
          <h3>Итог сценария</h3>
          <div className="plannerSummary">
            <div><span>Хватит без минуса</span><b>{summary.safeMonths} мес.</b></div>
            <div><span>Минимальный остаток</span><b className={summary.min < 0 ? "bad" : "ok"}>{fmt(summary.min)}</b></div>
            <div><span>Конец горизонта</span><b className={summary.endKzt < 0 ? "bad" : "ok"}>{fmt(summary.endKzt)}</b></div>
            <div><span>Доходы всего</span><b>{fmt(summary.totalIncome)}</b></div>
            <div><span>Расходы всего</span><b>{fmt(summary.totalExpense)}</b></div>
            <div><span>Первый минус</span><b>{summary.firstNegative ? monthLabel(summary.firstNegative) : "нет"}</b></div>
          </div>
        </div>
      </div>

      <div className="plannerSources">
        <div className="sourcesHead">
          <h3>Источники доходов и расходов</h3>
          <div>
            <button type="button" className="btn blue" onClick={() => addRow("income")}>+ доход</button>
            <button type="button" className="btn" onClick={() => addRow("expense")}>+ расход</button>
          </div>
        </div>

        <div className="sourceTableWrap">
          <table className="sourceTable">
            <thead>
              <tr>
                <th>on</th>
                <th>Тип</th>
                <th>Название</th>
                <th>Страна</th>
                <th>Валюта</th>
                <th>Сумма</th>
                <th>Источник</th>
                <th>Частота</th>
                <th>С</th>
                <th>До</th>
                <th>Группа</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row) => (
                <tr key={row.id} className={row.kind}>
                  <td><input type="checkbox" checked={row.active} onChange={(e) => updateRow(row.id, { active: e.target.checked })} /></td>
                  <td>
                    <select value={row.kind} onChange={(e) => updateRow(row.id, { kind: e.target.value as RowKind })}>
                      <option value="income">доход</option>
                      <option value="expense">расход</option>
                    </select>
                  </td>
                  <td><input value={row.title} onChange={(e) => updateRow(row.id, { title: e.target.value })} /></td>
                  <td>
                    <select value={row.country} onChange={(e) => updateRow(row.id, { country: e.target.value as Country })}>
                      {Object.entries(countries).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={row.currency} onChange={(e) => updateRow(row.id, { currency: e.target.value as Currency })}>
                      <option value="KZT">KZT</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </td>
                  <td><input type="number" value={row.amount} disabled={!!row.autoSource} onChange={(e) => updateRow(row.id, { amount: Number(e.target.value || 0) })} /></td>
                  <td>
                    <select value={row.autoSource || ""} onChange={(e) => updateRow(row.id, { autoSource: e.target.value as PlanRow["autoSource"] })}>
                      <option value="">ручн.</option>
                      <option value="partTimeNet">нетто подработка</option>
                      <option value="mainNet">нетто основная</option>
                    </select>
                  </td>
                  <td>
                    <select value={row.frequency} onChange={(e) => updateRow(row.id, { frequency: e.target.value as Frequency })}>
                      <option value="monthly">ежемесячно</option>
                      <option value="quarterly">квартал</option>
                      <option value="yearly">год</option>
                      <option value="once">разово</option>
                    </select>
                  </td>
                  <td><input type="month" value={row.startMonth} onChange={(e) => updateRow(row.id, { startMonth: e.target.value })} /></td>
                  <td><input type="month" value={row.endMonth} onChange={(e) => updateRow(row.id, { endMonth: e.target.value })} /></td>
                  <td><input value={row.group} onChange={(e) => updateRow(row.id, { group: e.target.value })} /></td>
                  <td className="rowTools">
                    <button type="button" onClick={() => duplicateRow(row)}>⧉</button>
                    <button type="button" onClick={() => deleteRow(row.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="plannerMatrixWrap">
        <table className="plannerMatrix">
          <thead>
            <tr>
              <th className="stickyCol">Показатель</th>
              {data.map((m) => <th key={m.month}>{monthLabel(m.month)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="strong"><th className="stickyCol">Доходы KZT</th>{data.map((m) => <td key={`i-${m.month}`}>{Math.round(m.incomeKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr className="strong"><th className="stickyCol">Расходы KZT</th>{data.map((m) => <td key={`e-${m.month}`}>{Math.round(m.expenseKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr className="strong"><th className="stickyCol">Остаток месяца</th>{data.map((m) => <td className={m.netKzt < 0 ? "badCell" : ""} key={`n-${m.month}`}>{Math.round(m.netKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr className="strong"><th className="stickyCol">Накопительно KZT</th>{data.map((m) => <td className={m.cumulativeKzt < 0 ? "badCell" : ""} key={`c-${m.month}`}>{Math.round(m.cumulativeKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr><th className="stickyCol">Накопительно EUR</th>{data.map((m) => <td className={m.cumulativeEur < 0 ? "badCell" : ""} key={`ce-${m.month}`}>{Math.round(m.cumulativeEur).toLocaleString("ru-RU")}</td>)}</tr>
            <tr className="section"><th className="stickyCol">Казахстан: доход</th>{data.map((m) => <td key={`kzi-${m.month}`}>{Math.round(m.byCountry.KZ.incomeKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr><th className="stickyCol">Казахстан: расход</th>{data.map((m) => <td key={`kze-${m.month}`}>{Math.round(m.byCountry.KZ.expenseKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr className="section"><th className="stickyCol">Германия: доход</th>{data.map((m) => <td key={`dei-${m.month}`}>{Math.round(m.byCountry.DE.incomeKzt).toLocaleString("ru-RU")}</td>)}</tr>
            <tr><th className="stickyCol">Германия: расход</th>{data.map((m) => <td key={`dee-${m.month}`}>{Math.round(m.byCountry.DE.expenseKzt).toLocaleString("ru-RU")}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
