import { randomUUID } from "node:crypto";
import { assertClose } from "./finance-assertions.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const reportDirectory = resolve("coverage/database");
const testId = randomUUID().slice(0, 8);
const testPassword = `Terra-r${randomUUID()}!`;
const month = "2026-07-01";

if (!supabaseUrl || !publishableKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
}

const createdUsers = [];
const localTarget = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(supabaseUrl).hostname);
const admin =
  localTarget && process.env.TERRA_LOCAL_ADMIN_KEY
    ? createClient(supabaseUrl, process.env.TERRA_LOCAL_ADMIN_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

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

function assertNoError(result, label) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  return result.data;
}

function assertNoRows(result, label) {
  const data = assertNoError(result, label);
  if (!Array.isArray(data) || data.length !== 0) fail(label + ": expected an empty array");
}

async function signUp(label) {
  const instance = client();
  const email = `terra-${label}-${testId}@${admin ? "example.test" : "mailinator.com"}`;
  if (admin) {
    const created = assertNoError(
      await admin.auth.admin.createUser({ email, password: testPassword, email_confirm: true }),
      "create local fixture",
    );
    createdUsers.push({ id: created.user.id, instance });
  }
  const { data, error } = admin
    ? await instance.auth.signInWithPassword({ email, password: testPassword })
    : await instance.auth.signUp({ email, password: testPassword });
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
      next_due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
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
  await insertOne(
    owner.client,
    "transactions",
    {
      user_id: owner.userId,
      account_id: fixture.checking.id,
      category_id: fixture.foodCategory.id,
      type: "expense",
      direction: "debit",
      amount: 1,
      date: month,
      recurring_rule_id: fixture.recurringRule.id,
    },
    "seed recurring payment",
  );
  const dataSources = [
    ["account_recent_activity", "account_id", fixture.checking.id],
    ["account_statement", "account_id", fixture.checking.id],
    ["transaction_allocations", "transaction_id", fixture.expense.id],
    ["recurring_paid_monthly", "user_id", owner.userId],
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
    const visible = assertNoError(
      await owner.client.from(source).select(column).eq(column, value).limit(1),
      "owner reads " + source,
    );
    assertEqual(visible.length, 1, "owner sentinel for " + source);
    assertNoRows(await secondUser.client.from(source).select("*").eq(column, value), `RLS select ${source}`);
  }

  const defaults = assertNoError(
    await secondUser.client.from("categories").select("id").is("user_id", null).limit(1),
    "system category access",
  );
  assertEqual(defaults.length, 1, "system category available");
  assertNoRows(
    await secondUser.client.rpc("filtered_ledger", { p_account_id: fixture.checking.id }),
    "isolated ledger RPC",
  );
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
  assertEqual(forgedInsert.error?.code, "42501", "RLS mismatched owner rejection");

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
  assertEqual(rows?.length, 1, "summary row count");
  for (const row of rows) {
    assertEqual(row.transaction_count, 0, "summary entry count");
    assertClose(row.income_amount, 0, "RLS transaction_summary income");
    assertClose(row.outflow_amount, 0, "RLS transaction_summary outflow");
    assertClose(row.net_amount, 0, "RLS transaction_summary net");
  }
}

async function verifyConcurrentWrites(owner, fixture) {
  const requestId = randomUUID();
  const args = {
    p_request_id: requestId,
    p_entry: {
      type: "expense",
      account: fixture.checking.id,
      category: fixture.foodCategory.id,
      amount: 2,
      date: month,
    },
  };
  const bookings = await Promise.all([owner.client.rpc("post_entry", args), owner.client.rpc("post_entry", args)]);
  const ids = bookings.map((row) => assertNoError(row, "concurrent booking"));
  assertEqual(ids[0], ids[1], "both callers receive the same booking");
  const occurrence = {
    p_recurring_rule_id: fixture.recurringRule.id,
    p_expected_next_due_date: fixture.recurringRule.next_due_date,
    p_occurred_on: month,
  };
  const before = assertNoError(
    await owner.client.from("transactions").select("id").eq("recurring_rule_id", fixture.recurringRule.id),
    "read occurrences",
  );
  const confirmations = await Promise.all([
    owner.client.rpc("confirm_recurring_occurrence", occurrence),
    owner.client.rpc("confirm_recurring_occurrence", occurrence),
  ]);
  assertEqual(confirmations.filter((result) => !result.error).length, 1, "one confirmed occurrence");
  assertEqual(confirmations.find((result) => result.error)?.error?.code, "40001", "stale confirmation rejected");
  const after = assertNoError(
    await owner.client.from("transactions").select("id").eq("recurring_rule_id", fixture.recurringRule.id),
    "read confirmed occurrences",
  );
  assertEqual(after.length, before.length + 1, "exactly one new recurring entry");
}

async function verify() {
  const owner = await signUp("owner");
  const second = await signUp("second-user");
  const fixture = await seedOwner(owner);
  await verifyCalculations(owner, fixture);
  await verifyRls(second, owner, fixture);
  await verifyConcurrentWrites(owner, fixture);
}
async function cleanup() {
  if (!admin) return;
  for (const { id, instance } of createdUsers) {
    assertNoError(
      await instance.from("transactions").delete().eq("user_id", id).not("linked_refund_of", "is", null),
      "remove fixture refunds",
    );
    for (const table of [
      "transactions",
      "goals",
      "budgets",
      "counterparties",
      "recurring_rules",
      "categories",
      "accounts",
    ]) {
      assertNoError(await instance.from(table).delete().eq("user_id", id), "remove fixture " + table);
    }
    assertNoError(await admin.auth.admin.deleteUser(id), "remove fixture user");
  }
}
let status = "passed";
try {
  await verify();
  console.log("Database calculations and two-user isolation passed.");
} catch (error) {
  status = "failed";
  console.error("Database verification failed:", error.message);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("Fixture cleanup failed:", error.message);
    status = "failed";
    process.exitCode = 1;
  }
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    resolve(reportDirectory, testId + ".json"),
    JSON.stringify({ status, at: new Date().toISOString(), run: testId }) + "\n",
  );
}
