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
  const minYear = cleanMonth(min) ? Number(String(min).slice(0, 4)) : Math.min(Number(current.year) - 6, parsed.year ? Number(parsed.year) : Number(current.year) - 6);
  const maxYear = cleanMonth(max) ? Number(String(max).slice(0, 4)) : Math.max(Number(current.year) + 8, parsed.year ? Number(parsed.year) : Number(current.year) + 8);

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y += 1) years.push(y);

  const yearValue = parsed.year || (nullable ? "" : current.year);
  const monthValue = parsed.month || (nullable ? "" : current.month);

  function emit(nextYear: string, nextMonth: string) {
    if (!nextYear || !nextMonth) {
      if (nullable) onChange(null);
      return;
    }
    onChange(`${nextYear}-${pad(Number(nextMonth))}`);
  }

  return (
    <div className={`monthPicker ${className}`.trim()}>
      <select
        value={monthValue}
        onChange={(e) => emit(yearValue || current.year, e.target.value)}
        aria-label="Месяц"
      >
        {nullable && <option value="">мес.</option>}
        {MONTH_OPTIONS.map((label, index) => (
          <option key={label} value={index + 1}>{label}</option>
        ))}
      </select>
      <select
        value={yearValue}
        onChange={(e) => emit(e.target.value, monthValue || current.month)}
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
