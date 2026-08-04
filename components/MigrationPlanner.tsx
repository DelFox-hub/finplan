"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import { createClient } from "@/lib/supabase/browser";
import { trackRelocationSave } from "@/lib/relocationSaveCoordinator";
import type { ExchangeRateSnapshot } from "@/lib/exchangeRate";

type Currency = "KZT" | "EUR";
type Country = "DE" | "OTHER";
type RowKind = "income" | "expense";
type Frequency = "monthly" | "quarterly" | "yearly" | "once";

type DiaryMonthPlan = {
  month: string;
  incomeBy: Record<string, number>;
  expenseBy: Record<string, number>;
  incomeTotal: number;
  expenseTotal: number;
  net: number;
};

type GermanyRecurringExpense = {
  id: string;
  title: string;
  group: string;
  currency: Currency;
  amount: number;
  frequency: Exclude<Frequency, "once">;
  startMonth: string;
  endMonth: string;
  active: boolean;
};


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
  eurKztBuy: number;
  eurKztSell: number;
  eurKztSource: "mig.kz" | "";
  eurKztUpdatedAt: string;
  eurKztCheckedAt: string;
  startBalanceEur: number;
  grossPartTime: number;
  grossMain: number;
  kkAdditional: number;
  hasChildren: boolean;
  churchTax: boolean;
  rows: PlanRow[];
  germanyExpenses: GermanyRecurringExpense[];
  germanyMonthExclusions: string[];
};

type GermanyForecastMonth = {
  month: string;
  incomeKzt: number;
  expenseKzt: number;
  netKzt: number;
  cumulativeKzt: number;
  germanyIncomeBy: Record<string, number>;
  germanyExpenseBy: Record<string, number>;
  germanyIncomeKzt: number;
  germanyExpenseKzt: number;
  kzIncomeKzt: number;
  kzExpenseKzt: number;
};

type CategoryOption = {
  id: string;
  name: string;
};

type MigrationPlannerProps = {
  userId: string;
  diaryStartMonth: string;
  expenseCategories: CategoryOption[];
  incomeCategories: CategoryOption[];
  getDiaryMonthPlan: (month: string) => DiaryMonthPlan;
  getDiaryBalanceBeforeMonth: (month: string) => number;
  exchangeRate: ExchangeRateSnapshot | null;
};

const supabase = createClient();

const countries: Record<Country, string> = {
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

function normalizeMonthValue(value: unknown, fallback = currentMonth()) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : fallback;
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

function compact(n: number) {
  return Math.round(Number(n || 0)).toLocaleString("ru-RU");
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  return Math.max(safeNumber(value, fallback), 0);
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultPlan(startMonth = currentMonth()): MigrationPlan {
  return {
    startMonth,
    months: 36,
    eurKztBuy: 0,
    eurKztSell: 0,
    eurKztSource: "",
    eurKztUpdatedAt: "",
    eurKztCheckedAt: "",
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
        title: "Подработка / Германия",
        country: "DE",
        currency: "EUR",
        amount: 0,
        autoSource: "partTimeNet",
        frequency: "monthly",
        startMonth: addMonths(startMonth, 8),
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
        startMonth: addMonths(startMonth, 12),
        endMonth: "",
        active: true,
        group: "доход"
      },
      {
        id: uuid(),
        kind: "expense",
        title: "Билеты",
        country: "DE",
        currency: "KZT",
        amount: 400000,
        frequency: "once",
        startMonth: addMonths(startMonth, 10),
        endMonth: "",
        active: true,
        group: "переезд"
      }
    ],
    germanyExpenses: [
      {
        id: uuid(),
        title: "Питание Германия",
        group: "питание",
        currency: "EUR",
        amount: 250,
        frequency: "monthly",
        startMonth: addMonths(startMonth, 10),
        endMonth: "",
        active: true
      },
      {
        id: uuid(),
        title: "Транспорт Германия",
        group: "транспорт",
        currency: "EUR",
        amount: 80,
        frequency: "monthly",
        startMonth: addMonths(startMonth, 10),
        endMonth: "",
        active: true
      }
    ],
    germanyMonthExclusions: []
  };
}

function germanyMonthExclusionKey(source: "regular" | "scenario", id: string, month: string) {
  return `${source}:${id}:${month}`;
}

function germanyExpenseApplies(row: GermanyRecurringExpense, month: string, planStart: string) {
  if (!row.active) return false;
  const startMonth = row.startMonth || planStart;
  if (monthIndex(month) < monthIndex(startMonth)) return false;
  if (row.endMonth && monthIndex(month) > monthIndex(row.endMonth)) return false;
  const diff = monthIndex(month) - monthIndex(startMonth);
  if (row.frequency === "monthly") return true;
  if (row.frequency === "quarterly") return diff % 3 === 0;
  return diff % 12 === 0;
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

function validExchangeRate(value: unknown) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

function toKzt(amount: number, currency: Currency, eurRate: number) {
  if (currency !== "EUR") return amount;
  const rate = validExchangeRate(eurRate);
  return rate > 0 ? amount * rate : 0;
}

function fromKzt(amountKzt: number, currency: Currency, eurSellRate: number) {
  if (currency !== "EUR") return amountKzt;
  const rate = validExchangeRate(eurSellRate);
  return rate > 0 ? amountKzt / rate : 0;
}

function effectiveRowAmount(row: PlanRow, partTimeNet: number, mainNet: number) {
  if (row.autoSource === "partTimeNet") return partTimeNet;
  if (row.autoSource === "mainNet") return mainNet;
  return Number(row.amount || 0);
}

function effectiveRowCurrency(row: PlanRow): Currency {
  return row.autoSource ? "EUR" : row.currency;
}

function calcGermanNet(gross: number, options: { kkAdditional: number; hasChildren: boolean; churchTax: boolean }) {
  const safeGross = nonNegativeNumber(gross);
  const additionalRate = nonNegativeNumber(options.kkAdditional);
  const bbgRv = 8450;
  const bbgKv = 5812.5;
  const rv = Math.min(safeGross, bbgRv) * 0.093;
  const alv = Math.min(safeGross, bbgRv) * 0.013;
  const kv = Math.min(safeGross, bbgKv) * ((0.146 + additionalRate) / 2);
  const pvRate = options.hasChildren ? 0.018 : 0.024;
  const pv = Math.min(safeGross, bbgKv) * pvRate;

  const yearlyGross = safeGross * 12;
  const taxable = Math.max(0, yearlyGross - 1230 - 36);
  const incomeTaxYear = roughGermanIncomeTax2026(taxable);
  const lohnsteuer = incomeTaxYear / 12;
  const soli = Math.min(0.055 * lohnsteuer, 0.119 * Math.max(0, lohnsteuer - 1695.83));
  const church = options.churchTax ? lohnsteuer * 0.09 : 0;
  const deductions = rv + alv + kv + pv + lohnsteuer + soli + church;
  return {
    gross: safeGross,
    net: Math.max(0, safeGross - deductions),
    deductions
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

function normalizePlan(input: Partial<MigrationPlan> | null | undefined, diaryStartMonth: string): MigrationPlan {
  const base = defaultPlan(currentMonth());
  const raw = input || {};
  const rawWithLegacyRate = raw as Partial<MigrationPlan> & { eurKzt?: unknown; eurKztSource?: unknown };
  const rawWithoutLegacyRate = { ...rawWithLegacyRate };
  delete rawWithoutLegacyRate.eurKzt;
  const rawRows = Array.isArray(raw.rows) ? raw.rows : base.rows;
  const normalizedDiaryStart = normalizeMonthValue(diaryStartMonth);
  const requestedStart = normalizeMonthValue(raw.startMonth, base.startMonth);
  const safeStart = monthIndex(requestedStart) < monthIndex(normalizedDiaryStart) ? normalizedDiaryStart : requestedStart;

  const migratedGermanyRows = rawRows.filter((row: any) => row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once");
  const savedGermanyExpenses = Array.isArray((raw as any).germanyExpenses) ? (raw as any).germanyExpenses : [];
  const seenGermanyIds = new Set<string>();
  const germanyExpenses = [...savedGermanyExpenses, ...migratedGermanyRows]
    .map((row: any): GermanyRecurringExpense => {
      const normalizedStart = normalizeMonthValue(row.startMonth, safeStart);
      const rowStart = monthIndex(normalizedStart) >= monthIndex(safeStart) ? normalizedStart : safeStart;
      const normalizedEnd = row.endMonth ? normalizeMonthValue(row.endMonth, "") : "";
      const rowEnd = normalizedEnd && monthIndex(normalizedEnd) >= monthIndex(rowStart) ? normalizedEnd : "";
      return {
        id: row.id || uuid(),
        title: String(row.title || "Расход Германия"),
        group: String(row.group || "расход"),
        currency: row.currency === "KZT" ? "KZT" : "EUR",
        amount: nonNegativeNumber(row.amount),
        frequency: (["monthly", "quarterly", "yearly"].includes(row.frequency) ? row.frequency : "monthly") as GermanyRecurringExpense["frequency"],
        startMonth: rowStart,
        endMonth: rowEnd,
        active: row.active !== false
      };
    })
    .filter((row) => {
      if (seenGermanyIds.has(row.id)) return false;
      seenGermanyIds.add(row.id);
      return true;
    });

  const rows: PlanRow[] = rawRows
    .filter((row: any) => row?.country !== "KZ")
    .filter((row: any) => !(row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once"))
    .map((row: any) => {
      const normalizedStart = normalizeMonthValue(row.startMonth, safeStart);
      const rowStart = monthIndex(normalizedStart) >= monthIndex(safeStart) ? normalizedStart : safeStart;
      const normalizedEnd = row.endMonth ? normalizeMonthValue(row.endMonth, "") : "";
      const rowEnd = normalizedEnd && monthIndex(normalizedEnd) >= monthIndex(rowStart) ? normalizedEnd : "";
      const kind: RowKind = row.kind === "income" ? "income" : "expense";
      const country: Country = row.country === "OTHER" ? "OTHER" : "DE";
      return {
        id: row.id || uuid(),
        kind,
        title: String(row.title || "Строка"),
        country,
        currency: row.currency === "EUR" ? "EUR" : "KZT",
        amount: nonNegativeNumber(row.amount),
        autoSource: row.autoSource === "partTimeNet" || row.autoSource === "mainNet" ? row.autoSource : "",
        frequency: kind === "expense" && country === "DE"
          ? "once"
          : (["monthly", "quarterly", "yearly", "once"].includes(row.frequency) ? row.frequency : "monthly") as Frequency,
        startMonth: rowStart,
        endMonth: rowEnd,
        active: row.active !== false,
        group: String(row.group || (kind === "income" ? "доход" : "расход")),
        comment: String(row.comment || "")
      };
    });

  const validRegularIds = new Set(germanyExpenses.map((row) => row.id));
  const validScenarioIds = new Set(rows.map((row) => row.id));
  const germanyMonthExclusions: string[] = Array.isArray((raw as any).germanyMonthExclusions)
    ? [...new Set<string>((raw as any).germanyMonthExclusions.filter((value: unknown): value is string => {
        if (typeof value !== "string") return false;
        const [source, id, month] = value.split(":");
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) return false;
        if (source === "regular") return validRegularIds.has(id);
        if (source === "scenario") return validScenarioIds.has(id);
        return false;
      }))]
    : [];

  const storedRateIsAutomatic = rawWithLegacyRate.eurKztSource === "mig.kz";
  const legacyAutomaticRate = storedRateIsAutomatic ? validExchangeRate(rawWithLegacyRate.eurKzt) : 0;
  const storedBuyRate = storedRateIsAutomatic ? validExchangeRate(raw.eurKztBuy) || legacyAutomaticRate : 0;
  const storedSellRate = storedRateIsAutomatic ? validExchangeRate(raw.eurKztSell) || legacyAutomaticRate : 0;

  return {
    ...base,
    ...rawWithoutLegacyRate,
    startMonth: safeStart,
    months: Math.min(Math.max(Math.round(safeNumber(raw.months, base.months)), 1), 120),
    eurKztBuy: storedBuyRate,
    eurKztSell: storedSellRate,
    eurKztSource: storedBuyRate > 0 && storedSellRate > 0 ? "mig.kz" : "",
    eurKztUpdatedAt: typeof raw.eurKztUpdatedAt === "string" ? raw.eurKztUpdatedAt : "",
    eurKztCheckedAt: typeof raw.eurKztCheckedAt === "string" ? raw.eurKztCheckedAt : "",
    startBalanceEur: nonNegativeNumber(raw.startBalanceEur),
    grossPartTime: nonNegativeNumber(raw.grossPartTime, base.grossPartTime),
    grossMain: nonNegativeNumber(raw.grossMain, base.grossMain),
    kkAdditional: nonNegativeNumber(raw.kkAdditional, base.kkAdditional),
    hasChildren: !!raw.hasChildren,
    churchTax: !!raw.churchTax,
    rows,
    germanyExpenses,
    germanyMonthExclusions
  };
}

export default function MigrationPlanner({
  userId,
  diaryStartMonth,
  expenseCategories,
  incomeCategories,
  getDiaryMonthPlan,
  getDiaryBalanceBeforeMonth,
  exchangeRate
}: MigrationPlannerProps) {
  const [plan, setPlan] = useState<MigrationPlan>(() => defaultPlan(currentMonth()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [matrixCurrency, setMatrixCurrency] = useState<Currency>("KZT");
  const [showIncomeArticles, setShowIncomeArticles] = useState(false);
  const [showExpenseArticles, setShowExpenseArticles] = useState(false);
  const [germanyViewMonth, setGermanyViewMonth] = useState(currentMonth());
  const [showSalaryCard, setShowSalaryCard] = useState(false);
  const [showScenarioParams, setShowScenarioParams] = useState(false);
  const [showScenarioSummary, setShowScenarioSummary] = useState(false);
  const [showScenarioArticles, setShowScenarioArticles] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const latestPlanRef = useRef(plan);
  const dirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ plan: MigrationPlan; silent: boolean } | null>(null);
  const saveLoopRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (loading || !exchangeRate) return;
    const previous = latestPlanRef.current;
    const previousCheckedAt = Date.parse(previous.eurKztCheckedAt || "");
    const incomingCheckedAt = Date.parse(exchangeRate.checkedAt);
    if (Number.isFinite(previousCheckedAt) && previousCheckedAt >= incomingCheckedAt) return;

    setDirtyPlan((current) => ({
      ...current,
      eurKztBuy: exchangeRate.buy,
      eurKztSell: exchangeRate.sell,
      eurKztSource: "mig.kz",
      eurKztUpdatedAt: exchangeRate.sourceUpdatedAt,
      eurKztCheckedAt: exchangeRate.checkedAt
    }));
  }, [exchangeRate, loading]);

  useEffect(() => {
    const syncPlan = (event: Event) => {
      const detail = (event as CustomEvent<{
        germanyExpenses?: GermanyRecurringExpense[];
        germanyMonthExclusions?: string[];
        groupRename?: { kind: RowKind; oldName: string; newName: string };
        replacePlan?: Partial<MigrationPlan>;
        reset?: boolean;
      }>).detail;
      if (detail?.replacePlan) {
        if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
        pendingSaveRef.current = null;
        const next = normalizePlan(detail.replacePlan, diaryStartMonth);
        latestPlanRef.current = next;
        dirtyRef.current = false;
        setPlan(next);
        setDirty(false);
        setSaveStatus("saved");
        setMessage("");
        return;
      }
      if (detail?.reset) {
        if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
        pendingSaveRef.current = null;
        dirtyRef.current = false;
        setDirty(false);
        void loadPlan();
        return;
      }
      if (detail?.germanyExpenses) {
        const previous = latestPlanRef.current;
        const next = normalizePlan({
          ...previous,
          germanyExpenses: detail.germanyExpenses || previous.germanyExpenses,
          germanyMonthExclusions: detail.germanyMonthExclusions || previous.germanyMonthExclusions
        }, diaryStartMonth);
        latestPlanRef.current = next;
        setPlan(next);
        void savePlan(next, true);
        return;
      }
      if (detail?.groupRename) {
        const { kind, oldName, newName } = detail.groupRename;
        const previous = latestPlanRef.current;
        const next = normalizePlan({
          ...previous,
          rows: previous.rows.map((row) => row.kind === kind && row.group === oldName ? { ...row, group: newName } : row),
          germanyExpenses: kind === "expense"
            ? previous.germanyExpenses.map((row) => row.group === oldName ? { ...row, group: newName } : row)
            : previous.germanyExpenses
        }, diaryStartMonth);
        latestPlanRef.current = next;
        setPlan(next);
        void savePlan(next, true);
        return;
      }
      if (!dirtyRef.current) void loadPlan();
    };
    window.addEventListener("relocation-plan-updated", syncPlan);
    return () => window.removeEventListener("relocation-plan-updated", syncPlan);
    // loadPlan/savePlan use refs for mutable plan data; rebind when the user or diary boundary changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, diaryStartMonth]);

  useEffect(() => {
    const prepareImport = () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      pendingSaveRef.current = null;
      dirtyRef.current = false;
      setDirty(false);
    };
    window.addEventListener("relocation-plan-before-import", prepareImport);
    return () => window.removeEventListener("relocation-plan-before-import", prepareImport);
  }, []);

  useEffect(() => {
    latestPlanRef.current = plan;
    dirtyRef.current = dirty;
  }, [plan, dirty]);
  useEffect(() => {
    if (!germanyViewMonth || monthIndex(germanyViewMonth) < monthIndex(plan.startMonth)) {
      setGermanyViewMonth(plan.startMonth);
    }
  }, [germanyViewMonth, plan.startMonth]);


  useEffect(() => {
    if (loading || !dirty) return;
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void savePlan(latestPlanRef.current, true);
    }, 400);
  }, [plan, dirty, loading]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
      if (!dirtyRef.current) return;
      pendingSaveRef.current = { plan: latestPlanRef.current, silent: true };
      void savePlan(latestPlanRef.current, true);
    };
  }, [userId]);


  useEffect(() => {
    const previous = latestPlanRef.current;
    const normalized = normalizePlan(previous, diaryStartMonth);
    if (JSON.stringify(normalized) === JSON.stringify(previous)) return;
    latestPlanRef.current = normalized;
    dirtyRef.current = true;
    setPlan(normalized);
    setDirty(true);
  }, [diaryStartMonth]);

  useEffect(() => {
    if (loading) return;
    const previous = latestPlanRef.current;
    let changed = false;
    const rows = previous.rows.map((row) => {
      const allowed = groupNames(row.kind);
      if (allowed.includes(row.group)) return row;
      changed = true;
      return { ...row, group: allowed[0] };
    });
    const allowedExpenses = groupNames("expense");
    const germanyExpenses = previous.germanyExpenses.map((row) => {
      if (allowedExpenses.includes(row.group)) return row;
      changed = true;
      return { ...row, group: allowedExpenses[0] };
    });
    if (!changed) return;
    const next = { ...previous, rows, germanyExpenses };
    latestPlanRef.current = next;
    dirtyRef.current = true;
    setPlan(next);
    setDirty(true);
  }, [expenseCategories, incomeCategories, loading]);

  async function loadPlan() {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("relocation_plans").select("*").eq("user_id", userId).maybeSingle();

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    if (data?.data) {
      const normalized = normalizePlan(data.data, diaryStartMonth);
      latestPlanRef.current = normalized;
      setPlan(normalized);
    } else {
      const seed = defaultPlan(monthIndex(currentMonth()) < monthIndex(diaryStartMonth) ? diaryStartMonth : currentMonth());
      const { error: seedError } = await supabase.from("relocation_plans").upsert({ user_id: userId, data: seed });
      if (seedError) {
        setLoadError(seedError.message);
        setLoading(false);
        return;
      }
      latestPlanRef.current = seed;
      setPlan(seed);
    }

    dirtyRef.current = false;
    setDirty(false);
    setLoading(false);
  }

  async function savePlan(next = latestPlanRef.current, silent = false) {
    pendingSaveRef.current = { plan: next, silent };
    setSaveStatus("saving");

    if (!saveLoopRef.current) {
      saveLoopRef.current = trackRelocationSave((async () => {
        while (pendingSaveRef.current) {
          const job = pendingSaveRef.current;
          pendingSaveRef.current = null;
          const snapshot = JSON.stringify(job.plan);
          const { error } = await supabase.from("relocation_plans").upsert({
            user_id: userId,
            data: job.plan,
            updated_at: new Date().toISOString()
          });

          if (error) {
            pendingSaveRef.current = pendingSaveRef.current || job;
            setSaveStatus("error");
            setMessage(`Не удалось сохранить: ${error.message}`);
            break;
          }

          if (JSON.stringify(latestPlanRef.current) === snapshot && !pendingSaveRef.current) {
            dirtyRef.current = false;
            setDirty(false);
          }
          if (!job.silent) setMessage("План сохранён");
        }
      })().finally(() => {
        saveLoopRef.current = null;
        if (!pendingSaveRef.current) {
          setSaveStatus("saved");
          window.setTimeout(() => setMessage(""), 2500);
        }
      }));
    }

    await saveLoopRef.current;
  }

  function groupNames(kind: RowKind) {
    const source = kind === "income" ? incomeCategories : expenseCategories;
    const names = [...new Set(source.map((category) => category.name.trim()).filter(Boolean))];
    return names.length ? names : [kind === "income" ? "Доход" : "Расход"];
  }

  function defaultGroup(kind: RowKind) {
    return groupNames(kind)[0];
  }

  function setDirtyPlan(updater: (previous: MigrationPlan) => MigrationPlan) {
    const next = updater(latestPlanRef.current);
    latestPlanRef.current = next;
    dirtyRef.current = true;
    setPlan(next);
    setDirty(true);
  }

  function updatePlan(patch: Partial<MigrationPlan>) {
    setDirtyPlan((previous) => ({ ...previous, ...patch }));
  }

  function updateStartMonth(value: string) {
    const next = !value || monthIndex(value) < monthIndex(diaryStartMonth) ? diaryStartMonth : value;
    updatePlan({ startMonth: next });
  }

  function updateRow(id: string, patch: Partial<PlanRow>) {
    setDirtyPlan((previous) => ({
      ...previous,
      rows: previous.rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.kind && patch.kind !== row.kind) {
          next.group = defaultGroup(patch.kind);
          if (patch.kind === "expense" && next.country === "DE") next.frequency = "once";
        }
        if (patch.country === "DE" && next.kind === "expense") next.frequency = "once";
        if (!groupNames(next.kind).includes(next.group)) next.group = defaultGroup(next.kind);
        if (patch.startMonth && next.endMonth && monthIndex(next.endMonth) < monthIndex(patch.startMonth)) next.endMonth = "";
        if (patch.endMonth && monthIndex(patch.endMonth) < monthIndex(next.startMonth || previous.startMonth)) next.endMonth = "";
        return next;
      })
    }));
  }

  function isGermanyMonthExcluded(source: "regular" | "scenario", id: string, month: string) {
    return plan.germanyMonthExclusions.includes(germanyMonthExclusionKey(source, id, month));
  }

  function toggleGermanyMonthItem(source: "regular" | "scenario", id: string, month: string, checked: boolean) {
    const key = germanyMonthExclusionKey(source, id, month);
    setDirtyPlan((previous) => ({
      ...previous,
      germanyMonthExclusions: checked
        ? previous.germanyMonthExclusions.filter((item) => item !== key)
        : [...new Set([...previous.germanyMonthExclusions, key])]
    }));
  }



  function updateGermanyExpense(id: string, patch: Partial<GermanyRecurringExpense>) {
    setDirtyPlan((previous) => ({
      ...previous,
      germanyExpenses: previous.germanyExpenses.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (!groupNames("expense").includes(next.group)) next.group = defaultGroup("expense");
        if (patch.startMonth && next.endMonth && monthIndex(next.endMonth) < monthIndex(patch.startMonth)) next.endMonth = "";
        if (patch.endMonth && monthIndex(patch.endMonth) < monthIndex(next.startMonth || previous.startMonth)) next.endMonth = "";
        return next;
      })
    }));
  }

  function changeGermanyExpenseType(source: "regular" | "scenario", id: string, target: "regular" | "scenario") {
    if (source === target) return;
    setDirtyPlan((previous) => {
      const remapExclusions = previous.germanyMonthExclusions.map((key) => {
        const prefix = `${source}:${id}:`;
        return key.startsWith(prefix) ? `${target}:${id}:${key.slice(prefix.length)}` : key;
      });

      if (source === "regular") {
        const row = previous.germanyExpenses.find((item) => item.id === id);
        if (!row) return previous;
        const scenarioRow: PlanRow = {
          id: row.id,
          kind: "expense",
          title: row.title,
          country: "DE",
          currency: row.currency,
          amount: nonNegativeNumber(row.amount),
          autoSource: "",
          frequency: "once",
          startMonth: row.startMonth || germanyViewMonth || previous.startMonth,
          endMonth: "",
          active: row.active,
          group: groupNames("expense").includes(row.group) ? row.group : defaultGroup("expense"),
          comment: ""
        };
        return {
          ...previous,
          germanyExpenses: previous.germanyExpenses.filter((item) => item.id !== id),
          rows: [scenarioRow, ...previous.rows],
          germanyMonthExclusions: remapExclusions
        };
      }

      const row = previous.rows.find((item) => item.id === id && item.kind === "expense" && item.country === "DE");
      if (!row) return previous;
      const regularRow: GermanyRecurringExpense = {
        id: row.id,
        title: row.title,
        group: groupNames("expense").includes(row.group) ? row.group : defaultGroup("expense"),
        currency: effectiveRowCurrency(row),
        amount: nonNegativeNumber(effectiveRowAmount(row, partTimeNet.net, mainNet.net)),
        frequency: row.frequency === "once" ? "monthly" : row.frequency,
        startMonth: row.startMonth || germanyViewMonth || previous.startMonth,
        endMonth: row.endMonth || "",
        active: row.active
      };
      return {
        ...previous,
        rows: previous.rows.filter((item) => item.id !== id),
        germanyExpenses: [regularRow, ...previous.germanyExpenses],
        germanyMonthExclusions: remapExclusions
      };
    });
  }

  function deleteGermanyMonthRow(source: "regular" | "scenario", id: string) {
    if (source === "scenario") {
      deleteRow(id);
      return;
    }
    setDirtyPlan((previous) => ({
      ...previous,
      germanyExpenses: previous.germanyExpenses.filter((row) => row.id !== id),
      germanyMonthExclusions: previous.germanyMonthExclusions.filter((key) => !key.startsWith(`regular:${id}:`))
    }));
  }

  function addGermanyExpense() {
    const row: GermanyRecurringExpense = {
      id: uuid(),
      title: "Новый расход Германия",
      group: defaultGroup("expense"),
      currency: "EUR",
      amount: 0,
      frequency: "monthly",
      startMonth: germanyViewMonth || plan.startMonth,
      endMonth: "",
      active: true
    };
    setDirtyPlan((previous) => ({ ...previous, germanyExpenses: [row, ...previous.germanyExpenses] }));
  }

  function addRow(kind: RowKind) {
    const row: PlanRow = {
      id: uuid(),
      kind,
      title: kind === "income" ? "Новый доход" : "Новый расход",
      country: "DE",
      currency: "EUR",
      amount: 0,
      autoSource: "",
      frequency: kind === "expense" ? "once" : "monthly",
      startMonth: plan.startMonth,
      endMonth: "",
      active: true,
      group: defaultGroup(kind)
    };

    setDirtyPlan((previous) => ({ ...previous, rows: [row, ...previous.rows] }));
  }

  function deleteRow(id: string) {
    setDirtyPlan((previous) => ({
      ...previous,
      rows: previous.rows.filter((row) => row.id !== id),
      germanyMonthExclusions: previous.germanyMonthExclusions.filter((key) => !key.startsWith(`scenario:${id}:`))
    }));
  }

  function duplicateRow(row: PlanRow) {
    const copy = { ...row, id: uuid(), title: `${row.title} копия` };
    setDirtyPlan((previous) => ({ ...previous, rows: [copy, ...previous.rows] }));
  }

  const incomeCategoryNames = useMemo(() => {
    const names = incomeCategories.map((category) => category.name.trim()).filter(Boolean);
    return [...new Set(names.length ? names : ["Доходы"])];
  }, [incomeCategories]);

  const expenseCategoryNames = useMemo(() => {
    const names = expenseCategories.map((category) => category.name.trim()).filter(Boolean);
    return [...new Set(names.length ? names : ["Расходы"])];
  }, [expenseCategories]);

  // Всегда используем самый свежий курс из общего загрузчика. Сохранённый в плане
  // снимок нужен только как резерв при временной недоступности mig.kz.
  const eurBuyRate = validExchangeRate(exchangeRate?.buy) || validExchangeRate(plan.eurKztBuy);
  const eurSellRate = validExchangeRate(exchangeRate?.sell) || validExchangeRate(plan.eurKztSell);
  const exchangeRateReady = eurBuyRate > 0 && eurSellRate > 0;

  const germanyData = useMemo<GermanyForecastMonth[]>(() => {
    const months = Array.from({ length: Math.max(Number(plan.months || 1), 1) }, (_, index) => addMonths(plan.startMonth, index));
    let cumulativeKzt = getDiaryBalanceBeforeMonth(plan.startMonth) + toKzt(Number(plan.startBalanceEur || 0), "EUR", eurBuyRate);
    const partTimeNetLocal = calcGermanNet(Number(plan.grossPartTime || 0), plan).net;
    const mainNetLocal = calcGermanNet(Number(plan.grossMain || 0), plan).net;

    return months.map((month) => {
      const diary = getDiaryMonthPlan(month);
      const germanyIncomeBy = Object.fromEntries(incomeCategoryNames.map((name) => [name, 0])) as Record<string, number>;
      const germanyExpenseBy = Object.fromEntries(expenseCategoryNames.map((name) => [name, 0])) as Record<string, number>;

      plan.rows.forEach((row) => {
        if (!rowApplies(row, month, plan.startMonth)) return;
        if (plan.germanyMonthExclusions.includes(germanyMonthExclusionKey("scenario", row.id, month))) return;

        const amountKzt = toKzt(
          Math.max(effectiveRowAmount(row, partTimeNetLocal, mainNetLocal), 0),
          effectiveRowCurrency(row),
          row.kind === "income" ? eurBuyRate : eurSellRate
        );
        const names = row.kind === "income" ? incomeCategoryNames : expenseCategoryNames;
        const target = row.kind === "income" ? germanyIncomeBy : germanyExpenseBy;
        const fallback = names.includes("Другое") ? "Другое" : names[0];
        const group = names.includes(row.group) ? row.group : fallback;
        target[group] = Number(target[group] || 0) + amountKzt;
      });

      plan.germanyExpenses.forEach((row) => {
        if (!germanyExpenseApplies(row, month, plan.startMonth)) return;
        if (plan.germanyMonthExclusions.includes(germanyMonthExclusionKey("regular", row.id, month))) return;

        const amountKzt = toKzt(Math.max(Number(row.amount || 0), 0), row.currency, eurSellRate);
        const fallback = expenseCategoryNames.includes("Другое") ? "Другое" : expenseCategoryNames[0];
        const group = expenseCategoryNames.includes(row.group) ? row.group : fallback;
        germanyExpenseBy[group] = Number(germanyExpenseBy[group] || 0) + amountKzt;
      });

      const germanyIncomeKzt = Object.values(germanyIncomeBy).reduce((sum, value) => sum + Number(value || 0), 0);
      const germanyExpenseKzt = Object.values(germanyExpenseBy).reduce((sum, value) => sum + Number(value || 0), 0);
      const kzIncomeKzt = Number(diary.incomeTotal || 0);
      const kzExpenseKzt = Number(diary.expenseTotal || 0);
      const incomeKzt = germanyIncomeKzt + kzIncomeKzt;
      const expenseKzt = germanyExpenseKzt + kzExpenseKzt;
      const netKzt = incomeKzt - expenseKzt;
      cumulativeKzt += netKzt;

      return {
        month,
        incomeKzt,
        expenseKzt,
        netKzt,
        cumulativeKzt,
        germanyIncomeBy,
        germanyExpenseBy,
        germanyIncomeKzt,
        germanyExpenseKzt,
        kzIncomeKzt,
        kzExpenseKzt
      };
    });
  }, [plan, incomeCategoryNames, expenseCategoryNames, getDiaryBalanceBeforeMonth, getDiaryMonthPlan, eurBuyRate, eurSellRate]);

  const summary = useMemo(() => {
    const min = Math.min(...germanyData.map((m) => m.cumulativeKzt), 0);
    const firstNegative = germanyData.find((m) => m.cumulativeKzt < 0)?.month || "";
    const totalIncome = germanyData.reduce((s, m) => s + m.incomeKzt, 0);
    const totalExpense = germanyData.reduce((s, m) => s + m.expenseKzt, 0);
    const last = germanyData.at(-1);
    const safeIndex = germanyData.findIndex((m) => m.cumulativeKzt < 0);
    return {
      min,
      firstNegative,
      totalIncome,
      totalExpense,
      endKzt: last?.cumulativeKzt || 0,
      safeMonths: safeIndex === -1 ? germanyData.length : safeIndex
    };
  }, [germanyData]);

  const partTimeNet = calcGermanNet(Number(plan.grossPartTime || 0), plan);
  const mainNet = calcGermanNet(Number(plan.grossMain || 0), plan);
  const matrixValue = (amountKzt: number) => compact(fromKzt(amountKzt, matrixCurrency, eurSellRate));
  const startBalance = getDiaryBalanceBeforeMonth(plan.startMonth);

  const germanyMonthRows = useMemo(() => {
    const recurring = plan.germanyExpenses
      .filter((row) => germanyExpenseApplies(row, germanyViewMonth, plan.startMonth))
      .map((row) => ({
        id: row.id,
        source: "regular" as const,
        group: row.group,
        title: row.title,
        amount: nonNegativeNumber(row.amount),
        currency: row.currency,
        badge: row.frequency === "monthly" ? "регулярно" : row.frequency === "quarterly" ? "квартал" : "год",
        frequency: row.frequency,
        startMonth: row.startMonth,
        endMonth: row.endMonth,
        checked: !isGermanyMonthExcluded("regular", row.id, germanyViewMonth),
        amountKzt: toKzt(Math.max(Number(row.amount || 0), 0), row.currency, eurSellRate)
      }));

    const scenario = plan.rows
      .filter((row) => row.kind === "expense" && row.country === "DE" && rowApplies(row, germanyViewMonth, plan.startMonth))
      .map((row) => {
        const amount = Math.max(Number(effectiveRowAmount(row, partTimeNet.net, mainNet.net) || 0), 0);
        const currency = effectiveRowCurrency(row);
        return {
          id: row.id,
          source: "scenario" as const,
          group: row.group,
          title: row.title,
          amount,
          currency,
          badge: row.frequency === "once" ? "разово" : row.frequency === "monthly" ? "ежемесячно" : row.frequency === "quarterly" ? "квартал" : "год",
          frequency: row.frequency,
          startMonth: row.startMonth,
          endMonth: row.endMonth,
          checked: !isGermanyMonthExcluded("scenario", row.id, germanyViewMonth),
          amountKzt: toKzt(amount, currency, eurSellRate)
        };
      });

    return [...recurring, ...scenario].sort((a, b) => Number(b.checked) - Number(a.checked) || b.amountKzt - a.amountKzt);
  }, [plan, germanyViewMonth, partTimeNet.net, mainNet.net, eurSellRate]);

  const germanyMonthTotal = useMemo(
    () => germanyMonthRows.filter((row) => row.checked).reduce((sum, row) => sum + row.amountKzt, 0),
    [germanyMonthRows]
  );

  const germanyGroupedRows = useMemo(() => {
    const grouped = new Map<string, typeof germanyMonthRows>();
    for (const row of germanyMonthRows) {
      const key = row.group || "Другое";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return Array.from(grouped.entries()).map(([group, rows]) => ({
      group,
      rows,
      totalKzt: rows.filter((row) => row.checked).reduce((sum, row) => sum + row.amountKzt, 0)
    }));
  }, [germanyMonthRows]);

  function toggleGermanyGroup(group: string) {
    setCollapsedGermanyGroups((previous) => ({ ...previous, [group]: !previous[group] }));
  }

  const scenarioMeta = useMemo(() => {
    const activeRows = plan.rows.filter((row) => row.active);
    return {
      activeCount: activeRows.length,
      incomeCount: activeRows.filter((row) => row.kind === "income").length,
      expenseCount: activeRows.filter((row) => row.kind === "expense").length
    };
  }, [plan.rows]);

  if (loading) return <section className="relocationPanel">Загрузка раздела Германии…</section>;

  if (loadError) {
    return (
      <section className="relocationPanel plannerLoadError">
        <b>Не удалось загрузить раздел Германии</b>
        <span>{loadError}</span>
        <button type="button" className="btn blue" onClick={() => loadPlan()}>Повторить</button>
      </section>
    );
  }

  return (
    <section className="relocationPanel">
      <div className="relocationHead">
        <div>
          <div className="relocationTitleLine">
            <h2>Германия</h2>
            <span className="syncBadge">Казахстан синхронизирован</span>
          </div>
          <p>Верхние параметры относятся к сценарию Германии. Казахстан остаётся в отдельном разделе, а здесь настраиваются Германия и прочие сценарные суммы.</p>
        </div>
        <div className="relocationActions">
          <span className={`plannerSaveState ${saveStatus}`}>{saveStatus === "saving" ? "Сохраняется…" : saveStatus === "error" ? "Ошибка сохранения" : dirty ? "Изменения ожидают сохранения" : "Все изменения сохранены"}</span>
          <button type="button" className={`btn ${dirty || saveStatus === "error" ? "blue" : ""}`} onClick={() => void savePlan()} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Сохранение…" : dirty || saveStatus === "error" ? "Сохранить сейчас" : "Сохранено"}
          </button>
        </div>
      </div>

      {message && <div className="plannerMessage">{message}</div>}

      <div className="plannerInfoToggles plannerTopToggles plannerToggleBar">
        <button type="button" className={`plannerInfoBtn ${showScenarioParams ? "active" : ""}`} onClick={() => setShowScenarioParams((v) => !v)}>
          {showScenarioParams ? "Скрыть" : "Показать"} параметры сценария
        </button>
        <button type="button" className={`plannerInfoBtn ${showScenarioSummary ? "active" : ""}`} onClick={() => setShowScenarioSummary((v) => !v)}>
          {showScenarioSummary ? "Скрыть" : "Показать"} сводку сценария
        </button>
        <button type="button" className={`plannerInfoBtn ${showSalaryCard ? "active" : ""}`} onClick={() => setShowSalaryCard((v) => !v)}>
          {showSalaryCard ? "Скрыть" : "Показать"} расчёт дохода
        </button>
        <button type="button" className={`plannerInfoBtn ${showScenarioArticles ? "active" : ""}`} onClick={() => setShowScenarioArticles((v) => !v)}>
          {showScenarioArticles ? "Скрыть" : "Показать"} сценарные статьи
        </button>
        <button type="button" className="btn blue plannerQuickAdd" onClick={() => { addRow("income"); setShowScenarioArticles(true); }}>+ доход</button>
      </div>

      {showScenarioArticles && (
        <div className="plannerSources plannerDiarySection">
          <div className="sourcesHead">
            <div>
              <h3>Германия и прочие сценарные статьи</h3>
              <p>Здесь остаются доходы и разовые сценарные расходы. Регулярные расходы Германии настраиваются в разделе «Германия».</p>
            </div>
            <div>
              <button type="button" className="btn blue" onClick={() => { addRow("income"); setShowScenarioArticles(true); }}>+ доход</button>
              <button type="button" className="btn" onClick={() => { addRow("expense"); setShowScenarioArticles(true); }}>+ расход</button>
            </div>
          </div>

          <div className="plannerQuickMeta subtle">
            <span>Активно: <b>{scenarioMeta.activeCount}</b></span>
            <span>Доходных: <b>{scenarioMeta.incomeCount}</b></span>
            <span>Расходных: <b>{scenarioMeta.expenseCount}</b></span>
          </div>

          <div className="scenarioList">
            <div className="scenarioListHead" aria-hidden="true">
              <span>on</span>
              <span>Тип</span>
              <span>Группа</span>
              <span>Название</span>
              <span>Сумма</span>
              <span>Страна</span>
              <span>Расчёт</span>
              <span>Частота</span>
              <span>Период</span>
              <span></span>
            </div>
            {plan.rows.map((row) => (
              <div key={row.id} className={`scenarioItem ${row.kind} ${row.active ? "" : "inactive"}`}>
                <label className="scenarioActive" title="Активность строки">
                  <input type="checkbox" checked={row.active} onChange={(e) => updateRow(row.id, { active: e.target.checked })} />
                  <span>on</span>
                </label>

                <label>
                  <span>Тип</span>
                  <select value={row.kind} onChange={(e) => updateRow(row.id, { kind: e.target.value as RowKind })}>
                    <option value="income">доход</option>
                    <option value="expense">расход</option>
                  </select>
                </label>

                <label>
                  <span>Группа</span>
                  <select value={row.group} onChange={(e) => updateRow(row.id, { group: e.target.value })}>
                    {groupNames(row.kind).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>

                <label className="scenarioTitleField">
                  <span>Название</span>
                  <input value={row.title} onChange={(e) => updateRow(row.id, { title: e.target.value })} />
                </label>

                <label className="scenarioAmountField">
                  <span>Сумма</span>
                  <div className="amountEditor">
                    <input
                      type="number"
                      min="0"
                      value={row.autoSource ? Math.round(effectiveRowAmount(row, partTimeNet.net, mainNet.net)) : row.amount}
                      disabled={!!row.autoSource}
                      onChange={(e) => updateRow(row.id, { amount: Math.max(Number(e.target.value || 0), 0) })}
                    />
                    <select
                      value={effectiveRowCurrency(row)}
                      disabled={!!row.autoSource}
                      onChange={(e) => updateRow(row.id, { currency: e.target.value as Currency })}
                    >
                      <option value="KZT">₸</option>
                      <option value="EUR">€</option>
                    </select>
                  </div>
                </label>

                <label>
                  <span>Страна</span>
                  <select value={row.country} onChange={(e) => updateRow(row.id, { country: e.target.value as Country })}>
                    {Object.entries(countries).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                  </select>
                </label>

                <label>
                  <span>Расчёт</span>
                  <select
                    value={row.autoSource || ""}
                    onChange={(e) => {
                      const autoSource = e.target.value as PlanRow["autoSource"];
                      updateRow(row.id, { autoSource, ...(autoSource ? { currency: "EUR" as Currency } : {}) });
                    }}
                  >
                    <option value="">ручная сумма</option>
                    <option value="partTimeNet">нетто подработка</option>
                    <option value="mainNet">нетто основная</option>
                  </select>
                </label>

                <label>
                  <span>Частота</span>
                  <select value={row.frequency} onChange={(e) => updateRow(row.id, { frequency: e.target.value as Frequency })}>
                    {row.kind === "income" || row.country === "OTHER" ? <>
                      <option value="monthly">ежемесячно</option>
                      <option value="quarterly">квартал</option>
                      <option value="yearly">год</option>
                    </> : null}
                    <option value="once">разово</option>
                  </select>
                </label>

                <label className="scenarioPeriodField">
                  <span>Период</span>
                  <div className="periodEditor">
                    <MonthPicker value={row.startMonth} onChange={(value) => updateRow(row.id, { startMonth: value || row.startMonth })} />
                    <span>—</span>
                    <MonthPicker className="periodEndPicker" value={row.endMonth} min={row.startMonth} nullable onChange={(value) => updateRow(row.id, { endMonth: value || "" })} />
                  </div>
                </label>

                <div className="rowTools scenarioRowTools">
                  <button type="button" title="Дублировать" onClick={() => duplicateRow(row)}>⧉</button>
                  <button type="button" title="Удалить" onClick={() => deleteRow(row.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showScenarioParams && (
        <div className="scenarioBar">
          <label>Начало сценария<MonthPicker value={plan.startMonth} min={diaryStartMonth} onChange={(value) => updateStartMonth(value || diaryStartMonth)} /></label>
          <label>Горизонт, месяцев<input type="number" min="1" max="120" value={plan.months} onChange={(e) => updatePlan({ months: Number(e.target.value || 1) })} /></label>
          <div className="autoBalanceBox exchangeRateScenarioBox">
            <span>Автоматический курс EUR</span>
            <b>{exchangeRateReady ? `покупка ${compact(eurBuyRate)} ₸ · продажа ${compact(eurSellRate)} ₸` : "курс недоступен"}</b>
            <small>источник: mig.kz · ручное изменение отключено</small>
          </div>
          <label>Резерв в EUR<input type="number" min="0" value={plan.startBalanceEur} onChange={(e) => updatePlan({ startBalanceEur: Math.max(Number(e.target.value || 0), 0) })} /></label>
          <div className="autoBalanceBox">
            <span>Стартовый остаток KZT</span>
            <b>{fmt(startBalance)}</b>
            <small>автоматически из дневника</small>
          </div>
        </div>
      )}

      {showScenarioSummary && (
        <div className="plannerKpis">
          <div><span>Без ухода в минус</span><b>{summary.safeMonths} мес.</b></div>
          <div><span>Первый минус</span><b className={summary.firstNegative ? "bad" : "ok"}>{summary.firstNegative ? monthLabel(summary.firstNegative) : "нет"}</b></div>
          <div><span>Минимальный остаток</span><b className={summary.min < 0 ? "bad" : "ok"}>{fmt(summary.min)}</b></div>
          <div><span>На конец горизонта</span><b className={summary.endKzt < 0 ? "bad" : "ok"}>{fmt(summary.endKzt)}</b></div>
          <div><span>Доходы всего</span><b>{fmt(summary.totalIncome)}</b></div>
          <div><span>Расходы всего</span><b>{fmt(summary.totalExpense)}</b></div>
        </div>
      )}



      <div className="plannerWorkspace plannerWorkspaceStacked">
        {showSalaryCard && (
          <div className="plannerMainGrid compactGrid">
            <div className="plannerCard compactCard salaryCard">
              <div className="cardTitleRow">
                <div>
                  <h3>Германия · расчёт дохода</h3>
                  <p>Нетто автоматически подставляется в строки доходов сценария.</p>
                </div>
              </div>
              <div className="salaryGrid">
                <label>Подработка gross, €<input type="number" min="0" value={plan.grossPartTime} onChange={(e) => updatePlan({ grossPartTime: Math.max(Number(e.target.value || 0), 0) })} /></label>
                <label>Основная gross, €<input type="number" min="0" value={plan.grossMain} onChange={(e) => updatePlan({ grossMain: Math.max(Number(e.target.value || 0), 0) })} /></label>
                <label>Доп. взнос KK<input type="number" min="0" step="0.001" value={plan.kkAdditional} onChange={(e) => updatePlan({ kkAdditional: Math.max(Number(e.target.value || 0), 0) })} /></label>
                <label className="checkLine"><input type="checkbox" checked={plan.hasChildren} onChange={(e) => updatePlan({ hasChildren: e.target.checked })} /> есть дети</label>
                <label className="checkLine"><input type="checkbox" checked={plan.churchTax} onChange={(e) => updatePlan({ churchTax: e.target.checked })} /> церковный налог</label>
              </div>
              <div className="salaryResults">
                <div><span>Подработка netto</span><b>{fmt(partTimeNet.net, "EUR")}</b></div>
                <div><span>Основная netto</span><b>{fmt(mainNet.net, "EUR")}</b></div>
                <div><span>Удержания основной</span><b>{fmt(mainNet.deductions, "EUR")}</b></div>
              </div>
              <p className="smallWarn">Расчёт ориентировочный. Для точного сценария можно выбрать «ручная сумма» в строке дохода.</p>
            </div>
          </div>
        )}

        <div className="germanyDashboard">
          <section className="panel diaryPanel germanyExpensePanel">
            <div className="panel-head">
              <div>
                <h2>Расходы Германии</h2>
                <span className="hint">{germanyMonthRows.length} поз. · {fmt(germanyMonthTotal)}</span>
              </div>
              <div className="panel-tools diaryPanelTools">
                <div className="diaryMonthInline">
                  <span className="hint">Период Германии</span>
                  <button className="btn month-btn" disabled={monthIndex(germanyViewMonth) <= monthIndex(plan.startMonth)} onClick={() => setGermanyViewMonth(addMonths(germanyViewMonth, -1))}>←</button>
                  <div className="diaryMonthPickerWrap">
                    <MonthPicker value={germanyViewMonth} min={plan.startMonth} onChange={(value) => value && setGermanyViewMonth(value)} />
                  </div>
                  <button className="btn month-btn current" onClick={() => setGermanyViewMonth(plan.startMonth)}>старт</button>
                  <button className="btn month-btn" onClick={() => setGermanyViewMonth(addMonths(germanyViewMonth, 1))}>→</button>
                </div>
                <button type="button" className="btn blue" onClick={addGermanyExpense}>+ расход</button>
              </div>
            </div>

            <div className="tablebox germanyExpenseTableBox">
              <div className="thead germanyExpenseHead kzLikeHead">
                <div>✓</div>
                <div>Тип</div>
                <div>Статья</div>
                <div>Комментарий</div>
                <div>Параметры</div>
                <div>Сумма</div>
                <div></div>
              </div>
              <div className="tbody germanyExpenseBody kzLikeBody">
                {germanyMonthRows.length === 0 && <div className="empty">Нет расходов Германии за {monthLabel(germanyViewMonth)}.</div>}
                {germanyGroupedRows.map(({ group, rows, totalKzt }) => {
                  const collapsed = !!collapsedGermanyGroups[group];
                  return (
                    <div key={group} className="kzLikeGroupWrap">
                      <div className={`opgroup ${collapsed ? "collapsed" : ""}`} onClick={() => toggleGermanyGroup(group)}>
                        <button className="groupToggle">{collapsed ? "▸" : "▾"}</button>
                        <div className="groupTitle">{group}</div>
                        <div className="groupMeta">{rows.length} поз. · −{fmt(totalKzt)}</div>
                      </div>
                      {!collapsed && rows.map((row) => (
                        <div className={`oprow expense germanyKzRow ${row.checked ? "done" : "pending"} ${row.source === "scenario" ? "virtual" : ""}`} key={`${row.source}-${row.id}`}>
                          <label className="checkcell">
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={(event) => toggleGermanyMonthItem(row.source, row.id, germanyViewMonth, event.target.checked)}
                            />
                            <span />
                          </label>
                          <div className="cell germanyCellType">
                            <select
                              className="germanyInlineControl"
                              value={row.source}
                              aria-label="Тип расхода"
                              onChange={(event) => changeGermanyExpenseType(row.source, row.id, event.target.value as "regular" | "scenario")}
                            >
                              <option value="regular">Рег.</option>
                              <option value="scenario">Сцен.</option>
                            </select>
                          </div>
                          <div className="cell germanyCellGroup">
                            <select
                              className="germanyInlineControl"
                              value={row.group}
                              aria-label="Статья расхода"
                              onChange={(event) => row.source === "regular"
                                ? updateGermanyExpense(row.id, { group: event.target.value })
                                : updateRow(row.id, { group: event.target.value })}
                            >
                              {expenseCategoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                          </div>
                          <div className="cell germanyCellComment">
                            <input
                              className="germanyInlineControl"
                              value={row.title}
                              aria-label="Комментарий расхода"
                              onChange={(event) => row.source === "regular"
                                ? updateGermanyExpense(row.id, { title: event.target.value })
                                : updateRow(row.id, { title: event.target.value })}
                            />
                          </div>
                          <div className="cell germanyCellParams">
                            <div className="germanyInlinePeriod">
                              <select
                                className="germanyInlineControl"
                                value={row.frequency}
                                aria-label="Частота расхода"
                                onChange={(event) => row.source === "regular"
                                  ? updateGermanyExpense(row.id, { frequency: event.target.value as GermanyRecurringExpense["frequency"] })
                                  : updateRow(row.id, { frequency: event.target.value as Frequency })}
                              >
                                {row.source === "scenario" && <option value="once">Разово</option>}
                                <option value="monthly">Ежем.</option>
                                <option value="quarterly">Кварт.</option>
                                <option value="yearly">Год</option>
                              </select>
                              <input
                                type="month"
                                className="germanyInlineControl"
                                value={row.startMonth}
                                min={plan.startMonth}
                                aria-label="Начало действия"
                                onChange={(event) => row.source === "regular"
                                  ? updateGermanyExpense(row.id, { startMonth: event.target.value })
                                  : updateRow(row.id, { startMonth: event.target.value })}
                              />
                              <input
                                type="month"
                                className="germanyInlineControl"
                                value={row.endMonth}
                                min={row.startMonth || plan.startMonth}
                                aria-label="Окончание действия"
                                onChange={(event) => row.source === "regular"
                                  ? updateGermanyExpense(row.id, { endMonth: event.target.value })
                                  : updateRow(row.id, { endMonth: event.target.value })}
                              />
                            </div>
                          </div>
                          <div className="amount expense germanyCellAmount">
                            <div className="germanyInlineMoney">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="germanyInlineControl"
                                value={row.amount}
                                aria-label="Сумма расхода"
                                onChange={(event) => row.source === "regular"
                                  ? updateGermanyExpense(row.id, { amount: Math.max(Number(event.target.value || 0), 0) })
                                  : updateRow(row.id, { amount: Math.max(Number(event.target.value || 0), 0), autoSource: "" })}
                              />
                              <select
                                className="germanyInlineControl germanyCurrencySelect"
                                value={row.currency}
                                aria-label="Валюта расхода"
                                onChange={(event) => row.source === "regular"
                                  ? updateGermanyExpense(row.id, { currency: event.target.value as Currency })
                                  : updateRow(row.id, { currency: event.target.value as Currency, autoSource: "" })}
                              >
                                <option value="EUR">€</option>
                                <option value="KZT">₸</option>
                              </select>
                            </div>
                          </div>
                          <div className="rowactions">
                            <button
                              className="delete"
                              type="button"
                              title="Удалить"
                              onClick={() => {
                                if (window.confirm(`Удалить «${row.title}»?`)) deleteGermanyMonthRow(row.source, row.id);
                              }}
                            >×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="pager germanyMiniFooter">
                <span>{monthLabel(germanyViewMonth)}</span>
                <b>Итого: {fmt(germanyMonthTotal)}</b>
              </div>
            </div>
          </section>

          <section className="panel forecastPanel germanyForecastPanel">
            <div className="panel-head forecastPanelHead">
              <div>
                <h2>Календарный прогноз</h2>
                <span className="hint">статьи общие с Казахстаном · горизонт {germanyData.length} мес. · в окне видно около 15 месяцев</span>
              </div>
              <div className="matrixCurrencyTools">
                <span>{exchangeRateReady ? `EUR: ${compact(eurBuyRate)} / ${compact(eurSellRate)} ₸` : "EUR: курс недоступен"}</span>
                <div className="currencyToggle" role="group" aria-label="Валюта таблицы">
                  <button type="button" className={matrixCurrency === "KZT" ? "active" : ""} onClick={() => setMatrixCurrency("KZT")}>₸</button>
                  <button type="button" className={matrixCurrency === "EUR" ? "active" : ""} onClick={() => setMatrixCurrency("EUR")}>€</button>
                </div>
              </div>
            </div>

            <div className="matrixbox germanyForecastBox">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="corner">Показатель</th>
                    {germanyData.map((m) => <th key={`y-${m.month}`} className="year">{m.month.slice(0, 4)}</th>)}
                  </tr>
                  <tr>
                    <th className="corner sub">Месяц</th>
                    {germanyData.map((m) => <th key={`m-${m.month}`} className="month">{monthLabel(m.month)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="strong netRow"><th className="rowhead">Остаток месяца</th>{germanyData.map((m) => <td className={m.netKzt < 0 ? "neg" : ""} key={`net-${m.month}`}>{matrixValue(m.netKzt)}</td>)}</tr>
                  <tr className="strong cumulativeRow"><th className="rowhead">Накопительно</th>{germanyData.map((m) => <td className={m.cumulativeKzt < 0 ? "neg" : ""} key={`bal-${m.month}`}>{matrixValue(m.cumulativeKzt)}</td>)}</tr>
                  <tr className="section incomeSection">
                    <th className="rowhead">
                      <button
                        type="button"
                        className="forecastGroupToggle"
                        aria-expanded={showIncomeArticles}
                        onClick={() => setShowIncomeArticles((value) => !value)}
                      >
                        <span>{showIncomeArticles ? "−" : "+"}</span>
                        Доходы
                      </button>
                    </th>
                    {germanyData.map((m) => <td key={`inc-${m.month}`}>{matrixValue(m.incomeKzt)}</td>)}
                  </tr>
                  {showIncomeArticles && incomeCategoryNames.map((name) => (
                    <tr className="incomeRow" key={`de-inc-${name}`}>
                      <th className="rowhead light">{name}</th>
                      {germanyData.map((m) => <td key={`de-inc-${name}-${m.month}`}>{matrixValue(m.germanyIncomeBy[name] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="incomeRow kzIncomeSummaryRow">
                    <th className="rowhead light">Казахстан · доходы</th>
                    {germanyData.map((m) => <td key={`kz-inc-${m.month}`}>{matrixValue(m.kzIncomeKzt)}</td>)}
                  </tr>
                  <tr className="section expenseSection">
                    <th className="rowhead">
                      <button
                        type="button"
                        className="forecastGroupToggle"
                        aria-expanded={showExpenseArticles}
                        onClick={() => setShowExpenseArticles((value) => !value)}
                      >
                        <span>{showExpenseArticles ? "−" : "+"}</span>
                        Расходы
                      </button>
                    </th>
                    {germanyData.map((m) => <td key={`exp-${m.month}`}>{matrixValue(m.expenseKzt)}</td>)}
                  </tr>
                  {showExpenseArticles && expenseCategoryNames.map((name) => (
                    <tr className="expenseRow" key={`de-exp-${name}`}>
                      <th className="rowhead light">{name}</th>
                      {germanyData.map((m) => <td key={`de-exp-${name}-${m.month}`}>{matrixValue(m.germanyExpenseBy[name] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="expenseRow kzExpenseSummaryRow">
                    <th className="rowhead light">Казахстан · расходы</th>
                    {germanyData.map((m) => <td key={`kz-exp-${m.month}`}>{matrixValue(m.kzExpenseKzt)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>


      </div>

    </section>
  );
}
