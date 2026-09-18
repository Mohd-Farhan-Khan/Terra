/**
 * Canonical database and reporting row shapes.
 *
 * Keep base-table fields here as the schema evolves. Components should compose
 * these types with Pick/Omit rather than declaring a second version of a table.
 */
export type DatabaseId = string;
export type DateString = string;
export type Timestamp = string;
export type Money = number | string;

export type AccountType = "bank" | "cash" | "investment" | "receivable" | "payable";
export type CategoryKind = "income" | "expense";
export type TransactionType = "income" | "expense" | "transfer";
export type TransactionDirection = "debit" | "credit";
export type TransactionStatus = "completed" | "reversed" | "pending";
export type CounterpartyRelationship = "parent" | "friend" | "other";
export type RecurringFrequency = "monthly" | "weekly" | "yearly";

// Base tables
export interface Account {
  id: DatabaseId;
  user_id: DatabaseId;
  name: string;
  type: AccountType;
  is_archived: boolean;
  is_savings: boolean;
  created_at: Timestamp;
}

export interface Category {
  id: DatabaseId;
  user_id: DatabaseId | null;
  name: string;
  parent_category_id: DatabaseId | null;
  kind: CategoryKind;
  is_archived: boolean;
  created_at: Timestamp;
}

export interface Transaction {
  id: DatabaseId;
  user_id: DatabaseId;
  account_id: DatabaseId;
  type: TransactionType;
  category_id: DatabaseId | null;
  amount: Money;
  direction: TransactionDirection;
  date: DateString;
  note: string | null;
  status: TransactionStatus;
  transfer_group_id: DatabaseId | null;
  linked_refund_of: DatabaseId | null;
  recurring_rule_id: DatabaseId | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TransactionSplit {
  id: DatabaseId;
  transaction_id: DatabaseId;
  category_id: DatabaseId;
  amount: Money;
}

export interface Counterparty {
  id: DatabaseId;
  user_id: DatabaseId;
  name: string;
  relationship_tag: CounterpartyRelationship;
  linked_account_id: DatabaseId;
  created_at: Timestamp;
}

export interface RecurringRule {
  id: DatabaseId;
  user_id: DatabaseId;
  name: string;
  account_id: DatabaseId;
  category_id: DatabaseId;
  amount: Money;
  frequency: RecurringFrequency;
  next_due_date: DateString;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Budget {
  id: DatabaseId;
  user_id: DatabaseId;
  category_id: DatabaseId;
  month: DateString;
  planned_amount: Money;
  rollover_enabled: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Goal {
  id: DatabaseId;
  user_id: DatabaseId;
  name: string;
  target_amount: Money;
  target_date: DateString | null;
  linked_account_id: DatabaseId;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Reusable projections and reporting views
export type NamedRecord = Pick<Account, "id" | "name">;
export type ActiveCategory = Pick<Category, "id" | "name" | "kind">;
export type SettingsAccount = Pick<Account, "id" | "name" | "type" | "is_archived" | "is_savings">;
export type SettingsCategory = Pick<
  Category,
  "id" | "user_id" | "name" | "parent_category_id" | "kind" | "is_archived"
>;

export interface AccountBalance {
  account_id: DatabaseId;
  account_name: string;
  account_type: AccountType;
  balance: Money;
}

export type AccountActivity = Pick<Transaction, "account_id" | "amount" | "direction" | "date" | "created_at">;
export type CounterpartyStatementEntry = Pick<
  Transaction,
  "id" | "amount" | "direction" | "type" | "date" | "note" | "created_at"
>;

export interface TransactionListEntry {
  transaction_id: DatabaseId;
  date: DateString;
  account_id: DatabaseId;
  account_name: string;
  category_id: DatabaseId | null;
  category_name: string | null;
  note: string | null;
  type: TransactionType;
  direction: TransactionDirection;
  amount: Money;
}

export interface TransactionSummary {
  transaction_count: number;
  income_amount: Money;
  outflow_amount: Money;
  net_amount: Money;
}

export interface DashboardMonthlySummary {
  month: DateString;
  income_amount: Money;
  expense_amount: Money;
  net_amount: Money;
  savings_rate_percent: Money | null;
}

export interface NetWorth {
  net_worth: Money;
}

export interface NetWorthDaily extends NetWorth {
  date: DateString;
}

export interface CategoryMonthlySpendWithShare {
  category_id: DatabaseId;
  actual_spend: Money;
  share_percent: Money;
}

export interface BudgetVsActualWithProgress {
  category_id: DatabaseId;
  month: DateString;
  planned_amount: Money;
  carry_in: Money;
  available_amount: Money;
  actual_spend: Money;
  remaining_amount: Money;
  rollover_enabled: boolean;
  progress_percent: Money;
  utilization_percent: Money | null;
}

export interface UpcomingRecurringBill {
  recurring_rule_id: DatabaseId;
  name: string;
  amount: Money;
  next_due_date: DateString;
  days_until_due: number;
}

export type ActiveRecurringRule = Pick<
  RecurringRule,
  "id" | "name" | "account_id" | "category_id" | "amount" | "frequency" | "next_due_date" | "is_active"
>;
export type ConfirmedRecurringTransaction = Pick<Transaction, "amount" | "date"> & { recurring_rule_id: DatabaseId };
export interface RecurringOccurrence {
  transaction_id: DatabaseId;
  next_due_date: DateString;
}
export type GoalWithBalance = Pick<Goal, "id" | "name" | "target_amount" | "target_date" | "linked_account_id"> & {
  balance: Money;
};
export type CounterpartyWithBalance = Pick<Counterparty, "id" | "name" | "relationship_tag" | "linked_account_id"> &
  Pick<AccountBalance, "account_type" | "balance">;
