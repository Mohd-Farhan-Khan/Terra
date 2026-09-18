"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { fetchRecurring } from "@/lib/queries/finance";
import { invalidateTransactionData, queryKeys } from "@/lib/queries/keys";
import { errorMessage } from "@/lib/utils/error-message";
import type {
  ActiveRecurringRule,
  ConfirmedRecurringTransaction,
  NamedRecord,
  RecurringOccurrence,
} from "@/lib/types/database";

const emptyRules: ActiveRecurringRule[] = [];
const emptyCategories: NamedRecord[] = [];
const emptyConfirmedTransactions: ConfirmedRecurringTransaction[] = [];

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

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date = new Date()) {
  return localDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return localDateString(new Date(year, monthNumber, 1));
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function frequencyLabel(frequency: ActiveRecurringRule["frequency"]) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

function daysFromToday(date: string, today: string) {
  const due = new Date(`${date}T00:00:00`).getTime();
  const current = new Date(`${today}T00:00:00`).getTime();
  return Math.round((due - current) / 86_400_000);
}

function monthlyEstimate(rule: ActiveRecurringRule) {
  if (rule.frequency === "weekly") return (numberValue(rule.amount) * 52) / 12;
  if (rule.frequency === "yearly") return numberValue(rule.amount) / 12;
  return numberValue(rule.amount);
}

function CategoryMark({ name }: { name: string }) {
  const normalizedName = name.toLowerCase();
  const glyph = normalizedName.includes("internet")
    ? "⌁"
    : normalizedName.includes("phone")
      ? "▯"
      : normalizedName.includes("rent") || normalizedName.includes("housing")
        ? "⌂"
        : normalizedName.includes("electric")
          ? "ϟ"
          : normalizedName.includes("food") || normalizedName.includes("dining")
            ? "⌇"
            : "·";
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 place-items-center rounded-lg bg-terra-paper-soft font-terra-heading text-xl text-terra-sage-deep"
    >
      {glyph}
    </span>
  );
}

function Metric({
  accent = "sage",
  detail,
  label,
  value,
}: {
  accent?: "sage" | "clay";
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <section className="rounded-xl border border-terra-tan/75 bg-terra-paper p-5">
      <p className="text-sm text-terra-gray">{label}</p>
      <p className="mt-2 font-terra-heading text-[2rem] leading-none tracking-[-.05em] text-terra-ink">{value}</p>
      <p className={`mt-3 text-xs font-medium ${accent === "clay" ? "text-terra-clay" : "text-terra-sage-deep"}`}>
        {detail}
      </p>
    </section>
  );
}

export function RecurringScreen() {
  const today = useMemo(() => localDateString(), []);
  const currentMonth = useMemo(() => monthStart(), []);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const recurringQuery = useQuery<{
    rules: ActiveRecurringRule[];
    categories: NamedRecord[];
    confirmedTransactions: ConfirmedRecurringTransaction[];
  }>({
    queryKey: queryKeys.recurring(currentMonth),
    queryFn: () =>
      fetchRecurring(currentMonth, nextMonth(currentMonth)) as Promise<{
        rules: ActiveRecurringRule[];
        categories: NamedRecord[];
        confirmedTransactions: ConfirmedRecurringTransaction[];
      }>,
  });
  const rules = recurringQuery.data?.rules ?? emptyRules;
  const categories = recurringQuery.data?.categories ?? emptyCategories;
  const confirmedTransactions = recurringQuery.data?.confirmedTransactions ?? emptyConfirmedTransactions;
  const state = recurringQuery.isPending ? "loading" : recurringQuery.isError ? "error" : "ready";
  const confirmationMutation = useMutation({
    mutationFn: async (rule: ActiveRecurringRule) => {
      const result = await createClient().rpc("confirm_recurring_occurrence", {
        p_recurring_rule_id: rule.id,
        p_expected_next_due_date: rule.next_due_date,
        p_occurred_on: today,
      });
      if (result.error) throw result.error;
      return { rule, occurrence: (result.data?.[0] ?? null) as RecurringOccurrence | null };
    },
    onSuccess: async ({ rule, occurrence }) => {
      await invalidateTransactionData(queryClient);
      if (occurrence) setNotice(`${rule.name} recorded. Next due ${displayDate(occurrence.next_due_date)}.`);
    },
  });

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const dueSoonRules = rules.filter((rule) => daysFromToday(rule.next_due_date, today) <= 7);
  const dueThisMonth = rules.filter(
    (rule) => rule.next_due_date >= currentMonth && rule.next_due_date < nextMonth(currentMonth),
  );
  const paidThisMonth = confirmedTransactions.reduce(
    (total, transaction) => total + numberValue(transaction.amount),
    0,
  );

  async function confirmOccurrence(rule: ActiveRecurringRule) {
    setNotice(null);
    setMutationError(null);
    try {
      await confirmationMutation.mutateAsync(rule);
    } catch (error) {
      setMutationError(errorMessage(error, "We couldn’t confirm this recurring item. Please try again."));
    }
  }

  return (
    <div className="recurring-enter space-y-7 lg:space-y-9">
      <header className="flex flex-col justify-between gap-4 border-b border-terra-tan/65 pb-6 lg:flex-row lg:items-end lg:border-0 lg:pb-0">
        <div>
          <h1 className="font-terra-heading text-[clamp(2.5rem,4.6vw,3.8rem)] leading-none tracking-[-.06em] text-terra-ink">
            Recurring &amp; subscriptions
          </h1>
          <p className="mt-3 text-base text-terra-gray">
            Confirm payments as they occur; Terra keeps the next due date in step.
          </p>
        </div>
        <p className="rounded-lg border border-terra-tan bg-terra-paper px-4 py-2.5 text-sm text-terra-gray">
          {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(
            new Date(`${currentMonth}T00:00:00`),
          )}
        </p>
      </header>

      {state === "loading" && (
        <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">
          Loading recurring items…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          Recurring items are unavailable. Refresh the page and try again.
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
      {notice && (
        <p
          aria-live="polite"
          className="rounded-lg border border-terra-sage-line bg-terra-sage-wash px-4 py-3 text-sm text-terra-sage-deep"
        >
          {notice}
        </p>
      )}
      {state === "ready" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              detail={`${rules.length} active`}
              label="Monthly estimate"
              value={money(rules.reduce((total, rule) => total + monthlyEstimate(rule), 0))}
            />
            <Metric
              accent="clay"
              detail={`${dueSoonRules.length} within 7 days`}
              label="Due soon"
              value={money(dueSoonRules.reduce((total, rule) => total + numberValue(rule.amount), 0))}
            />
            <Metric
              detail={`${dueThisMonth.length} scheduled`}
              label="Due this month"
              value={money(dueThisMonth.reduce((total, rule) => total + numberValue(rule.amount), 0))}
            />
            <Metric
              detail={`${confirmedTransactions.length} confirmed`}
              label="Paid this month"
              value={money(paidThisMonth)}
            />
          </div>
          {!rules.length ? (
            <div className="rounded-xl border border-dashed border-terra-tan bg-terra-paper px-5 py-12 text-center">
              <p className="font-terra-heading text-2xl text-terra-ink">No active recurring items</p>
              <p className="mt-2 text-sm text-terra-gray">Add a recurring rule to track its schedule here.</p>
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[55rem] border-collapse text-left">
                  <thead className="border-b border-terra-tan/75 bg-terra-paper-soft/50 text-[.69rem] font-semibold uppercase tracking-[.12em] text-terra-gray">
                    <tr>
                      <th className="px-7 py-4">Name</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                      <th className="px-5 py-4">Frequency</th>
                      <th className="px-5 py-4">Next due date</th>
                      <th className="px-7 py-4 text-right">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => {
                      const daysAway = daysFromToday(rule.next_due_date, today);
                      const dueSoon = daysAway <= 7;
                      const categoryName = categoryNames.get(rule.category_id) ?? "Uncategorized";
                      return (
                        <tr
                          className={`recurring-row border-b border-terra-tan/55 last:border-0 ${dueSoon ? "bg-terra-clay-wash/45" : ""}`}
                          key={rule.id}
                        >
                          <td className="px-7 py-4">
                            <div className="flex items-center gap-3">
                              <CategoryMark name={categoryName} />
                              <div>
                                <p className="text-sm font-medium text-terra-ink">{rule.name}</p>
                                <p className="mt-1 text-xs text-terra-gray">{categoryName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-terra-heading text-lg text-terra-ink">
                            {money(rule.amount)}
                          </td>
                          <td className="px-5 py-4 text-sm text-terra-gray">{frequencyLabel(rule.frequency)}</td>
                          <td className="px-5 py-4">
                            <p className="text-sm text-terra-ink">{displayDate(rule.next_due_date)}</p>
                            {dueSoon && (
                              <p className="mt-1 text-xs font-medium text-terra-clay">
                                {daysAway < 0
                                  ? `${Math.abs(daysAway)} days overdue`
                                  : daysAway === 0
                                    ? "Due today"
                                    : `Due in ${daysAway} days`}
                              </p>
                            )}
                          </td>
                          <td className="px-7 py-4 text-right">
                            <Button
                              disabled={confirmationMutation.isPending}
                              onClick={() => confirmOccurrence(rule)}
                              size="sm"
                              variant={dueSoon ? "primary" : "secondary"}
                            >
                              {confirmationMutation.variables?.id === rule.id ? "Recording…" : "Confirm occurred"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-terra-tan/60 lg:hidden">
                {rules.map((rule) => {
                  const daysAway = daysFromToday(rule.next_due_date, today);
                  const dueSoon = daysAway <= 7;
                  const categoryName = categoryNames.get(rule.category_id) ?? "Uncategorized";
                  return (
                    <article
                      className={`recurring-row px-5 py-5 ${dueSoon ? "bg-terra-clay-wash/45" : ""}`}
                      key={rule.id}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <CategoryMark name={categoryName} />
                          <div className="min-w-0">
                            <h2 className="truncate text-sm font-medium text-terra-ink">{rule.name}</h2>
                            <p className="mt-1 text-xs text-terra-gray">
                              {categoryName} · {frequencyLabel(rule.frequency)}
                            </p>
                          </div>
                        </div>
                        <p className="whitespace-nowrap font-terra-heading text-lg text-terra-ink">
                          {money(rule.amount)}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-terra-gray">Next due</p>
                          <p className="mt-1 text-sm text-terra-ink">{displayDate(rule.next_due_date)}</p>
                          {dueSoon && (
                            <p className="mt-1 text-xs font-medium text-terra-clay">
                              {daysAway < 0
                                ? `${Math.abs(daysAway)} days overdue`
                                : daysAway === 0
                                  ? "Due today"
                                  : `Due in ${daysAway} days`}
                            </p>
                          )}
                        </div>
                        <Button
                          disabled={confirmationMutation.isPending}
                          onClick={() => confirmOccurrence(rule)}
                          size="sm"
                          variant={dueSoon ? "primary" : "secondary"}
                        >
                          {confirmationMutation.variables?.id === rule.id ? "Recording…" : "Confirm"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
