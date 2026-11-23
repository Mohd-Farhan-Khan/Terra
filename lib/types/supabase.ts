import type {
  Account,
  AccountActivity,
  AccountBalance,
  Budget,
  BudgetVsActualWithProgress,
  Category,
  CategoryMonthlySpendWithShare,
  Counterparty,
  CounterpartyStatementEntry,
  DashboardMonthlySummary,
  Goal,
  NetWorth,
  NetWorthDaily,
  RecurringOccurrence,
  RecurringRule,
  Transaction,
  TransactionListEntry,
  TransactionSplit,
  TransactionSummary,
  UpcomingRecurringBill,
} from "./database";

// Typed projections used by the application. CI verifies these against the migrated API.
type Row<T> = { [K in keyof T]: T[K] };
type Table<T, Required extends keyof T> = {
  Row: Row<T>;
  Insert: Row<Pick<T, Required> & Partial<Omit<T, Required>>>;
  Update: Partial<Row<T>>;
  Relationships: [];
};
type View<T> = { Row: Row<T>; Relationships: [] };
type Owned = { user_id: string };
type Ledger = TransactionListEntry & Owned & { created_at: string; linked_refund_of: string | null };
type Filters = {
  p_from_date: string | null;
  p_to_date: string | null;
  p_account_id: string | null;
  p_category_id: string | null;
};
type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type Database = {
  public: {
    Tables: {
      accounts: Table<Account, "name" | "user_id" | "type">;
      categories: Table<Category, "name" | "kind">;
      transactions: Table<Transaction, "user_id" | "account_id" | "type" | "amount" | "date" | "direction">;
      transaction_splits: Table<TransactionSplit, "category_id" | "transaction_id" | "amount">;
      budgets: Table<Budget, "user_id" | "month" | "category_id" | "planned_amount">;
      recurring_rules: Table<
        RecurringRule,
        "user_id" | "account_id" | "category_id" | "amount" | "name" | "frequency" | "next_due_date"
      >;
      goals: Table<Goal, "user_id" | "name" | "target_amount" | "linked_account_id">;
      counterparties: Table<Counterparty, "user_id" | "name" | "relationship_tag" | "linked_account_id">;
    };
    Views: {
      account_balances: View<AccountBalance & Owned & { is_savings: boolean }>;
      account_recent_activity: View<AccountActivity & { id: string }>;
      account_statement: View<CounterpartyStatementEntry & { account_id: string; running_balance: number }>;
      transaction_list: View<Ledger>;
      net_worth: View<NetWorth & Owned>;
      net_worth_daily: View<NetWorthDaily & Owned>;
      dashboard_monthly_summary: View<DashboardMonthlySummary & Owned>;
      category_monthly_spend_with_share: View<CategoryMonthlySpendWithShare & Owned & { month: string }>;
      budget_vs_actual_with_progress: View<BudgetVsActualWithProgress & Owned>;
      upcoming_recurring_bills: View<UpcomingRecurringBill & Owned>;
      recurring_paid_monthly: View<Owned & { month: string; paid_count: number; paid_amount: number }>;
    };
    Functions: {
      filtered_ledger: {
        Args: Filters;
        Returns: Row<Ledger>[];
        SetofOptions: { from: "*"; to: "transaction_list"; isSetofReturn: true; isOneToOne: false };
      };
      transaction_summary: { Args: Filters; Returns: Row<TransactionSummary>[] };
      post_entry: { Args: { p_request_id: string; p_entry: Json }; Returns: string };
      confirm_recurring_occurrence: {
        Args: { p_recurring_rule_id: string; p_expected_next_due_date: string; p_occurred_on: string };
        Returns: Row<RecurringOccurrence>[];
      };
    };
  };
};
