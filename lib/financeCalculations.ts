export type CalculationKind = "income" | "expense";

export type CalculationCategory = {
  id: string;
  name: string;
};

export type CalculationOperation = {
  op_date: string;
  kind: CalculationKind;
  category_id: string | null;
  amount: number;
  completed: boolean;
  source_recurring_payment_id: string | null;
  source_recurring_income_id: string | null;
  source_month: string | null;
};

export type PlannedIncome = {
  id: string;
  category_id: string | null;
  amount: number;
};

export type PlannedPayment = {
  id: string;
  category_id: string | null;
  amount: number;
};

export type CalculationExclusion = {
  recurring_payment_id: string;
  month: string;
};

export type MonthPlan = {
  month: string;
  incomeBy: Record<string, number>;
  expenseBy: Record<string, number>;
  incomeTotal: number;
  expenseTotal: number;
  net: number;
};

function categoryName(categories: CalculationCategory[], id: string | null, fallback: string) {
  return categories.find((category) => category.id === id)?.name || fallback;
}

function operationSourceMonth(operation: CalculationOperation) {
  return operation.source_month || operation.op_date.slice(0, 7);
}

export function calculateMonthPlan(input: {
  month: string;
  incomeCategories: CalculationCategory[];
  expenseCategories: CalculationCategory[];
  operations: CalculationOperation[];
  plannedIncomes: PlannedIncome[];
  plannedPayments: PlannedPayment[];
  exclusions: CalculationExclusion[];
  hasConfiguredRecurringIncome: boolean;
  hasConfiguredRecurringExpense: boolean;
  fallbackIncome: number;
  fallbackExpense: number;
}): MonthPlan {
  const {
    month,
    incomeCategories,
    expenseCategories,
    operations,
    plannedIncomes,
    plannedPayments,
    exclusions,
    hasConfiguredRecurringIncome,
    hasConfiguredRecurringExpense,
    fallbackIncome,
    fallbackExpense
  } = input;

  const incomeBy = Object.fromEntries(incomeCategories.map((category) => [category.name, 0])) as Record<string, number>;
  const expenseBy = Object.fromEntries(expenseCategories.map((category) => [category.name, 0])) as Record<string, number>;
  const completedInMonth = operations.filter((operation) => operation.completed && operation.op_date.slice(0, 7) === month);
  const completedRecurringIncomeSources = new Set(
    operations
      .filter((operation) => operation.completed && operation.source_recurring_income_id)
      .filter((operation) => operationSourceMonth(operation) === month)
      .map((operation) => operation.source_recurring_income_id as string)
  );

  for (const income of plannedIncomes) {
    if (completedRecurringIncomeSources.has(income.id)) continue;
    const name = categoryName(incomeCategories, income.category_id, "Доход");
    incomeBy[name] = Number(incomeBy[name] || 0) + Number(income.amount || 0);
  }

  for (const payment of plannedPayments) {
    const excluded = exclusions.some((item) => item.recurring_payment_id === payment.id && item.month === month);
    if (excluded) continue;
    const name = categoryName(expenseCategories, payment.category_id, "Другое");
    expenseBy[name] = Number(expenseBy[name] || 0) + Number(payment.amount || 0);
  }

  for (const operation of completedInMonth) {
    if (operation.kind === "income") {
      const name = categoryName(incomeCategories, operation.category_id, "Доход");
      incomeBy[name] = Number(incomeBy[name] || 0) + Number(operation.amount || 0);
      continue;
    }

    // Regular payments are already represented by their current settings.
    // Old materialized copies must never be counted for a second time.
    if (!operation.source_recurring_payment_id) {
      const name = categoryName(expenseCategories, operation.category_id, "Другое");
      expenseBy[name] = Number(expenseBy[name] || 0) + Number(operation.amount || 0);
    }
  }

  if (!hasConfiguredRecurringIncome && Number(fallbackIncome || 0) > 0) {
    incomeBy["Плановый доход"] = Number(incomeBy["Плановый доход"] || 0) + Number(fallbackIncome || 0);
  }
  if (!hasConfiguredRecurringExpense && Number(fallbackExpense || 0) > 0) {
    expenseBy["План прочих расходов"] = Number(expenseBy["План прочих расходов"] || 0) + Number(fallbackExpense || 0);
  }

  const incomeTotal = Object.values(incomeBy).reduce((sum, value) => sum + Number(value || 0), 0);
  const expenseTotal = Object.values(expenseBy).reduce((sum, value) => sum + Number(value || 0), 0);
  return { month, incomeBy, expenseBy, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
}
