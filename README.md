# Terra

Terra is a single-user personal-finance journal built with Next.js and Supabase. The browser is intentionally a thin client: Postgres owns financial calculations, transaction invariants, and tenant isolation through Row-Level Security (RLS).

## What is in this repository

- **Dashboard**: current-month income, spending, net amount, savings rate, net worth, category spend, budgets, and upcoming recurring bills.
- **Transactions**: income, expense, atomic transfers, and split expenses. Transfers always create matching debit and credit legs; split amounts must total the parent expense.
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

## Requirements

- Node.js 20.6 or later (Node 22 is recommended)
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

3. Apply the database migrations, then start the app:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), create an account, and sign in. The first useful setup is: add an account in **Settings**, add an income/expense category if the supplied system categories do not fit, then add a transaction.

For a complete Supabase walkthrough, including Auth URLs and troubleshooting, read [Supabase setup](Supabase.md).

## Supabase migrations

The ordered migration history is in [`supabase/migrations`](supabase/migrations). Treat applied migrations as immutable: add a new timestamped SQL file for every schema or policy change.

For a hosted project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Review the migration plan before confirming `db push`. Use a separate Supabase project for Preview and Production, and link/push each one intentionally. Never run production migrations from unreviewed local changes. The migration order, database contracts, and rollback guidance are in [Operations and testing](docs/OPERATIONS.md).

Before a production migration, export a backup in Supabase and run the checks below against the target environment. If a migration changes RLS policies or reporting views, the two-user RLS verification must pass before deployment.

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test:database
```

`test:database` creates two disposable authenticated test users and verifies account signs, refund netting, savings rate, and RLS through every page data source and direct API call. Run it only against development or staging, never against a personal or production dataset. It requires a reachable Supabase project, working email/password sign-up, and the two public variables configured. Its latest observed status is recorded in [RLS verification](supabase/tests/RLS_VERIFICATION.md); do not treat a stale or blocked report as a passing result.

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
- [RLS verification record](supabase/tests/RLS_VERIFICATION.md): current result from the live two-user verification; it is evidence, not a substitute for rerunning the check against a changed environment.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run format:check
npm run test:database
```
