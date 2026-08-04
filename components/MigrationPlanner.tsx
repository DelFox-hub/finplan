"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import { createClient } from "@/lib/supabase/browser";

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
  eurKzt: number;
  startBalanceEur: number;
  grossPartTime: number;
  grossMain: number;
  kkAdditional: number;
  hasChildren: boolean;
  churchTax: boolean;
  rows: PlanRow[];
  germanyExpenses: GermanyRecurringExpense[];
};

type MonthPlan = {
  month: string;
  incomeKzt: number;
  expenseKzt: number;
  netKzt: number;
  cumulativeKzt: number;
  byCountry: Record<"KZ" | Country, { incomeKzt: number; expenseKzt: number }>;
  kzIncomeBy: Record<string, number>;
  kzExpenseBy: Record<string, number>;
  scenarioByRowKzt: Record<string, number>;
  germanyExpenseByIdKzt: Record<string, number>;
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

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultPlan(startMonth = currentMonth()): MigrationPlan {
  return {
    startMonth,
    months: 36,
    eurKzt: 650,
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
    ]
  };
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

function toKzt(amount: number, currency: Currency, eurKzt: number) {
  return currency === "EUR" ? amount * eurKzt : amount;
}

function fromKzt(amountKzt: number, currency: Currency, eurKzt: number) {
  return currency === "EUR" ? amountKzt / Math.max(Number(eurKzt || 1), 1) : amountKzt;
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
  const safeGross = Math.max(Number(gross || 0), 0);
  const additionalRate = Math.max(Number(options.kkAdditional || 0), 0);
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
  const rawRows = Array.isArray(raw.rows) ? raw.rows : base.rows;
  const requestedStart = raw.startMonth || base.startMonth;
  const safeStart = monthIndex(requestedStart) < monthIndex(diaryStartMonth) ? diaryStartMonth : requestedStart;

  const migratedGermanyRows = rawRows.filter((row: any) => row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once");
  const savedGermanyExpenses = Array.isArray((raw as any).germanyExpenses) ? (raw as any).germanyExpenses : [];
  const germanyExpenseSource = [...savedGermanyExpenses, ...migratedGermanyRows];
  const seenGermanyIds = new Set<string>();
  const germanyExpenses = germanyExpenseSource
    .map((row: any) => {
      const rowStart = row.startMonth && monthIndex(row.startMonth) >= monthIndex(safeStart) ? row.startMonth : safeStart;
      const rowEnd = row.endMonth && monthIndex(row.endMonth) >= monthIndex(rowStart) ? row.endMonth : "";
      return {
        id: row.id || uuid(),
        title: row.title || "Расход Германия",
        group: row.group || "расход",
        currency: row.currency === "KZT" ? "KZT" as Currency : "EUR" as Currency,
        amount: Number(row.amount || 0),
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

  return {
    ...base,
    ...raw,
    startMonth: safeStart,
    months: Math.min(Math.max(Number(raw.months || base.months), 1), 120),
    eurKzt: Math.max(Number(raw.eurKzt || base.eurKzt || 1), 1),
    startBalanceEur: Number(raw.startBalanceEur || 0),
    grossPartTime: Math.max(Number(raw.grossPartTime ?? base.grossPartTime), 0),
    grossMain: Math.max(Number(raw.grossMain ?? base.grossMain), 0),
    kkAdditional: Math.max(Number(raw.kkAdditional ?? base.kkAdditional), 0),
    hasChildren: !!raw.hasChildren,
    churchTax: !!raw.churchTax,
    germanyExpenses,
    rows: rawRows
      .filter((row: any) => row.country !== "KZ")
      .filter((row: any) => !(row.country === "DE" && row.kind === "expense" && row.frequency !== "once"))
      .map((row: any) => {
        const rowStart = row.startMonth && monthIndex(row.startMonth) >= monthIndex(safeStart) ? row.startMonth : safeStart;
        const rowEnd = row.endMonth && monthIndex(row.endMonth) >= monthIndex(rowStart) ? row.endMonth : "";
        return {
          id: row.id || uuid(),
          kind: row.kind === "income" ? "income" : "expense",
          title: row.title || "Строка",
          country: row.country === "OTHER" ? "OTHER" : "DE",
          currency: row.currency === "EUR" ? "EUR" : "KZT",
          amount: Number(row.amount || 0),
          autoSource: row.autoSource === "partTimeNet" || row.autoSource === "mainNet" ? row.autoSource : "",
          frequency: row.kind === "expense" && row.country === "DE"
            ? "once"
            : (["monthly", "quarterly", "yearly", "once"].includes(row.frequency) ? row.frequency : "monthly"),
          startMonth: rowStart,
          endMonth: rowEnd,
          active: row.active !== false,
          group: row.group || (row.kind === "income" ? "доход" : "расход"),
          comment: row.comment || ""
        };
      })
  };
}

export default function MigrationPlanner({
  userId,
  diaryStartMonth,
  expenseCategories,
  incomeCategories,
  getDiaryMonthPlan,
  getDiaryBalanceBeforeMonth
}: MigrationPlannerProps) {
  const [plan, setPlan] = useState<MigrationPlan>(() => defaultPlan(currentMonth()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [matrixCurrency, setMatrixCurrency] = useState<Currency>("KZT");
  const [forecastView, setForecastView] = useState<"summary" | "detail">("summary");
  const [showKzCard, setShowKzCard] = useState(false);
  const [showSalaryCard, setShowSalaryCard] = useState(false);
  const [showScenarioParams, setShowScenarioParams] = useState(false);
  const [showScenarioSummary, setShowScenarioSummary] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [matrixPage, setMatrixPage] = useState(0);
  const [matrixPageSize, setMatrixPageSize] = useState(6);
  const latestPlanRef = useRef(plan);
  const dirtyRef = useRef(false);
  const saveRequestRef = useRef(0);
  const autoSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const reload = () => void loadPlan();
    window.addEventListener("relocation-plan-updated", reload);
    return () => window.removeEventListener("relocation-plan-updated", reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    latestPlanRef.current = plan;
    dirtyRef.current = dirty;
  }, [plan, dirty]);

  useEffect(() => {
    const updatePageSize = () => {
      const width = window.innerWidth;
      setMatrixPageSize(width < 620 ? 2 : width < 980 ? 4 : 6);
    };
    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  useEffect(() => {
    setMatrixPage(0);
  }, [plan.startMonth, plan.months, matrixPageSize]);

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
      void supabase.from("relocation_plans").upsert({
        user_id: userId,
        data: latestPlanRef.current,
        updated_at: new Date().toISOString()
      });
    };
  }, [userId]);


  useEffect(() => {
    setPlan((previous) => {
      const normalized = normalizePlan(previous, diaryStartMonth);
      const changed = normalized.startMonth !== previous.startMonth
        || normalized.rows.some((row, index) => row.startMonth !== previous.rows[index]?.startMonth || row.endMonth !== previous.rows[index]?.endMonth);
      if (changed) setDirty(true);
      return changed ? normalized : previous;
    });
  }, [diaryStartMonth]);

  useEffect(() => {
    if (loading) return;
    setPlan((previous) => {
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
      if (changed) setDirty(true);
      return changed ? { ...previous, rows, germanyExpenses } : previous;
    });
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
      setPlan(normalizePlan(data.data, diaryStartMonth));
    } else {
      const seed = defaultPlan(monthIndex(currentMonth()) < monthIndex(diaryStartMonth) ? diaryStartMonth : currentMonth());
      const { error: seedError } = await supabase.from("relocation_plans").upsert({ user_id: userId, data: seed });
      if (seedError) {
        setLoadError(seedError.message);
        setLoading(false);
        return;
      }
      setPlan(seed);
    }

    setDirty(false);
    setLoading(false);
  }

  async function savePlan(next = plan, silent = false) {
    const requestId = ++saveRequestRef.current;
    const snapshot = JSON.stringify(next);
    setSaveStatus("saving");

    const { error } = await supabase.from("relocation_plans").upsert({
      user_id: userId,
      data: next,
      updated_at: new Date().toISOString()
    });

    if (requestId !== saveRequestRef.current) return;

    if (error) {
      setSaveStatus("error");
      setMessage(`Не удалось сохранить: ${error.message}`);
      return;
    }

    setSaveStatus("saved");
    setMessage("");
    if (JSON.stringify(latestPlanRef.current) === snapshot) setDirty(false);
    if (!silent) {
      setMessage("План сохранён");
      window.setTimeout(() => setMessage(""), 2500);
    }
  }

  function groupNames(kind: RowKind) {
    const source = kind === "income" ? incomeCategories : expenseCategories;
    const names = [...new Set(source.map((category) => category.name.trim()).filter(Boolean))];
    return names.length ? names : [kind === "income" ? "Доход" : "Расход"];
  }

  function defaultGroup(kind: RowKind) {
    return groupNames(kind)[0];
  }

  function updatePlan(patch: Partial<MigrationPlan>) {
    setPlan((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function updateStartMonth(value: string) {
    const next = !value || monthIndex(value) < monthIndex(diaryStartMonth) ? diaryStartMonth : value;
    updatePlan({ startMonth: next });
  }

  function updateRow(id: string, patch: Partial<PlanRow>) {
    setPlan((previous) => ({
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
    setDirty(true);
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
    let cumulativeKzt = getDiaryBalanceBeforeMonth(plan.startMonth) + Number(plan.startBalanceEur || 0) * Number(plan.eurKzt || 1);

    return months.map((month): MonthPlan => {
      const diary = getDiaryMonthPlan(month);
      const byCountry: MonthPlan["byCountry"] = {
        KZ: { incomeKzt: Number(diary.incomeTotal || 0), expenseKzt: Number(diary.expenseTotal || 0) },
        DE: { incomeKzt: 0, expenseKzt: 0 },
        OTHER: { incomeKzt: 0, expenseKzt: 0 }
      };

      let incomeKzt = Number(diary.incomeTotal || 0);
      let expenseKzt = Number(diary.expenseTotal || 0);
      const scenarioByRowKzt: Record<string, number> = {};
      const germanyExpenseByIdKzt: Record<string, number> = {};

      const partTimeNetLocal = calcGermanNet(Number(plan.grossPartTime || 0), plan).net;
      const mainNetLocal = calcGermanNet(Number(plan.grossMain || 0), plan).net;

      plan.rows.forEach((row) => {
        scenarioByRowKzt[row.id] = 0;
        if (!rowApplies(row, month, plan.startMonth)) return;

        const sourceAmount = effectiveRowAmount(row, partTimeNetLocal, mainNetLocal);
        const amountKzt = toKzt(sourceAmount, effectiveRowCurrency(row), Number(plan.eurKzt || 1));
        scenarioByRowKzt[row.id] = amountKzt;

        if (row.kind === "income") {
          incomeKzt += amountKzt;
          byCountry[row.country].incomeKzt += amountKzt;
        } else {
          expenseKzt += amountKzt;
          byCountry[row.country].expenseKzt += amountKzt;
        }
      });

      plan.germanyExpenses.forEach((row) => {
        germanyExpenseByIdKzt[row.id] = 0;
        if (!germanyExpenseApplies(row, month, plan.startMonth)) return;
        const amountKzt = toKzt(Number(row.amount || 0), row.currency, Number(plan.eurKzt || 1));
        germanyExpenseByIdKzt[row.id] = amountKzt;
        expenseKzt += amountKzt;
        byCountry.DE.expenseKzt += amountKzt;
      });

      const netKzt = incomeKzt - expenseKzt;
      cumulativeKzt += netKzt;

      return {
        month,
        incomeKzt,
        expenseKzt,
        netKzt,
        cumulativeKzt,
        byCountry,
        kzIncomeBy: diary.incomeBy || {},
        kzExpenseBy: diary.expenseBy || {},
        scenarioByRowKzt,
        germanyExpenseByIdKzt
      };
    });
  }, [plan, getDiaryBalanceBeforeMonth, getDiaryMonthPlan]);

  const matrixPageCount = Math.max(1, Math.ceil(data.length / matrixPageSize));
  const safeMatrixPage = Math.min(matrixPage, matrixPageCount - 1);
  const visibleData = useMemo(
    () => data.slice(safeMatrixPage * matrixPageSize, safeMatrixPage * matrixPageSize + matrixPageSize),
    [data, safeMatrixPage, matrixPageSize]
  );

  const summary = useMemo(() => {
    const min = Math.min(...data.map((m) => m.cumulativeKzt), 0);
    const firstNegative = data.find((m) => m.cumulativeKzt < 0)?.month || "";
    const totalIncome = data.reduce((s, m) => s + m.incomeKzt, 0);
    const totalExpense = data.reduce((s, m) => s + m.expenseKzt, 0);
    const last = data.at(-1);
    const safeIndex = data.findIndex((m) => m.cumulativeKzt < 0);
    return {
      min,
      firstNegative,
      totalIncome,
      totalExpense,
      endKzt: last?.cumulativeKzt || 0,
      safeMonths: safeIndex === -1 ? data.length : safeIndex
    };
  }, [data]);

  const partTimeNet = calcGermanNet(Number(plan.grossPartTime || 0), plan);
  const mainNet = calcGermanNet(Number(plan.grossMain || 0), plan);
  const matrixValue = (amountKzt: number) => compact(fromKzt(amountKzt, matrixCurrency, Number(plan.eurKzt || 1)));
  const scenarioRowsByCountry = (country: Country, kind: RowKind) => plan.rows.filter((row) => row.active && row.country === country && row.kind === kind);
  const startDiary = getDiaryMonthPlan(plan.startMonth);
  const startBalance = getDiaryBalanceBeforeMonth(plan.startMonth);
  const startEndBalance = startBalance + startDiary.net;

  const kzIncomeNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((month) => Object.entries(month.kzIncomeBy).forEach(([name, value]) => Number(value) !== 0 && names.add(name)));
    return [...names];
  }, [data]);

  const kzExpenseNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((month) => Object.entries(month.kzExpenseBy).forEach(([name, value]) => Number(value) !== 0 && names.add(name)));
    return [...names];
  }, [data]);

  const scenarioMeta = useMemo(() => {
    const activeRows = plan.rows.filter((row) => row.active);
    return {
      activeCount: activeRows.length,
      incomeCount: activeRows.filter((row) => row.kind === "income").length,
      expenseCount: activeRows.filter((row) => row.kind === "expense").length
    };
  }, [plan.rows]);

  if (loading) return <section className="relocationPanel">Загрузка калькулятора…</section>;

  if (loadError) {
    return (
      <section className="relocationPanel plannerLoadError">
        <b>Не удалось загрузить план переезда</b>
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
            <h2>План переезда</h2>
            <span className="syncBadge">Казахстан синхронизирован</span>
          </div>
          <p>Доходы, расходы, кредиты, квартира и остальные статьи Казахстана берутся напрямую из дневника. Здесь редактируются только Германия и прочие сценарные суммы.</p>
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
        <button type="button" className={`plannerInfoBtn ${showKzCard ? "active" : ""}`} onClick={() => setShowKzCard((v) => !v)}>
          {showKzCard ? "Скрыть" : "Показать"} Казахстан
        </button>
        <button type="button" className={`plannerInfoBtn ${showSalaryCard ? "active" : ""}`} onClick={() => setShowSalaryCard((v) => !v)}>
          {showSalaryCard ? "Скрыть" : "Показать"} расчёт дохода
        </button>
      </div>

      {showScenarioParams && (
        <div className="scenarioBar">
          <label>Начало сценария<MonthPicker value={plan.startMonth} min={diaryStartMonth} onChange={(value) => updateStartMonth(value || diaryStartMonth)} /></label>
          <label>Горизонт, месяцев<input type="number" min="1" max="120" value={plan.months} onChange={(e) => updatePlan({ months: Number(e.target.value || 1) })} /></label>
          <label>Курс EUR → KZT<input type="number" min="1" value={plan.eurKzt} onChange={(e) => updatePlan({ eurKzt: Number(e.target.value || 1) })} /></label>
          <label>Резерв в EUR<input type="number" value={plan.startBalanceEur} onChange={(e) => updatePlan({ startBalanceEur: Number(e.target.value || 0) })} /></label>
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
        {(showKzCard || showSalaryCard) && (
          <div className="plannerMainGrid compactGrid">
            {showKzCard && <div className="plannerCard compactCard kzSyncCard">
              <div className="cardTitleRow">
                <div>
                  <h3>Казахстан · {monthLabel(plan.startMonth)}</h3>
                  <p>Точное отражение календарного прогноза дневника.</p>
                </div>
                <span className="readOnlyBadge">только чтение</span>
              </div>

              <div className="kzMonthTotals">
                <div className="income"><span>Доходы</span><b>{fmt(startDiary.incomeTotal)}</b></div>
                <div className="expense"><span>Расходы</span><b>{fmt(startDiary.expenseTotal)}</b></div>
                <div><span>Остаток месяца</span><b className={startDiary.net < 0 ? "bad" : "ok"}>{fmt(startDiary.net)}</b></div>
                <div><span>На конец месяца</span><b className={startEndBalance < 0 ? "bad" : "ok"}>{fmt(startEndBalance)}</b></div>
              </div>

              <div className="kzBreakdown compactBreakdown">
                <div>
                  <h4>Доходы</h4>
                  {Object.entries(startDiary.incomeBy).filter(([, value]) => Number(value) !== 0).map(([name, value]) => (
                    <div className="breakdownLine" key={`kzi-${name}`}><span>{name}</span><b>{fmt(value)}</b></div>
                  ))}
                  {Object.values(startDiary.incomeBy).every((value) => Number(value) === 0) && <div className="emptyMini">Нет доходов</div>}
                </div>
                <div>
                  <h4>Расходы</h4>
                  {Object.entries(startDiary.expenseBy).filter(([, value]) => Number(value) !== 0).map(([name, value]) => (
                    <div className="breakdownLine" key={`kze-${name}`}><span>{name}</span><b>{fmt(value)}</b></div>
                  ))}
                  {Object.values(startDiary.expenseBy).every((value) => Number(value) === 0) && <div className="emptyMini">Нет расходов</div>}
                </div>
              </div>
            </div>}

            {showSalaryCard && <div className="plannerCard compactCard salaryCard">
              <div className="cardTitleRow">
                <div>
                  <h3>Германия · расчёт дохода</h3>
                  <p>Нетто автоматически подставляется в строки сценария.</p>
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
              <p className="smallWarn">Расчёт ориентировочный. Для точного сценария можно выбрать «ручная сумма» в нужной строке дохода.</p>
            </div>}
          </div>
        )}

        <div className="forecastBlock plannerDiarySection">
        <div className="forecastHead">
          <div>
            <h3>Помесячный сценарий</h3>
            <p>Все значения таблицы переключаются одним режимом. Пересчёт в обе стороны выполняется по курсу из шапки.</p>
          </div>
          <div className="matrixCurrencyTools">
            <span>1 € = {compact(plan.eurKzt)} ₸</span>
            <div className="matrixPager" aria-label="Страницы месяцев">
              <button type="button" onClick={() => setMatrixPage((page) => Math.max(0, page - 1))} disabled={safeMatrixPage === 0}>←</button>
              <span>{safeMatrixPage + 1} / {matrixPageCount}</span>
              <button type="button" onClick={() => setMatrixPage((page) => Math.min(matrixPageCount - 1, page + 1))} disabled={safeMatrixPage >= matrixPageCount - 1}>→</button>
            </div>
            <div className="currencyToggle" role="group" aria-label="Режим таблицы">
              <button type="button" className={forecastView === "summary" ? "active" : ""} onClick={() => setForecastView("summary")}>сводно</button>
              <button type="button" className={forecastView === "detail" ? "active" : ""} onClick={() => setForecastView("detail")}>детали</button>
            </div>
            <div className="currencyToggle" role="group" aria-label="Валюта таблицы">
              <button type="button" className={matrixCurrency === "KZT" ? "active" : ""} onClick={() => setMatrixCurrency("KZT")}>₸</button>
              <button type="button" className={matrixCurrency === "EUR" ? "active" : ""} onClick={() => setMatrixCurrency("EUR")}>€</button>
            </div>
          </div>
        </div>
        <div className="plannerMatrixWrap">
          <table className="plannerMatrix">
            <thead>
              <tr>
                <th className="stickyCol">Показатель</th>
                {visibleData.map((month) => <th key={month.month}>{monthLabel(month.month)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="strong totalIncomeRow"><th className="stickyCol">Доходы всего</th>{visibleData.map((month) => <td key={`i-${month.month}`}>{matrixValue(month.incomeKzt)}</td>)}</tr>
              <tr className="strong totalExpenseRow"><th className="stickyCol">Расходы всего</th>{visibleData.map((month) => <td key={`e-${month.month}`}>{matrixValue(month.expenseKzt)}</td>)}</tr>
              <tr className="strong netRow"><th className="stickyCol">Остаток месяца</th>{visibleData.map((month) => <td className={month.netKzt < 0 ? "badCell" : ""} key={`n-${month.month}`}>{matrixValue(month.netKzt)}</td>)}</tr>
              <tr className="strong cumulativeRow"><th className="stickyCol">Накопительно</th>{visibleData.map((month) => <td className={month.cumulativeKzt < 0 ? "badCell" : ""} key={`c-${month.month}`}>{matrixValue(month.cumulativeKzt)}</td>)}</tr>

              {forecastView === "summary" ? (
                <>
                  <tr className="countryNetRow kzNet"><th className="stickyCol">Казахстан · итог</th>{visibleData.map((month) => <td key={`kz-net-${month.month}`}>{matrixValue(month.byCountry.KZ.incomeKzt - month.byCountry.KZ.expenseKzt)}</td>)}</tr>
                  <tr className="countryNetRow deNet"><th className="stickyCol">Германия · итог</th>{visibleData.map((month) => <td key={`de-net-${month.month}`}>{matrixValue(month.byCountry.DE.incomeKzt - month.byCountry.DE.expenseKzt)}</td>)}</tr>
                  <tr className="countryNetRow otherNet"><th className="stickyCol">Другое · итог</th>{visibleData.map((month) => <td key={`other-net-${month.month}`}>{matrixValue(month.byCountry.OTHER.incomeKzt - month.byCountry.OTHER.expenseKzt)}</td>)}</tr>
                </>
              ) : (
                <>
                  <tr className="countrySection synced"><th className="stickyCol">Казахстан · дневник</th>{visibleData.map((month) => <td key={`kz-title-${month.month}`}></td>)}</tr>
                  <tr className="section incomeSection"><th className="stickyCol">Доходы</th>{visibleData.map((month) => <td key={`kzi-${month.month}`}>{matrixValue(month.byCountry.KZ.incomeKzt)}</td>)}</tr>
                  {kzIncomeNames.map((name) => (
                    <tr className="detailRow" key={`kzi-name-${name}`}>
                      <th className="stickyCol">{name}</th>
                      {visibleData.map((month) => <td key={`kzi-${name}-${month.month}`}>{matrixValue(month.kzIncomeBy[name] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="section expenseSection"><th className="stickyCol">Расходы</th>{visibleData.map((month) => <td key={`kze-${month.month}`}>{matrixValue(month.byCountry.KZ.expenseKzt)}</td>)}</tr>
                  {kzExpenseNames.map((name) => (
                    <tr className="detailRow" key={`kze-name-${name}`}>
                      <th className="stickyCol">{name}</th>
                      {visibleData.map((month) => <td key={`kze-${name}-${month.month}`}>{matrixValue(month.kzExpenseBy[name] || 0)}</td>)}
                    </tr>
                  ))}

                  <tr className="countrySection"><th className="stickyCol">Германия · настройки + сценарий</th>{visibleData.map((month) => <td key={`de-title-${month.month}`}></td>)}</tr>
                  <tr className="section incomeSection"><th className="stickyCol">Доходы</th>{visibleData.map((month) => <td key={`dei-${month.month}`}>{matrixValue(month.byCountry.DE.incomeKzt)}</td>)}</tr>
                  {scenarioRowsByCountry("DE", "income").map((row) => (
                    <tr className="detailRow" key={`de-income-${row.id}`}>
                      <th className="stickyCol">{row.title}</th>
                      {visibleData.map((month) => <td key={`de-income-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="section expenseSection"><th className="stickyCol">Расходы</th>{visibleData.map((month) => <td key={`dee-${month.month}`}>{matrixValue(month.byCountry.DE.expenseKzt)}</td>)}</tr>
                  {plan.germanyExpenses.filter((row) => row.active).map((row) => (
                    <tr className="detailRow" key={`de-regular-expense-${row.id}`}>
                      <th className="stickyCol">{row.title}</th>
                      {visibleData.map((month) => <td key={`de-regular-expense-${row.id}-${month.month}`}>{matrixValue(month.germanyExpenseByIdKzt[row.id] || 0)}</td>)}
                    </tr>
                  ))}
                  {scenarioRowsByCountry("DE", "expense").map((row) => (
                    <tr className="detailRow" key={`de-expense-${row.id}`}>
                      <th className="stickyCol">{row.title}</th>
                      {visibleData.map((month) => <td key={`de-expense-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                    </tr>
                  ))}

                  <tr className="countrySection"><th className="stickyCol">Другое</th>{visibleData.map((month) => <td key={`other-title-${month.month}`}></td>)}</tr>
                  <tr className="section incomeSection"><th className="stickyCol">Доходы</th>{visibleData.map((month) => <td key={`oi-${month.month}`}>{matrixValue(month.byCountry.OTHER.incomeKzt)}</td>)}</tr>
                  {scenarioRowsByCountry("OTHER", "income").map((row) => (
                    <tr className="detailRow" key={`other-income-${row.id}`}>
                      <th className="stickyCol">{row.title}</th>
                      {visibleData.map((month) => <td key={`other-income-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="section expenseSection"><th className="stickyCol">Расходы</th>{visibleData.map((month) => <td key={`oe-${month.month}`}>{matrixValue(month.byCountry.OTHER.expenseKzt)}</td>)}</tr>
                  {scenarioRowsByCountry("OTHER", "expense").map((row) => (
                    <tr className="detailRow" key={`other-expense-${row.id}`}>
                      <th className="stickyCol">{row.title}</th>
                      {visibleData.map((month) => <td key={`other-expense-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        </div>

        <div className="plannerSources plannerDiarySection">
          <div className="sourcesHead">
            <div>
              <h3>Германия и прочие сценарные статьи</h3>
              <p>Здесь остаются доходы и разовые сценарные расходы. Регулярные расходы Германии настраиваются в разделе «Германия».</p>
            </div>
            <div>
              <button type="button" className="btn blue" onClick={() => addRow("income")}>+ доход</button>
              <button type="button" className="btn" onClick={() => addRow("expense")}>+ расход</button>
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
                      value={row.autoSource ? Math.round(effectiveRowAmount(row, partTimeNet.net, mainNet.net)) : row.amount}
                      disabled={!!row.autoSource}
                      onChange={(e) => updateRow(row.id, { amount: Number(e.target.value || 0) })}
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
      </div>
    </section>
  );
}
