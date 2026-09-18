import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const reportPath = resolve("supabase/tests/RLS_VERIFICATION.md");
const testId = randomUUID().slice(0, 8);
const testPassword = `Terra-r${randomUUID()}!`;
const month = "2026-07-01";

if (!supabaseUrl || !publishableKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
}

function client() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    fail(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertClose(actual, expected, label) {
  if (Math.abs(Number(actual) - expected) > 0.000001) {
    fail(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertNoError(result, label) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  return result.data;
}

function assertNoRows(result, label) {
  const data = assertNoError(result, label);
  if ((data ?? []).length !== 0) fail(`${label}: expected no rows, received ${data.length}`);
}

async function signUp(label) {
  const instance = client();
  const email = `terra-${label}-${testId}@example.test`;
  const { data, error } = await instance.auth.signUp({ email, password: testPassword });
  if (error) fail(`create ${label} test user: ${error.message}`);
  if (!data.user || !data.session) {
    fail(`create ${label} test user: email confirmation is enabled, so no authenticated session was issued`);
  }
  return { client: instance, userId: data.user.id };
}

async function insertOne(instance, table, row, label) {
  const result = await instance.from(table).insert(row).select().single();
  return assertNoError(result, label);
}

async function seedOwner(owner) {
  const prefix = `RLS fixture ${testId}`;
  const incomeCategory = await insertOne(
    owner.client,
    "categories",
    { user_id: owner.userId, name: `${prefix} salary`, kind: "income" },
    "seed income category",
  );
  const foodCategory = await insertOne(
    owner.client,
    "categories",
    { user_id: owner.userId, name: `${prefix} food`, kind: "expense" },
    "seed expense category",
  );
  const transportCategory = await insertOne(
    owner.client,
    "categories",
    { user_id: owner.userId, name: `${prefix} transport`, kind: "expense" },
    "seed second expense category",
  );
  const checking = await insertOne(
    owner.client,
    "accounts",
    { user_id: owner.userId, name: `${prefix} checking`, type: "bank" },
    "seed checking account",
  );
  const savings = await insertOne(
    owner.client,
    "accounts",
    { user_id: owner.userId, name: `${prefix} savings`, type: "bank", is_savings: true },
    "seed savings account",
  );
  const investment = await insertOne(
    owner.client,
    "accounts",
    { user_id: owner.userId, name: `${prefix} investment`, type: "investment" },
    "seed investment account",
  );
  const receivable = await insertOne(
    owner.client,
    "accounts",
    { user_id: owner.userId, name: `${prefix} receivable`, type: "receivable" },
    "seed receivable account",
  );
  const payable = await insertOne(
    owner.client,
    "accounts",
    { user_id: owner.userId, name: `${prefix} payable`, type: "payable" },
    "seed payable account",
  );

  await insertOne(
    owner.client,
    "transactions",
    {
      user_id: owner.userId,
      account_id: checking.id,
      type: "income",
      category_id: incomeCategory.id,
      amount: 1000,
      direction: "credit",
      date: "2026-07-01",
    },
    "seed income",
  );
  const expense = await insertOne(
    owner.client,
    "transactions",
    {
      user_id: owner.userId,
      account_id: checking.id,
      type: "expense",
      category_id: foodCategory.id,
      amount: 200,
      direction: "debit",
      date: "2026-07-02",
    },
    "seed expense",
  );
  await insertOne(
    owner.client,
    "transactions",
    {
      user_id: owner.userId,
      account_id: checking.id,
      type: "income",
      category_id: incomeCategory.id,
      amount: 50,
      direction: "credit",
      date: "2026-07-05",
      linked_refund_of: expense.id,
    },
    "seed linked refund",
  );

  for (const [from, to, amount, note] of [
    [checking.id, savings.id, 100, "fund savings"],
    [checking.id, investment.id, 100, "fund investment"],
    [checking.id, receivable.id, 80, "loan to friend"],
    [payable.id, checking.id, 20, "borrowing received"],
  ]) {
    const result = await owner.client.rpc("create_transfer", {
      p_from_account_id: from,
      p_to_account_id: to,
      p_amount: amount,
      p_date: "2026-07-10",
      p_note: note,
    });
    assertNoError(result, `seed transfer: ${note}`);
  }

  const splitExpenseId = assertNoError(
    await owner.client.rpc("create_expense_with_splits", {
      p_account_id: checking.id,
      p_amount: 10,
      p_date: "2026-08-01",
      p_note: "RLS split fixture",
      p_splits: [
        { category_id: foodCategory.id, amount: 5 },
        { category_id: transportCategory.id, amount: 5 },
      ],
    }),
    "seed split expense",
  );

  const counterparty = await insertOne(
    owner.client,
    "counterparties",
    { user_id: owner.userId, name: `${prefix} friend`, relationship_tag: "friend", linked_account_id: receivable.id },
    "seed counterparty",
  );
  const budget = await insertOne(
    owner.client,
    "budgets",
    { user_id: owner.userId, category_id: foodCategory.id, month, planned_amount: 300, rollover_enabled: true },
    "seed budget",
  );
  const goal = await insertOne(
    owner.client,
    "goals",
    { user_id: owner.userId, name: `${prefix} goal`, target_amount: 1000, linked_account_id: savings.id },
    "seed goal",
  );
  const recurringRule = await insertOne(
    owner.client,
    "recurring_rules",
    {
      user_id: owner.userId,
      name: `${prefix} recurring`,
      account_id: checking.id,
      category_id: foodCategory.id,
      amount: 25,
      frequency: "monthly",
      next_due_date: "2026-10-01",
    },
    "seed recurring rule",
  );

  return {
    incomeCategory,
    foodCategory,
    transportCategory,
    checking,
    savings,
    investment,
    receivable,
    payable,
    expense,
    splitExpenseId,
    counterparty,
    budget,
    goal,
    recurringRule,
  };
}

async function verifyCalculations(owner, fixture) {
  const balances = assertNoError(
    await owner.client
      .from("account_balances")
      .select("account_id,balance")
      .in("account_id", [
        fixture.checking.id,
        fixture.savings.id,
        fixture.investment.id,
        fixture.receivable.id,
        fixture.payable.id,
      ]),
    "read account balances",
  );
  const balanceByAccount = new Map(balances.map((row) => [row.account_id, row.balance]));
  assertClose(balanceByAccount.get(fixture.checking.id), 580, "checking balance uses debit/credit signs");
  assertClose(balanceByAccount.get(fixture.savings.id), 100, "savings balance uses credit sign");
  assertClose(balanceByAccount.get(fixture.investment.id), 100, "investment balance uses credit sign");
  assertClose(balanceByAccount.get(fixture.receivable.id), 80, "receivable balance uses credit sign");
  assertClose(balanceByAccount.get(fixture.payable.id), -20, "payable balance uses debit sign");

  const spend = assertNoError(
    await owner.client
      .from("category_monthly_spend")
      .select("expense_amount,refund_amount,actual_spend")
      .eq("category_id", fixture.foodCategory.id)
      .eq("month", month)
      .single(),
    "read category spend",
  );
  assertClose(spend.expense_amount, 200, "expense amount");
  assertClose(spend.refund_amount, 50, "linked refund amount");
  assertClose(spend.actual_spend, 150, "refund nets against category spend");

  const savingsRate = assertNoError(
    await owner.client
      .from("savings_rate_monthly")
      .select("income_amount,savings_contribution_amount,savings_rate")
      .eq("month", month)
      .single(),
    "read savings rate",
  );
  assertClose(savingsRate.income_amount, 1000, "linked refund is excluded from income");
  assertClose(savingsRate.savings_contribution_amount, 200, "savings and investment contributions");
  assertClose(savingsRate.savings_rate, 0.2, "savings rate");
}

async function verifyRls(secondUser, owner, fixture) {
  const dataSources = [
    ["accounts", "id", fixture.checking.id],
    ["categories", "id", fixture.foodCategory.id],
    ["transactions", "id", fixture.expense.id],
    ["transaction_splits", "transaction_id", fixture.splitExpenseId],
    ["counterparties", "id", fixture.counterparty.id],
    ["budgets", "id", fixture.budget.id],
    ["goals", "id", fixture.goal.id],
    ["recurring_rules", "id", fixture.recurringRule.id],
    ["account_balances", "account_id", fixture.checking.id],
    ["category_monthly_spend", "category_id", fixture.foodCategory.id],
    ["net_worth", "user_id", owner.userId],
    ["savings_rate_monthly", "user_id", owner.userId],
    ["budget_vs_actual", "category_id", fixture.foodCategory.id],
    ["transaction_list", "account_id", fixture.checking.id],
    ["dashboard_monthly_summary", "user_id", owner.userId],
    ["net_worth_daily", "user_id", owner.userId],
    ["category_monthly_spend_with_share", "category_id", fixture.foodCategory.id],
    ["budget_vs_actual_with_progress", "category_id", fixture.foodCategory.id],
    ["upcoming_recurring_bills", "recurring_rule_id", fixture.recurringRule.id],
  ];

  for (const [source, column, value] of dataSources) {
    assertNoRows(await secondUser.client.from(source).select("*").eq(column, value), `RLS select ${source}`);
  }

  const update = await secondUser.client
    .from("accounts")
    .update({ name: "RLS escape attempt" })
    .eq("id", fixture.checking.id)
    .select("id,name");
  assertNoRows(update, "RLS update owner account");

  const forgedInsert = await secondUser.client
    .from("accounts")
    .insert({ user_id: owner.userId, name: "RLS forged account", type: "bank" })
    .select("id");
  if (!forgedInsert.error) fail("RLS insert with another user's user_id: expected rejection");

  const ownerAccount = assertNoError(
    await owner.client.from("accounts").select("name").eq("id", fixture.checking.id).single(),
    "confirm owner account unchanged",
  );
  assertEqual(ownerAccount.name, `RLS fixture ${testId} checking`, "RLS update did not alter owner account");

  const summary = await secondUser.client.rpc("transaction_summary", {
    p_from_date: month,
    p_to_date: "2026-07-31",
    p_account_id: fixture.checking.id,
    p_category_id: fixture.foodCategory.id,
  });
  const rows = assertNoError(summary, "RLS transaction_summary RPC");
  for (const row of rows ?? []) {
    assertClose(row.income_amount, 0, "RLS transaction_summary income");
    assertClose(row.outflow_amount, 0, "RLS transaction_summary outflow");
    assertClose(row.net_amount, 0, "RLS transaction_summary net");
  }
}

async function writeReport() {
  const timestamp = new Date().toISOString();
  const report = `# RLS verification\n\nVerified by \`npm run test:database\` on ${timestamp}. The command created two distinct authenticated test users and seeded sentinel records only for the first.\n\nThe second user received zero rows when querying every source backing data-bearing app pages:\n\n- Dashboard: dashboard summary, net-worth, daily trend, category spend, budgets, and upcoming recurring bills\n- Accounts, transactions, budgets, counterparties, goals, recurring items, and settings: their base tables and reporting views\n- Direct API: all tenant tables, reporting views, and \`transaction_summary\` RPC\n\nIt also verified that the second user could neither update the first user's account nor insert an account with the first user's \`user_id\`; the first user's sentinel account remained unchanged. System-owned categories are intentionally outside this assertion because the product deliberately exposes them to every authenticated user.\n\nResult: **verified** — first-user data was inaccessible to the second user through each page data source and direct API call tested.\n`;
  await mkdir(resolve("supabase/tests"), { recursive: true });
  await writeFile(reportPath, report);
}

async function main() {
  const owner = await signUp("owner");
  const secondUser = await signUp("second-user");
  const fixture = await seedOwner(owner);
  await verifyCalculations(owner, fixture);
  await verifyRls(secondUser, owner, fixture);
  await writeReport();
  console.log("Database calculations and two-user RLS verification passed.");
}

main().catch((error) => {
  console.error(`Database verification failed: ${error.message}`);
  process.exitCode = 1;
});
