"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fetchDashboard } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";

type Summary = {
  month: string;
  income_amount: number | string;
  expense_amount: number | string;
  net_amount: number | string;
  savings_rate_percent: number | string | null;
};

type NetWorthPoint = { date: string; net_worth: number | string };
type CategorySpend = { category_id: string; actual_spend: number | string; share_percent: number | string };
type Budget = {
  category_id: string;
  planned_amount: number | string;
  carry_in: number | string;
  available_amount: number | string;
  actual_spend: number | string;
  remaining_amount: number | string;
  progress_percent: number | string;
  utilization_percent: number | string | null;
};
type Bill = { recurring_rule_id: string; name: string; amount: number | string; next_due_date: string; days_until_due: number };
type NetWorth = { net_worth: number | string };
type CategoryName = { id: string; name: string };

type DashboardData = {
  summary: Summary | null;
  netWorth: NetWorth | null;
  trend: NetWorthPoint[];
  categories: CategorySpend[];
  budgets: Budget[];
  bills: Bill[];
  categoryNames: CategoryName[];
};

const emptyDashboard: DashboardData = {
  summary: null,
  netWorth: null,
  trend: [],
  categories: [],
  budgets: [],
  bills: [],
  categoryNames: [],
};

function numberValue(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(numberValue(value));
}

function percentage(value: number | string | null | undefined) {
  return value === null || value === undefined ? "—" : `${numberValue(value).toFixed(0)}%`;
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStart(date = new Date()) {
  return localDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function nextMonth(month: string) {
  const date = new Date(`${month}T00:00:00`);
  return localDateString(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

function displayMonth(month: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}T00:00:00`));
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`));
}

function StatIcon({ kind }: { kind: "income" | "expense" | "net" | "savings" }) {
  const glyphs = {
    income: <path d="M5 8h14a2 2 0 0 1 2 2v9H3v-9a2 2 0 0 1 2-2Zm10-3v6M12 5 9.5 7.5M12 5l2.5 2.5M7 15h.01" />,
    expense: <path d="M7 8V6a5 5 0 0 1 10 0v2m-12 0h14l1 12H4L5 8Zm5 5h4" />,
    net: <><path d="M12 3v9l6 3" /><circle cx="12" cy="12" r="9" /></>,
    savings: <><path d="M4 14c3.4-6.3 8.7-8.9 16-8-1 7.2-5.6 12.1-13 12-1.1 0-2.1-.2-3-.5" /><path d="M5 20c2.8-4.4 6.2-7.2 10.4-8.6" /></>,
  };
  return <svg aria-hidden className="h-6 w-6 fill-none stroke-current stroke-[1.6]" viewBox="0 0 24 24">{glyphs[kind]}</svg>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-terra-tan/75 bg-terra-paper p-5 shadow-[0_2px_10px_rgba(68,54,38,0.025)] sm:p-6 ${className}`}>{children}</section>;
}

function PanelTitle({ children, detail }: { children: React.ReactNode; detail?: string }) {
  return <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-terra-heading text-[1.65rem] leading-none tracking-[-0.04em] text-terra-ink">{children}</h2>{detail && <p className="mt-2 text-xs text-terra-gray">{detail}</p>}</div></div>;
}

export function DashboardScreen() {
  const currentMonth = useMemo(() => monthStart(), []);
  const dashboardQuery = useQuery<DashboardData>({
    queryKey: queryKeys.dashboard(currentMonth),
    queryFn: () => fetchDashboard(currentMonth, nextMonth(currentMonth)) as Promise<DashboardData>,
  });
  const data = dashboardQuery.data ?? emptyDashboard;
  const state = dashboardQuery.isPending ? "loading" : dashboardQuery.isError ? "error" : "ready";

  const categoryName = (id: string) => data.categoryNames.find((category) => category.id === id)?.name ?? "Uncategorized";
  const summary = data.summary;
  const hasData = Boolean(summary || data.netWorth || data.categories.length || data.budgets.length || data.bills.length);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const chartData = data.trend.map((point) => ({ ...point, label: displayDate(point.date) }));

  return (
    <div className="dashboard-enter space-y-6 lg:space-y-7">
      <header className="flex flex-col justify-between gap-5 border-b border-terra-tan/65 pb-6 lg:flex-row lg:items-end lg:border-0 lg:pb-0">
        <div>
          <p className="font-terra-heading text-[clamp(2.4rem,4.2vw,3.65rem)] leading-[.95] tracking-[-0.06em] text-terra-ink">{greeting}.</p>
          <p className="mt-3 text-base text-terra-gray">Here’s your financial overview for {displayMonth(currentMonth)}.</p>
        </div>
        <div className="flex h-11 items-center gap-3 rounded-lg border border-terra-tan bg-terra-paper px-4 text-sm text-terra-ink"><span aria-hidden>◫</span>{displayMonth(currentMonth)}</div>
      </header>

      {state === "loading" && <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">Loading your financial overview…</div>}
      {state === "error" && <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">Dashboard reports are unavailable. Apply the latest Supabase migrations, then refresh this page.</div>}

      {state === "ready" && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Income", value: money(summary?.income_amount), kind: "income" as const, tone: "text-terra-sage bg-terra-sage-wash" },
            { label: "Expenses", value: money(summary?.expense_amount), kind: "expense" as const, tone: "text-terra-clay bg-terra-clay-wash" },
            { label: "Net", value: money(summary?.net_amount), kind: "net" as const, tone: "text-terra-sage bg-terra-sage-wash" },
            { label: "Savings rate", value: percentage(summary?.savings_rate_percent), kind: "savings" as const, tone: "text-terra-sage bg-terra-sage-wash" },
          ].map((stat) => (
            <Panel className="dashboard-stagger group min-h-40" key={stat.label}>
              <div className="flex items-start justify-between"><p className="text-sm font-semibold uppercase tracking-[.09em] text-terra-sage">{stat.label}</p><span className={`grid h-14 w-14 place-items-center rounded-full ${stat.tone} transition-transform duration-300 group-hover:scale-105`}><StatIcon kind={stat.kind} /></span></div>
              <p className="mt-5 font-terra-heading text-[2.15rem] leading-none tracking-[-.05em] text-terra-ink">{stat.value}</p>
              <p className="mt-3 text-xs text-terra-gray">{summary ? `Current month · ${displayMonth(currentMonth)}` : "No data for this month"}</p>
            </Panel>
          ))}
        </div>

        {!hasData && <Panel><p className="font-terra-heading text-2xl text-terra-ink">No dashboard data yet</p><p className="mt-2 text-sm text-terra-gray">Add transactions and budgets, or run the dashboard seed fixture for your account. The reports will populate automatically from Supabase.</p></Panel>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,.85fr)]">
          <Panel className="dashboard-stagger min-h-[21rem]">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><PanelTitle detail="All eligible bank, cash, and investment accounts">Net worth</PanelTitle><p className="-mt-3 font-terra-heading text-[2rem] leading-none tracking-[-.05em] text-terra-ink">{money(data.netWorth?.net_worth)}</p></div><span className="rounded-md border border-terra-tan bg-terra-paper-soft px-3 py-1.5 text-xs text-terra-gray">This month</span></div>
            <div className="mt-6 h-52 w-full sm:h-60">
              {chartData.length ? <ResponsiveContainer height="100%" width="100%"><LineChart data={chartData} margin={{ top: 8, right: 5, bottom: 0, left: -18 }}><XAxis axisLine={false} dataKey="label" minTickGap={28} tick={{ fill: "#8c8375", fontSize: 11 }} tickLine={false} /><YAxis axisLine={false} tick={{ fill: "#8c8375", fontSize: 11 }} tickFormatter={(value) => money(value)} tickLine={false} width={64} /><Tooltip contentStyle={{ border: "1px solid #d8cfc0", borderRadius: "8px", background: "#fffdf9", color: "#2b2621" }} formatter={(value) => money(String(value))} labelStyle={{ color: "#8c8375" }} /><Line activeDot={{ r: 4, fill: "#c1673b" }} dataKey="net_worth" dot={false} stroke="#c35d30" strokeWidth={2.5} type="monotone" /></LineChart></ResponsiveContainer> : <div className="grid h-full place-items-center border-y border-dashed border-terra-tan text-sm text-terra-gray">No net-worth activity this month</div>}
            </div>
          </Panel>

          <Panel className="dashboard-stagger xl:row-span-2"><PanelTitle detail="Next 30 days">Upcoming bills</PanelTitle><div className="divide-y divide-terra-tan/65">{data.bills.length ? data.bills.map((bill) => <div className="flex items-center justify-between gap-3 py-4 first:pt-0" key={bill.recurring_rule_id}><div className="min-w-0"><p className="truncate text-sm font-medium text-terra-ink">{bill.name}</p><p className="mt-1 text-xs text-terra-gray">{bill.days_until_due === 0 ? "Due today" : `Due in ${bill.days_until_due} days`} · {displayDate(bill.next_due_date)}</p></div><p className="font-terra-heading text-lg text-terra-ink">{money(bill.amount)}</p></div>) : <p className="py-8 text-sm text-terra-gray">No recurring bills due in the next 30 days.</p>}</div><a className="mt-5 inline-flex text-sm font-medium text-terra-clay hover:text-terra-clay-deep" href="/recurring">View all recurring <span className="ml-2">→</span></a></Panel>

          <div className="grid gap-5 lg:grid-cols-2 xl:col-start-1">
            <Panel className="dashboard-stagger"><PanelTitle detail={displayMonth(currentMonth)}>Spending by category</PanelTitle><div className="space-y-4">{data.categories.length ? data.categories.map((category) => <div className="grid grid-cols-[minmax(5.4rem,.7fr)_minmax(5rem,1.35fr)_auto] items-center gap-3" key={category.category_id}><span className="truncate text-sm text-terra-ink">{categoryName(category.category_id)}</span><span className="h-1.5 overflow-hidden rounded-full bg-terra-track"><span className="block h-full rounded-full bg-terra-clay" style={{ width: `${numberValue(category.share_percent)}%` }} /></span><span className="text-right text-xs text-terra-gray">{money(category.actual_spend)}<span className="ml-1.5 hidden text-terra-muted sm:inline">{percentage(category.share_percent)}</span></span></div>) : <p className="py-5 text-sm text-terra-gray">No category spend this month.</p>}</div></Panel>
            <Panel className="dashboard-stagger"><PanelTitle detail={displayMonth(currentMonth)}>Budgets</PanelTitle><div className="space-y-4">{data.budgets.length ? data.budgets.map((budget) => <div key={budget.category_id}><div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-terra-ink">{categoryName(budget.category_id)}</span><span className="whitespace-nowrap text-xs text-terra-gray">{money(budget.actual_spend)} / {money(budget.available_amount)}</span></div><div className="mt-2 flex items-center gap-3"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-terra-track"><span className={`block h-full rounded-full ${numberValue(budget.utilization_percent) > 100 ? "bg-terra-brick" : "bg-terra-sage"}`} style={{ width: `${numberValue(budget.progress_percent)}%` }} /></span><span className="w-8 text-right text-xs text-terra-gray">{percentage(budget.utilization_percent)}</span></div></div>) : <p className="py-5 text-sm text-terra-gray">No budgets for this month.</p>}</div></Panel>
          </div>
        </div>
      </>}
    </div>
  );
}
