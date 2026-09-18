import { describe, expect, it } from "vitest";
import { creditRegularPaymentApplies, getCreditEarlyPayoffInfo } from "./creditSchedule";

const credit = {
  payment_type: "credit" as const,
  amount: 100_000,
  total_months: 12,
  paid_months: 4,
  valid_from_month: "2026-01",
  early_payoff_date: "2026-11-15"
};

describe("credit early payoff", () => {
  it("calculates paid and outstanding amounts on the payoff date", () => {
    const payoff = getCreditEarlyPayoffInfo(credit, "2026-09");
    expect(payoff).toMatchObject({
      month: "2026-11",
      paidInstallments: 10,
      installmentsAtPayoff: 2,
      paidAmount: 1_000_000,
      payoffAmount: 200_000
    });
  });

  it("keeps regular payments only before the payoff month", () => {
    expect(creditRegularPaymentApplies(credit, "2026-04", "2026-01")).toBe(false);
    expect(creditRegularPaymentApplies(credit, "2026-05", "2026-01")).toBe(true);
    expect(creditRegularPaymentApplies(credit, "2026-10", "2026-01")).toBe(true);
    expect(creditRegularPaymentApplies(credit, "2026-11", "2026-01")).toBe(false);
    expect(creditRegularPaymentApplies(credit, "2026-12", "2026-01")).toBe(false);
  });

  it("rejects a payoff date outside the remaining schedule", () => {
    expect(getCreditEarlyPayoffInfo({ ...credit, early_payoff_date: "2027-06-01" }, "2026-01")).toBeNull();
  });
});
