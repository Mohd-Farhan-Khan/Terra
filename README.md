# Terra

Terra is a personal-finance journal with a private ledger for each signed-in user built with Next.js and Supabase. The browser is intentionally a thin client: Postgres owns financial calculations, transaction invariants, and tenant isolation through Row-Level Security (RLS).

## What is in this repository

- **Dashboard**: current-month income, spending, net amount, savings rate, net worth, category spend, budgets, and upcoming recurring bills.
- **Transactions**: income, expense, atomic transfers, and split expenses. All entry types use the retry-safe `post_entry` RPC. Transfers create matching debit and credit legs. Each split uses distinct categories and reconciles to the paisa.
- **Accounts and categories**: created, edited, and archived from **Settings**. Archiving preserves historical transactions but hides a row from new-entry selectors.
- **Read models**: accounts, budgets, goals, counterparties, recurring items, and the ledger are rendered from RLS-protected tables and `security_invoker` reporting views.

See [Architecture and data model](docs/ARCHITECTURE.md) for the request/data flow and [Financial rules and UI coverage](docs/FINANCIAL_MODEL.md) for calculation definitions and the current UI boundary.

## Repository map

| Location                             | Purpose                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `app/`                               | Next.js routes. All authenticated routes render a screen inside `AppShell`.   |
| `components/`                        | Feature screens, application layout, and shared UI primitives.                |
| `lib/queries/finance.ts`             | All browser read queries and the tables/views that back them.                 |
| `supabase/migrations/`               | Ordered, immutable database schema, policies, functions, and reporting views. |
| `supabase/tests/`                    | SQL-editor fixtures plus the recorded two-user RLS result.                    |
| `scripts/verify-finance-and-rls.mjs` | Disposable-user calculation and RLS integration check.                        |
| `docs/`                              | Architecture, financial-model, and operations/testing guides.                 |

## Database compatibility

This frontend uses the schema through `20261123093000_recurring_calendar.sql`. The Terra Finance hosted project was upgraded on 23 November 2026. The release recorded eight existing migration versions and applied four new ones. The hosted SQL check verified replay of a transfer and isolation between two user identities. See the [dated verification record](supabase/tests/RLS_VERIFICATION.md) for the exact scope.

## Requirements

- Node.js 22.13 or later
- npm
- A Supabase project
- The Supabase CLI for applying migrations to a hosted project

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy the environment template and fill in the values from **Supabase → Connect** or **Project Settings → API Keys**:

   ```bash
   cp .env.example .env.local
   ```

   Required variables:

   | Variable                               | Value                                                                            |
   | -------------------------------------- | -------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | The HTTPS URL for the Supabase project.                                          |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project publishable (anon) key. This value is intentionally browser-visible. |

   Do not put `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, Vercel, client code, or any `NEXT_PUBLIC_` variable. The app does not require it.

3. Check that your Supabase project has the migrations listed below, then start the app.

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000), create an account, and sign in. From **Add transaction**, follow **Create an account in Settings** to open the Accounts tab. Create your first account, then return to **Add transaction** to record an entry. System categories are available immediately.

For Auth URLs and troubleshooting, read [Supabase setup](Supabase.md).

## Supabase migrations

The ordered migration history is in [`supabase/migrations`](supabase/migrations). Add a new timestamped SQL file for each change to an applied schema.

For a hosted project, substitute its reference in the link command.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Review the migration plan before confirming `db push`. Use a separate Supabase project for Preview and Production, and link/push each one intentionally. Never run production migrations from unreviewed local changes. The migration order, database contracts, and rollback guidance are in [Operations and testing](docs/OPERATIONS.md).

Before a production migration, back up the target. Run the following checks against a disposable local or staging environment. If a migration changes RLS policies or reporting views, the two-user RLS verification must pass before deployment.

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run test:database
```

`test:database` creates two disposable authenticated test users and verifies account signs, refund netting, savings rate, and RLS through every page data source and direct API call. Run it only against development or staging, never against a personal or production dataset. It requires a reachable Supabase project, working email/password sign-up, and the two public variables configured. Each run writes its result to `coverage/database/`. CI provisions a disposable local Supabase stack and removes its fixture users.

## Vercel deployment

[`vercel.json`](vercel.json) configures Vercel to install locked dependencies and run the production Next.js build.

1. Import this repository into Vercel.
2. In **Project Settings → Environment Variables**, add the two variables from `.env.example` to **Production**. Add matching values for Preview only if its deployment should use the same Supabase project; a separate preview project is safer.
3. Deploy. Vercel uses `npm ci` and `npm run build` from `vercel.json`.
4. In Supabase, configure Authentication settings and allowed redirect URLs for the final Vercel domain(s) if enabling email confirmations, password resets, or OAuth.

The public publishable key is safe to expose to the browser; protection depends on the database’s RLS policies, not on hiding that key. Do not add a service-role key to Vercel for this application. See the production checklist and post-deploy smoke test in [Operations and testing](docs/OPERATIONS.md).

## Documentation

- [Supabase setup](Supabase.md): create/connect a Supabase project, configure Auth, apply migrations, and troubleshoot first-time setup.
- [Architecture and data model](docs/ARCHITECTURE.md): routes, client/server boundaries, tables, views, RLS, and database RPCs.
- [Financial rules and UI coverage](docs/FINANCIAL_MODEL.md): debit/credit semantics, reporting formulas, supported transaction workflows, and known UI gaps.
- [Operations and testing](docs/OPERATIONS.md): local/CI checks, test fixtures, migrations, deployment, and incident-oriented troubleshooting.
- [RLS verification record](supabase/tests/RLS_VERIFICATION.md): hosted release checks, their results, and the scope of the authenticated database test.

See [Operations and testing](docs/OPERATIONS.md) for the prerequisites and commands for the SQL fixtures, schema compatibility checks, and browser suite.
