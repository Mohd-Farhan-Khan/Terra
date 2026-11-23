import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

test(
  "new user can reconcile an income, split purchase and transfer on desktop and mobile",
  { timeout: 120000 },
  async (t) => {
    const base = process.env.TERRA_APP_URL ?? "http://127.0.0.1:3000";
    const db = process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.ok(
      [base, db].every((url) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)),
      "Browser fixtures require the disposable local stack",
    );
    const admin = createClient(db, process.env.TERRA_LOCAL_ADMIN_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = "terra-browser-" + randomUUID() + "@example.test",
      password = randomUUID() + "aA!";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const owner = createClient(db, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    t.after(async () => {
      const id = data.user.id;
      for (const table of ["transactions", "accounts"]) {
        assert.ifError((await owner.from(table).delete().eq("user_id", id)).error);
      }
      assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    });
    assert.ifError((await owner.auth.signInWithPassword({ email, password })).error);
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(base + "/settings?tab=accounts");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL("**/settings?tab=accounts");
    const selectedAccountsTab = page.getByRole("tab", { name: "Accounts", selected: true });
    await selectedAccountsTab.waitFor();
    await page.goto(base + "/add-transaction");
    await page.getByRole("link", { name: "Create an account in Settings" }).click();
    await page.waitForURL("**/settings?tab=accounts");
    await selectedAccountsTab.waitFor();
    for (const name of ["Checking", "Savings"]) {
      await page.getByRole("button", { name: /Add account/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name", { exact: true }).fill(name);
      await dialog.getByRole("button", { name: "Save account" }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("cell", { name, exact: true }).waitFor();
    }
    async function entry(type, amount, note) {
      await page.goto(base + "/add-transaction");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: new RegExp(type, "i") }).click();
      await dialog
        .getByLabel(type === "transfer" ? "From account" : "Account", { exact: true })
        .selectOption({ label: "Checking" });
      await dialog.getByPlaceholder("0.00", { exact: true }).fill(amount);
      await dialog.getByPlaceholder("Add a note…").fill(note);
      return dialog;
    }
    async function save(dialog) {
      await dialog.getByRole("button", { name: "Add transaction", exact: true }).click();
      await page.waitForURL("**/transactions");
    }
    let dialog = await entry("income", "1000", "Salary test");
    await dialog.getByLabel("Category", { exact: true }).selectOption({ label: "Salary" });
    await save(dialog);
    dialog = await entry("expense", "100", "Split test");
    await dialog.getByRole("button", { name: /Add another category/ }).click();
    await dialog.getByLabel("Split category 1").selectOption({ label: "Food" });
    await dialog.getByLabel("Split category 2").selectOption({ label: "Food" });
    await dialog.getByLabel("Split amount 1").fill("70");
    await dialog.getByLabel("Split amount 2").fill("30");
    await dialog.getByRole("button", { name: "Add transaction", exact: true }).click();
    await dialog.getByText("Choose a different category for each split.").waitFor();
    await dialog.getByLabel("Split category 2").selectOption({ label: "Transport" });
    await save(dialog);
    dialog = await entry("transfer", "100", "Transfer test");
    await dialog.getByLabel("To account").selectOption({ label: "Savings" });
    await save(dialog);
    const transferCredit = page.getByRole("row").filter({ hasText: "Savings" }).filter({ hasText: "Transfer test" });
    await transferCredit.waitFor();
    assert.match(await transferCredit.innerText(), /\+₹100\.00/);
    await page.getByLabel("Filter by category").selectOption({ label: "Food" });
    const split = page.getByRole("row").filter({ hasText: "Split test" });
    await split.waitFor();
    assert.match(await split.innerText(), /−₹70\.00/);
    await page.getByLabel("From", { exact: true }).fill("2099-12-31");
    await page.getByText("The start date must be on or before the end date.").waitFor();
    await page.getByLabel("From", { exact: true }).fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("article").filter({ hasText: "Split test" }).waitFor();
    await page.goto(base + "/add-transaction");
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("dialog").evaluate((el) => el.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    await page.waitForURL("**/transactions");
    await page.goto(base + "/add-transaction");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.waitForURL("**/transactions");
    await page.setViewportSize({ width: 1366, height: 900 });
    const secondTab = await page.context().newPage();
    await secondTab.goto(base + "/accounts");
    await secondTab.getByText("Checking", { exact: true }).first().waitFor();
    await page.route("**/auth/v1/logout**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) }),
    );
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(new URL(page.url()).pathname, "/transactions");
    await page.unroute("**/auth/v1/logout**");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.waitForURL("**/login");
    await secondTab.waitForURL("**/login");
    assert.equal(await secondTab.getByText("Checking", { exact: true }).count(), 0);
  },
);
