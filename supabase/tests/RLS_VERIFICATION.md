# RLS verification

## Status

Blocked on 2026-09-18: the configured Supabase hostname could not be resolved from the command line (`getaddrinfo ENOTFOUND`). No test users or fixture records were created, and this check is deliberately **not** marked verified.

## Command

Run `npm run test:database` after the configured Supabase project is reachable. The command creates two distinct authenticated test users and seeds sentinel records only for the first user.

On a successful run, the command overwrites this file with a timestamped `verified` result after asserting all of the following:

- Calculation inputs and outputs: account debit/credit signs, linked-refund category-spend netting, and monthly savings rate.
- Page data sources: dashboard, accounts, transactions, budgets, counterparties, goals, recurring items, and settings.
- Direct API access: tenant tables, security-invoker reporting views, and the `transaction_summary` RPC.
- Write isolation: the second user cannot update the first user's account or forge an insert with the first user's `user_id`; the owner record remains unchanged.

System-owned categories are excluded because they are intentionally readable by every authenticated user.
