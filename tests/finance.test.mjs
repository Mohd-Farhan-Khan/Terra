import { test } from "node:test";
import assert from "node:assert/strict";
import { paise, formatInr } from "../lib/utils/currency.ts";
import { returnPath } from "../lib/utils/return-path.ts";
import { occurrencesInPeriod } from "../lib/utils/calendar.ts";
import { errorMessage } from "../lib/utils/error-message.ts";
import { assertClose } from "../scripts/finance-assertions.mjs";

test("split amounts use integer paise across the full database range", () => {
  assert.equal(paise("0.10") + paise("0.20"), paise("0.30"));
  assert.equal(paise("999999999999.99"), 99999999999999);
  for (const invalid of ["", "0", "-1", "1e3", "0.011", "1000000000000", "NaN"]) assert.equal(paise(invalid), null);
  assert.match(formatInr(-12.5), /12\.50/);
});
test("login returns preserve paths, searches and fragments within Terra", () => {
  assert.equal(returnPath("/transactions?view=month#ledger"), "/transactions?view=month#ledger");
  for (const path of [
    null,
    "/login",
    "/a/../login/",
    "//other.invalid",
    "/a/..//other.invalid",
    "/\\other.invalid",
    "https://other.invalid",
    "javascript:alert(1)",
  ])
    assert.equal(returnPath(path), "/dashboard");
});
test("weekly commitments count each unpaid occurrence in the month", () => {
  assert.equal(occurrencesInPeriod("2026-10-30", "weekly", 30, "2026-11-01", "2026-12-01"), 4);
  assert.equal(occurrencesInPeriod("2026-11-30", "weekly", 30, "2026-11-01", "2026-12-01"), 1);
  assert.equal(occurrencesInPeriod("2026-12-01", "weekly", 1, "2026-11-01", "2026-12-01"), 0);
});
test("month-end and leap-day schedules retain their anchor", () => {
  assert.equal(occurrencesInPeriod("2026-02-28", "monthly", 31, "2026-03-29", "2026-04-01"), 1);
  assert.equal(occurrencesInPeriod("2025-02-28", "yearly", 29, "2028-02-29", "2028-03-01"), 1);
});
test("failed writes report uncertain outcomes and preserve database messages", () => {
  assert.match(errorMessage({ message: "TypeError: Failed to fetch" }, "failed"), /could not confirm/);
  assert.equal(errorMessage({ message: "Choose an active account" }, "failed"), "Choose an active account");
});
test("verification rejects missing, invalid and unexpected numbers", () => {
  for (const invalid of [undefined, null, "", " ", NaN, Infinity, "bad", false, {}, 1])
    assert.throws(() => assertClose(invalid, 0, "balance"));
  assert.doesNotThrow(() => assertClose("0.00", 0, "balance"));
});

test("lost acknowledgements reuse a booking token and confirmed identical entries get new tokens", async () => {
  const { sendEntryOnce } = await import("../lib/queries/entry-retry.ts");
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
  const tokens = [];
  const entry = { amount: 50, note: "Private note" };
  await assert.rejects(
    sendEntryOnce("first", entry, storage, async (id) => {
      tokens.push(id);
      throw new Error("connection lost");
    }),
  );
  assert.ok([...map.keys()].every((k) => !k.includes(entry.note)));
  await sendEntryOnce("second", entry, storage, async (id) => tokens.push(id));
  await sendEntryOnce("first", entry, storage, async (id) => tokens.push(id));
  await sendEntryOnce("first", entry, storage, async (id) => tokens.push(id));
  assert.equal(tokens[0], tokens[2]);
  assert.notEqual(tokens[0], tokens[1]);
  assert.notEqual(tokens[0], tokens[3]);
  assert.equal(map.size, 0);
});

test("local midnight in Kolkata changes the displayed day while the UTC month is still ending", async () => {
  const { execFileSync } = await import("node:child_process");
  const script =
    'import {dateString,addDays,nextMonth,daysBetween} from "./lib/utils/calendar.ts";console.log(JSON.stringify([dateString(new Date("2026-11-30T18:29:59Z")),dateString(new Date("2026-11-30T18:30:00Z")),nextMonth("2026-12-01"),addDays("2028-02-28",1),daysBetween("2028-02-28","2028-03-01")]))';
  const result = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    env: { ...process.env, TZ: "Asia/Kolkata" },
    encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(result), ["2026-11-30", "2026-12-01", "2027-01-01", "2028-02-29", 2]);
});
