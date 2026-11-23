import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { returnPath } from "../lib/utils/return-path.ts";

const require = createRequire(import.meta.url);
const next = require("next/server");
const compiled = ts.transpileModule(readFileSync(new URL("../proxy.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function request(path, user, error = null) {
  const context = {
    exports: {},
    URL,
    Headers,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture" } },
    require(name) {
      if (name === "next/server") return next;
      if (name === "@/lib/utils/return-path") return { returnPath };
      if (name !== "@supabase/ssr") throw new Error(name);
      return {
        createServerClient(_url, _key, { cookies }) {
          return {
            auth: {
              async getUser() {
                cookies.setAll([{ name: "test-refresh", value: "refreshed", options: { path: "/" } }], {
                  "Cache-Control": "private, no-store",
                });
                return { data: { user }, error };
              },
            },
          };
        },
      };
    },
  };
  runInNewContext(compiled, context);
  return context.exports.proxy(new next.NextRequest("http://localhost:3000" + path));
}
test("session refresh survives an authenticated redirect with query parameters", async () => {
  const r = await request("/login?next=%2Ftransactions%3Fview%3Dmonth", { id: "owner" });
  assert.equal(r.headers.get("location"), "http://localhost:3000/transactions?view=month");
  assert.equal(r.cookies.get("test-refresh")?.value, "refreshed");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});
test("a protected deep link survives login and pass-through keeps auth headers", async () => {
  const redirect = await request("/budgets?month=2026-11", null);
  assert.equal(new URL(redirect.headers.get("location")).searchParams.get("next"), "/budgets?month=2026-11");
  assert.ok(redirect.cookies.has("test-refresh"));
  const response = await request("/budgets", { id: "owner" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("an unavailable auth service preserves the return path and reports the outage", async () => {
  const response = await request("/accounts", null, { name: "AuthRetryableFetchError" });
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("next"), "/accounts");
  assert.equal(location.searchParams.get("service"), "unavailable");
});
