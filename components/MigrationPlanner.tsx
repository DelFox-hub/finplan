"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type MigrationPlannerProps = {
  userId: string;
  diaryStartMonth: string;
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
        title: "Питание Германия",
        country: "DE",
        currency: "EUR",
        amount: 250,
        frequency: "monthly",
        startMonth: addMonths(startMonth, 10),
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
        startMonth: addMonths(startMonth, 10),
        endMonth: "",
        active: true,
        group: "транспорт"
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
  const rows = Array.isArray(raw.rows) ? raw.rows : base.rows;
  const requestedStart = raw.startMonth || base.startMonth;
  const safeStart = monthIndex(requestedStart) < monthIndex(diaryStartMonth) ? diaryStartMonth : requestedStart;

  return {
    ...base,
    ...raw,
    startMonth: safeStart,
    months: Math.min(Math.max(Number(raw.months || base.months), 1), 120),
    eurKzt: Math.max(Number(raw.eurKzt || base.eurKzt || 1), 1),
    startBalanceEur: Number(raw.startBalanceEur || 0),
    rows: rows
      .filter((row: any) => row.country !== "KZ")
      .map((row: any) => ({
        id: row.id || uuid(),
        kind: row.kind === "income" ? "income" : "expense",
        title: row.title || "Строка",
        country: row.country === "OTHER" ? "OTHER" : "DE",
        currency: row.currency === "EUR" ? "EUR" : "KZT",
        amount: Number(row.amount || 0),
        autoSource: row.autoSource === "partTimeNet" || row.autoSource === "mainNet" ? row.autoSource : "",
        frequency: ["monthly", "quarterly", "yearly", "once"].includes(row.frequency) ? row.frequency : "monthly",
        startMonth: row.startMonth || safeStart,
        endMonth: row.endMonth || "",
        active: row.active !== false,
        group: row.group || (row.kind === "income" ? "доход" : "расход"),
        comment: row.comment || ""
      }))
  };
}

export default function MigrationPlanner({
  userId,
  diaryStartMonth,
  getDiaryMonthPlan,
  getDiaryBalanceBeforeMonth
}: MigrationPlannerProps) {
  const [plan, setPlan] = useState<MigrationPlan>(() => defaultPlan(currentMonth()));
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [matrixCurrency, setMatrixCurrency] = useState<Currency>("KZT");

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadPlan() {
    setLoading(true);
    const { data, error } = await supabase.from("relocation_plans").select("*").eq("user_id", userId).maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data?.data) {
      setPlan(normalizePlan(data.data, diaryStartMonth));
    } else {
      const seed = defaultPlan(monthIndex(currentMonth()) < monthIndex(diaryStartMonth) ? diaryStartMonth : currentMonth());
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

  function updateStartMonth(value: string) {
    const next = !value || monthIndex(value) < monthIndex(diaryStartMonth) ? diaryStartMonth : value;
    updatePlan({ startMonth: next });
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
      currency: kind === "income" ? "EUR" : "EUR",
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
        scenarioByRowKzt
      };
    });
  }, [plan, getDiaryBalanceBeforeMonth, getDiaryMonthPlan]);

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

  if (loading) return <section className="relocationPanel">Загрузка калькулятора…</section>;

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
          <button type="button" className={`btn ${dirty ? "blue" : ""}`} onClick={() => savePlan()}>{dirty ? "Сохранить изменения" : "Сохранено"}</button>
        </div>
      </div>

      {message && <div className="plannerMessage">{message}</div>}

      <div className="scenarioBar">
        <label>Начало сценария<input type="month" min={diaryStartMonth} value={plan.startMonth} onChange={(e) => updateStartMonth(e.target.value)} /></label>
        <label>Горизонт, месяцев<input type="number" min="1" max="120" value={plan.months} onChange={(e) => updatePlan({ months: Number(e.target.value || 1) })} /></label>
        <label>Курс EUR → KZT<input type="number" min="1" value={plan.eurKzt} onChange={(e) => updatePlan({ eurKzt: Number(e.target.value || 1) })} /></label>
        <label>Резерв в EUR<input type="number" value={plan.startBalanceEur} onChange={(e) => updatePlan({ startBalanceEur: Number(e.target.value || 0) })} /></label>
        <div className="autoBalanceBox">
          <span>Стартовый остаток KZT</span>
          <b>{fmt(startBalance)}</b>
          <small>автоматически из дневника</small>
        </div>
      </div>

      <div className="plannerKpis">
        <div><span>Без ухода в минус</span><b>{summary.safeMonths} мес.</b></div>
        <div><span>Первый минус</span><b className={summary.firstNegative ? "bad" : "ok"}>{summary.firstNegative ? monthLabel(summary.firstNegative) : "нет"}</b></div>
        <div><span>Минимальный остаток</span><b className={summary.min < 0 ? "bad" : "ok"}>{fmt(summary.min)}</b></div>
        <div><span>На конец горизонта</span><b className={summary.endKzt < 0 ? "bad" : "ok"}>{fmt(summary.endKzt)}</b></div>
        <div><span>Доходы всего</span><b>{fmt(summary.totalIncome)}</b></div>
        <div><span>Расходы всего</span><b>{fmt(summary.totalExpense)}</b></div>
      </div>

      <div className="plannerMainGrid">
        <div className="plannerCard kzSyncCard">
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

          <div className="kzBreakdown">
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
        </div>

        <div className="plannerCard salaryCard">
          <div className="cardTitleRow">
            <div>
              <h3>Германия · расчёт дохода</h3>
              <p>Нетто автоматически подставляется в строки сценария.</p>
            </div>
          </div>
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
          <p className="smallWarn">Расчёт ориентировочный. Для точного сценария можно выбрать «ручная сумма» в нужной строке дохода.</p>
        </div>
      </div>

      <div className="plannerSources">
        <div className="sourcesHead">
          <div>
            <h3>Германия и прочие сценарные статьи</h3>
            <p>Казахстан здесь не редактируется: любые изменения вносятся в дневник и сразу попадают в расчёт.</p>
          </div>
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
                <th>Сумма</th>
                <th>Расчёт</th>
                <th>Частота</th>
                <th>Период</th>
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
                  <td><input className="titleInput" value={row.title} onChange={(e) => updateRow(row.id, { title: e.target.value })} /></td>
                  <td>
                    <select value={row.country} onChange={(e) => updateRow(row.id, { country: e.target.value as Country })}>
                      {Object.entries(countries).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                    </select>
                  </td>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>
                    <select value={row.frequency} onChange={(e) => updateRow(row.id, { frequency: e.target.value as Frequency })}>
                      <option value="monthly">ежемесячно</option>
                      <option value="quarterly">квартал</option>
                      <option value="yearly">год</option>
                      <option value="once">разово</option>
                    </select>
                  </td>
                  <td>
                    <div className="periodEditor">
                      <input type="month" value={row.startMonth} onChange={(e) => updateRow(row.id, { startMonth: e.target.value })} />
                      <span>—</span>
                      <input type="month" value={row.endMonth} onChange={(e) => updateRow(row.id, { endMonth: e.target.value })} />
                    </div>
                  </td>
                  <td><input value={row.group} onChange={(e) => updateRow(row.id, { group: e.target.value })} /></td>
                  <td className="rowTools">
                    <button type="button" title="Дублировать" onClick={() => duplicateRow(row)}>⧉</button>
                    <button type="button" title="Удалить" onClick={() => deleteRow(row.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="forecastBlock">
        <div className="forecastHead">
          <div>
            <h3>Помесячный сценарий</h3>
            <p>Все значения таблицы переключаются одним режимом. Пересчёт в обе стороны выполняется по курсу из шапки.</p>
          </div>
          <div className="matrixCurrencyTools">
            <span>1 € = {compact(plan.eurKzt)} ₸</span>
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
                {data.map((month) => <th key={month.month}>{monthLabel(month.month)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="strong"><th className="stickyCol">Доходы всего</th>{data.map((month) => <td key={`i-${month.month}`}>{matrixValue(month.incomeKzt)}</td>)}</tr>
              <tr className="strong"><th className="stickyCol">Расходы всего</th>{data.map((month) => <td key={`e-${month.month}`}>{matrixValue(month.expenseKzt)}</td>)}</tr>
              <tr className="strong"><th className="stickyCol">Остаток месяца</th>{data.map((month) => <td className={month.netKzt < 0 ? "badCell" : ""} key={`n-${month.month}`}>{matrixValue(month.netKzt)}</td>)}</tr>
              <tr className="strong"><th className="stickyCol">Накопительно</th>{data.map((month) => <td className={month.cumulativeKzt < 0 ? "badCell" : ""} key={`c-${month.month}`}>{matrixValue(month.cumulativeKzt)}</td>)}</tr>

              <tr className="countrySection synced"><th className="stickyCol">Казахстан · дневник</th>{data.map((month) => <td key={`kz-title-${month.month}`}></td>)}</tr>
              <tr className="section"><th className="stickyCol">Доходы</th>{data.map((month) => <td key={`kzi-${month.month}`}>{matrixValue(month.byCountry.KZ.incomeKzt)}</td>)}</tr>
              {kzIncomeNames.map((name) => (
                <tr className="detailRow" key={`kzi-name-${name}`}>
                  <th className="stickyCol">{name}</th>
                  {data.map((month) => <td key={`kzi-${name}-${month.month}`}>{matrixValue(month.kzIncomeBy[name] || 0)}</td>)}
                </tr>
              ))}
              <tr className="section"><th className="stickyCol">Расходы</th>{data.map((month) => <td key={`kze-${month.month}`}>{matrixValue(month.byCountry.KZ.expenseKzt)}</td>)}</tr>
              {kzExpenseNames.map((name) => (
                <tr className="detailRow" key={`kze-name-${name}`}>
                  <th className="stickyCol">{name}</th>
                  {data.map((month) => <td key={`kze-${name}-${month.month}`}>{matrixValue(month.kzExpenseBy[name] || 0)}</td>)}
                </tr>
              ))}

              <tr className="countrySection"><th className="stickyCol">Германия</th>{data.map((month) => <td key={`de-title-${month.month}`}></td>)}</tr>
              <tr className="section"><th className="stickyCol">Доходы</th>{data.map((month) => <td key={`dei-${month.month}`}>{matrixValue(month.byCountry.DE.incomeKzt)}</td>)}</tr>
              {scenarioRowsByCountry("DE", "income").map((row) => (
                <tr className="detailRow" key={`de-income-${row.id}`}>
                  <th className="stickyCol">{row.title}</th>
                  {data.map((month) => <td key={`de-income-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                </tr>
              ))}
              <tr className="section"><th className="stickyCol">Расходы</th>{data.map((month) => <td key={`dee-${month.month}`}>{matrixValue(month.byCountry.DE.expenseKzt)}</td>)}</tr>
              {scenarioRowsByCountry("DE", "expense").map((row) => (
                <tr className="detailRow" key={`de-expense-${row.id}`}>
                  <th className="stickyCol">{row.title}</th>
                  {data.map((month) => <td key={`de-expense-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                </tr>
              ))}

              <tr className="countrySection"><th className="stickyCol">Другое</th>{data.map((month) => <td key={`other-title-${month.month}`}></td>)}</tr>
              <tr className="section"><th className="stickyCol">Доходы</th>{data.map((month) => <td key={`oi-${month.month}`}>{matrixValue(month.byCountry.OTHER.incomeKzt)}</td>)}</tr>
              {scenarioRowsByCountry("OTHER", "income").map((row) => (
                <tr className="detailRow" key={`other-income-${row.id}`}>
                  <th className="stickyCol">{row.title}</th>
                  {data.map((month) => <td key={`other-income-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                </tr>
              ))}
              <tr className="section"><th className="stickyCol">Расходы</th>{data.map((month) => <td key={`oe-${month.month}`}>{matrixValue(month.byCountry.OTHER.expenseKzt)}</td>)}</tr>
              {scenarioRowsByCountry("OTHER", "expense").map((row) => (
                <tr className="detailRow" key={`other-expense-${row.id}`}>
                  <th className="stickyCol">{row.title}</th>
                  {data.map((month) => <td key={`other-expense-${row.id}-${month.month}`}>{matrixValue(month.scenarioByRowKzt[row.id] || 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
