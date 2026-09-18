export type CreditScheduleInput = {
  payment_type: "regular" | "credit";
  amount: number;
  total_months: number;
  paid_months: number;
  valid_from_month: string | null;
  early_payoff_date: string | null;
};

function normalizeMonth(value: unknown) {
  const text = typeof value === "string" ? value.slice(0, 7) : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : null;
}

export function normalizeCreditPayoffDate(value: unknown) {
  const text = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : null;
}

function monthIndex(month: string) {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

function monthFromIndex(index: number) {
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function getCreditRemainingMonths(payment: CreditScheduleInput) {
  const total = Math.max(Number(payment.total_months || 0), 0);
  const paid = Math.min(Math.max(Number(payment.paid_months || 0), 0), total);
  return Math.max(total - paid, 0);
}

export function getCreditEarlyPayoffInfo(payment: CreditScheduleInput, calcStart: string) {
  if (payment.payment_type !== "credit") return null;
  const date = normalizeCreditPayoffDate(payment.early_payoff_date);
  if (!date) return null;

  const startMonth = normalizeMonth(payment.valid_from_month) || calcStart;
  const payoffMonth = date.slice(0, 7);
  const totalInstallments = Math.max(Number(payment.total_months || 0), 0);
  const paidBeforeStart = Math.min(Math.max(Number(payment.paid_months || 0), 0), totalInstallments);
  const remainingAtStart = getCreditRemainingMonths(payment);
  const firstUnpaidMonthIndex = monthIndex(startMonth) + paidBeforeStart;
  const monthsBeforePayoff = monthIndex(payoffMonth) - firstUnpaidMonthIndex;
  if (remainingAtStart <= 0 || monthsBeforePayoff < 0 || monthsBeforePayoff >= remainingAtStart) return null;

  const installmentsAtPayoff = remainingAtStart - monthsBeforePayoff;
  const monthlyAmount = Math.max(Number(payment.amount || 0), 0);
  const paidInstallments = paidBeforeStart + monthsBeforePayoff;
  return {
    date,
    month: payoffMonth,
    monthsBeforePayoff,
    installmentsAtPayoff,
    paidInstallments,
    paidAmount: paidInstallments * monthlyAmount,
    payoffAmount: installmentsAtPayoff * monthlyAmount,
    firstUnpaidMonth: monthFromIndex(firstUnpaidMonthIndex),
    originalEndMonth: monthFromIndex(monthIndex(startMonth) + totalInstallments - 1)
  };
}

export function creditRegularPaymentApplies(payment: CreditScheduleInput, month: string, calcStart: string) {
  if (payment.payment_type !== "credit") return false;
  const startMonth = normalizeMonth(payment.valid_from_month) || calcStart;
  const offset = monthIndex(month) - monthIndex(startMonth);
  const total = Math.max(Number(payment.total_months || 0), 0);
  const paid = Math.min(Math.max(Number(payment.paid_months || 0), 0), total);
  if (offset < paid || offset >= total) return false;
  const payoff = getCreditEarlyPayoffInfo(payment, calcStart);
  return !payoff || monthIndex(month) < monthIndex(payoff.month);
}
