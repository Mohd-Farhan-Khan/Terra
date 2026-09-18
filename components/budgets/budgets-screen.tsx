"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProgressBar } from "@/components/ui/progress-bar";
import { createClient } from "@/lib/supabase/client";
import { fetchBudgets } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";
import { errorMessage } from "@/lib/utils/error-message";
import type { BudgetVsActualWithProgress, NamedRecord } from "@/lib/types/database";

type BudgetRow = BudgetVsActualWithProgress;
const emptyBudgetRows: BudgetRow[] = [];
const emptyCategories: NamedRecord[] = [];

function numberValue(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function localMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function moveMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return localMonth(new Date(year, monthNumber - 1 + offset, 1));
}

function displayMonth(month: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}T00:00:00`));
}

function categoryGlyph(name: string) {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes("home") || normalizedName.includes("housing")) return "⌂";
  if (normalizedName.includes("food") || normalizedName.includes("dining")) return "⌇";
  if (normalizedName.includes("transport")) return "↗";
  if (normalizedName.includes("utility")) return "⌁";
  if (normalizedName.includes("shop")) return "□";
  return "·";
}

function RolloverToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={`Rollover ${checked ? "enabled" : "disabled"}`}
      className={`relative h-7 w-12 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra-clay disabled:cursor-wait disabled:opacity-60 ${checked ? "bg-terra-sage" : "bg-terra-tan"}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-terra-paper shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

function BudgetProgress({ row }: { row: BudgetRow }) {
  const utilization = numberValue(row.utilization_percent);
  const overBudget = utilization > 100;
  return (
    <div className="flex min-w-[11.5rem] items-center gap-3">
      <span
        className={`w-10 text-right text-xs font-medium ${overBudget ? "text-terra-brick-deep" : "text-terra-gray"}`}
      >
        {row.utilization_percent === null ? "—" : `${Math.round(utilization)}%`}
      </span>
      <ProgressBar
        className="flex-1"
        tone={overBudget ? "brick" : utilization >= 80 ? "clay" : "sage"}
        value={numberValue(row.progress_percent)}
      />
    </div>
  );
}

function BudgetTable({
  categoryNames,
  onToggle,
  rows,
  savingCategoryId,
}: {
  categoryNames: Map<string, string>;
  onToggle: (row: BudgetRow, nextValue: boolean) => void;
  rows: BudgetRow[];
  savingCategoryId: string | null;
}) {
  const total = rows.reduce(
    (result, row) => ({
      planned: result.planned + numberValue(row.planned_amount),
      actual: result.actual + numberValue(row.actual_spend),
      remaining: result.remaining + numberValue(row.remaining_amount),
      available: result.available + numberValue(row.available_amount),
    }),
    { planned: 0, actual: 0, remaining: 0, available: 0 },
  );
  const totalProgress = total.available <= 0 ? 0 : (100 * total.actual) / total.available;

  return (
    <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[58rem] border-collapse text-left">
          <thead className="border-b border-terra-tan/75 bg-terra-paper-soft/50 text-[.69rem] font-semibold uppercase tracking-[.12em] text-terra-gray">
            <tr>
              <th className="px-7 py-4">Category</th>
              <th className="px-5 py-4 text-right">Planned</th>
              <th className="px-5 py-4 text-right">Actual</th>
              <th className="px-5 py-4 text-right">Remaining</th>
              <th className="px-7 py-4">Progress</th>
              <th className="px-7 py-4 text-center">Rollover</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = categoryNames.get(row.category_id) ?? "Uncategorized";
              const overBudget = numberValue(row.remaining_amount) < 0;
              return (
                <tr className="budget-row border-b border-terra-tan/55 last:border-0" key={row.category_id}>
                  <td className="px-7 py-5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-9 w-9 place-items-center rounded-lg bg-terra-paper-soft font-terra-heading text-lg text-terra-sage-deep"
                      >
                        {categoryGlyph(name)}
                      </span>
                      <span className="font-terra-heading text-lg text-terra-ink">{name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 text-right font-terra-heading text-lg text-terra-ink">
                    {money(row.planned_amount)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 text-right font-terra-heading text-lg text-terra-ink">
                    {money(row.actual_spend)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-5 text-right font-terra-heading text-lg ${overBudget ? "text-terra-brick-deep" : "text-terra-sage-deep"}`}
                  >
                    <span>{money(row.remaining_amount)}</span>
                    {numberValue(row.carry_in) !== 0 && (
                      <span className="mt-1 block font-terra-body text-[.65rem] font-medium uppercase tracking-[.08em] text-terra-gray">
                        incl. {money(row.carry_in)} carry
                      </span>
                    )}
                  </td>
                  <td className="px-7 py-5">
                    <BudgetProgress row={row} />
                  </td>
                  <td className="px-7 py-5 text-center">
                    <RolloverToggle
                      checked={row.rollover_enabled}
                      disabled={savingCategoryId === row.category_id}
                      onChange={(nextValue) => onToggle(row, nextValue)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-terra-tan bg-terra-paper-soft/45">
            <tr>
              <th className="px-7 py-5 font-terra-heading text-xl text-terra-ink">Total</th>
              <td className="px-5 py-5 text-right font-terra-heading text-lg text-terra-ink">{money(total.planned)}</td>
              <td className="px-5 py-5 text-right font-terra-heading text-lg text-terra-ink">{money(total.actual)}</td>
              <td
                className={`px-5 py-5 text-right font-terra-heading text-lg ${total.remaining < 0 ? "text-terra-brick-deep" : "text-terra-sage-deep"}`}
              >
                {money(total.remaining)}
              </td>
              <td className="px-7 py-5">
                <BudgetProgress
                  row={{
                    ...rows[0],
                    category_id: "total",
                    planned_amount: total.planned,
                    actual_spend: total.actual,
                    available_amount: total.available,
                    remaining_amount: total.remaining,
                    progress_percent: Math.min(100, Math.max(0, totalProgress)),
                    utilization_percent: totalProgress,
                  }}
                />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="divide-y divide-terra-tan/60 lg:hidden">
        {rows.map((row) => {
          const name = categoryNames.get(row.category_id) ?? "Uncategorized";
          const overBudget = numberValue(row.remaining_amount) < 0;
          return (
            <article className="budget-row px-5 py-5" key={row.category_id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 place-items-center rounded-lg bg-terra-paper-soft font-terra-heading text-lg text-terra-sage-deep"
                  >
                    {categoryGlyph(name)}
                  </span>
                  <div>
                    <h2 className="font-terra-heading text-xl leading-none text-terra-ink">{name}</h2>
                    <p className="mt-2 text-xs text-terra-gray">
                      Planned {money(row.planned_amount)} · Actual {money(row.actual_spend)}
                    </p>
                  </div>
                </div>
                <RolloverToggle
                  checked={row.rollover_enabled}
                  disabled={savingCategoryId === row.category_id}
                  onChange={(nextValue) => onToggle(row, nextValue)}
                />
              </div>
              <div className="mt-5">
                <BudgetProgress row={row} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-terra-gray">Remaining</span>
                <span className={`font-medium ${overBudget ? "text-terra-brick-deep" : "text-terra-sage-deep"}`}>
                  {money(row.remaining_amount)}
                  {numberValue(row.carry_in) !== 0 && ` · includes ${money(row.carry_in)} carry`}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BudgetsScreen() {
  const [month, setMonth] = useState(localMonth);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const budgetsQuery = useQuery<{ rows: BudgetRow[]; categories: NamedRecord[] }>({
    queryKey: queryKeys.budgets(month),
    queryFn: () => fetchBudgets(month) as Promise<{ rows: BudgetRow[]; categories: NamedRecord[] }>,
  });
  const rows = budgetsQuery.data?.rows ?? emptyBudgetRows;
  const categories = budgetsQuery.data?.categories ?? emptyCategories;
  const state = budgetsQuery.isPending ? "loading" : budgetsQuery.isError ? "error" : "ready";
  const rolloverMutation = useMutation({
    mutationFn: async ({ categoryId, rolloverEnabled }: { categoryId: string; rolloverEnabled: boolean }) => {
      const result = await createClient()
        .from("budgets")
        .update({ rollover_enabled: rolloverEnabled })
        .eq("category_id", categoryId)
        .eq("month", month);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets(month) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const isLoading = state === "loading";

  async function toggleRollover(row: BudgetRow, nextValue: boolean) {
    setMutationError(null);
    try {
      await rolloverMutation.mutateAsync({ categoryId: row.category_id, rolloverEnabled: nextValue });
    } catch (error) {
      setMutationError(errorMessage(error, "We couldn’t update this budget. Please try again."));
    }
  }

  return (
    <div className="budgets-enter space-y-7 lg:space-y-9">
      <header className="flex flex-col justify-between gap-5 border-b border-terra-tan/65 pb-6 lg:flex-row lg:items-end lg:border-0 lg:pb-0">
        <div>
          <h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">
            Budgets
          </h1>
          <p className="mt-3 text-base text-terra-gray">Plan intentionally. Spend with confidence.</p>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-terra-tan bg-terra-paper p-1.5 sm:gap-3">
          <button
            className="rounded-md px-3 py-2 text-sm text-terra-gray transition-colors hover:bg-terra-paper-soft hover:text-terra-ink"
            onClick={() => setMonth((current) => moveMonth(current, -1))}
            type="button"
          >
            <span aria-hidden className="mr-1.5">
              ‹
            </span>
            Previous
          </button>
          <p aria-live="polite" className="min-w-28 text-center font-terra-heading text-lg text-terra-ink">
            {displayMonth(month)}
          </p>
          <button
            className="rounded-md px-3 py-2 text-sm text-terra-gray transition-colors hover:bg-terra-paper-soft hover:text-terra-ink"
            onClick={() => setMonth((current) => moveMonth(current, 1))}
            type="button"
          >
            Next
            <span aria-hidden className="ml-1.5">
              ›
            </span>
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">
          Loading {displayMonth(month)} budgets…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          Budget data is unavailable. Refresh the page and try again.
        </div>
      )}
      {mutationError && (
        <div
          className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep"
          role="alert"
        >
          {mutationError}
        </div>
      )}
      {state === "ready" &&
        !isLoading &&
        (rows.length ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-terra-gray">
              <span>Actuals and carry-forward are calculated by Postgres.</span>
              <span>Rollover affects the following month’s available budget.</span>
            </div>
            <BudgetTable
              categoryNames={categoryNames}
              onToggle={toggleRollover}
              rows={rows}
              savingCategoryId={rolloverMutation.isPending ? rolloverMutation.variables.categoryId : null}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-terra-tan bg-terra-paper px-5 py-12 text-center">
            <p className="font-terra-heading text-2xl text-terra-ink">No budgets for {displayMonth(month)}</p>
            <p className="mt-2 text-sm text-terra-gray">
              Create a category budget for this month to track planned and actual spending.
            </p>
          </div>
        ))}
    </div>
  );
}
