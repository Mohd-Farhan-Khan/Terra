export type AccountType =
  | "bank"
  | "cash"
  | "investment"
  | "receivable"
  | "payable";

export type CategoryKind = "income" | "expense";
export type TransactionType = "income" | "expense" | "transfer";
export type TransactionDirection = "debit" | "credit";
export type TransactionStatus = "completed" | "reversed" | "pending";
export type CounterpartyRelationship = "parent" | "friend" | "other";
export type RecurringFrequency = "monthly" | "weekly" | "yearly";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  is_archived: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  parent_category_id: string | null;
  kind: CategoryKind;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  category_id: string | null;
  amount: number;
  direction: TransactionDirection;
  date: string;
  note: string | null;
  status: TransactionStatus;
  transfer_group_id: string | null;
  linked_refund_of: string | null;
  recurring_rule_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  category_id: string;
  amount: number;
}

export interface Counterparty {
  id: string;
  user_id: string;
  name: string;
  relationship_tag: CounterpartyRelationship;
  linked_account_id: string;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  name: string;
  account_id: string;
  category_id: string;
  amount: number;
  frequency: RecurringFrequency;
  next_due_date: string;
  is_active: boolean;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  planned_amount: number;
  rollover_enabled: boolean;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  linked_account_id: string;
}
