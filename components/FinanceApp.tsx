"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import MigrationPlanner from "@/components/MigrationPlanner";
import MonthPicker from "@/components/MonthPicker";

type Kind = "income" | "expense";
type PaymentType = "regular" | "credit";
type Frequency = "monthly" | "quarterly" | "halfyear" | "yearly";

type Settings = {
  user_id: string;
  calc_start_month: string;
  diary_start_month: string;
  forecast_start_month: string;
  start_balance: number;
  plan_income: number;
  plan_other: number;
  years: number;
  currency: string;
};

type Category = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
};

type Operation = {
  id: string;
  user_id: string;
  op_date: string;
  kind: Kind;
  category_id: string | null;
  title: string;
  amount: number;
  completed: boolean;
  sort_order: number;
  source_recurring_payment_id: string | null;
  source_recurring_income_id: string | null;
  source_month: string | null;
};

type RecurringPayment = {
  id: string;
  user_id: string;
  title: string;
  category_id: string | null;
  amount: number;
  due_day: number;
  payment_type: PaymentType;
  active: boolean;
  total_months: number;
  paid_months: number;
  valid_from_month: string | null;
  valid_to_month: string | null;
  sort_order: number;
};

type RecurringIncome = {
  id: string;
  user_id: string;
  title: string;
  category_id: string | null;
  amount: number;
  due_day: number;
  frequency: Frequency;
  active: boolean;
  valid_from_month: string | null;
  valid_to_month: string | null;
  sort_order: number;
};

type PaymentExclusion = {
  user_id: string;
  recurring_payment_id: string;
  month: string;
};

type CollapsedGroup = {
  user_id: string;
  month: string;
  category_key: string;
  collapsed: boolean;
};

type VirtualOperation = Operation & {
  virtual: true;
  payment: RecurringPayment;
};

type AnyOperation = Operation | VirtualOperation;

const supabase = createClient();

const defaultExpenseCategories = [
  "Квартира",
  "Транспорт и связь",
  "Подписки",
  "Продукты",
  "Здоровье",
  "Одежда",
  "Кошки",
  "Другое"
];

const defaultIncomeCategories = ["Зарплата", "Аванс", "Премия", "Подработка", "Возврат", "Подарок", "Другое"];

const freqMonths: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  halfyear: 6,
  yearly: 12
};

const freqLabels: Record<Frequency, string> = {
  monthly: "Ежемесячно",
  quarterly: "Раз в квартал",
  halfyear: "Раз в полгода",
  yearly: "Раз в год"
};

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
  const names = ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
  const [y, mm] = m.split("-").map(Number);
  return `${names[(mm || 1) - 1]} ${String(y).slice(2)}`;
}

function monthLongLabel(m: string) {
  const names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const [y, mm] = m.split("-").map(Number);
  return `${names[(mm || 1) - 1]} ${y}`;
}

function daysInMonth(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm, 0).getDate();
}

function dateForDay(month: string, day: number) {
  const d = Math.min(Math.max(Number(day) || 1, 1), daysInMonth(month));
  return `${month}-${pad(d)}`;
}

function inMonth(date: string, m: string) {
  return String(date || "").slice(0, 7) === m;
}

function fmt(n: number, suffix = " ₸") {
  return `${Math.round(Number(n || 0)).toLocaleString("ru-RU")}${suffix}`;
}

function full(n: number) {
  const v = Math.round(Number(n || 0));
  if (Object.is(v, -0)) return "0";
  return v.toLocaleString("ru-RU");
}

function normalizeMonth(v: string | null | undefined) {
  if (!v) return null;
  return String(v).slice(0, 7);
}

function validInMonth(item: { valid_from_month?: string | null; valid_to_month?: string | null }, month: string) {
  const from = normalizeMonth(item.valid_from_month);
  const to = normalizeMonth(item.valid_to_month);
  if (from && monthIndex(month) < monthIndex(from)) return false;
  if (to && monthIndex(month) > monthIndex(to)) return false;
  return true;
}

function creditDuration(p: RecurringPayment) {
  return Math.max(Number(p.total_months || 0), 0);
}

function categoryName(categories: Category[], id: string | null, fallback = "Другое") {
  return categories.find((c) => c.id === id)?.name || fallback;
}

function paymentDue(payment: RecurringPayment, month: string, calcStart: string) {
  if (!payment.active) return false;

  const startMonth = normalizeMonth(payment.valid_from_month) || calcStart;
  const start = monthIndex(startMonth);
  const cur = monthIndex(month);
  if (cur < start) return false;

  if (payment.payment_type === "credit") {
    // У кредитов нет отдельного поля «До»: конец всегда считается от месяца
    // начала и общей длительности. Скрытое старое valid_to_month не учитывается.
    const duration = creditDuration(payment);
    return duration > 0 && cur < start + duration;
  }

  return validInMonth(payment, month);
}

function incomeDue(income: RecurringIncome, month: string, calcStart: string) {
  if (!income.active) return false;
  if (!validInMonth(income, month)) return false;

  const startMonth = normalizeMonth(income.valid_from_month) || calcStart;
  const start = monthIndex(startMonth);
  const cur = monthIndex(month);
  if (cur < start) return false;

  const diff = cur - start;
  return diff % (freqMonths[income.frequency] || 1) === 0;
}

function isUUID(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nextSortOrder(items: { sort_order: number }[]) {
  return (Math.max(0, ...items.map((x) => Number(x.sort_order || 0))) + 10);
}

function clampDay(value: unknown) {
  return Math.min(Math.max(Number(value || 1), 1), 31);
}

function cleanMonth(value: unknown) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

function money(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pickLegacyState(input: any) {
  return input?.state || input?.data || input?.financeDiary || input || {};
}

type SettingsTableKey = "payments" | "credits" | "incomes" | "expenseCategories" | "incomeCategories";
type SettingsSortDirection = "asc" | "desc";
type SettingsTableSort = { key: string; direction: SettingsSortDirection };

function matchesText(value: unknown, query: string) {
  return !query.trim() || String(value ?? "").toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"));
}

function matchesExactNumber(value: unknown, query: string) {
  if (!query.trim()) return true;
  const expected = Number(query.replace(",", "."));
  return Number.isFinite(expected) && Number(value || 0) === expected;
}

function compareSettingsValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return String(left ?? "").localeCompare(String(right ?? ""), "ru", { numeric: true, sensitivity: "base" });
}


export default function FinanceApp({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [incomes, setIncomes] = useState<RecurringIncome[]>([]);
  const [exclusions, setExclusions] = useState<PaymentExclusion[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<CollapsedGroup[]>([]);

  const [viewMonth, setViewMonthState] = useState(currentMonth());
  const [opsPage, setOpsPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"diary" | "relocation">("diary");
  const [settingsTab, setSettingsTab] = useState<"main" | "expenses" | "credits" | "incomes" | "categories" | "import">("expenses");
  const [saveState, setSaveState] = useState<{ status: "saved" | "saving" | "error"; message: string }>({
    status: "saved",
    message: "Все изменения сохранены"
  });
  const [settingsTableFilters, setSettingsTableFilters] = useState<Record<SettingsTableKey, Record<string, string>>>({
    payments: { active: "all", title: "", category: "", amount: "", due_day: "", from: "", to: "" },
    credits: { active: "all", title: "", category: "", amount: "", due_day: "", total_months: "", paid_months: "", from: "" },
    incomes: { active: "all", title: "", category: "", amount: "", frequency: "", due_day: "", from: "", to: "" },
    expenseCategories: { name: "" },
    incomeCategories: { name: "" }
  });
  const [settingsTableSorts, setSettingsTableSorts] = useState<Record<SettingsTableKey, SettingsTableSort>>({
    payments: { key: "sort_order", direction: "asc" },
    credits: { key: "sort_order", direction: "asc" },
    incomes: { key: "sort_order", direction: "asc" },
    expenseCategories: { key: "sort_order", direction: "asc" },
    incomeCategories: { key: "sort_order", direction: "asc" }
  });
  const [opModalOpen, setOpModalOpen] = useState(false);
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [opForm, setOpForm] = useState({
    op_date: `${currentMonth()}-01`,
    kind: "expense" as Kind,
    category_id: "",
    title: "",
    amount: ""
  });

  const diaryStart = settings?.diary_start_month || settings?.calc_start_month || currentMonth();
  const forecastStart = settings?.forecast_start_month || settings?.calc_start_month || currentMonth();
  const calcStart = monthFromIndex(Math.min(monthIndex(diaryStart), monthIndex(forecastStart)));

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function safeViewMonth(month: string, start = diaryStart) {
    return monthIndex(month) < monthIndex(start) ? start : month;
  }

  function setSettingsTableFilter(table: SettingsTableKey, key: string, value: string) {
    setSettingsTableFilters((current) => ({
      ...current,
      [table]: { ...current[table], [key]: value }
    }));
  }

  function resetSettingsTableFilters(table: SettingsTableKey) {
    setSettingsTableFilters((current) => ({
      ...current,
      [table]: Object.fromEntries(Object.keys(current[table]).map((key) => [key, key === "active" ? "all" : ""]))
    }));
  }

  function toggleSettingsTableSort(table: SettingsTableKey, key: string) {
    setSettingsTableSorts((current) => {
      const previous = current[table];
      return {
        ...current,
        [table]: {
          key,
          direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc"
        }
      };
    });
  }

  function settingsSortMark(table: SettingsTableKey, key: string) {
    const sort = settingsTableSorts[table];
    if (sort.key !== key) return "↕";
    return sort.direction === "asc" ? "↑" : "↓";
  }

  async function loadAll() {
    setLoading(true);

    let [{ data: settingsData }, { data: expenseData }, { data: incomeData }, { data: opData }, { data: payData }, { data: recIncomeData }, { data: exclData }, { data: collapsedData }] =
      await Promise.all([
        supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("expense_categories").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("income_categories").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("operations").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("recurring_payments").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("recurring_incomes").select("*").eq("user_id", userId).order("sort_order"),
        supabase.from("monthly_payment_exclusions").select("*").eq("user_id", userId),
        supabase.from("collapsed_groups").select("*").eq("user_id", userId)
      ]);

    if (!settingsData) {
      const start = currentMonth();
      const insert = {
        user_id: userId,
        calc_start_month: start,
        diary_start_month: start,
        forecast_start_month: start,
        start_balance: 0,
        plan_income: 0,
        plan_other: 0,
        years: 3,
        currency: "KZT"
      };
      const { data } = await supabase.from("user_settings").insert(insert).select("*").single();
      settingsData = data;
    }

    if (!expenseData?.length) {
      const rows = defaultExpenseCategories.map((name, i) => ({ user_id: userId, name, sort_order: (i + 1) * 10 }));
      const { data } = await supabase.from("expense_categories").insert(rows).select("*").order("sort_order");
      expenseData = data || [];
    }

    if (!incomeData?.length) {
      const rows = defaultIncomeCategories.map((name, i) => ({ user_id: userId, name, sort_order: (i + 1) * 10 }));
      const { data } = await supabase.from("income_categories").insert(rows).select("*").order("sort_order");
      incomeData = data || [];
    }

    // Старые версии приложения сохраняли регулярные платежи как отдельные операции.
    // Теперь настройки являются единственным источником истины, поэтому такие копии
    // удаляются: иначе они дают пустые галочки, дубли и устаревшие суммы.
    const materializedPaymentOps = (opData || []).filter((x: any) => x.source_recurring_payment_id);
    if (materializedPaymentOps.length) {
      for (let i = 0; i < materializedPaymentOps.length; i += 200) {
        const ids = materializedPaymentOps.slice(i, i + 200).map((x: any) => x.id);
        await supabase.from("operations").delete().eq("user_id", userId).in("id", ids);
      }
      opData = (opData || []).filter((x: any) => !x.source_recurring_payment_id);
    }

    // Поле «До» у кредитов удалено из интерфейса. Очищаем старые значения,
    // чтобы скрытая дата больше не могла обрезать кредитный график.
    const creditsWithLegacyEnd = (payData || []).filter((x: any) => x.payment_type === "credit" && x.valid_to_month);
    if (creditsWithLegacyEnd.length) {
      const ids = creditsWithLegacyEnd.map((x: any) => x.id);
      await supabase.from("recurring_payments").update({ valid_to_month: null }).eq("user_id", userId).in("id", ids);
      payData = (payData || []).map((x: any) => x.payment_type === "credit" ? { ...x, valid_to_month: null } : x);
    }

    const legacyStart = settingsData?.calc_start_month || currentMonth();
    const loadedDiaryStart = settingsData?.diary_start_month || legacyStart;
    const loadedForecastStart = settingsData?.forecast_start_month || legacyStart;
    const loadedCalcStart = monthFromIndex(Math.min(monthIndex(loadedDiaryStart), monthIndex(loadedForecastStart)));

    setSettings({
      ...settingsData,
      calc_start_month: loadedCalcStart,
      diary_start_month: loadedDiaryStart,
      forecast_start_month: loadedForecastStart,
      start_balance: Number(settingsData?.start_balance || 0),
      plan_income: Number(settingsData?.plan_income || 0),
      plan_other: Number(settingsData?.plan_other || 0),
      years: Number(settingsData?.years || 3)
    });

    setExpenseCategories((expenseData || []).map((x: any) => ({ ...x, sort_order: Number(x.sort_order || 0) })));
    setIncomeCategories((incomeData || []).map((x: any) => ({ ...x, sort_order: Number(x.sort_order || 0) })));
    setOperations((opData || []).map((x: any) => ({
      ...x,
      amount: Number(x.amount || 0),
      sort_order: Number(x.sort_order || 0),
      completed: !!x.completed
    })));
    setPayments((payData || []).map((x: any) => ({
      ...x,
      amount: Number(x.amount || 0),
      due_day: Number(x.due_day || 1),
      total_months: Number(x.total_months || 0),
      paid_months: Number(x.paid_months || 0),
      sort_order: Number(x.sort_order || 0)
    })));
    setIncomes((recIncomeData || []).map((x: any) => ({
      ...x,
      amount: Number(x.amount || 0),
      due_day: Number(x.due_day || 1),
      sort_order: Number(x.sort_order || 0)
    })));
    setExclusions(exclData || []);
    setCollapsedGroups(collapsedData || []);

    setViewMonthState(safeViewMonth(viewMonth, loadedDiaryStart));
    setLoading(false);
  }

  function beginSave(message = "Сохранение изменений…") {
    setSaveState({ status: "saving", message });
  }

  function finishSave(message = "Все изменения сохранены") {
    setSaveState({ status: "saved", message });
  }

  function failSave(message: string) {
    setSaveState({ status: "error", message });
  }

  async function updateSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const patched = { ...settings, ...patch };
    const nextDiaryStart = patched.diary_start_month || patched.calc_start_month || currentMonth();
    const nextForecastStart = patched.forecast_start_month || patched.calc_start_month || currentMonth();
    const nextCalcStart = monthFromIndex(Math.min(monthIndex(nextDiaryStart), monthIndex(nextForecastStart)));
    const next: Settings = {
      ...patched,
      diary_start_month: nextDiaryStart,
      forecast_start_month: nextForecastStart,
      calc_start_month: nextCalcStart
    };

    if (patch.diary_start_month) {
      setViewMonthState(safeViewMonth(viewMonth, nextDiaryStart));
    }

    setSettings(next);
    beginSave();
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userId,
      calc_start_month: next.calc_start_month,
      diary_start_month: next.diary_start_month,
      forecast_start_month: next.forecast_start_month,
      start_balance: Number(next.start_balance || 0),
      plan_income: Number(next.plan_income || 0),
      plan_other: Number(next.plan_other || 0),
      years: Number(next.years || 3),
      currency: next.currency || "KZT"
    });
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }
    finishSave();
  }

  function setViewMonth(month: string) {
    setViewMonthState(safeViewMonth(month));
    setOpsPage(1);
  }

  function monthOps(month = viewMonth) {
    return operations
      .filter((o) => inMonth(o.op_date, month))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.op_date).localeCompare(String(b.op_date)));
  }

  function duePayments(month: string) {
    return payments.filter((p) => paymentDue(p, month, calcStart));
  }

  function dueIncomes(month: string) {
    return incomes.filter((i) => incomeDue(i, month, calcStart));
  }

  function isPaymentExcluded(paymentId: string, month: string) {
    return exclusions.some((e) => e.recurring_payment_id === paymentId && e.month === month);
  }

  function plannedChecklistItems(month = viewMonth): VirtualOperation[] {
    return duePayments(month)
      .map((p) => ({
        id: `virtual:${p.id}:${month}`,
        user_id: userId,
        op_date: dateForDay(month, p.due_day),
        kind: "expense" as Kind,
        category_id: p.category_id,
        title: p.title,
        amount: Number(p.amount || 0),
        completed: !isPaymentExcluded(p.id, month),
        sort_order: Number(p.sort_order || 0),
        source_recurring_payment_id: p.id,
        source_recurring_income_id: null,
        source_month: month,
        virtual: true as const,
        payment: p
      }))
      .sort((a, b) => String(a.op_date).localeCompare(String(b.op_date)));
  }

  function checklistOps(month = viewMonth): AnyOperation[] {
    // Платежи из настроек всегда строятся из актуальных настроек как виртуальные строки.
    // Старые материализованные копии скрываются, чтобы не было дублей и устаревших сумм.
    const real = monthOps(month).filter((o) => !o.source_recurring_payment_id);
    const virtual = plannedChecklistItems(month);
    const all: AnyOperation[] = [...real, ...virtual];
    return all.sort((a, b) => {
      const doneA = a.completed ? 1 : 0;
      const doneB = b.completed ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      return Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.op_date).localeCompare(String(b.op_date));
    });
  }

  async function toggleVirtualPayment(item: VirtualOperation, checked: boolean) {
    const sourceMonth = item.source_month || viewMonth;

    if (checked) {
      const { error } = await supabase
        .from("monthly_payment_exclusions")
        .delete()
        .eq("user_id", userId)
        .eq("recurring_payment_id", item.payment.id)
        .eq("month", sourceMonth);
      if (error) {
        flash(error.message);
        return;
      }
      setExclusions((prev) => prev.filter((e) => !(e.recurring_payment_id === item.payment.id && e.month === sourceMonth)));
      return;
    }

    const row = { user_id: userId, recurring_payment_id: item.payment.id, month: sourceMonth };
    const { error } = await supabase.from("monthly_payment_exclusions").upsert(row);
    if (error) {
      flash(error.message);
      return;
    }
    setExclusions((prev) => {
      if (prev.some((e) => e.recurring_payment_id === row.recurring_payment_id && e.month === row.month)) return prev;
      return [...prev, row];
    });
  }

  async function toggleOperation(op: Operation, completed: boolean) {
    const patch = { completed };
    const { error } = await supabase.from("operations").update(patch).eq("user_id", userId).eq("id", op.id);
    if (error) {
      flash(error.message);
      return;
    }
    setOperations((prev) => prev.map((x) => (x.id === op.id ? { ...x, completed } : x)));
  }

  async function moveOperation(op: Operation, dir: -1 | 1) {
    const real = monthOps(viewMonth).filter((x) => x.completed === op.completed);
    const idx = real.findIndex((x) => x.id === op.id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= real.length) return;
    const a = real[idx];
    const b = real[next];
    const aOrder = Number(a.sort_order || (idx + 1) * 10);
    const bOrder = Number(b.sort_order || (next + 1) * 10);

    await Promise.all([
      supabase.from("operations").update({ sort_order: bOrder }).eq("user_id", userId).eq("id", a.id),
      supabase.from("operations").update({ sort_order: aOrder }).eq("user_id", userId).eq("id", b.id)
    ]);

    setOperations((prev) => prev.map((x) => (x.id === a.id ? { ...x, sort_order: bOrder } : x.id === b.id ? { ...x, sort_order: aOrder } : x)));
  }

  function openNewOperation() {
    setEditingOperationId(null);
    setOpForm({
      op_date: `${viewMonth}-01`,
      kind: "expense",
      category_id: expenseCategories[0]?.id || "",
      title: "",
      amount: ""
    });
    setOpModalOpen(true);
  }

  function openEditOperation(op: Operation) {
    setEditingOperationId(op.id);
    setOpForm({
      op_date: op.op_date,
      kind: op.kind,
      category_id: op.category_id || "",
      title: op.title || "",
      amount: String(op.amount || "")
    });
    setOpModalOpen(true);
  }

  async function saveOperation(e: React.FormEvent) {
    e.preventDefault();

    const amount = Math.abs(Number(opForm.amount || 0));
    if (!amount) {
      flash("Введите сумму");
      return;
    }

    const row = {
      user_id: userId,
      op_date: opForm.op_date || `${viewMonth}-01`,
      kind: opForm.kind,
      category_id: opForm.category_id || null,
      title: opForm.title.trim() || "Операция",
      amount,
      completed: false,
      sort_order: nextSortOrder(monthOps(String(opForm.op_date || `${viewMonth}-01`).slice(0, 7)))
    };

    if (editingOperationId) {
      const { data, error } = await supabase.from("operations").update(row).eq("user_id", userId).eq("id", editingOperationId).select("*").single();
      if (error) {
        flash(error.message);
        return;
      }
      setOperations((prev) => prev.map((x) => (x.id === editingOperationId ? { ...data, amount: Number(data.amount || 0) } : x)));
    } else {
      const { data, error } = await supabase.from("operations").insert(row).select("*").single();
      if (error) {
        flash(error.message);
        return;
      }
      setOperations((prev) => [...prev, { ...data, amount: Number(data.amount || 0) }]);
    }

    setOpModalOpen(false);
    setEditingOperationId(null);
    setViewMonth(String(row.op_date).slice(0, 7));
  }

  async function deleteOperation(op: Operation) {
    if (!confirm("Удалить операцию?")) return;
    const { error } = await supabase.from("operations").delete().eq("user_id", userId).eq("id", op.id);
    if (error) {
      flash(error.message);
      return;
    }
    setOperations((prev) => prev.filter((x) => x.id !== op.id));
  }

  function oneMonthPlan(month: string) {
    const incomeBy: Record<string, number> = {};
    const expenseBy: Record<string, number> = {};
    incomeCategories.forEach((c) => (incomeBy[c.name] = 0));
    expenseCategories.forEach((c) => (expenseBy[c.name] = 0));

    const allOps = operations.filter((o) => inMonth(o.op_date, month));
    const doneOps = allOps.filter((o) => o.completed);

    const doneIncomeSource = new Set(doneOps.filter((o) => o.source_recurring_income_id).map((o) => o.source_recurring_income_id));

    dueIncomes(month).forEach((i) => {
      if (doneIncomeSource.has(i.id)) return;
      const name = categoryName(incomeCategories, i.category_id, "Доход");
      incomeBy[name] = (incomeBy[name] || 0) + Number(i.amount || 0);
    });

    // Платежи из настроек считаются по самой настройке. Старая операция-копия
    // не влияет на итог, поэтому изменение суммы/статьи сразу отражается в прогнозе.
    duePayments(month).forEach((p) => {
      if (isPaymentExcluded(p.id, month)) return;
      const name = categoryName(expenseCategories, p.category_id, "Другое");
      expenseBy[name] = (expenseBy[name] || 0) + Number(p.amount || 0);
    });

    doneOps.filter((o) => o.kind === "income").forEach((o) => {
      const name = categoryName(incomeCategories, o.category_id, "Доход");
      incomeBy[name] = (incomeBy[name] || 0) + Number(o.amount || 0);
    });

    doneOps.filter((o) => o.kind === "expense" && !o.source_recurring_payment_id).forEach((o) => {
      const name = categoryName(expenseCategories, o.category_id, "Другое");
      expenseBy[name] = (expenseBy[name] || 0) + Number(o.amount || 0);
    });

    const incomeBeforeFallback = Object.values(incomeBy).reduce((a, b) => a + b, 0);
    if (incomeBeforeFallback <= 0 && Number(settings?.plan_income || 0) > 0) {
      incomeBy["Плановый доход"] = (incomeBy["Плановый доход"] || 0) + Number(settings?.plan_income || 0);
    }

    const expenseBeforeFallback = Object.values(expenseBy).reduce((a, b) => a + b, 0);
    if (expenseBeforeFallback <= 0 && Number(settings?.plan_other || 0) > 0) {
      expenseBy["План прочих расходов"] = (expenseBy["План прочих расходов"] || 0) + Number(settings?.plan_other || 0);
    }

    const incomeTotal = Object.values(incomeBy).reduce((a, b) => a + b, 0);
    const expenseTotal = Object.values(expenseBy).reduce((a, b) => a + b, 0);

    return { month, incomeBy, expenseBy, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
  }

  function balanceBeforeMonth(month: string) {
    let balance = Number(settings?.start_balance || 0);
    for (let i = monthIndex(calcStart); i < monthIndex(month); i++) {
      balance += oneMonthPlan(monthFromIndex(i)).net;
    }
    return balance;
  }

  function forecastData() {
    const visibleStart = forecastStart;
    const visibleMonths = Number(settings?.years || 3) * 12;
    const first = monthIndex(calcStart);
    const last = monthIndex(visibleStart) + visibleMonths - 1;

    let balance = Number(settings?.start_balance || 0);
    const rows: Array<ReturnType<typeof oneMonthPlan> & { balance: number }> = [];

    for (let i = first; i <= last; i++) {
      const month = monthFromIndex(i);
      const plan = oneMonthPlan(month);
      balance += plan.net;
      if (i >= monthIndex(visibleStart)) rows.push({ ...plan, balance });
    }

    return rows;
  }

  const forecast = forecastData();
  const selectedPlan = oneMonthPlan(viewMonth);
  const before = balanceBeforeMonth(viewMonth);
  const selectedEndBalance = before + selectedPlan.net;

  const opRows = checklistOps(viewMonth);
  const doneCount = opRows.filter((o) => o.completed).length;
  const pendingCount = opRows.length - doneCount;

  const groupedDone = useMemo(() => {
    const done = opRows.filter((o) => o.completed);
    const map = new Map<string, { key: string; title: string; items: AnyOperation[] }>();

    done.forEach((op) => {
      const isIncome = op.kind === "income";
      const title = isIncome ? categoryName(incomeCategories, op.category_id, "Доход") : categoryName(expenseCategories, op.category_id, "Другое");
      const key = `${op.kind}:${op.category_id || title}`;
      if (!map.has(key)) map.set(key, { key, title, items: [] });
      map.get(key)!.items.push(op);
    });

    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }, [opRows, expenseCategories, incomeCategories]);

  const collapsedKeys = new Set(collapsedGroups.filter((g) => g.month === viewMonth && g.collapsed).map((g) => g.category_key));

  const displayedRows = useMemo(() => {
    const pending = opRows.filter((o) => !o.completed).map((op) => ({ type: "op" as const, op }));
    const groups: Array<{ type: "group"; group: { key: string; title: string; items: AnyOperation[] } } | { type: "op"; op: AnyOperation }> = [];

    groupedDone.forEach((group) => {
      groups.push({ type: "group", group });
      if (!collapsedKeys.has(group.key)) {
        group.items.forEach((op) => groups.push({ type: "op", op }));
      }
    });

    return [...pending, ...groups];
  }, [opRows, groupedDone, collapsedGroups, viewMonth]);

  const rowsPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(displayedRows.length / rowsPerPage));
  const page = Math.min(opsPage, totalPages);
  const pagedRows = displayedRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  async function toggleGroup(key: string) {
    const isCollapsed = collapsedKeys.has(key);

    if (isCollapsed) {
      await supabase.from("collapsed_groups").delete().eq("user_id", userId).eq("month", viewMonth).eq("category_key", key);
      setCollapsedGroups((prev) => prev.filter((x) => !(x.month === viewMonth && x.category_key === key)));
      return;
    }

    const row = { user_id: userId, month: viewMonth, category_key: key, collapsed: true };
    await supabase.from("collapsed_groups").upsert(row);
    setCollapsedGroups((prev) => [...prev.filter((x) => !(x.month === viewMonth && x.category_key === key)), row]);
  }

  async function addCategory(kind: Kind) {
    beginSave("Добавление статьи…");
    const table = kind === "expense" ? "expense_categories" : "income_categories";
    const list = kind === "expense" ? expenseCategories : incomeCategories;
    const name = kind === "expense" ? "Новая статья расходов" : "Новая статья доходов";
    const { data, error } = await supabase.from(table).insert({ user_id: userId, name, sort_order: nextSortOrder(list) }).select("*").single();

    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }

    if (kind === "expense") setExpenseCategories((prev) => [...prev, data]);
    else setIncomeCategories((prev) => [...prev, data]);
    finishSave("Статья сохранена");
  }

  function editCategoryLocal(kind: Kind, id: string, name: string) {
    if (kind === "expense") setExpenseCategories((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
    else setIncomeCategories((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
  }

  async function saveCategory(kind: Kind, id: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      flash("Название статьи не может быть пустым");
      return;
    }

    beginSave();
    const table = kind === "expense" ? "expense_categories" : "income_categories";
    const { error } = await supabase.from(table).update({ name: cleanName }).eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }
    editCategoryLocal(kind, id, cleanName);
    finishSave();
  }

  async function deleteCategory(kind: Kind, id: string) {
    const list = kind === "expense" ? expenseCategories : incomeCategories;
    const category = list.find((item) => item.id === id);
    if (!category) return;
    if (list.length <= 1) {
      flash("Должна остаться хотя бы одна статья");
      return;
    }
    if (!window.confirm(`Удалить статью «${category.name}»?`)) return;

    const table = kind === "expense" ? "expense_categories" : "income_categories";
    beginSave("Удаление статьи…");
    const { error } = await supabase.from(table).delete().eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }

    if (kind === "expense") {
      setExpenseCategories((prev) => prev.filter((item) => item.id !== id));
      setPayments((prev) => prev.map((item) => (item.category_id === id ? { ...item, category_id: null } : item)));
    } else {
      setIncomeCategories((prev) => prev.filter((item) => item.id !== id));
      setIncomes((prev) => prev.map((item) => (item.category_id === id ? { ...item, category_id: null } : item)));
    }
    setOperations((prev) => prev.map((item) => (item.kind === kind && item.category_id === id ? { ...item, category_id: null } : item)));
    finishSave("Статья удалена");
  }

  async function addPayment(type: PaymentType = "regular") {
    beginSave(type === "credit" ? "Добавление кредита…" : "Добавление платежа…");
    const row = {
      user_id: userId,
      title: type === "credit" ? "Новый кредит" : "Новый платёж",
      category_id: expenseCategories[0]?.id || null,
      amount: 0,
      due_day: 1,
      payment_type: type,
      active: true,
      total_months: 0,
      paid_months: 0,
      valid_from_month: viewMonth,
      valid_to_month: null,
      sort_order: nextSortOrder(payments)
    };
    const { data, error } = await supabase.from("recurring_payments").insert(row).select("*").single();
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
    } else {
      setPayments((prev) => [{ ...data, amount: Number(data.amount || 0) }, ...prev]);
      finishSave(type === "credit" ? "Кредит сохранён" : "Платёж сохранён");
    }
  }

  async function updatePayment(id: string, patch: Partial<RecurringPayment>) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    beginSave();
    const { error } = await supabase.from("recurring_payments").update(patch).eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }
    finishSave();
  }

  async function deletePayment(id: string) {
    if (!confirm("Удалить регулярный платёж?")) return;
    beginSave("Удаление строки…");

    // Сначала удаляем копии, созданные старыми версиями приложения.
    await supabase.from("operations").delete().eq("user_id", userId).eq("source_recurring_payment_id", id);
    const { error } = await supabase.from("recurring_payments").delete().eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
    } else {
      setPayments((prev) => prev.filter((x) => x.id !== id));
      setOperations((prev) => prev.filter((x) => x.source_recurring_payment_id !== id));
      setExclusions((prev) => prev.filter((x) => x.recurring_payment_id !== id));
      finishSave("Строка удалена");
    }
  }

  async function addIncome() {
    beginSave("Добавление дохода…");
    const row = {
      user_id: userId,
      title: "Новый доход",
      category_id: incomeCategories[0]?.id || null,
      amount: 0,
      due_day: 1,
      frequency: "monthly",
      active: true,
      valid_from_month: viewMonth,
      valid_to_month: null,
      sort_order: nextSortOrder(incomes)
    };
    const { data, error } = await supabase.from("recurring_incomes").insert(row).select("*").single();
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
    } else {
      setIncomes((prev) => [{ ...data, amount: Number(data.amount || 0) }, ...prev]);
      finishSave("Доход сохранён");
    }
  }

  async function updateIncome(id: string, patch: Partial<RecurringIncome>) {
    setIncomes((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    beginSave();
    const { error } = await supabase.from("recurring_incomes").update(patch).eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
      return;
    }
    finishSave();
  }

  async function deleteIncome(id: string) {
    if (!confirm("Удалить регулярный доход?")) return;
    beginSave("Удаление строки…");
    const { error } = await supabase.from("recurring_incomes").delete().eq("user_id", userId).eq("id", id);
    if (error) {
      failSave(`Ошибка сохранения: ${error.message}`);
      flash(error.message);
    } else {
      setIncomes((prev) => prev.filter((x) => x.id !== id));
      finishSave("Строка удалена");
    }
  }

  async function exportData() {
    const payload = { settings, expenseCategories, incomeCategories, operations, payments, incomes, exclusions, collapsedGroups, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-diary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importLegacy(file: File | null) {
    if (!file) return;
    if (!confirm("Импорт заменит текущие данные в базе. Продолжить?")) return;

    const raw = await file.text();
    let legacy: any;
    try {
      legacy = pickLegacyState(JSON.parse(raw));
    } catch {
      flash("Файл не похож на JSON");
      return;
    }

    setLoading(true);

    try {
      // Deletes are sequential to avoid FK races during import.
      await supabase.from("monthly_payment_exclusions").delete().eq("user_id", userId);
      await supabase.from("collapsed_groups").delete().eq("user_id", userId);
      await supabase.from("operations").delete().eq("user_id", userId);
      await supabase.from("recurring_incomes").delete().eq("user_id", userId);
      await supabase.from("recurring_payments").delete().eq("user_id", userId);
      await supabase.from("income_categories").delete().eq("user_id", userId);
      await supabase.from("expense_categories").delete().eq("user_id", userId);

      const isSupabaseExport = Array.isArray(legacy.expenseCategories) || Array.isArray(legacy.incomeCategories) || Array.isArray(legacy.payments) || Array.isArray(legacy.incomes);

      const groups = isSupabaseExport
        ? (legacy.expenseCategories || []).map((c: any) => c.name).filter(Boolean)
        : (Array.isArray(legacy.groups) && legacy.groups.length ? legacy.groups : defaultExpenseCategories);
      const incomeTypes = isSupabaseExport
        ? (legacy.incomeCategories || []).map((c: any) => c.name).filter(Boolean)
        : (Array.isArray(legacy.incomeTypes) && legacy.incomeTypes.length ? legacy.incomeTypes : defaultIncomeCategories);

      const { data: expCats, error: expErr } = await supabase
        .from("expense_categories")
        .insert((groups.length ? groups : defaultExpenseCategories).map((name: string, i: number) => ({ user_id: userId, name, sort_order: (i + 1) * 10 })))
        .select("*");
      if (expErr) throw expErr;

      const { data: incCats, error: incErr } = await supabase
        .from("income_categories")
        .insert((incomeTypes.length ? incomeTypes : defaultIncomeCategories).map((name: string, i: number) => ({ user_id: userId, name, sort_order: (i + 1) * 10 })))
        .select("*");
      if (incErr) throw incErr;

      const expenseMap = new Map((expCats || []).map((c: Category) => [c.name, c.id]));
      const incomeMap = new Map((incCats || []).map((c: Category) => [c.name, c.id]));
      const oldExpenseIdToNew = new Map((legacy.expenseCategories || []).map((c: any) => [String(c.id), expenseMap.get(c.name)]));
      const oldIncomeIdToNew = new Map((legacy.incomeCategories || []).map((c: any) => [String(c.id), incomeMap.get(c.name)]));

      const legacyStart = legacy.settings?.calc_start_month || legacy.calcStartMonth || legacy.calc_start_month || legacy.month || currentMonth();
      const importedDiaryStart = legacy.settings?.diary_start_month || legacy.diaryStartMonth || legacyStart;
      const importedForecastStart = legacy.settings?.forecast_start_month || legacy.forecastStartMonth || legacyStart;
      const importedCalcStart = monthFromIndex(Math.min(monthIndex(importedDiaryStart), monthIndex(importedForecastStart)));
      const { error: settingsErr } = await supabase.from("user_settings").upsert({
        user_id: userId,
        calc_start_month: importedCalcStart,
        diary_start_month: importedDiaryStart,
        forecast_start_month: importedForecastStart,
        start_balance: money(legacy.settings?.start_balance ?? legacy.startBalance ?? legacy.start_balance),
        plan_income: money(legacy.settings?.plan_income ?? legacy.planIncome ?? legacy.plan_income),
        plan_other: money(legacy.settings?.plan_other ?? legacy.planOther ?? legacy.plan_other),
        years: Number(legacy.settings?.years || legacy.years || 3),
        currency: legacy.settings?.currency || "KZT"
      });
      if (settingsErr) throw settingsErr;

      const scheduleMap = new Map<string, string>();
      const incomeSourceMap = new Map<string, string>();

      const sourcePayments = isSupabaseExport ? (legacy.payments || []) : (legacy.schedules || legacy.regulars || []);
      const paymentRows = sourcePayments.map((s: any, i: number) => {
        const id = crypto.randomUUID();
        if (s.id) scheduleMap.set(String(s.id), id);
        const categoryNameFromOld = s.group || s.category || (legacy.expenseCategories || []).find((c: any) => c.id === s.category_id)?.name || "Другое";
        return {
          id,
          user_id: userId,
          title: s.title || "Платёж",
          category_id: oldExpenseIdToNew.get(String(s.category_id)) || expenseMap.get(categoryNameFromOld) || expCats?.[0]?.id || null,
          amount: money(s.amount),
          due_day: clampDay(s.due_day ?? s.day ?? s.dueDay ?? s.payDay),
          payment_type: (s.payment_type || s.type) === "credit" ? "credit" : "regular",
          active: s.active !== false,
          total_months: Number(s.total_months ?? s.totalMonths ?? s.repeatMonths ?? s.creditMonths ?? 0),
          paid_months: Number(s.paid_months ?? s.paidMonths ?? s.paid ?? 0),
          valid_from_month: cleanMonth(s.valid_from_month ?? s.validFrom ?? s.startMonth),
          valid_to_month: cleanMonth(s.valid_to_month ?? s.validTo),
          sort_order: Number(s.sort_order ?? s.order ?? (i + 1) * 10)
        };
      });
      if (paymentRows.length) {
        const { error } = await supabase.from("recurring_payments").insert(paymentRows);
        if (error) throw error;
      }

      const sourceIncomes = isSupabaseExport ? (legacy.incomes || []) : (legacy.recurringIncomes || []);
      const incomeRows = sourceIncomes.map((r: any, i: number) => {
        const id = crypto.randomUUID();
        if (r.id) incomeSourceMap.set(String(r.id), id);
        const categoryNameFromOld = r.category || r.type || (legacy.incomeCategories || []).find((c: any) => c.id === r.category_id)?.name || "Зарплата";
        const freq = r.frequency || r.freq || "monthly";
        return {
          id,
          user_id: userId,
          title: r.title || "Доход",
          category_id: oldIncomeIdToNew.get(String(r.category_id)) || incomeMap.get(categoryNameFromOld) || incCats?.[0]?.id || null,
          amount: money(r.amount),
          due_day: clampDay(r.due_day ?? r.day),
          frequency: freqMonths[freq as Frequency] ? freq : "monthly",
          active: r.active !== false,
          valid_from_month: cleanMonth(r.valid_from_month ?? r.validFrom ?? r.startMonth),
          valid_to_month: cleanMonth(r.valid_to_month ?? r.validTo),
          sort_order: Number(r.sort_order ?? r.order ?? (i + 1) * 10)
        };
      });
      if (incomeRows.length) {
        const { error } = await supabase.from("recurring_incomes").insert(incomeRows);
        if (error) throw error;
      }

      const sourceOps = legacy.operations || legacy.ops || [];
      const opRows = sourceOps.map((o: any, i: number) => {
        const kind = o.kind === "income" ? "income" : "expense";
        const categoryTitle = o.category || (kind === "income"
          ? (legacy.incomeCategories || []).find((c: any) => c.id === o.category_id)?.name
          : (legacy.expenseCategories || []).find((c: any) => c.id === o.category_id)?.name);
        return {
          user_id: userId,
          op_date: o.op_date || o.date || `${calcStart}-01`,
          kind,
          category_id: kind === "income"
            ? oldIncomeIdToNew.get(String(o.category_id)) || incomeMap.get(categoryTitle || "Доход") || incCats?.[0]?.id || null
            : oldExpenseIdToNew.get(String(o.category_id)) || expenseMap.get(categoryTitle || "Другое") || expCats?.[0]?.id || null,
          title: o.title || categoryTitle || "Операция",
          amount: money(o.amount),
          completed: o.completed !== undefined ? !!o.completed : true,
          sort_order: Number(o.sort_order ?? o.order ?? (i + 1) * 10),
          source_recurring_payment_id: o.source_recurring_payment_id ? scheduleMap.get(String(o.source_recurring_payment_id)) || null : (o.sourceScheduleId ? scheduleMap.get(String(o.sourceScheduleId)) || null : null),
          source_recurring_income_id: o.source_recurring_income_id ? incomeSourceMap.get(String(o.source_recurring_income_id)) || null : (o.sourceRecurringIncomeId ? incomeSourceMap.get(String(o.sourceRecurringIncomeId)) || null : null),
          source_month: o.source_month || o.sourceMonth || null
        };
      });
      if (opRows.length) {
        const { error } = await supabase.from("operations").insert(opRows);
        if (error) throw error;
      }

      const exclusionRows: any[] = [];
      const oldExclusions = legacy.scheduleExclusions || {};
      Object.keys(oldExclusions).forEach((key) => {
        const [oldId, month] = key.split("__");
        const newId = scheduleMap.get(oldId);
        if (newId && month) exclusionRows.push({ user_id: userId, recurring_payment_id: newId, month });
      });
      (legacy.exclusions || []).forEach((e: any) => {
        const newId = scheduleMap.get(String(e.recurring_payment_id));
        if (newId && e.month) exclusionRows.push({ user_id: userId, recurring_payment_id: newId, month: e.month });
      });
      if (exclusionRows.length) {
        const { error } = await supabase.from("monthly_payment_exclusions").upsert(exclusionRows);
        if (error) throw error;
      }

      const collapsedRows = (legacy.collapsedGroups || []).map((g: any) => ({
        user_id: userId,
        month: g.month,
        category_key: g.category_key,
        collapsed: g.collapsed !== false
      })).filter((g: any) => g.month && g.category_key);
      if (collapsedRows.length) await supabase.from("collapsed_groups").upsert(collapsedRows);

      await loadAll();
      setViewMonthState(importedDiaryStart);
      flash("Импорт завершён");
    } catch (error: any) {
      flash(error?.message || "Импорт не завершён");
      setLoading(false);
    }
  }

  const regularPayments = useMemo(() => payments.filter((p) => p.payment_type !== "credit"), [payments]);
  const creditPayments = useMemo(() => payments.filter((p) => p.payment_type === "credit"), [payments]);

  const visibleRegularPayments = useMemo(() => {
    const filters = settingsTableFilters.payments;
    const sort = settingsTableSorts.payments;
    const rows = regularPayments.filter((payment) => {
      const activeMatches = filters.active === "all" || (filters.active === "active" ? payment.active : !payment.active);
      return activeMatches
        && matchesText(payment.title, filters.title)
        && (!filters.category || payment.category_id === filters.category)
        && matchesExactNumber(payment.amount, filters.amount)
        && matchesExactNumber(payment.due_day, filters.due_day)
        && (!filters.from || normalizeMonth(payment.valid_from_month) === filters.from)
        && (!filters.to || normalizeMonth(payment.valid_to_month) === filters.to);
    });
    const value = (payment: RecurringPayment) => {
      switch (sort.key) {
        case "active": return payment.active;
        case "title": return payment.title;
        case "category": return categoryName(expenseCategories, payment.category_id, "");
        case "amount": return Number(payment.amount || 0);
        case "due_day": return Number(payment.due_day || 0);
        case "from": return normalizeMonth(payment.valid_from_month) || "";
        case "to": return normalizeMonth(payment.valid_to_month) || "";
        default: return Number(payment.sort_order || 0);
      }
    };
    return [...rows].sort((left, right) => compareSettingsValues(value(left), value(right)) * (sort.direction === "asc" ? 1 : -1));
  }, [regularPayments, expenseCategories, settingsTableFilters.payments, settingsTableSorts.payments]);

  const visibleCreditPayments = useMemo(() => {
    const filters = settingsTableFilters.credits;
    const sort = settingsTableSorts.credits;
    const rows = creditPayments.filter((payment) => {
      const activeMatches = filters.active === "all" || (filters.active === "active" ? payment.active : !payment.active);
      return activeMatches
        && matchesText(payment.title, filters.title)
        && (!filters.category || payment.category_id === filters.category)
        && matchesExactNumber(payment.amount, filters.amount)
        && matchesExactNumber(payment.due_day, filters.due_day)
        && matchesExactNumber(payment.total_months, filters.total_months)
        && matchesExactNumber(payment.paid_months, filters.paid_months)
        && (!filters.from || normalizeMonth(payment.valid_from_month) === filters.from);
    });
    const value = (payment: RecurringPayment) => {
      switch (sort.key) {
        case "active": return payment.active;
        case "title": return payment.title;
        case "category": return categoryName(expenseCategories, payment.category_id, "");
        case "amount": return Number(payment.amount || 0);
        case "due_day": return Number(payment.due_day || 0);
        case "total_months": return Number(payment.total_months || 0);
        case "paid_months": return Number(payment.paid_months || 0);
        case "from": return normalizeMonth(payment.valid_from_month) || "";
        default: return Number(payment.sort_order || 0);
      }
    };
    return [...rows].sort((left, right) => compareSettingsValues(value(left), value(right)) * (sort.direction === "asc" ? 1 : -1));
  }, [creditPayments, expenseCategories, settingsTableFilters.credits, settingsTableSorts.credits]);

  const visibleIncomes = useMemo(() => {
    const filters = settingsTableFilters.incomes;
    const sort = settingsTableSorts.incomes;
    const rows = incomes.filter((income) => {
      const activeMatches = filters.active === "all" || (filters.active === "active" ? income.active : !income.active);
      return activeMatches
        && matchesText(income.title, filters.title)
        && (!filters.category || income.category_id === filters.category)
        && matchesExactNumber(income.amount, filters.amount)
        && (!filters.frequency || income.frequency === filters.frequency)
        && matchesExactNumber(income.due_day, filters.due_day)
        && (!filters.from || normalizeMonth(income.valid_from_month) === filters.from)
        && (!filters.to || normalizeMonth(income.valid_to_month) === filters.to);
    });
    const value = (income: RecurringIncome) => {
      switch (sort.key) {
        case "active": return income.active;
        case "title": return income.title;
        case "category": return categoryName(incomeCategories, income.category_id, "");
        case "amount": return Number(income.amount || 0);
        case "frequency": return freqLabels[income.frequency];
        case "due_day": return Number(income.due_day || 0);
        case "from": return normalizeMonth(income.valid_from_month) || "";
        case "to": return normalizeMonth(income.valid_to_month) || "";
        default: return Number(income.sort_order || 0);
      }
    };
    return [...rows].sort((left, right) => compareSettingsValues(value(left), value(right)) * (sort.direction === "asc" ? 1 : -1));
  }, [incomes, incomeCategories, settingsTableFilters.incomes, settingsTableSorts.incomes]);

  const visibleExpenseCategories = useMemo(() => {
    const filters = settingsTableFilters.expenseCategories;
    const sort = settingsTableSorts.expenseCategories;
    const rows = expenseCategories.filter((category) => matchesText(category.name, filters.name));
    const value = (category: Category) => sort.key === "name" ? category.name : Number(category.sort_order || 0);
    return [...rows].sort((left, right) => compareSettingsValues(value(left), value(right)) * (sort.direction === "asc" ? 1 : -1));
  }, [expenseCategories, settingsTableFilters.expenseCategories, settingsTableSorts.expenseCategories]);

  const visibleIncomeCategories = useMemo(() => {
    const filters = settingsTableFilters.incomeCategories;
    const sort = settingsTableSorts.incomeCategories;
    const rows = incomeCategories.filter((category) => matchesText(category.name, filters.name));
    const value = (category: Category) => sort.key === "name" ? category.name : Number(category.sort_order || 0);
    return [...rows].sort((left, right) => compareSettingsValues(value(left), value(right)) * (sort.direction === "asc" ? 1 : -1));
  }, [incomeCategories, settingsTableFilters.incomeCategories, settingsTableSorts.incomeCategories]);

  const incomeRowNames = useMemo(() => {
    const names = new Set<string>();
    forecast.forEach((m) => Object.entries(m.incomeBy).forEach(([k, v]) => Number(v) !== 0 && names.add(k)));
    return [...names];
  }, [forecast]);

  const expenseRowNames = useMemo(() => {
    const names = new Set<string>();
    forecast.forEach((m) => Object.entries(m.expenseBy).forEach(([k, v]) => Number(v) !== 0 && names.add(k)));
    return [...names];
  }, [forecast]);

  if (loading || !settings) {
    return <main className="loading">Загрузка дневника…</main>;
  }

  return (
    <main id="stage">
      <div id="app">
        <header className="slimbar">
          <div className="brand">
            <div className="mark">₸</div>
            <div>
              <div className="slim-title">Финансовый дневник</div>
              <div className="slim-sub">
                дневник с <span>{monthLongLabel(diaryStart)}</span> · прогноз с <span>{monthLongLabel(forecastStart)}</span>
              </div>
            </div>
          </div>

          <nav className="mainTabs headerTabs">
            <button type="button" className={`mainTab ${mainTab === "diary" ? "active" : ""}`} onClick={() => setMainTab("diary")}>
              Дневник
            </button>
            <button type="button" className={`mainTab ${mainTab === "relocation" ? "active" : ""}`} onClick={() => setMainTab("relocation")}>
              Переезд / мультивалюта
            </button>
          </nav>

        </header>

        {message && <div className="toast">{message}</div>}

        {mainTab === "diary" && (
          <>
        <section className="summaryGrid">
          <div className={`summaryCard ${before < 0 ? "negative" : ""}`}>
            <b>{fmt(before)}</b>
            <span>на начало месяца</span>
          </div>
          <div className="summaryCard income">
            <b>{fmt(selectedPlan.incomeTotal)}</b>
            <span>доходы месяца</span>
          </div>
          <div className="summaryCard expense">
            <b>{fmt(selectedPlan.expenseTotal)}</b>
            <span>расходы месяца</span>
          </div>
          <div className={`summaryCard ${selectedEndBalance < 0 ? "negative" : ""}`}>
            <b>{fmt(selectedEndBalance)}</b>
            <span>на конец месяца</span>
          </div>
        </section>

        <section className="workspace">
          <section className="panel diaryPanel">
            <div className="panel-head">
              <div>
                <h2>Дневник операций</h2>
                <span className="hint">{doneCount} факт · {pendingCount} план</span>
              </div>
              <div className="panel-tools diaryPanelTools">
                <div className="diaryMonthInline">
                  <span className="hint">Период дневника</span>
                  <button className="btn month-btn" disabled={monthIndex(viewMonth) <= monthIndex(diaryStart)} onClick={() => setViewMonth(addMonths(viewMonth, -1))}>
                    ←
                  </button>
                  <div className="diaryMonthPickerWrap">
                    <MonthPicker value={viewMonth} min={diaryStart} onChange={(value) => value && setViewMonth(value)} />
                  </div>
                  <button className="btn month-btn current" onClick={() => setViewMonth(currentMonth())}>
                    текущий
                  </button>
                  <button className="btn month-btn" onClick={() => setViewMonth(addMonths(viewMonth, 1))}>
                    →
                  </button>
                </div>
                <button className="btn blue" onClick={openNewOperation}>+ операция</button>
              </div>
            </div>

            <div className="tablebox">
              <div className="thead">
                <div>✓</div>
                <div>Дата</div>
                <div>Тип</div>
                <div>Статья</div>
                <div>Комментарий</div>
                <div>Сумма</div>
                <div></div>
              </div>

              <div className="tbody">
                {pagedRows.length === 0 && <div className="empty">Пока нет операций за выбранный месяц.</div>}

                {pagedRows.map((row, idx) => {
                  if (row.type === "group") {
                    const income = row.group.items.filter((x) => x.kind === "income").reduce((s, x) => s + Number(x.amount || 0), 0);
                    const expense = row.group.items.filter((x) => x.kind === "expense").reduce((s, x) => s + Number(x.amount || 0), 0);
                    const sumText = income > 0 && expense > 0 ? `+${fmt(income)} / −${fmt(expense)}` : income > 0 ? `+${fmt(income)}` : `−${fmt(expense)}`;
                    const collapsed = collapsedKeys.has(row.group.key);
                    return (
                      <div className={`opgroup ${collapsed ? "collapsed" : ""}`} key={`group-${row.group.key}`} onClick={() => toggleGroup(row.group.key)}>
                        <button className="groupToggle">{collapsed ? "▸" : "▾"}</button>
                        <div className="groupTitle">{row.group.title}</div>
                        <div className="groupMeta">{row.group.items.length} поз. · {sumText}</div>
                      </div>
                    );
                  }

                  const op = row.op;
                  const real = !("virtual" in op);
                  const cat = op.kind === "income" ? categoryName(incomeCategories, op.category_id, "Доход") : categoryName(expenseCategories, op.category_id, "Другое");
                  return (
                    <div className={`oprow ${op.kind} ${op.completed ? "done" : "pending"} ${"virtual" in op ? "virtual" : ""}`} key={`${op.id}-${idx}`}>
                      <label className="checkcell">
                        <input
                          type="checkbox"
                          checked={op.completed}
                          onChange={(e) => {
                            if ("virtual" in op) toggleVirtualPayment(op, e.target.checked);
                            else toggleOperation(op, e.target.checked);
                          }}
                        />
                        <span />
                      </label>
                      <div className="cell dateCell">{op.op_date.slice(8, 10)}.{op.op_date.slice(5, 7)}</div>
                      <div><span className={`tag ${op.kind}`}>{op.kind === "income" ? "Доход" : "Расход"}</span></div>
                      <div className="cell categoryCell">{cat}</div>
                      <div className="cell commentCell">
                        <span>{op.title}</span>
                        <b className={`statusBadge ${op.completed ? "fact" : "plan"}`}>{op.completed ? "факт" : "план"}</b>
                        <em>{op.source_recurring_payment_id ? "рег. платёж" : op.source_recurring_income_id ? "рег. доход" : "ручн."}</em>
                      </div>
                      <div className={`amount ${op.kind}`}>{op.kind === "income" ? "+" : "−"}{fmt(op.amount)}</div>
                      <div className="rowactions">
                        {real ? (
                          <>
                            <button className="movebtn" onClick={() => moveOperation(op as Operation, -1)}>↑</button>
                            <button className="movebtn" onClick={() => moveOperation(op as Operation, 1)}>↓</button>
                            <button className="edit" onClick={() => openEditOperation(op as Operation)}>✎</button>
                            <button className="delete" onClick={() => deleteOperation(op as Operation)}>×</button>
                          </>
                        ) : (
                          <span className="virtualLock">настр.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pager">
                <button className="btn" disabled={page <= 1} onClick={() => setOpsPage(page - 1)}>←</button>
                <span>{page} / {totalPages}</span>
                <button className="btn" disabled={page >= totalPages} onClick={() => setOpsPage(page + 1)}>→</button>
              </div>
            </div>
          </section>

          <section className="panel forecastPanel">
            <div className="panel-head forecastPanelHead">
              <div>
                <h2>Календарный прогноз</h2>
                <span className="hint">независимо от выбранного месяца дневника · показано {forecast.length} мес.</span>
              </div>
              <label className="forecastStartControl">
                <span>Показывать с</span>
                <MonthPicker value={forecastStart} onChange={(value) => updateSettings({ forecast_start_month: value || currentMonth() })} />
              </label>
            </div>

            <div className="matrixbox">
              <table className="matrix">
                <thead>
                  <tr>
                    <th className="corner">Показатель</th>
                    {forecast.map((m) => <th key={`y-${m.month}`} className="year">{m.month.slice(0, 4)}</th>)}
                  </tr>
                  <tr>
                    <th className="corner sub">Месяц</th>
                    {forecast.map((m) => <th key={`m-${m.month}`} className="month">{monthLabel(m.month)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="strong netRow"><th className="rowhead">Остаток месяца</th>{forecast.map((m) => <td className={m.net < 0 ? "neg" : ""} key={`net-${m.month}`}>{full(m.net)}</td>)}</tr>
                  <tr className="strong cumulativeRow"><th className="rowhead">Накопительно</th>{forecast.map((m) => <td className={m.balance < 0 ? "neg" : ""} key={`bal-${m.month}`}>{full(m.balance)}</td>)}</tr>
                  <tr className="section incomeSection"><th className="rowhead">Доходы</th>{forecast.map((m) => <td key={`inc-${m.month}`}>{full(m.incomeTotal)}</td>)}</tr>
                  {incomeRowNames.map((name) => (
                    <tr className="incomeRow" key={`incrow-${name}`}>
                      <th className="rowhead light">{name}</th>
                      {forecast.map((m) => <td key={`${name}-${m.month}`}>{full(m.incomeBy[name] || 0)}</td>)}
                    </tr>
                  ))}
                  <tr className="section expenseSection"><th className="rowhead">Расходы</th>{forecast.map((m) => <td key={`exp-${m.month}`}>{full(m.expenseTotal)}</td>)}</tr>
                  {expenseRowNames.map((name) => (
                    <tr className="expenseRow" key={`exprow-${name}`}>
                      <th className="rowhead light">{name}</th>
                      {forecast.map((m) => <td key={`${name}-${m.month}`}>{full(m.expenseBy[name] || 0)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>

          </>
        )}

        {mainTab === "relocation" && (
          <MigrationPlanner
            userId={userId}
            diaryStartMonth={calcStart}
            getDiaryMonthPlan={oneMonthPlan}
            getDiaryBalanceBeforeMonth={balanceBeforeMonth}
          />
        )}

        <button className="settings-fab" onClick={() => setSettingsOpen(true)}>⚙</button>
        <button className="logoutBtn" onClick={signOut}>выйти</button>
      </div>

      {opModalOpen && (
        <div className="modal show">
          <form className="modal-card compact" onSubmit={saveOperation}>
            <div className="modal-head">
              <h3>{editingOperationId ? "Редактировать операцию" : "Новая операция"}</h3>
              <button type="button" onClick={() => setOpModalOpen(false)}>×</button>
            </div>

            <div className="formgrid">
              <label>Дата<input type="date" value={opForm.op_date} onChange={(e) => setOpForm({ ...opForm, op_date: e.target.value })} /></label>
              <label>Тип
                <select value={opForm.kind} onChange={(e) => {
                  const kind = e.target.value as Kind;
                  setOpForm({ ...opForm, kind, category_id: kind === "income" ? incomeCategories[0]?.id || "" : expenseCategories[0]?.id || "" });
                }}>
                  <option value="expense">Расход</option>
                  <option value="income">Доход</option>
                </select>
              </label>
              <label>Статья
                <select value={opForm.category_id} onChange={(e) => setOpForm({ ...opForm, category_id: e.target.value })}>
                  {(opForm.kind === "income" ? incomeCategories : expenseCategories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Сумма<input type="number" value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} /></label>
              <label className="wide">Комментарий<input value={opForm.title} onChange={(e) => setOpForm({ ...opForm, title: e.target.value })} /></label>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setOpModalOpen(false)}>Отмена</button>
              <button className="btn blue" type="submit">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {settingsOpen && (
        <div className="modal show settingsOverlay">
          <div className="modal-card settingsModal">
            <div className="modal-head settingsModalHead">
              <div>
                <h3>Настройки дневника</h3>
                <p>Платежи, доходы и статьи можно менять вручную. Изменения сохраняются автоматически.</p>
              </div>
              <button type="button" aria-label="Закрыть настройки" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className={`settingsSaveBar ${saveState.status}`}>
              <div className="settingsSaveTrack"><span /></div>
              <div className="settingsSaveMeta">
                <strong>{saveState.status === "saving" ? "Автосохранение" : saveState.status === "error" ? "Ошибка сохранения" : "Сохранено"}</strong>
                <span>{saveState.message}</span>
              </div>
            </div>

            <div className="settingsLayout">
              <nav className="settingsNav" aria-label="Разделы настроек">
                <button type="button" className={settingsTab === "main" ? "active" : ""} onClick={() => setSettingsTab("main")}>Параметры</button>
                <button type="button" className={settingsTab === "expenses" ? "active" : ""} onClick={() => setSettingsTab("expenses")}>Платежи</button>
                <button type="button" className={settingsTab === "credits" ? "active" : ""} onClick={() => setSettingsTab("credits")}>Кредиты</button>
                <button type="button" className={settingsTab === "incomes" ? "active" : ""} onClick={() => setSettingsTab("incomes")}>Доходы</button>
                <button type="button" className={settingsTab === "categories" ? "active" : ""} onClick={() => setSettingsTab("categories")}>Статьи</button>
                <button type="button" className={settingsTab === "import" ? "active" : ""} onClick={() => setSettingsTab("import")}>Импорт</button>
              </nav>

              <section className={`settingsContent ${["expenses", "credits", "incomes", "categories"].includes(settingsTab) ? "settingsContentTableMode" : ""}`}>
                {settingsTab === "main" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Основные параметры</h4>
                        <p>Дневник и календарный прогноз имеют независимые периоды просмотра.</p>
                      </div>
                    </div>
                    <div className="settingsGrid settingsGridCards">
                      <label>Дневник операций — показывать с<MonthPicker value={diaryStart} onChange={(value) => updateSettings({ diary_start_month: value || currentMonth() })} /><span>Это нижняя граница переключения месяцев в дневнике.</span></label>
                      <label>Календарный прогноз — показывать с<MonthPicker value={forecastStart} onChange={(value) => updateSettings({ forecast_start_month: value || currentMonth() })} /><span>Прогноз начинается с этого месяца и не зависит от дневника.</span></label>
                      <label>Стартовый остаток<input type="number" value={settings.start_balance} onChange={(e) => updateSettings({ start_balance: Number(e.target.value || 0) })} /></label>
                      <label>Резервный план дохода<input type="number" value={settings.plan_income} onChange={(e) => updateSettings({ plan_income: Number(e.target.value || 0) })} /><span>Используется только когда регулярные доходы не заведены.</span></label>
                      <label>Резервный план расходов<input type="number" value={settings.plan_other} onChange={(e) => updateSettings({ plan_other: Number(e.target.value || 0) })} /><span>Используется только когда регулярные расходы не заведены.</span></label>
                      <label>Горизонт прогноза, лет<input type="number" min="1" max="10" value={settings.years} onChange={(e) => updateSettings({ years: Number(e.target.value || 3) })} /></label>
                    </div>
                  </div>
                )}

                {settingsTab === "expenses" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Регулярные расходы</h4>
                        <p>Обычные ежемесячные и разовые платежи без кредитов и рассрочек.</p>
                      </div>
                      <div className="settingsHeadActions">
                        <button className="btn blue" type="button" onClick={() => addPayment("regular")}>+ Платёж</button>
                      </div>
                    </div>

                    <section className="settingsTableCard">
                      <div className="tableCardHead">
                        <div>
                          <h5>Платежи</h5>
                          <span>{visibleRegularPayments.length} из {regularPayments.length}</span>
                        </div>
                      </div>
                      <div className="settingsCompactTableWrap">
                        <table className="settingsCompactTable paymentsTable">
                          <thead>
                            <tr className="settingsSortRow">
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "active")}>on <span>{settingsSortMark("payments", "active")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "title")}>Название <span>{settingsSortMark("payments", "title")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "category")}>Статья <span>{settingsSortMark("payments", "category")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "amount")}>Сумма <span>{settingsSortMark("payments", "amount")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "due_day")}>День <span>{settingsSortMark("payments", "due_day")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "from")}>С <span>{settingsSortMark("payments", "from")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("payments", "to")}>До <span>{settingsSortMark("payments", "to")}</span></button></th>
                              <th></th>
                            </tr>
                            <tr className="settingsFilterRow">
                              <th><select aria-label="Фильтр активности платежей" value={settingsTableFilters.payments.active} onChange={(e) => setSettingsTableFilter("payments", "active", e.target.value)}><option value="all">Все</option><option value="active">Вкл</option><option value="inactive">Выкл</option></select></th>
                              <th><input aria-label="Фильтр платежей по названию" placeholder="Поиск" value={settingsTableFilters.payments.title} onChange={(e) => setSettingsTableFilter("payments", "title", e.target.value)} /></th>
                              <th><select aria-label="Фильтр платежей по статье" value={settingsTableFilters.payments.category} onChange={(e) => setSettingsTableFilter("payments", "category", e.target.value)}><option value="">Все статьи</option>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></th>
                              <th><input aria-label="Фильтр платежей по сумме" type="number" placeholder="=" value={settingsTableFilters.payments.amount} onChange={(e) => setSettingsTableFilter("payments", "amount", e.target.value)} /></th>
                              <th><input aria-label="Фильтр платежей по дню" type="number" min="1" max="31" placeholder="=" value={settingsTableFilters.payments.due_day} onChange={(e) => setSettingsTableFilter("payments", "due_day", e.target.value)} /></th>
                              <th><MonthPicker value={settingsTableFilters.payments.from || null} onChange={(value) => setSettingsTableFilter("payments", "from", value || "")} nullable className="filterMonthPicker" /></th>
                              <th><MonthPicker value={settingsTableFilters.payments.to || null} onChange={(value) => setSettingsTableFilter("payments", "to", value || "")} nullable className="filterMonthPicker" /></th>
                              <th><button type="button" className="settingsFilterReset" aria-label="Очистить фильтры платежей" title="Очистить фильтры" onClick={() => resetSettingsTableFilters("payments")}>×</button></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRegularPayments.map((p) => (
                              <tr key={p.id} className={p.active ? "" : "inactive"}>
                                <td><input type="checkbox" checked={p.active} onChange={(e) => updatePayment(p.id, { active: e.target.checked })} /></td>
                                <td><input value={p.title} onChange={(e) => updatePayment(p.id, { title: e.target.value })} /></td>
                                <td><select value={p.category_id || ""} onChange={(e) => updatePayment(p.id, { category_id: e.target.value || null })}>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                                <td><input type="number" value={p.amount} onChange={(e) => updatePayment(p.id, { amount: Number(e.target.value || 0) })} /></td>
                                <td><input type="number" min="1" max="31" value={p.due_day} onChange={(e) => updatePayment(p.id, { due_day: Number(e.target.value || 1) })} /></td>
                                <td><MonthPicker value={p.valid_from_month} onChange={(value) => updatePayment(p.id, { valid_from_month: value })} nullable /></td>
                                <td><MonthPicker value={p.valid_to_month} onChange={(value) => updatePayment(p.id, { valid_to_month: value })} nullable /></td>
                                <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${p.title}`} onClick={() => deletePayment(p.id)}>×</button></td>
                              </tr>
                            ))}
                            {!visibleRegularPayments.length && <tr><td colSpan={8}><div className="settingsEmpty slim">{regularPayments.length ? "По фильтрам ничего не найдено." : "Регулярных платежей пока нет."}</div></td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "credits" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Кредиты / рассрочки</h4>
                        <p>Отдельная вкладка только для кредитных обязательств, чтобы не засорять обычные расходы.</p>
                      </div>
                      <div className="settingsHeadActions">
                        <button className="btn blue" type="button" onClick={() => addPayment("credit")}>+ Кредит</button>
                      </div>
                    </div>

                    <section className="settingsTableCard">
                      <div className="tableCardHead">
                        <div>
                          <h5>Кредиты</h5>
                          <span>{visibleCreditPayments.length} из {creditPayments.length}</span>
                        </div>
                      </div>
                      <div className="settingsCompactTableWrap">
                        <table className="settingsCompactTable creditTable">
                          <thead>
                            <tr className="settingsSortRow">
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "active")}>on <span>{settingsSortMark("credits", "active")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "title")}>Название <span>{settingsSortMark("credits", "title")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "category")}>Статья <span>{settingsSortMark("credits", "category")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "amount")}>Сумма <span>{settingsSortMark("credits", "amount")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "due_day")}>День <span>{settingsSortMark("credits", "due_day")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "total_months")}>Всего мес. <span>{settingsSortMark("credits", "total_months")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "paid_months")}>Оплачено <span>{settingsSortMark("credits", "paid_months")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("credits", "from")}>С <span>{settingsSortMark("credits", "from")}</span></button></th>
                              <th></th>
                            </tr>
                            <tr className="settingsFilterRow">
                              <th><select aria-label="Фильтр активности кредитов" value={settingsTableFilters.credits.active} onChange={(e) => setSettingsTableFilter("credits", "active", e.target.value)}><option value="all">Все</option><option value="active">Вкл</option><option value="inactive">Выкл</option></select></th>
                              <th><input aria-label="Фильтр кредитов по названию" placeholder="Поиск" value={settingsTableFilters.credits.title} onChange={(e) => setSettingsTableFilter("credits", "title", e.target.value)} /></th>
                              <th><select aria-label="Фильтр кредитов по статье" value={settingsTableFilters.credits.category} onChange={(e) => setSettingsTableFilter("credits", "category", e.target.value)}><option value="">Все статьи</option>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></th>
                              <th><input aria-label="Фильтр кредитов по сумме" type="number" placeholder="=" value={settingsTableFilters.credits.amount} onChange={(e) => setSettingsTableFilter("credits", "amount", e.target.value)} /></th>
                              <th><input aria-label="Фильтр кредитов по дню" type="number" min="1" max="31" placeholder="=" value={settingsTableFilters.credits.due_day} onChange={(e) => setSettingsTableFilter("credits", "due_day", e.target.value)} /></th>
                              <th><input aria-label="Фильтр кредитов по общей длительности" type="number" min="0" placeholder="=" value={settingsTableFilters.credits.total_months} onChange={(e) => setSettingsTableFilter("credits", "total_months", e.target.value)} /></th>
                              <th><input aria-label="Фильтр кредитов по оплаченным месяцам" type="number" min="0" placeholder="=" value={settingsTableFilters.credits.paid_months} onChange={(e) => setSettingsTableFilter("credits", "paid_months", e.target.value)} /></th>
                              <th><MonthPicker value={settingsTableFilters.credits.from || null} onChange={(value) => setSettingsTableFilter("credits", "from", value || "")} nullable className="filterMonthPicker" /></th>
                              <th><button type="button" className="settingsFilterReset" aria-label="Очистить фильтры кредитов" title="Очистить фильтры" onClick={() => resetSettingsTableFilters("credits")}>×</button></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleCreditPayments.map((p) => (
                              <tr key={p.id} className={p.active ? "" : "inactive"}>
                                <td><input type="checkbox" checked={p.active} onChange={(e) => updatePayment(p.id, { active: e.target.checked })} /></td>
                                <td><input value={p.title} onChange={(e) => updatePayment(p.id, { title: e.target.value })} /></td>
                                <td><select value={p.category_id || ""} onChange={(e) => updatePayment(p.id, { category_id: e.target.value || null })}>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                                <td><input type="number" value={p.amount} onChange={(e) => updatePayment(p.id, { amount: Number(e.target.value || 0) })} /></td>
                                <td><input type="number" min="1" max="31" value={p.due_day} onChange={(e) => updatePayment(p.id, { due_day: Number(e.target.value || 1) })} /></td>
                                <td><input type="number" min="0" value={p.total_months} onChange={(e) => updatePayment(p.id, { total_months: Number(e.target.value || 0) })} /></td>
                                <td><input type="number" min="0" value={p.paid_months} onChange={(e) => updatePayment(p.id, { paid_months: Number(e.target.value || 0) })} /></td>
                                <td><MonthPicker value={p.valid_from_month} onChange={(value) => updatePayment(p.id, { valid_from_month: value })} nullable /></td>
                                <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${p.title}`} onClick={() => deletePayment(p.id)}>×</button></td>
                              </tr>
                            ))}
                            {!visibleCreditPayments.length && <tr><td colSpan={9}><div className="settingsEmpty slim">{creditPayments.length ? "По фильтрам ничего не найдено." : "Кредитов пока нет."}</div></td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "incomes" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Регулярные доходы</h4>
                        <p>Вся информация — в одной строке: название, статья, сумма, частота и период действия.</p>
                      </div>
                      <button className="btn blue" type="button" onClick={addIncome}>+ Добавить доход</button>
                    </div>

                    <section className="settingsTableCard">
                      <div className="tableCardHead">
                        <div>
                          <h5>Доходы</h5>
                          <span>{visibleIncomes.length} из {incomes.length}</span>
                        </div>
                      </div>
                      <div className="settingsCompactTableWrap">
                        <table className="settingsCompactTable incomeTable">
                          <thead>
                            <tr className="settingsSortRow">
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "active")}>on <span>{settingsSortMark("incomes", "active")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "title")}>Название <span>{settingsSortMark("incomes", "title")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "category")}>Статья <span>{settingsSortMark("incomes", "category")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "amount")}>Сумма <span>{settingsSortMark("incomes", "amount")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "frequency")}>Частота <span>{settingsSortMark("incomes", "frequency")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "due_day")}>День <span>{settingsSortMark("incomes", "due_day")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "from")}>С <span>{settingsSortMark("incomes", "from")}</span></button></th>
                              <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomes", "to")}>До <span>{settingsSortMark("incomes", "to")}</span></button></th>
                              <th></th>
                            </tr>
                            <tr className="settingsFilterRow">
                              <th><select aria-label="Фильтр активности доходов" value={settingsTableFilters.incomes.active} onChange={(e) => setSettingsTableFilter("incomes", "active", e.target.value)}><option value="all">Все</option><option value="active">Вкл</option><option value="inactive">Выкл</option></select></th>
                              <th><input aria-label="Фильтр доходов по названию" placeholder="Поиск" value={settingsTableFilters.incomes.title} onChange={(e) => setSettingsTableFilter("incomes", "title", e.target.value)} /></th>
                              <th><select aria-label="Фильтр доходов по статье" value={settingsTableFilters.incomes.category} onChange={(e) => setSettingsTableFilter("incomes", "category", e.target.value)}><option value="">Все статьи</option>{incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></th>
                              <th><input aria-label="Фильтр доходов по сумме" type="number" placeholder="=" value={settingsTableFilters.incomes.amount} onChange={(e) => setSettingsTableFilter("incomes", "amount", e.target.value)} /></th>
                              <th><select aria-label="Фильтр доходов по частоте" value={settingsTableFilters.incomes.frequency} onChange={(e) => setSettingsTableFilter("incomes", "frequency", e.target.value)}><option value="">Все</option>{Object.entries(freqLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></th>
                              <th><input aria-label="Фильтр доходов по дню" type="number" min="1" max="31" placeholder="=" value={settingsTableFilters.incomes.due_day} onChange={(e) => setSettingsTableFilter("incomes", "due_day", e.target.value)} /></th>
                              <th><MonthPicker value={settingsTableFilters.incomes.from || null} onChange={(value) => setSettingsTableFilter("incomes", "from", value || "")} nullable className="filterMonthPicker" /></th>
                              <th><MonthPicker value={settingsTableFilters.incomes.to || null} onChange={(value) => setSettingsTableFilter("incomes", "to", value || "")} nullable className="filterMonthPicker" /></th>
                              <th><button type="button" className="settingsFilterReset" aria-label="Очистить фильтры доходов" title="Очистить фильтры" onClick={() => resetSettingsTableFilters("incomes")}>×</button></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleIncomes.map((i) => (
                              <tr key={i.id} className={i.active ? "" : "inactive"}>
                                <td><input type="checkbox" checked={i.active} onChange={(e) => updateIncome(i.id, { active: e.target.checked })} /></td>
                                <td><input value={i.title} onChange={(e) => updateIncome(i.id, { title: e.target.value })} /></td>
                                <td><select value={i.category_id || ""} onChange={(e) => updateIncome(i.id, { category_id: e.target.value || null })}>{incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                                <td><input type="number" value={i.amount} onChange={(e) => updateIncome(i.id, { amount: Number(e.target.value || 0) })} /></td>
                                <td><select value={i.frequency} onChange={(e) => updateIncome(i.id, { frequency: e.target.value as Frequency })}>{Object.entries(freqLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                                <td><input type="number" min="1" max="31" value={i.due_day} onChange={(e) => updateIncome(i.id, { due_day: Number(e.target.value || 1) })} /></td>
                                <td><MonthPicker value={i.valid_from_month} onChange={(value) => updateIncome(i.id, { valid_from_month: value })} nullable /></td>
                                <td><MonthPicker value={i.valid_to_month} onChange={(value) => updateIncome(i.id, { valid_to_month: value })} nullable /></td>
                                <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${i.title}`} onClick={() => deleteIncome(i.id)}>×</button></td>
                              </tr>
                            ))}
                            {!visibleIncomes.length && <tr><td colSpan={9}><div className="settingsEmpty slim">{incomes.length ? "По фильтрам ничего не найдено." : "Регулярных доходов пока нет."}</div></td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "categories" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Статьи дневника</h4>
                        <p>Названия полностью ваши: добавляйте, переименовывайте и удаляйте. Сохранение — после выхода из поля.</p>
                      </div>
                    </div>

                    <div className="categorySettings">
                      <section className="categoryColumn">
                        <div className="categoryColumnHead">
                          <div><h5>Расходы</h5><span>{visibleExpenseCategories.length} из {expenseCategories.length}</span></div>
                          <button className="btn" type="button" onClick={() => addCategory("expense")}>+ Добавить</button>
                        </div>
                        <div className="settingsCompactTableWrap categoryTableWrap">
                          <table className="settingsCompactTable categoryTable">
                            <thead>
                              <tr className="settingsSortRow">
                                <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("expenseCategories", "sort_order")}>№ <span>{settingsSortMark("expenseCategories", "sort_order")}</span></button></th>
                                <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("expenseCategories", "name")}>Название <span>{settingsSortMark("expenseCategories", "name")}</span></button></th>
                                <th></th>
                              </tr>
                              <tr className="settingsFilterRow">
                                <th></th>
                                <th><input aria-label="Фильтр расходных статей" placeholder="Поиск по названию" value={settingsTableFilters.expenseCategories.name} onChange={(e) => setSettingsTableFilter("expenseCategories", "name", e.target.value)} /></th>
                                <th><button type="button" className="settingsFilterReset" aria-label="Очистить фильтр расходных статей" title="Очистить фильтр" onClick={() => resetSettingsTableFilters("expenseCategories")}>×</button></th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleExpenseCategories.map((c) => (
                                <tr key={c.id}>
                                  <td className="categoryIndexCell">{expenseCategories.findIndex((item) => item.id === c.id) + 1}</td>
                                  <td><input value={c.name} onChange={(e) => editCategoryLocal("expense", c.id, e.target.value)} onBlur={(e) => saveCategory("expense", c.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></td>
                                  <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${c.name}`} onClick={() => deleteCategory("expense", c.id)}>×</button></td>
                                </tr>
                              ))}
                              {!visibleExpenseCategories.length && <tr><td colSpan={3}><div className="settingsEmpty slim">{expenseCategories.length ? "По фильтру ничего не найдено." : "Расходных статей пока нет."}</div></td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="categoryColumn">
                        <div className="categoryColumnHead">
                          <div><h5>Доходы</h5><span>{visibleIncomeCategories.length} из {incomeCategories.length}</span></div>
                          <button className="btn" type="button" onClick={() => addCategory("income")}>+ Добавить</button>
                        </div>
                        <div className="settingsCompactTableWrap categoryTableWrap">
                          <table className="settingsCompactTable categoryTable">
                            <thead>
                              <tr className="settingsSortRow">
                                <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomeCategories", "sort_order")}>№ <span>{settingsSortMark("incomeCategories", "sort_order")}</span></button></th>
                                <th><button type="button" className="settingsSortButton" onClick={() => toggleSettingsTableSort("incomeCategories", "name")}>Название <span>{settingsSortMark("incomeCategories", "name")}</span></button></th>
                                <th></th>
                              </tr>
                              <tr className="settingsFilterRow">
                                <th></th>
                                <th><input aria-label="Фильтр доходных статей" placeholder="Поиск по названию" value={settingsTableFilters.incomeCategories.name} onChange={(e) => setSettingsTableFilter("incomeCategories", "name", e.target.value)} /></th>
                                <th><button type="button" className="settingsFilterReset" aria-label="Очистить фильтр доходных статей" title="Очистить фильтр" onClick={() => resetSettingsTableFilters("incomeCategories")}>×</button></th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleIncomeCategories.map((c) => (
                                <tr key={c.id}>
                                  <td className="categoryIndexCell">{incomeCategories.findIndex((item) => item.id === c.id) + 1}</td>
                                  <td><input value={c.name} onChange={(e) => editCategoryLocal("income", c.id, e.target.value)} onBlur={(e) => saveCategory("income", c.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} /></td>
                                  <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${c.name}`} onClick={() => deleteCategory("income", c.id)}>×</button></td>
                                </tr>
                              ))}
                              {!visibleIncomeCategories.length && <tr><td colSpan={3}><div className="settingsEmpty slim">{incomeCategories.length ? "По фильтру ничего не найдено." : "Доходных статей пока нет."}</div></td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {settingsTab === "import" && (
                  <div className="settingsSection">
                    <div className="settingsSectionHead">
                      <div>
                        <h4>Резервная копия</h4>
                        <p>Экспортируйте текущую базу перед заменой данных.</p>
                      </div>
                    </div>
                    <div className="importBox">
                      <button type="button" className="btn" onClick={exportData}>Экспорт текущей базы</button>
                      <label className="fileImport">
                        Импорт из старого HTML / JSON
                        <input type="file" accept="application/json,.json" onChange={(e) => importLegacy(e.target.files?.[0] || null)} />
                      </label>
                      <p>Импорт заменяет текущие данные. Перед импортом лучше сделать экспорт базы.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
