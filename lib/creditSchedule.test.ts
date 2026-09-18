import { describe, expect, it } from "vitest";
import { creditRegularPaymentApplies, getCreditEarlyPayoffInfo } from "./creditSchedule";

const credit = {
  payment_type: "credit" as const,
  amount: 100_000,
  total_months: 12,
  paid_months: 4,
  valid_from_month: "2026-01",
  early_payoff_date: "2026-06-15"
};

describe("credit early payoff", () => {
  it("calculates paid and outstanding amounts on the payoff date", () => {
    const payoff = getCreditEarlyPayoffInfo(credit, "2026-01");
    expect(payoff).toMatchObject({
      month: "2026-06",
      paidInstallments: 9,
      installmentsAtPayoff: 3,
      paidAmount: 900_000,
      payoffAmount: 300_000
    });
  });

  it("keeps regular payments only before the payoff month", () => {
    expect(creditRegularPaymentApplies(credit, "2025-12", "2026-01")).toBe(false);
    expect(creditRegularPaymentApplies(credit, "2026-01", "2026-01")).toBe(true);
    expect(creditRegularPaymentApplies(credit, "2026-05", "2026-01")).toBe(true);
    expect(creditRegularPaymentApplies(credit, "2026-06", "2026-01")).toBe(false);
    expect(creditRegularPaymentApplies(credit, "2026-12", "2026-01")).toBe(false);
  });

  it("rejects a payoff date outside the remaining schedule", () => {
    expect(getCreditEarlyPayoffInfo({ ...credit, early_payoff_date: "2027-06-01" }, "2026-01")).toBeNull();
  });

  it("does not hide old active loans for the already paid month count", () => {
    const forte = {
      payment_type: "credit" as const,
      amount: 94_000,
      total_months: 60,
      paid_months: 12,
      valid_from_month: "2025-12",
      early_payoff_date: null
    };
    const halyk = { ...forte, amount: 201_588, paid_months: 14 };

    expect(creditRegularPaymentApplies(forte, "2026-09", "2026-01")).toBe(true);
    expect(creditRegularPaymentApplies(halyk, "2026-09", "2026-01")).toBe(true);
  });
});
