# Terra

Terra is a personal-finance app built with Next.js and Supabase. Financial reporting and tenant isolation live in Postgres; the browser uses the Supabase publishable key and is constrained by Row-Level Security (RLS).

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

2. Copy the environment template and fill in the values from **Supabase → Project Settings → API**:

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
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), create an account, and sign in.

## Supabase migrations

The ordered migration history is in [`supabase/migrations`](supabase/migrations). Treat applied migrations as immutable: add a new timestamped SQL file for every schema or policy change.

For a hosted project:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Review the migration plan before confirming `db push`. Use a separate Supabase project for Preview and Production, and link/push each one intentionally. Never run production migrations from unreviewed local changes.

Before a production migration, export a backup in Supabase and run the checks below against the target environment. If a migration changes RLS policies or reporting views, the two-user RLS verification must pass before deployment.

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test:database
```

`test:database` creates two disposable authenticated test users and verifies account signs, refund netting, savings rate, and RLS through every page data source and direct API calls. It requires a reachable Supabase project with the two public variables configured.

## Vercel deployment

[`vercel.json`](vercel.json) configures Vercel to install locked dependencies and run the production Next.js build.

1. Import this repository into Vercel.
2. In **Project Settings → Environment Variables**, add the two variables from `.env.example` to **Production**. Add matching values for Preview only if its deployment should use the same Supabase project; a separate preview project is safer.
3. Deploy. Vercel uses `npm ci` and `npm run build` from `vercel.json`.
4. In Supabase, configure Authentication settings and allowed redirect URLs for the final Vercel domain(s) if enabling email confirmations, password resets, or OAuth.

The public publishable key is safe to expose to the browser; protection depends on the database’s RLS policies, not on hiding that key. Do not add a service-role key to Vercel for this application.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run format:check
npm run test:database
```
