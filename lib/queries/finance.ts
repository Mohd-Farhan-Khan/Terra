import { addDays, daysBetween } from "@/lib/utils/calendar";
import { createClient } from "@/lib/supabase/client";
import type { NamedRecord } from "@/lib/types/database";

export type Option = NamedRecord;

function throwIfError(error: Error | null) {
  if (error) throw error;
}

// The API can cap a page below the requested size. Advance by the number
// actually returned and stop at the server's total.
async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null; count: number | null }>,
) {
  const rows: T[] = [];
  while (true) {
    const result = await page(rows.length, rows.length + 249);
    if (result.error && "code" in result.error && result.error.code === "PGRST103" && rows.length) break;
    throwIfError(result.error);
    if (!result.data?.length) break;
    rows.push(...result.data);
    if (result.count !== null && rows.length >= result.count) break;
  }
  return rows;
}
function accountOptions(active: boolean) {
  const client = createClient();
  return allRows((start, end) => {
    let q = client.from("accounts").select("id,name", { count: "exact" });
    if (active) q = q.eq("is_archived", false);
    return q.order("name").order("id").range(start, end);
  });
}
function categoryOptions(active: boolean) {
  const client = createClient();
  return allRows((start, end) => {
    let q = client.from("categories").select("id,name,kind", { count: "exact" });
    if (active) q = q.eq("is_archived", false);
    return q.order("name").order("id").range(start, end);
  });
}
export const fetchActiveAccounts = () => accountOptions(true);
export const fetchHistoricalAccounts = () => accountOptions(false);
export const fetchActiveCategories = () => categoryOptions(true);
export const fetchHistoricalCategories = () => categoryOptions(false);

export async function fetchTransactions(filters: {
  fromDate: string;
  toDate: string;
  accountId: string;
  categoryId: string;
  page: number;
  pageSize: number;
}) {
  const client = createClient();
  const args = {
    p_from_date: filters.fromDate || null,
    p_to_date: filters.toDate || null,
    p_account_id: filters.accountId || null,
    p_category_id: filters.categoryId || null,
  };
  const offset = filters.page * filters.pageSize;
  const [ledgerResult, summaryResult] = await Promise.all([
    client
      .rpc("filtered_ledger", args, { count: "exact" })
      .select("transaction_id,date,account_id,account_name,category_id,category_name,note,type,direction,amount,status")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("transaction_id", { ascending: false })
      .range(offset, offset + filters.pageSize - 1),
    client.rpc("transaction_summary", args).single(),
  ]);
  // A concurrent deletion may remove the last page. Retry at the first page.
  if (ledgerResult.error?.code === "PGRST103" && filters.page > 0) return { rows: [], count: 0, summary: null };
  throwIfError(ledgerResult.error ?? summaryResult.error);
  return { rows: ledgerResult.data ?? [], count: ledgerResult.count ?? 0, summary: summaryResult.data };
}

export async function fetchDashboard(month: string, nextMonth: string, today: string) {
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
      .order("utilization_percent", { ascending: false, nullsFirst: false })
      .order("category_id")
      .limit(6),
    client
      .from("recurring_rules")
      .select("recurring_rule_id:id,name,amount,next_due_date")
      .eq("is_active", true)
      .gte("next_due_date", today)
      .lte("next_due_date", addDays(today, 30))
      .order("next_due_date")
      .order("id")
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
    bills: (bills.data ?? []).map((bill) => ({ ...bill, days_until_due: daysBetween(today, bill.next_due_date) })),
    categoryNames: names.data ?? [],
  };
}

export async function fetchAccountOverview() {
  const client = createClient();
  const [accounts, transactions] = await Promise.all([
    allRows((a, b) =>
      client
        .from("account_balances")
        .select("account_id,account_name,account_type,balance", { count: "exact" })
        .order("account_name")
        .order("account_id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("account_recent_activity")
        .select("account_id,amount,direction,date,created_at,id", { count: "exact" })
        .order("account_id")
        .order("date")
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
  ]);
  return { accounts, transactions };
}

export async function fetchBudgets(month: string) {
  const client = createClient();
  const [rows, categories] = await Promise.all([
    allRows((a, b) =>
      client
        .from("budget_vs_actual_with_progress")
        .select(
          "category_id,month,planned_amount,carry_in,available_amount,actual_spend,remaining_amount,rollover_enabled,progress_percent,utilization_percent",
          { count: "exact" },
        )
        .eq("month", month)
        .order("category_id")
        .range(a, b),
    ),
    fetchHistoricalCategories(),
  ]);
  return { rows, categories };
}

export async function fetchCounterparties() {
  const client = createClient();
  const [counterparties, balances] = await Promise.all([
    allRows((a, b) =>
      client
        .from("counterparties")
        .select("id,name,relationship_tag,linked_account_id", { count: "exact" })
        .order("name")
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("account_balances")
        .select("account_id,account_type,balance", { count: "exact" })
        .in("account_type", ["receivable", "payable"])
        .order("account_id")
        .range(a, b),
    ),
  ]);
  const balanceByAccount = new Map(balances.map((balance) => [balance.account_id, balance]));
  return counterparties.flatMap((counterparty) => {
    const balance = balanceByAccount.get(counterparty.linked_account_id);
    if (balance?.account_type !== "receivable" && balance?.account_type !== "payable") return [];
    return [{ ...counterparty, balance: balance.balance, account_type: balance.account_type }];
  });
}

export async function fetchCounterpartyStatement(accountId: string, page = 0) {
  const result = await createClient()
    .from("account_statement")
    .select("id,amount,direction,type,date,note,created_at,running_balance", { count: "exact" })
    .eq("account_id", accountId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * 25, page * 25 + 24);
  throwIfError(result.error);
  return { rows: result.data ?? [], count: result.count ?? 0 };
}

export async function fetchRecurring(month: string) {
  const client = createClient();
  const [rules, categories, paid] = await Promise.all([
    allRows((a, b) =>
      client
        .from("recurring_rules")
        .select("id,name,account_id,category_id,amount,frequency,next_due_date,is_active,anchor_day", {
          count: "exact",
        })
        .eq("is_active", true)
        .order("next_due_date")
        .order("id")
        .range(a, b),
    ),
    fetchHistoricalCategories(),
    client.from("recurring_paid_monthly").select("paid_count,paid_amount").eq("month", month).maybeSingle(),
  ]);
  throwIfError(paid.error);
  return { rules, categories, paidCount: paid.data?.paid_count ?? 0, paidAmount: paid.data?.paid_amount ?? 0 };
}

export async function fetchGoals() {
  const client = createClient();
  const [goals, balances] = await Promise.all([
    allRows((a, b) =>
      client
        .from("goals")
        .select("id,name,target_amount,target_date,linked_account_id", { count: "exact" })
        .order("created_at")
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client.from("account_balances").select("account_id,balance", { count: "exact" }).order("account_id").range(a, b),
    ),
  ]);
  const byAccount = new Map(balances.map((account) => [account.account_id, account.balance]));
  return goals.map((goal) => ({ ...goal, balance: byAccount.get(goal.linked_account_id) ?? 0 }));
}

export async function fetchSettings() {
  const client = createClient();
  const [auth, categories, accounts] = await Promise.all([
    client.auth.getUser(),
    allRows((a, b) =>
      client
        .from("categories")
        .select("id,user_id,name,parent_category_id,kind,is_archived", { count: "exact" })
        .order("name")
        .order("id")
        .range(a, b),
    ),
    allRows((a, b) =>
      client
        .from("accounts")
        .select("id,name,type,is_archived,is_savings", { count: "exact" })
        .order("name")
        .order("id")
        .range(a, b),
    ),
  ]);
  throwIfError(auth.error);
  if (!auth.data.user) throw new Error("Your session has ended.");
  return { user: auth.data.user, categories, accounts };
}
