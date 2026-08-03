"use client";

type MonthPickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  min?: string | null;
  max?: string | null;
  nullable?: boolean;
  className?: string;
};

const MONTH_OPTIONS = [
  "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function cleanMonth(value: string | null | undefined) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}

function parseMonth(value: string | null | undefined) {
  const clean = cleanMonth(value);
  if (!clean) return { year: "", month: "" };
  const [year, month] = clean.split("-");
  return { year, month: String(Number(month)) };
}

function currentParts() {
  const now = new Date();
  return { year: String(now.getFullYear()), month: String(now.getMonth() + 1) };
}

export default function MonthPicker({ value, onChange, min, max, nullable = false, className = "" }: MonthPickerProps) {
  const parsed = parseMonth(value);
  const current = currentParts();
  const cleanMin = cleanMonth(min);
  const cleanMax = cleanMonth(max);

  const selectedYear = parsed.year ? Number(parsed.year) : Number(current.year);
  const minYear = cleanMin ? Number(cleanMin.slice(0, 4)) : Math.min(Number(current.year) - 15, selectedYear);
  const maxYear = cleanMax ? Number(cleanMax.slice(0, 4)) : Math.max(Number(current.year) + 20, selectedYear);

  const years: number[] = [];
  for (let year = minYear; year <= maxYear; year += 1) years.push(year);

  const yearValue = parsed.year || (nullable ? "" : current.year);
  const monthValue = parsed.month || (nullable ? "" : current.month);

  function clampToRange(month: string) {
    if (cleanMin && month < cleanMin) return cleanMin;
    if (cleanMax && month > cleanMax) return cleanMax;
    return month;
  }

  function emit(nextYear: string, nextMonth: string) {
    if (!nextYear || !nextMonth) {
      if (nullable) onChange(null);
      return;
    }
    onChange(clampToRange(`${nextYear}-${pad(Number(nextMonth))}`));
  }

  function monthDisabled(monthNumber: number) {
    if (!yearValue) return false;
    const candidate = `${yearValue}-${pad(monthNumber)}`;
    return Boolean((cleanMin && candidate < cleanMin) || (cleanMax && candidate > cleanMax));
  }

  return (
    <div className={`monthPicker ${className}`.trim()}>
      <select
        value={monthValue}
        onChange={(event) => emit(yearValue || current.year, event.target.value)}
        aria-label="Месяц"
      >
        {nullable && <option value="">мес.</option>}
        {MONTH_OPTIONS.map((label, index) => (
          <option key={label} value={index + 1} disabled={monthDisabled(index + 1)}>{label}</option>
        ))}
      </select>
      <select
        value={yearValue}
        onChange={(event) => emit(event.target.value, monthValue || current.month)}
        aria-label="Год"
      >
        {nullable && <option value="">год</option>}
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      {nullable ? (
        <button type="button" className="monthPickerClear" onClick={() => onChange(null)} aria-label="Очистить период">
          ×
        </button>
      ) : <span className="monthPickerStub" />}
    </div>
  );
}
