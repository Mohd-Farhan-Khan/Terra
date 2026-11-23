// Exercise the production SELECT expressions offline. The Postgres fixture
// suite separately covers RLS, exact numeric types, locking and deferred triggers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const source = readFileSync(
  new URL("../supabase/migrations/20261123091000_financial_reporting.sql", import.meta.url),
  "utf8",
);
function portable(sql) {
  return sql
    .replaceAll("public.", "")
    .replace(/::numeric\(\d+,\s*\d+\)|::date/g, "")
    .replaceAll("auth.uid()", "'owner'");
}
function view(name) {
  const start = source.indexOf("view public." + name + " with");
  const body = source.indexOf(" as\n", start);
  assert.ok(start !== -1 && body !== -1);
  return portable(source.slice(body + 4, source.indexOf(";", body)));
}
function functionSql(name) {
  const start = source.indexOf("function public." + name + "("),
    body = source.indexOf("as $$", start);
  assert.ok(start !== -1 && body !== -1);
  return portable(
    source
      .slice(body + 5, source.indexOf("$$;", body))
      .trim()
      .replace(/;$/, ""),
  );
}
test("ledger and category projections reconcile transfers, statuses and split refunds", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.function("div", (a, b) => Math.floor(a / b));
    db.function("mod", (a, b) => a % b);
    db.function("date_trunc", (_unit, date) => date.slice(0, 7) + "-01");
    db.exec(`
    create table accounts(id text,name text);
    create table categories(id text,name text);
    create table transactions(id text,user_id text,account_id text,type text,direction text,amount real,status text,category_id text,linked_refund_of text,date text,created_at text,note text);
    create table transaction_splits(transaction_id text,category_id text,amount real);
    insert into accounts values('a','Checking'),('b','Savings');
    insert into categories values('food','Food'),('bus','Transit'),('income','Salary');
    insert into transactions(id,user_id,account_id,type,direction,amount,status,category_id,linked_refund_of,date) values
    ('d','owner','a','transfer','debit',100,'completed',null,null,'2026-07-01'),
    ('c','owner','b','transfer','credit',100,'completed',null,null,'2026-07-01'),
    ('s','owner','a','expense','debit',100,'completed',null,null,'2026-07-02'),
    ('r','owner','a','income','credit',0.01,'completed','income','s','2026-08-01'),
    ('p','owner','a','expense','debit',20,'pending','food',null,'2026-07-03'),
    ('x','owner','a','expense','debit',20,'reversed','food',null,'2026-07-03');
    insert into transaction_splits values('s','food',50),('s','bus',50);`);
    for (const name of ["transaction_allocations", "category_monthly_spend", "transaction_list"])
      db.exec("create view " + name + " as " + view(name));
    const cols = db
      .prepare("pragma table_info(transaction_list)")
      .all()
      .map((c) => c.name)
      .join(",");
    const filtered = functionSql("filtered_ledger").replace(/\bp_(from_date|to_date|account_id|category_id)\b/g, ":$1");
    const cte = "with filtered(" + cols + ") as (" + filtered + ") ";
    const summary = functionSql("transaction_summary").replace(/filtered_ledger\([^)]*\)/, "filtered");
    const query = (args = {}) =>
      Object.values(
        db.prepare(cte + summary).get({ from_date: null, to_date: null, account_id: null, category_id: null, ...args }),
      );
    assert.deepEqual(query({ to_date: "2026-07-01" }), [2, 0, 0, 0]);
    assert.deepEqual(query({ account_id: "b" }), [1, 0, 0, 100]);
    assert.deepEqual(query(), [4, 0, 99.99, -99.99]);
    assert.deepEqual(query({ category_id: "food", to_date: "2026-07-31" }), [1, 0, 50, -50]);
    assert.equal(
      db.prepare("select sum(refund_amount) as total from category_monthly_spend where month='2026-08-01'").get().total,
      0.01,
    );
    assert.equal(db.prepare("select count(*) as n from transaction_list").get().n, 5);
    db.exec(`update transaction_splits set amount=case when category_id='food' then 70 else 30 end;
      update transactions set status='reversed' where id='s';
      insert into transactions(id,user_id,account_id,type,direction,amount,status,category_id,linked_refund_of,date)
      values('refund2','owner','a','income','credit',0.02,'completed','income','s','2026-08-03');`);
    const refunds = db
      .prepare(
        "select category_id,round(100*refund_amount) as paise from category_monthly_spend where month='2026-08-01' order by category_id",
      )
      .all();
    assert.deepEqual(
      refunds.map((row) => [row.category_id, row.paise]),
      [
        ["bus", 1],
        ["food", 2],
      ],
    );
    assert.deepEqual(query(), [4, 0, -0.03, 0.03]);
  } finally {
    db.close();
  }
});
