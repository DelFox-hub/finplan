import { describe, expect, it } from "vitest";
import { calculateMonthPlan } from "./financeCalculations";

const incomeCategories = [{ id: "salary", name: "Зарплата" }];
const expenseCategories = [{ id: "home", name: "Квартира" }];

function baseInput() {
  return {
    month: "2026-09",
    incomeCategories,
    expenseCategories,
    operations: [],
    plannedIncomes: [],
    plannedPayments: [],
    exclusions: [],
    hasConfiguredRecurringIncome: false,
    hasConfiguredRecurringExpense: false,
    fallbackIncome: 0,
    fallbackExpense: 0
  };
}

describe("calculateMonthPlan", () => {
  it("replaces a planned recurring income with its fact without double counting", () => {
    const result = calculateMonthPlan({
      ...baseInput(),
      plannedIncomes: [{ id: "income-1", category_id: "salary", amount: 100_000 }],
      hasConfiguredRecurringIncome: true,
      operations: [{
        op_date: "2026-09-12",
        kind: "income",
        category_id: "salary",
        amount: 120_000,
        completed: true,
        source_recurring_payment_id: null,
        source_recurring_income_id: "income-1",
        source_month: "2026-09"
      }]
    });

    expect(result.incomeTotal).toBe(120_000);
  });

  it("keeps the source month suppressed when the income fact is moved to another month", () => {
    const operation = {
      op_date: "2026-10-01",
      kind: "income" as const,
      category_id: "salary",
      amount: 120_000,
      completed: true,
      source_recurring_payment_id: null,
      source_recurring_income_id: "income-1",
      source_month: "2026-09"
    };
    const september = calculateMonthPlan({
      ...baseInput(),
      plannedIncomes: [{ id: "income-1", category_id: "salary", amount: 100_000 }],
      hasConfiguredRecurringIncome: true,
      operations: [operation]
    });
    const october = calculateMonthPlan({
      ...baseInput(),
      month: "2026-10",
      plannedIncomes: [],
      hasConfiguredRecurringIncome: true,
      operations: [operation]
    });

    expect(september.incomeTotal).toBe(0);
    expect(october.incomeTotal).toBe(120_000);
  });

  it("counts a pending manual operation as part of the monthly plan", () => {
    const result = calculateMonthPlan({
      ...baseInput(),
      operations: [{
        op_date: "2026-09-18",
        kind: "expense",
        category_id: "home",
        amount: 35_000,
        completed: false,
        source_recurring_payment_id: null,
        source_recurring_income_id: null,
        source_month: null
      }]
    });

    expect(result.expenseTotal).toBe(35_000);
    expect(result.net).toBe(-35_000);
  });

  it("does not remove a fallback merely because a manual operation exists", () => {
    const result = calculateMonthPlan({
      ...baseInput(),
      fallbackIncome: 500_000,
      operations: [{
        op_date: "2026-09-05",
        kind: "income",
        category_id: "salary",
        amount: 10_000,
        completed: true,
        source_recurring_payment_id: null,
        source_recurring_income_id: null,
        source_month: null
      }]
    });

    expect(result.incomeTotal).toBe(510_000);
  });

  it("does not count an excluded payment or its old materialized copy", () => {
    const result = calculateMonthPlan({
      ...baseInput(),
      plannedPayments: [{ id: "payment-1", category_id: "home", amount: 200_000 }],
      hasConfiguredRecurringExpense: true,
      exclusions: [{ recurring_payment_id: "payment-1", month: "2026-09" }],
      operations: [{
        op_date: "2026-09-01",
        kind: "expense",
        category_id: "home",
        amount: 200_000,
        completed: true,
        source_recurring_payment_id: "payment-1",
        source_recurring_income_id: null,
        source_month: "2026-09"
      }]
    });

    expect(result.expenseTotal).toBe(0);
  });
});
