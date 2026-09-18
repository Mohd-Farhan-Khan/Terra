# Connecting Terra to Supabase

This guide sets up a new Supabase project for Terra from scratch. You only need the browser to create and configure the Supabase project; the application setup itself happens from your terminal.

## 1. Create a Supabase project

1. Go to [Supabase](https://supabase.com) and sign in or create an account.
2. Select **New project**.
3. Choose an organization, give the project a name such as `terra`, choose a strong database password, and select a region close to your users.
4. Select **Create new project** and wait until its status says it is ready.

Keep the database password in a password manager. Terra does not need it during normal development, but you may need it for administrative database access later.

## 2. Get the two application credentials

1. In Supabase, open your new project.
2. Go to **Project Settings → API** (or use the **Connect** dialog).
3. Copy the **Project URL** and **Publishable key**.

These are the only credentials Terra needs:

| Terra variable                         | Supabase value  |
| -------------------------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

The publishable key is intentionally visible in a browser app. It is safe to use only because the database policies restrict each signed-in user to their own records. Never use or expose the `service_role` key in this project.

## 3. Configure your local project

From the Terra project directory, install dependencies and create your local environment file:

```bash
npm ci
cp .env.example .env.local
```

Open `.env.local` and replace the sample values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

`.env.local` is ignored by Git, so do not commit it or paste its values into source files.

## 4. Apply Terra's database migrations

Migrations create Terra's tables, views, functions, constraints, and Row-Level Security policies. They must be applied before the app can store data.

1. Install or run the Supabase CLI:

   ```bash
   npx supabase --version
   ```

2. Log in, then link the local repository to the Supabase project. The project reference is the subdomain in the Project URL.

   ```bash
   npx supabase login
   npx supabase link --project-ref your-project-ref
   ```

3. Review and apply the migrations in `supabase/migrations`:

   ```bash
   npx supabase db push
   ```

Read the CLI's proposed migration list before confirming. Do not edit migration files that are already applied; create a new timestamped migration for later database changes.

## 5. Configure authentication

Terra uses email and password sign-up.

1. In Supabase, go to **Authentication → Providers → Email** and ensure Email is enabled.
2. For the easiest local start, you can temporarily turn off **Confirm email**. When it is enabled, new users must confirm their email before they receive a usable session.
3. Before production, set **Authentication → URL Configuration → Site URL** to your Vercel production URL.
4. Add your local URL (`http://localhost:3000`) and production/preview URLs to the allowed redirect URLs if you later enable password reset, email confirmation, or OAuth.

## 6. Start Terra locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose **Sign up**, create an account, and sign in. Then add an account, category, and transaction to confirm that your connected project can save and read data.

If the app reports that Supabase is not configured, recheck the variable names in `.env.local` and restart `npm run dev` after saving the file.

## 7. Verify before deploying

Run the local code checks:

```bash
npm run lint
npm run typecheck
npm run format:check
npm run build
```

The following command creates two test users and verifies financial calculations and RLS isolation:

```bash
npm run test:database
```

Run it only against a dedicated development or staging Supabase project, because it creates test users and records. A successful run updates `supabase/tests/RLS_VERIFICATION.md` with a timestamped verified result.

## 8. Add the connection to Vercel

When you are ready to deploy:

1. Import the Git repository into Vercel.
2. Open **Project Settings → Environment Variables**.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the **Production** environment.
4. Prefer a separate Supabase project and matching variables for Preview deployments.
5. Deploy. The repository's `vercel.json` runs `npm ci` and `npm run build`.

Do not add a Supabase service-role key to Vercel for Terra. Database access from the app is intentionally limited to the signed-in user's permissions.

## Common first-time problems

| Problem                                       | What to check                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| “Supabase is not configured”                  | Both variables exist in `.env.local`, their names match exactly, and the dev server was restarted.    |
| Sign-up succeeds but the user cannot continue | Email confirmation may be enabled; confirm the email or disable it temporarily for local development. |
| Database/table error in the app               | Run `npx supabase db push` and confirm every migration completed.                                     |
| A user sees no data                           | This is normally RLS working. Make sure the records were created while signed in as that same user.   |
| `test:database` cannot connect                | Verify the Project URL is current and that DNS/network access to your Supabase project is available.  |
