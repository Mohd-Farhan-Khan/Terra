// Compare the app's typed projections with the schema built from the migrations.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "terra-schema-"));
try {
  const generated = execFileSync("supabase", ["gen", "types", "typescript", "--local", "--schema", "public"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(join(dir, "actual.ts"), generated);
  const source = JSON.stringify(resolve("lib/types/supabase").replaceAll("\\", "/"));
  writeFileSync(
    join(dir, "check.ts"),
    [
      "import type {Database as App} from " + source + ";",
      'import type {Database as DB} from "./actual";',
      'type Actual = DB["public"]; type Expected = App["public"];',
      "type Missing<S,T> = Exclude<keyof S,keyof T>;",
      "type Columns<S,T> = Missing<S,T> | {[K in keyof S & keyof T]: [NonNullable<S[K]> & NonNullable<T[K]>] extends [never] ? K : never}[keyof S & keyof T];",
      'type RelationIssues<Group extends "Tables"|"Views"> = Missing<Expected[Group],Actual[Group]> | {[K in keyof Expected[Group] & keyof Actual[Group]]: Expected[Group][K] extends {Row:infer E} ? Actual[Group][K] extends {Row:infer A} ? Columns<E,A> : K : K}[keyof Expected[Group] & keyof Actual[Group]];',
      'type Output<E,A> = E extends (infer ER)[] ? A extends (infer AR)[] ? Columns<ER,AR> : "return type" : [E & A] extends [never] ? "return type" : never;',
      'type FunctionIssues = Missing<Expected["Functions"],Actual["Functions"]> | {[K in keyof Expected["Functions"] & keyof Actual["Functions"]]: Expected["Functions"][K] extends {Args:infer E,Returns:infer ER} ? Actual["Functions"][K] extends {Args:infer A,Returns:infer AR} ? Columns<E,A> | Output<ER,AR> : K : K}[keyof Expected["Functions"] & keyof Actual["Functions"]];',
      "type Check<T extends never> = T;",
      'export type ContractCheck = Check<RelationIssues<"Tables">|RelationIssues<"Views">|FunctionIssues>;',
    ].join("\n"),
  );
  execFileSync(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "es2022",
      "--moduleResolution",
      "bundler",
      "--module",
      "esnext",
      join(dir, "check.ts"),
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
