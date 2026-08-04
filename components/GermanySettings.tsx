"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import { createClient } from "@/lib/supabase/browser";
import { trackRelocationSave } from "@/lib/relocationSaveCoordinator";

type Currency = "KZT" | "EUR";
type Frequency = "monthly" | "quarterly" | "yearly";

type CategoryOption = {
  id: string;
  name: string;
};

type GermanyExpense = {
  id: string;
  title: string;
  group: string;
  currency: Currency;
  amount: number;
  frequency: Frequency;
  startMonth: string;
  endMonth: string;
  active: boolean;
};

type SaveState = {
  status: "saved" | "saving" | "error";
  message: string;
};

type GermanySettingsProps = {
  userId: string;
  diaryStartMonth: string;
  expenseCategories: CategoryOption[];
  onSaveState: (state: SaveState) => void;
};

const supabase = createClient();
const frequencyLabels: Record<Frequency, string> = {
  monthly: "ежемесячно",
  quarterly: "раз в квартал",
  yearly: "раз в год"
};

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeMonth(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : fallback;
}

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function normalizeExpense(row: any, startMonth: string, fallbackGroup: string): GermanyExpense {
  const start = normalizeMonth(row?.startMonth, startMonth);
  const end = row?.endMonth ? normalizeMonth(row.endMonth, "") : "";
  return {
    id: row?.id || uuid(),
    title: String(row?.title || "Расход Германия"),
    group: String(row?.group || fallbackGroup),
    currency: row?.currency === "KZT" ? "KZT" : "EUR",
    amount: nonNegativeNumber(row?.amount),
    frequency: ["monthly", "quarterly", "yearly"].includes(row?.frequency) ? row.frequency : "monthly",
    startMonth: start,
    endMonth: end && end >= start ? end : "",
    active: row?.active !== false
  };
}

function splitPlanExpenses(plan: any, startMonth: string, fallbackGroup: string) {
  const rows = Array.isArray(plan?.rows) ? plan.rows : [];
  const stored = Array.isArray(plan?.germanyExpenses) ? plan.germanyExpenses : [];
  const migrated = rows.filter((row: any) => row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once");
  const seen = new Set<string>();
  const expenses = [...stored, ...migrated]
    .map((row) => normalizeExpense(row, startMonth, fallbackGroup))
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  const remainingRows = rows.filter((row: any) => !(row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once"));
  return { expenses, remainingRows };
}

export default function GermanySettings({ userId, diaryStartMonth, expenseCategories, onSaveState }: GermanySettingsProps) {
  const fallbackGroup = expenseCategories[0]?.name || "Расходы";
  const allowedGroups = useMemo(() => {
    const names = [...new Set(expenseCategories.map((item) => item.name.trim()).filter(Boolean))];
    return names.length ? names : [fallbackGroup];
  }, [expenseCategories, fallbackGroup]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expenses, setExpenses] = useState<GermanyExpense[]>([]);
  const [planStartMonth, setPlanStartMonth] = useState(diaryStartMonth);
  const [filter, setFilter] = useState({ active: "all", title: "", group: "", currency: "", frequency: "", from: "", to: "" });
  const [sort, setSort] = useState<{ key: keyof GermanyExpense; direction: "asc" | "desc" }>({ key: "title", direction: "asc" });
  const latestExpensesRef = useRef<GermanyExpense[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<GermanyExpense[] | null>(null);
  const saveLoopRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    latestExpensesRef.current = expenses;
  }, [expenses]);

  useEffect(() => {
    if (!expenses.length) return;
    let changed = false;
    const normalized = expenses.map((row) => {
      if (allowedGroups.includes(row.group)) return row;
      changed = true;
      return { ...row, group: allowedGroups[0] };
    });
    if (changed) setExpensesAndSave(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedGroups.join("|")]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void saveNow(latestExpensesRef.current, false);
      }
    };
  }, []);

  async function load() {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("relocation_plans").select("data").eq("user_id", userId).maybeSingle();
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const plan = data?.data || {};
    const loadedPlanStart = normalizeMonth(plan?.startMonth, diaryStartMonth);
    const { expenses: loadedExpenses, remainingRows } = splitPlanExpenses(plan, loadedPlanStart, fallbackGroup);
    setPlanStartMonth(loadedPlanStart);
    setExpenses(loadedExpenses);
    latestExpensesRef.current = loadedExpenses;
    setLoading(false);

    const hadMigratedRows = Array.isArray(plan?.rows) && remainingRows.length !== plan.rows.length;
    if (hadMigratedRows || !Array.isArray(plan?.germanyExpenses)) {
      await saveNow(loadedExpenses, false);
    }
  }

  function scheduleSave(next: GermanyExpense[]) {
    pendingSaveRef.current = next;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    onSaveState({ status: "saving", message: "Сохраняются расходы Германии…" });
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow(pendingSaveRef.current || next, true);
    }, 400);
  }

  function setExpensesAndSave(next: GermanyExpense[]) {
    setExpenses(next);
    latestExpensesRef.current = next;
    scheduleSave(next);
  }

  function commitExpenses(updater: (previous: GermanyExpense[]) => GermanyExpense[]) {
    const next = updater(latestExpensesRef.current);
    setExpensesAndSave(next);
  }

  async function saveNow(next = latestExpensesRef.current, announce = true) {
    pendingSaveRef.current = next;
    if (announce && mountedRef.current) onSaveState({ status: "saving", message: "Сохраняются расходы Германии…" });

    if (!saveLoopRef.current) {
      saveLoopRef.current = trackRelocationSave((async () => {
        while (pendingSaveRef.current) {
          const snapshot = pendingSaveRef.current;
          pendingSaveRef.current = null;

          const { data: current, error: loadPlanError } = await supabase.from("relocation_plans").select("data").eq("user_id", userId).maybeSingle();
          if (loadPlanError) {
            pendingSaveRef.current = pendingSaveRef.current || snapshot;
            if (mountedRef.current) onSaveState({ status: "error", message: loadPlanError.message });
            break;
          }

          const currentPlan = current?.data || {};
          const rows = Array.isArray(currentPlan.rows) ? currentPlan.rows : [];
          const remainingRows = rows.filter((row: any) => !(row?.country === "DE" && row?.kind === "expense" && row?.frequency !== "once"));
          const validIds = new Set(snapshot.map((row) => row.id));
          const exclusions = Array.isArray(currentPlan.germanyMonthExclusions)
            ? currentPlan.germanyMonthExclusions.filter((key: unknown) => {
                if (typeof key !== "string" || !key.startsWith("regular:")) return true;
                const id = key.split(":")[1];
                return validIds.has(id);
              })
            : [];
          const mergedPlan = { ...currentPlan, rows: remainingRows, germanyExpenses: snapshot, germanyMonthExclusions: exclusions };
          const { error } = await supabase.from("relocation_plans").upsert({
            user_id: userId,
            data: mergedPlan,
            updated_at: new Date().toISOString()
          });

          if (error) {
            pendingSaveRef.current = pendingSaveRef.current || snapshot;
            if (mountedRef.current) onSaveState({ status: "error", message: error.message });
            break;
          }

          window.dispatchEvent(new CustomEvent("relocation-plan-updated", {
            detail: { germanyExpenses: snapshot, germanyMonthExclusions: exclusions }
          }));
        }
      })().finally(() => {
        saveLoopRef.current = null;
        if (!pendingSaveRef.current && mountedRef.current) {
          onSaveState({ status: "saved", message: "Расходы Германии сохранены" });
        }
      }));
    }

    await saveLoopRef.current;
  }

  function addExpense() {
    const row: GermanyExpense = {
      id: uuid(),
      title: "Новый расход Германия",
      group: allowedGroups[0],
      currency: "EUR",
      amount: 0,
      frequency: "monthly",
      startMonth: planStartMonth,
      endMonth: "",
      active: true
    };
    commitExpenses((previous) => [...previous, row]);
  }

  function updateExpense(id: string, patch: Partial<GermanyExpense>) {
    commitExpenses((previous) => previous.map((row) => {
      if (row.id !== id) return row;
      const updated = { ...row, ...patch };
      if (patch.amount !== undefined) updated.amount = nonNegativeNumber(patch.amount);
      if (patch.startMonth && updated.endMonth && updated.endMonth < patch.startMonth) updated.endMonth = "";
      if (patch.endMonth && patch.endMonth < updated.startMonth) updated.endMonth = "";
      return updated;
    }));
  }

  function deleteExpense(id: string) {
    commitExpenses((previous) => previous.filter((row) => row.id !== id));
  }

  function toggleSort(key: keyof GermanyExpense) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  function sortMark(key: keyof GermanyExpense) {
    if (sort.key !== key) return "↕";
    return sort.direction === "asc" ? "↑" : "↓";
  }

  const visible = useMemo(() => {
    const normalizedTitle = filter.title.trim().toLocaleLowerCase("ru-RU");
    const rows = expenses.filter((row) => {
      if (filter.active === "active" && !row.active) return false;
      if (filter.active === "inactive" && row.active) return false;
      if (normalizedTitle && !row.title.toLocaleLowerCase("ru-RU").includes(normalizedTitle)) return false;
      if (filter.group && row.group !== filter.group) return false;
      if (filter.currency && row.currency !== filter.currency) return false;
      if (filter.frequency && row.frequency !== filter.frequency) return false;
      if (filter.from && row.startMonth !== filter.from) return false;
      if (filter.to && row.endMonth !== filter.to) return false;
      return true;
    });
    return rows.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      const compared = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ru", { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? compared : -compared;
    });
  }, [expenses, filter, sort]);

  if (loading) return <div className="settingsEmpty">Загрузка расходов Германии…</div>;
  if (loadError) return <div className="settingsEmpty"><b>Не удалось загрузить раздел.</b><span>{loadError}</span><button className="btn" type="button" onClick={() => void load()}>Повторить</button></div>;

  return (
    <div className="settingsSection">
      <div className="settingsSectionHead">
        <div>
          <h4>Германия</h4>
          <p>Регулярные расходы Германии. Они автоматически попадают в план переезда и не редактируются в сценарной таблице.</p>
        </div>
        <div className="settingsHeadActions">
          <button className="btn blue" type="button" onClick={addExpense}>+ Расход</button>
        </div>
      </div>

      <section className="settingsTableCard">
        <div className="tableCardHead">
          <div><h5>Регулярные расходы Германии</h5><span>{visible.length} из {expenses.length}</span></div>
        </div>
        <div className="settingsCompactTableWrap">
          <table className="settingsCompactTable germanyTable">
            <thead>
              <tr className="settingsSortRow">
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("active")}>on <span>{sortMark("active")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("title")}>Название <span>{sortMark("title")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("group")}>Статья <span>{sortMark("group")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("amount")}>Сумма <span>{sortMark("amount")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("currency")}>Валюта <span>{sortMark("currency")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("frequency")}>Частота <span>{sortMark("frequency")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("startMonth")}>С <span>{sortMark("startMonth")}</span></button></th>
                <th><button type="button" className="settingsSortButton" onClick={() => toggleSort("endMonth")}>До <span>{sortMark("endMonth")}</span></button></th>
                <th></th>
              </tr>
              <tr className="settingsFilterRow">
                <th><select value={filter.active} onChange={(e) => setFilter({ ...filter, active: e.target.value })}><option value="all">Все</option><option value="active">Вкл</option><option value="inactive">Выкл</option></select></th>
                <th><input placeholder="Поиск" value={filter.title} onChange={(e) => setFilter({ ...filter, title: e.target.value })} /></th>
                <th><select value={filter.group} onChange={(e) => setFilter({ ...filter, group: e.target.value })}><option value="">Все статьи</option>{allowedGroups.map((name) => <option key={name} value={name}>{name}</option>)}</select></th>
                <th></th>
                <th><select value={filter.currency} onChange={(e) => setFilter({ ...filter, currency: e.target.value })}><option value="">Все</option><option value="EUR">EUR</option><option value="KZT">KZT</option></select></th>
                <th><select value={filter.frequency} onChange={(e) => setFilter({ ...filter, frequency: e.target.value })}><option value="">Все</option>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></th>
                <th><MonthPicker value={filter.from || null} nullable onChange={(value) => setFilter({ ...filter, from: value || "" })} className="filterMonthPicker" /></th>
                <th><MonthPicker value={filter.to || null} nullable onChange={(value) => setFilter({ ...filter, to: value || "" })} className="filterMonthPicker" /></th>
                <th><button type="button" className="settingsFilterReset" onClick={() => setFilter({ active: "all", title: "", group: "", currency: "", frequency: "", from: "", to: "" })}>×</button></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={row.active ? "" : "inactive"}>
                  <td><input type="checkbox" checked={row.active} onChange={(e) => updateExpense(row.id, { active: e.target.checked })} /></td>
                  <td><input value={row.title} onChange={(e) => updateExpense(row.id, { title: e.target.value })} /></td>
                  <td><select value={row.group} onChange={(e) => updateExpense(row.id, { group: e.target.value })}>{allowedGroups.map((name) => <option key={name} value={name}>{name}</option>)}</select></td>
                  <td><input type="number" min="0" value={row.amount} onChange={(e) => updateExpense(row.id, { amount: Number(e.target.value || 0) })} /></td>
                  <td><select value={row.currency} onChange={(e) => updateExpense(row.id, { currency: e.target.value as Currency })}><option value="EUR">EUR</option><option value="KZT">KZT</option></select></td>
                  <td><select value={row.frequency} onChange={(e) => updateExpense(row.id, { frequency: e.target.value as Frequency })}>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
                  <td><MonthPicker value={row.startMonth} min={planStartMonth} onChange={(value) => updateExpense(row.id, { startMonth: value || planStartMonth })} /></td>
                  <td><MonthPicker value={row.endMonth || null} min={row.startMonth} nullable onChange={(value) => updateExpense(row.id, { endMonth: value || "" })} /></td>
                  <td><button type="button" className="iconDelete mini" aria-label={`Удалить ${row.title}`} onClick={() => deleteExpense(row.id)}>×</button></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={9}><div className="settingsEmpty slim">{expenses.length ? "По фильтрам ничего не найдено." : "Регулярных расходов Германии пока нет."}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
