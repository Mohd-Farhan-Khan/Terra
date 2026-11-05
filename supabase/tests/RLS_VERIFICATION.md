# RLS verification

## Status

Blocked on 2026-11-05: the restored project is reachable and Healthy, but `npm run test:database` cannot currently create its two disposable Auth users because the project’s email-delivery limit is exhausted (the dashboard reports a limit of two emails per hour). The script uses unique `mailinator.com` fixture addresses because the project rejects reserved example domains. No successful two-user run completed, and this check is deliberately **not** marked verified.

## Command

Run `npm run test:database` after the configured Supabase project is reachable and its Auth email quota permits two sign-ups. The command creates two distinct authenticated test users and seeds sentinel records only for the first user.

On a successful run, the command overwrites this file with a timestamped `verified` result after asserting all of the following:

- Calculation inputs and outputs: account debit/credit signs, linked-refund category-spend netting, and monthly savings rate.
- Page data sources: dashboard, accounts, transactions, budgets, counterparties, goals, recurring items, and settings.
- Direct API access: tenant tables, security-invoker reporting views, and the `transaction_summary` RPC.
- Write isolation: the second user cannot update the first user's account or forge an insert with the first user's `user_id`; the owner record remains unchanged.

System-owned categories are excluded because they are intentionally readable by every authenticated user.
