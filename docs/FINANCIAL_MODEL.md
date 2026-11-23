# Financial rules and UI coverage

## Ledger conventions

All monetary values are positive amounts. Direction determines the effect on an account:

| Direction | Account effect                      |
| --------- | ----------------------------------- |
| `credit`  | Adds to the account balance.        |
| `debit`   | Subtracts from the account balance. |

The ledger shows pending rows with their status. Its summary counts cleared entries, reports spending after refunds, and uses signed account movement for net. With the account filter set to All accounts, both transfer legs cancel out. When filtered to one account, its leg changes net movement. A category filter displays the matching portion of a split or linked refund.

Only `completed` transactions contribute to account balances and reporting calculations. Reversed transactions are excluded from the ledger view and its summary; pending transactions are stored but do not contribute to balances.

## Calculation rules

| Metric                 | Definition                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account balance        | Sum of completed credits minus completed debits for the account.                                                                                                                                                                |
| Category monthly spend | Direct expense amount, or each split allocation, less any linked refund allocated in proportion to the original expense’s category allocation.                                                                                  |
| Net worth              | Completed balances in bank, cash, and investment accounts. Receivable and payable accounts are excluded.                                                                                                                        |
| Savings rate           | Completed credits into a savings-marked account or investment account from a non-savings/non-investment source, divided by completed income that is not a linked refund. A savings-to-investment transfer is not counted twice. |
| Budget carry           | The previous month’s remaining amount carries only when that previous budget enabled rollover. A missing month breaks the chain.                                                                                                |

Examples and assertions for these rules are in [`supabase/tests/finance_calculations.sql`](../supabase/tests/finance_calculations.sql) and the live integration script.

## Supported transaction entry flows

| Flow                         | Current UI path                                  | Database behavior                                                                                          |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Income                       | Add transaction → Income                         | Inserts an income credit with an income category.                                                          |
| Ordinary expense             | Add transaction → Expense                        | Inserts an expense debit with one expense category.                                                        |
| Split expense                | Add transaction → Expense → Add another category | `post_entry` delegates to `create_expense_with_splits`; two or more positive splits must equal the total.  |
| Transfer                     | Add transaction → Transfer                       | `post_entry` delegates to `create_transfer`; source receives a debit and destination receives a credit.    |
| Recurring occurrence         | Recurring → Confirm                              | Calls `confirm_recurring_occurrence`; records the expense and advances the schedule.                       |
| Account/category maintenance | Settings                                         | Creates, edits, archives, and restores accounts/categories. Archived records remain on historical entries. |

## Important current UI boundary

The database supports more concepts than the current screens expose. These are not hidden user flows and should not be documented as available product features:

- A linked refund can be stored through `transactions.linked_refund_of`, and reporting nets it against the original expense, but the transaction-entry screen does **not** provide a control to select the original expense. Creating a linked refund currently requires a trusted database/API workflow.
- The current screens display goals, counterparties, budgets, and recurring rules. Settings creates accounts and categories, and the budgets screen toggles rollover, but the app does **not** currently include UI forms to create or edit goals, counterparties, budget rows, or recurring rules.
- Counterparty lending and repayment are modeled as transfers to/from a linked receivable or payable account. The counterparty statement derives its labels from the account type and transaction direction.
- An ATM withdrawal is represented as a transfer from a bank account to a cash account; it is not spending and therefore has no category impact.
- EMI and subscription payments are ordinary expense entries, or recurring-rule occurrences when a rule already exists.

When adding any of these missing UI workflows, preserve the RPC and reporting invariants above; add a migration only for database changes and add a matching verification case.

## Scenario checklist for manual testing

Use a disposable development/staging user. Record starting balances, create the action, refresh the relevant page, and compare the result with the expected delta.

| Scenario               | Expected account/category effect                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Salary credit          | Selected account increases; income category and monthly income increase.                                                                               |
| Savings transfer       | Source decreases and savings destination increases by the same amount; net worth is unchanged; savings contribution increases once.                    |
| Split purchase         | Selected account decreases by total; each split category increases by its allocation.                                                                  |
| ATM withdrawal         | Bank decreases and cash increases by the same amount; no spending category increases.                                                                  |
| Lending                | Funding account decreases; linked receivable increases.                                                                                                |
| Counterparty repayment | Receivable decreases and funding account increases; the counterparty balance moves toward zero.                                                        |
| Linked refund          | Funding account increases; original expense category’s spend decreases by the refund allocation. Requires API/database setup until the UI supports it. |
| EMI/subscription       | Funding account decreases; selected expense category increases. A confirmed recurring rule additionally advances its next due date.                    |

This is a verification plan, not evidence of a completed manual run. Keep actual observed results with the deployment/test run that produced them.

## Calendar dates and historical classifications

- A monthly or yearly rule keeps its scheduled day. Short months use their final day; later months return to the anchor. A weekly rule contributes once per outstanding occurrence in the selected month.
- A partial linked refund distributes whole paise in proportion to the original allocations. The largest remainders receive surplus paise, with the category ID breaking ties. A completed refund retains its allocation if the original expense is reversed. Refunded expenses must retain their expense type.
- Archiving an account or category preserves posted records and historical filters. New postings, including recurring confirmations, require active references.
- Completed future-dated entries contribute to the posted balance. Date filters on the ledger can show those entries. Goals sharing an account show its full balance. Savings reports use the current savings classification. These existing product rules remain available for a separate product decision.
