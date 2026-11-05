# Operations and testing

## Commands

| Command                 | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`           | Start Next.js development server.                                                  |
| `npm run lint`          | Run ESLint.                                                                        |
| `npm run typecheck`     | Type-check without emitting files.                                                 |
| `npm run format:check`  | Verify Prettier formatting.                                                        |
| `npm run build`         | Build the production application.                                                  |
| `npm run test:database` | Seed two disposable authenticated users; verify key calculations and two-user RLS. |

Run the first four checks before opening a pull request. Run `test:database` against a dedicated development or staging Supabase project only: it creates users and records that are intentionally left available for the duration of the check.

## Database verification

`npm run test:database` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env.local`. It needs email/password sign-up to issue sessions for two new users. The command verifies:

- debit/credit account signs;
- category spend net of linked refunds;
- savings-rate inputs and result;
- isolation across page data sources, base tables, reporting views, `transaction_summary`, and cross-user writes.

On success it rewrites [`supabase/tests/RLS_VERIFICATION.md`](../supabase/tests/RLS_VERIFICATION.md) with a timestamped verified result. A failed or blocked run must remain documented as such. Common operational causes are a paused/unreachable Supabase project, Auth email confirmation enabled, or Auth email-rate limits.

Additional SQL-editor fixtures are intentionally separate from the npm command:

| File                                 | Scope                                                                            | Persistence |
| ------------------------------------ | -------------------------------------------------------------------------------- | ----------- |
| `finance_calculations.sql`           | Balances, refund netting, savings rate, budget rollover, recurring confirmation. | Rolls back. |
| `transaction_entry_verification.sql` | Income, expense, split expense, and transfer RPC.                                | Rolls back. |
| `counterparty_balances.sql`          | Receivable/payable lending and repayment.                                        | Rolls back. |
| `archive_selection_verification.sql` | Archive behavior for historical records and selectors.                           | Rolls back. |
| `seed_dashboard_test_data.sql`       | Dashboard demonstration data for a chosen user.                                  | Commits.    |
| `seed_transactions_test_data.sql`    | Ledger pagination fixture for a chosen user.                                     | Commits.    |

Never run either committing seed against production personal data. Each requires replacing its all-zero user UUID first.

## Migration workflow

1. Review the existing files in `supabase/migrations/` in timestamp order. Applied migration files are immutable.
2. Add a new timestamped migration for every schema, policy, RPC, or reporting-view change.
3. Apply it to development/staging:

   ```bash
   npx supabase login
   npx supabase link --project-ref <development-project-ref>
   npx supabase db push
   ```

4. Run lint, type-check, formatting, build, and the database verification.
5. Back up production, link deliberately to its project reference, inspect the CLI plan, and apply the reviewed migration.
6. Run a post-deploy signed-in smoke test: Settings can read accounts/categories, Dashboard loads, and a disposable-user transaction is visible only to that user.

Do not use `SUPABASE_SERVICE_ROLE_KEY` to make application calls or to bypass RLS verification.

## Vercel deployment checklist

1. Import the Git repository into Vercel. [`vercel.json`](../vercel.json) runs `npm ci` and `npm run build`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for **Production**. Use a distinct Supabase project and matching variables for **Preview** where possible.
3. In Supabase Auth, set the Site URL to the production deployment and add the local/preview/production URLs as redirect URLs if email confirmation, reset password, or OAuth is enabled.
4. Deploy and complete the signed-in smoke test above.
5. Verify that no secret or service-role value was added to Vercel or a `NEXT_PUBLIC_` variable.

## Troubleshooting

| Symptom                                     | Check                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| App reports Supabase is not configured      | Both public variables are set, have no surrounding quotes/spaces, and the dev server was restarted.                                   |
| Browser redirects back to login             | Confirm the user has an active Supabase Auth session and the project URL/key refer to the same project.                               |
| Sign-up does not yield a session            | Email confirmation may be enabled; complete the confirmation flow or use a development-only configuration.                            |
| `test:database` cannot connect              | Confirm the project is Healthy/reachable and `.env.local` uses its current URL and publishable key.                                   |
| `test:database` reports an email rate limit | Wait for or raise the Supabase Auth email limit, then rerun once. Do not claim RLS passed without the completed two-user run.         |
| Build cannot download `next/font` fonts     | Ensure the build environment can reach Google Fonts, or change the app to a locally hosted font strategy in a deliberate code change. |
