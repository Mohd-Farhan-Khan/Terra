"use client";

import { useQuery } from "@tanstack/react-query";

import { ProgressBar } from "@/components/ui/progress-bar";
import { fetchGoals } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";
import type { GoalWithBalance } from "@/lib/types/database";

const emptyGoals: GoalWithBalance[] = [];

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

function progressPercent(goal: GoalWithBalance) {
  const target = numberValue(goal.target_amount);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (100 * numberValue(goal.balance)) / target));
}

function displayDate(date: string | null) {
  if (!date) return "No target date";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function GoalIcon({ name }: { name: string }) {
  const normalizedName = name.toLowerCase();
  const glyph =
    normalizedName.includes("home") || normalizedName.includes("house")
      ? "⌂"
      : normalizedName.includes("car")
        ? "▱"
        : normalizedName.includes("travel") || normalizedName.includes("vacation")
          ? "✈"
          : normalizedName.includes("education")
            ? "⌁"
            : normalizedName.includes("retire") || normalizedName.includes("invest")
              ? "⌇"
              : "✦";
  return (
    <span
      aria-hidden
      className="grid h-16 w-16 place-items-center rounded-full bg-terra-sage-wash font-terra-heading text-3xl text-terra-sage-deep"
    >
      {glyph}
    </span>
  );
}

function GoalCard({ goal }: { goal: GoalWithBalance }) {
  const progress = progressPercent(goal);
  return (
    <article className="goal-card overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <GoalIcon name={goal.name} />
          <div className="min-w-0">
            <h2 className="font-terra-heading text-[1.8rem] leading-none tracking-[-.045em] text-terra-ink">
              {goal.name}
            </h2>
            <p className="mt-2 font-terra-heading text-xl text-terra-ink">{money(goal.target_amount)}</p>
          </div>
        </div>
        <div className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-terra-heading text-[1.85rem] leading-none text-terra-sage-deep">
              {Math.round(progress)}%
            </p>
            <p className="text-right text-sm text-terra-gray">
              <span className="font-medium text-terra-ink">{money(goal.balance)}</span> of {money(goal.target_amount)}
            </p>
          </div>
          <ProgressBar className="mt-5" tone="clay" value={progress} />
        </div>
      </div>
      <footer className="flex items-center gap-3 border-t border-terra-tan/60 px-6 py-4 text-sm text-terra-gray">
        <span aria-hidden className="text-lg">
          ▣
        </span>
        <span>Target date: {displayDate(goal.target_date)}</span>
      </footer>
    </article>
  );
}

export function GoalsScreen() {
  const goalsQuery = useQuery<GoalWithBalance[]>({
    queryKey: queryKeys.goals,
    queryFn: () => fetchGoals() as Promise<GoalWithBalance[]>,
  });
  const goals = goalsQuery.data ?? emptyGoals;
  const state = goalsQuery.isPending ? "loading" : goalsQuery.isError ? "error" : "ready";

  return (
    <div className="goals-enter space-y-7 lg:space-y-9">
      <header className="flex flex-col gap-3 border-b border-terra-tan/65 pb-6 lg:border-0 lg:pb-0">
        <h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">
          Your goals
        </h1>
        <p className="text-base text-terra-gray">Track progress toward what matters most.</p>
      </header>
      {state === "loading" && (
        <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">
          Loading goals…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          Goal progress is unavailable. Apply the latest Supabase migrations, then refresh.
        </div>
      )}
      {state === "ready" &&
        (goals.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {goals.map((goal) => (
              <GoalCard goal={goal} key={goal.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-terra-tan bg-terra-paper px-5 py-12 text-center">
            <p className="font-terra-heading text-2xl text-terra-ink">No goals yet</p>
            <p className="mt-2 text-sm text-terra-gray">
              Create a goal with a linked account to track its current balance here.
            </p>
          </div>
        ))}
    </div>
  );
}
