"use client";

import { useEffect, useRef, useState } from "react";

type MonthPickerProps = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  min?: string | null;
  max?: string | null;
  nullable?: boolean;
  className?: string;
};

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function pad(value: number) { return String(value).padStart(2, "0"); }

function cleanMonth(value: string | null | undefined) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : "";
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export default function MonthPicker({ value, onChange, min, max, nullable = false, className = "" }: MonthPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = cleanMonth(value);
  const fallback = currentMonth();
  const cleanMin = cleanMonth(min);
  const cleanMax = cleanMonth(max);
  const selectedYear = Number((selected || fallback).slice(0, 4));
  const minYear = cleanMin ? Number(cleanMin.slice(0, 4)) : Math.min(new Date().getFullYear() - 15, selectedYear);
  const maxYear = cleanMax ? Number(cleanMax.slice(0, 4)) : Math.max(new Date().getFullYear() + 20, selectedYear);
  const years = Array.from({ length: Math.max(maxYear - minYear + 1, 1) }, (_, index) => minYear + index);
  const [open, setOpen] = useState(false);
  const [expandedYear, setExpandedYear] = useState(selectedYear);

  useEffect(() => setExpandedYear(selectedYear), [selectedYear]);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const target = rootRef.current?.querySelector<HTMLElement>(`[data-month-picker-year="${expandedYear}"]`);
      target?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, expandedYear]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function isDisabled(year: number, month: number) {
    const candidate = `${year}-${pad(month)}`;
    return Boolean((cleanMin && candidate < cleanMin) || (cleanMax && candidate > cleanMax));
  }

  function choose(year: number, month: number) {
    if (isDisabled(year, month)) return;
    onChange(`${year}-${pad(month)}`);
    setOpen(false);
  }

  const label = selected ? `${MONTH_NAMES[Number(selected.slice(5, 7)) - 1]} ${selected.slice(0, 4)}` : "Выбрать период";

  return (
    <div ref={rootRef} className={`monthPicker ${className}`.trim()}>
      <button type="button" className={`monthPickerTrigger ${selected ? "" : "placeholder"}`.trim()} aria-label="Выбрать месяц и год" aria-expanded={open} onClick={() => setOpen((previous) => !previous)}>
        <span>{label}</span><b aria-hidden="true">⌄</b>
      </button>
      {nullable && selected && <button type="button" className="monthPickerClear" onClick={() => onChange(null)} aria-label="Очистить период">×</button>}
      {open && (
        <div className="monthPickerPopover" role="dialog" aria-label="Месяц и год">
          {nullable && <button type="button" className="monthPickerEmpty" onClick={() => { onChange(null); setOpen(false); }}>Без ограничения</button>}
          <div className="monthPickerYears">
            {years.map((year) => (
              <div className="monthPickerYear" key={year} data-month-picker-year={year}>
                <button type="button" className="monthPickerYearButton" onClick={() => setExpandedYear(year)}>{year}</button>
                {expandedYear === year && (
                  <div className="monthPickerGrid">
                    {MONTHS.map((month, index) => {
                      const number = index + 1;
                      const candidate = `${year}-${pad(number)}`;
                      return <button type="button" key={month} disabled={isDisabled(year, number)} className={candidate === selected ? "selected" : ""} onClick={() => choose(year, number)}>{month}</button>;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
