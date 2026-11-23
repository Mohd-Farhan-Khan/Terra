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

Run `npm test` for the offline calendar, money, redirect, retry and ledger regression tests. The ledger test executes the projection expressions with a SQLite adapter. PostgreSQL tests exercise exact numeric arithmetic, roles, locks and triggers.

## Database verification

CI verifies a fresh installation, then upgrades a populated copy of the previous schema and checks its balances and recurrence dates. The same stack can run locally with Docker, the Supabase CLI and `psql`. Run `supabase start`, set the two public variables to the local API URL and anon key, and run these checks.

| Command                 | Coverage                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:sql`      | Runs every rollback fixture with the first SQL error causing failure. Connects to the CLI database on port 54322.                                                                 |
| `npm run test:database` | Checks signed-in calculations, verifies an owner can read each sentinel, checks isolation with a second user, and exercises concurrent submissions.                               |
| `npm run test:schema`   | Generates types from the local migrated database and checks that the application’s table, view and RPC projections are present and compatible.                                    |
| `npm run test:browser`  | Covers sign-in and deep links, first-account setup, split validation, transfers, mobile history, cancellation, and cross-tab logout. Requires the production app running locally. |

The local integration and browser jobs use the disposable CLI service-role key under `TERRA_LOCAL_ADMIN_KEY` for fixture setup and cleanup. Keep it in the test process. Financial requests use signed-in users and the public key. The database script also supports its existing public-key signup mode on a dedicated staging project. That mode requires usable signup sessions and retains its fixture accounts. Each database run writes a timestamped result with a unique filename under `coverage/database/`.

Apply migrations through `20261123093000` before starting this frontend. The integrity migration validates legacy transfers and splits and stops if existing postings need repair. On a staging copy, run `supabase/checks/ledger_preflight.sql` to identify entries for review. The upgrade does not rewrite historical amounts. Existing recurring rules take their current due day as their future anchor.

The SQL fixtures and demonstration seeds have different persistence behavior.

| File                                 | Scope                                                                                     | Persistence |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ----------- |
| `finance_calculations.sql`           | Balances, refund netting, savings rate, budget rollover, recurring confirmation.          | Rolls back. |
| `transaction_entry_verification.sql` | Income, expense, split expense, and transfer RPC.                                         | Rolls back. |
| `ledger_regressions.sql`             | Transfer, split refund, retry, status, recurrence, archive and large-history regressions. | Rolls back. |
| `counterparty_balances.sql`          | Receivable/payable lending and repayment.                                                 | Rolls back. |
| `archive_selection_verification.sql` | Archive behavior for historical records and selectors.                                    | Rolls back. |
| `seed_dashboard_test_data.sql`       | Dashboard demonstration data for a chosen user.                                           | Commits.    |
| `seed_transactions_test_data.sql`    | Ledger pagination fixture for a chosen user.                                              | Commits.    |

Never run either committing seed against production personal data. Each requires replacing its all-zero user UUID first.

## Hosted release on 23 November 2026

Terra Finance reported Healthy. The existing eight-table schema had no migration history. The release checked the legacy catalog and the ledger preflight, recorded the eight existing versions, and applied four forward migrations in one transaction. An in-transaction check compared every account balance before and after the upgrade. The history now ends at `20261123093000`. Later deployments can compare their local versions with `supabase migration list` and preview pending SQL with `supabase db push --dry-run`.

The application deployment has its own release cycle. For a hosted database test result, see [RLS verification](../supabase/tests/RLS_VERIFICATION.md). For a browser session against the production build, use the disposable stack and `npm run test:browser`.

## Migration workflow

1. Review the existing files in `supabase/migrations/` in timestamp order. Applied migration files are immutable.
2. Add a new timestamped migration for every schema, policy, RPC, or reporting-view change.
3. Apply it to development/staging:

   ```bash
   npx supabase login
   npx supabase link --project-ref <development-project-ref>
   npx supabase migration list
   npx supabase db push --dry-run
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

| Symptom                                     | Check                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| App reports Supabase is not configured      | Both public variables are set, have no surrounding quotes/spaces, and the dev server was restarted.                           |
| Browser redirects back to login             | Confirm the user has an active Supabase Auth session and the project URL/key refer to the same project.                       |
| Sign-up does not yield a session            | Email confirmation may be enabled; complete the confirmation flow or use a development-only configuration.                    |
| `test:database` cannot connect              | Confirm the project is Healthy/reachable and `.env.local` uses its current URL and publishable key.                           |
| `test:database` reports an email rate limit | Wait for or raise the Supabase Auth email limit, then rerun once. Do not claim RLS passed without the completed two-user run. |
