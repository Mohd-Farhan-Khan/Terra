# Architecture and data model

## Runtime flow

```text
Browser → Next.js route → client feature screen → Supabase JS client
                                            ↘ Postgres tables / RPCs / reporting views
Next.js proxy → Supabase Auth session lookup → allow route or redirect to /login
```

All routes except `/login` are guarded by [`proxy.ts`](../proxy.ts) when the two public Supabase environment variables are configured. The proxy refreshes the session cookie and redirects unauthenticated requests to `/login`; authenticated users visiting `/login` return to the requested app route or `/dashboard`.

Feature screens are client components using TanStack Query. Reads live in [`lib/queries/finance.ts`](../lib/queries/finance.ts); mutations are deliberately colocated with the screen that owns the action. This keeps the browser responsible for interaction and cache invalidation, while Postgres remains responsible for data rules and calculations.

## Routes

| Route              | Screen                  | Primary data/actions                                                            |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| `/dashboard`       | Dashboard               | Dashboard reporting views, net worth, category spend, budgets, recurring bills. |
| `/transactions`    | Transactions            | `filtered_ledger` rows and the cleared totals from `transaction_summary`.       |
| `/add-transaction` | Transaction entry panel | Submits ordinary, split and transfer bookings through the retry-safe entry RPC. |
| `/accounts`        | Accounts                | `account_balances` and recent account activity.                                 |
| `/budgets`         | Budgets                 | `budget_vs_actual_with_progress`; toggles the selected month’s rollover flag.   |
| `/counterparties`  | Counterparties          | Counterparty records, linked receivable/payable balance, and statement.         |
| `/recurring`       | Recurring               | Lists active rules and confirms an occurrence via RPC.                          |
| `/goals`           | Goals                   | Goal rows joined to account balances.                                           |
| `/settings`        | Settings                | Account/category management, archiving, and Auth email/password updates.        |

## Core tables

| Table                | Role                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `accounts`           | User-owned bank, cash, investment, receivable, and payable accounts. `is_savings` identifies bank/cash savings destinations. |
| `categories`         | System categories (`user_id IS NULL`) plus user-owned income/expense categories in an optional same-kind hierarchy.          |
| `transactions`       | The financial ledger: income, expense, or one leg of a transfer. Status can be `completed`, `pending`, or `reversed`.        |
| `transaction_splits` | Expense-category allocations for a split parent transaction.                                                                 |
| `counterparties`     | A person/entity linked to exactly one receivable or payable account.                                                         |
| `recurring_rules`    | Expense schedule with a frequency, next due date, active flag, and anchor day.                                               |
| `budgets`            | Planned amount and rollover setting per user/category/month.                                                                 |
| `goals`              | Target amount/date tied to an account.                                                                                       |

Schema constraints and triggers validate category kind, same-user ownership, split classification, transfer pairs, counterparty account type, and timestamps. The canonical TypeScript row shapes are in [`lib/types/database.ts`](../lib/types/database.ts).

## Database API

The entry form calls `post_entry` for all bookings. It reuses a per-user request ID after an uncertain response. The database commits the request receipt and booking together. The existing transfer and split RPCs also remain available to existing callers.

Do not hand-assemble multi-row financial writes in the browser. Use the supplied RPCs:

| RPC                            | What it guarantees                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_entry`                   | Accepts a request ID and the entry payload. Atomically posts an ordinary entry, split or transfer and records its result in `terra_private.entry_requests`. Replays return the original ID. |
| `filtered_ledger`              | Returns non-reversed entries using date, account, and category filters. A category filter returns only its allocation.                                                                      |
| `create_transfer`              | Creates matched debit and credit transfer legs under one `transfer_group_id`; validates ownership, distinct accounts, amount, date, and status.                                             |
| `create_expense_with_splits`   | Creates an expense and at least two positive split rows in one transaction; split total must equal the expense amount.                                                                      |
| `confirm_recurring_occurrence` | Creates the expense occurrence and advances `next_due_date` atomically; rejects stale/double confirmation.                                                                                  |
| `transaction_summary`          | Returns a user-scoped ledger count, income, outflow, and net for optional date/account/category filters.                                                                                    |

## Reporting views

Views use `security_invoker = true`, so the calling user’s RLS permissions apply. The following views back the API and application reports:

| View                                | Meaning                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_balances`                  | Completed credits minus debits per account.                                                                                                         |
| `category_monthly_spend`            | Monthly expense allocations less linked refunds.                                                                                                    |
| `net_worth` / `net_worth_daily`     | Bank, cash, and investment balances only; receivables/payables are excluded.                                                                        |
| `savings_rate_monthly`              | Savings/investment contributions divided by non-refund income.                                                                                      |
| `budget_vs_actual`                  | Monthly budget chain with carry-in and remaining amount.                                                                                            |
| `dashboard_monthly_summary`         | Dashboard-shape monthly income, expense, net, and savings-rate data.                                                                                |
| `category_monthly_spend_with_share` | Spend plus its share of monthly category spending.                                                                                                  |
| `budget_vs_actual_with_progress`    | Budget rows plus utilization/progress percentages.                                                                                                  |
| `transaction_allocations`           | Direct and split amounts and the whole-paisa distribution of a linked refund.                                                                       |
| `account_statement`                 | Completed movements with a running balance computed before pagination.                                                                              |
| `account_recent_activity`           | The last eight completed entries per account for the chart.                                                                                         |
| `recurring_paid_monthly`            | Count and total of completed recurring payments by posting month.                                                                                   |
| `upcoming_recurring_bills`          | Compatibility view using the database date. The dashboard queries active rules directly using the browser’s local calendar day and a 30-day window. |
| `transaction_list`                  | Non-reversed ledger rows joined to account/category labels.                                                                                         |

## Security model

All tenant tables have RLS enabled. The authenticated user can access only rows whose `user_id` equals `auth.uid()`. `categories` are the one intentional exception for reads: authenticated users may read system categories as well as their own categories. The browser uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no service-role credential belongs in the app or Vercel.

The two-user integration check in [`scripts/verify-finance-and-rls.mjs`](../scripts/verify-finance-and-rls.mjs) verifies page data sources, direct API access, and rejected cross-user writes. Its dated results and execution scope are described in [the verification record](../supabase/tests/RLS_VERIFICATION.md).

## Navigation and cached data

Settings accepts the `tab` values `accounts`, `categories`, and `profile`. New users follow the entry form’s setup link directly to Accounts. The auth proxy retains the requested path and query string through login. A change of signed-in identity clears the query cache and remounts private screens. Local day changes refresh the date-dependent screens.

Both Supabase clients use the application projections in [supabase.ts](../lib/types/supabase.ts). The schema check generates types from a migrated local database and compares them with those projections.
