import { createClient } from "@/lib/supabase/client";
import type { ActiveCategory, NamedRecord } from "@/lib/types/database";

export type Option = NamedRecord;

function throwIfError(error: Error | null) {
  if (error) throw error;
}

export async function fetchActiveAccounts() {
  const result = await createClient().from("accounts").select("id,name").eq("is_archived", false).order("name");
  throwIfError(result.error);
  return (result.data ?? []) as NamedRecord[];
}

export async function fetchActiveCategories() {
  const result = await createClient().from("categories").select("id,name,kind").eq("is_archived", false).order("name");
  throwIfError(result.error);
  return (result.data ?? []) as ActiveCategory[];
}

export async function fetchTransactions(filters: {
  fromDate: string;
  toDate: string;
  accountId: string;
  categoryId: string;
  page: number;
  pageSize: number;
}) {
  const client = createClient();
  let ledger = client
    .from("transaction_list")
    .select("transaction_id,date,account_id,account_name,category_id,category_name,note,type,direction,amount", {
      count: "exact",
    })
    .order("date", { ascending: false })
    .range(filters.page * filters.pageSize, filters.page * filters.pageSize + filters.pageSize - 1);
  if (filters.fromDate) ledger = ledger.gte("date", filters.fromDate);
  if (filters.toDate) ledger = ledger.lte("date", filters.toDate);
  if (filters.accountId) ledger = ledger.eq("account_id", filters.accountId);
  if (filters.categoryId) ledger = ledger.eq("category_id", filters.categoryId);
  const [ledgerResult, summaryResult] = await Promise.all([
    ledger,
    client
      .rpc("transaction_summary", {
        p_from_date: filters.fromDate || null,
        p_to_date: filters.toDate || null,
        p_account_id: filters.accountId || null,
        p_category_id: filters.categoryId || null,
      })
      .maybeSingle(),
  ]);
  throwIfError(ledgerResult.error ?? summaryResult.error);
  return { rows: ledgerResult.data ?? [], count: ledgerResult.count ?? 0, summary: summaryResult.data };
}

export async function fetchDashboard(month: string, nextMonth: string) {
  const client = createClient();
  const [summary, netWorth, trend, categories, budgets, bills] = await Promise.all([
    client
      .from("dashboard_monthly_summary")
      .select("month,income_amount,expense_amount,net_amount,savings_rate_percent")
      .eq("month", month)
      .maybeSingle(),
    client.from("net_worth").select("net_worth").maybeSingle(),
    client.from("net_worth_daily").select("date,net_worth").gte("date", month).lt("date", nextMonth).order("date"),
    client
      .from("category_monthly_spend_with_share")
      .select("category_id,actual_spend,share_percent")
      .eq("month", month)
      .order("actual_spend", { ascending: false })
      .limit(6),
    client
      .from("budget_vs_actual_with_progress")
      .select(
        "category_id,planned_amount,carry_in,available_amount,actual_spend,remaining_amount,progress_percent,utilization_percent",
      )
      .eq("month", month)
      .order("utilization_percent", { ascending: false }),
    client
      .from("upcoming_recurring_bills")
      .select("recurring_rule_id,name,amount,next_due_date,days_until_due")
      .order("next_due_date")
      .limit(6),
  ]);
  throwIfError(summary.error ?? netWorth.error ?? trend.error ?? categories.error ?? budgets.error ?? bills.error);
  const categoryIds = [
    ...new Set([
      ...(categories.data ?? []).map((row) => row.category_id),
      ...(budgets.data ?? []).map((row) => row.category_id),
    ]),
  ];
  const names = categoryIds.length
    ? await client.from("categories").select("id,name").in("id", categoryIds)
    : { data: [], error: null };
  throwIfError(names.error);
  return {
    summary: summary.data,
    netWorth: netWorth.data,
    trend: trend.data ?? [],
    categories: categories.data ?? [],
    budgets: budgets.data ?? [],
    bills: bills.data ?? [],
    categoryNames: names.data ?? [],
  };
}

export async function fetchAccountOverview() {
  const client = createClient();
  const [accounts, transactions] = await Promise.all([
    client.from("account_balances").select("account_id,account_name,account_type,balance").order("account_name"),
    client
      .from("transactions")
      .select("account_id,amount,direction,date,created_at")
      .eq("status", "completed")
      .order("date")
      .order("created_at"),
  ]);
  throwIfError(accounts.error ?? transactions.error);
  return { accounts: accounts.data ?? [], transactions: transactions.data ?? [] };
}

export async function fetchBudgets(month: string) {
  const client = createClient();
  const budgets = await client
    .from("budget_vs_actual_with_progress")
    .select(
      "category_id,month,planned_amount,carry_in,available_amount,actual_spend,remaining_amount,rollover_enabled,progress_percent,utilization_percent",
    )
    .eq("month", month)
    .order("category_id");
  throwIfError(budgets.error);
  const categoryIds = (budgets.data ?? []).map((row) => row.category_id);
  const categories = categoryIds.length
    ? await client.from("categories").select("id,name").in("id", categoryIds)
    : { data: [], error: null };
  throwIfError(categories.error);
  return { rows: budgets.data ?? [], categories: categories.data ?? [] };
}

export async function fetchCounterparties() {
  const client = createClient();
  const [counterparties, balances] = await Promise.all([
    client.from("counterparties").select("id,name,relationship_tag,linked_account_id").order("name"),
    client
      .from("account_balances")
      .select("account_id,account_type,balance")
      .in("account_type", ["receivable", "payable"]),
  ]);
  throwIfError(counterparties.error ?? balances.error);
  const balanceByAccount = new Map((balances.data ?? []).map((balance) => [balance.account_id, balance]));
  return (counterparties.data ?? []).flatMap((counterparty) => {
    const balance = balanceByAccount.get(counterparty.linked_account_id);
    return balance ? [{ ...counterparty, ...balance }] : [];
  });
}

export async function fetchCounterpartyStatement(accountId: string) {
  const result = await createClient()
    .from("transactions")
    .select("id,amount,direction,type,date,note,created_at")
    .eq("account_id", accountId)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  throwIfError(result.error);
  return result.data ?? [];
}

export async function fetchRecurring(month: string, nextMonth: string) {
  const client = createClient();
  const [rules, transactions] = await Promise.all([
    client
      .from("recurring_rules")
      .select("id,name,account_id,category_id,amount,frequency,next_due_date,is_active")
      .eq("is_active", true)
      .order("next_due_date"),
    client
      .from("transactions")
      .select("recurring_rule_id,amount,date")
      .eq("status", "completed")
      .not("recurring_rule_id", "is", null)
      .gte("date", month)
      .lt("date", nextMonth),
  ]);
  throwIfError(rules.error ?? transactions.error);
  const categoryIds = [...new Set((rules.data ?? []).map((rule) => rule.category_id))];
  const categories = categoryIds.length
    ? await client.from("categories").select("id,name").in("id", categoryIds)
    : { data: [], error: null };
  throwIfError(categories.error);
  return { rules: rules.data ?? [], categories: categories.data ?? [], confirmedTransactions: transactions.data ?? [] };
}

export async function fetchGoals() {
  const client = createClient();
  const [goals, balances] = await Promise.all([
    client.from("goals").select("id,name,target_amount,target_date,linked_account_id").order("created_at"),
    client.from("account_balances").select("account_id,balance"),
  ]);
  throwIfError(goals.error ?? balances.error);
  const byAccount = new Map((balances.data ?? []).map((account) => [account.account_id, account.balance]));
  return (goals.data ?? []).map((goal) => ({ ...goal, balance: byAccount.get(goal.linked_account_id) ?? 0 }));
}

export async function fetchSettings() {
  const client = createClient();
  const [auth, categories, accounts] = await Promise.all([
    client.auth.getUser(),
    client.from("categories").select("id,user_id,name,parent_category_id,kind,is_archived").order("name"),
    client.from("accounts").select("id,name,type,is_archived,is_savings").order("name"),
  ]);
  throwIfError(auth.error ?? categories.error ?? accounts.error);
  if (!auth.data.user) throw new Error("Your session has ended.");
  return { user: auth.data.user, categories: categories.data ?? [], accounts: accounts.data ?? [] };
}
