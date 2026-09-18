"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { fetchAccountOverview } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";
import type { AccountActivity, AccountBalance, AccountType } from "@/lib/types/database";

type SparkPoint = { value: number };

const ownedAccountTypes: AccountType[] = ["bank", "cash", "investment"];
const emptyAccounts: AccountBalance[] = [];
const emptyTransactions: AccountActivity[] = [];

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

function typeLabel(type: AccountType) {
  return {
    bank: "Bank account",
    cash: "Cash account",
    investment: "Investment account",
    receivable: "Receivable",
    payable: "Payable",
  }[type];
}

function AccountIcon({ type }: { type: AccountType }) {
  const glyph = {
    bank: (
      <>
        <path d="M3 10 12 4l9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 20h18" />
        <path d="M2 22h20" />
      </>
    ),
    cash: (
      <>
        <rect height="14" rx="2.5" width="18" x="3" y="6" />
        <path d="M16 13h2.5M7 6V4h10v2" />
      </>
    ),
    investment: (
      <>
        <path d="M5 19c3.7-8.6 8.7-12.6 15-14-1.3 7.2-5.5 12.6-12.5 13.5A12 12 0 0 1 5 19Z" />
        <path d="M4 21c3.2-4.5 7.3-8.1 12.4-10.7" />
      </>
    ),
    receivable: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h5a5.5 5.5 0 0 1 5.5 5.5V21" />
      </>
    ),
    payable: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h5a5.5 5.5 0 0 1 5.5 5.5V21" />
        <path d="m16.5 17 2.5 2.5 2.5-2.5" />
      </>
    ),
  }[type];

  return (
    <svg aria-hidden className="h-7 w-7 fill-none stroke-current stroke-[1.55]" viewBox="0 0 24 24">
      {glyph}
    </svg>
  );
}

function buildSparkline(balance: number | string, transactions: AccountActivity[]) {
  const finalBalance = numberValue(balance);
  const ordered = [...transactions].sort((left, right) =>
    `${left.date}-${left.created_at}`.localeCompare(`${right.date}-${right.created_at}`),
  );
  const openingBalance = ordered.reduce(
    (total, transaction) =>
      total - (transaction.direction === "credit" ? numberValue(transaction.amount) : -numberValue(transaction.amount)),
    finalBalance,
  );

  let runningBalance = openingBalance;
  const points = [{ value: runningBalance }];
  ordered.forEach((transaction) => {
    runningBalance +=
      transaction.direction === "credit" ? numberValue(transaction.amount) : -numberValue(transaction.amount);
    points.push({ value: runningBalance });
  });

  const recentPoints = points.slice(-9);
  if (recentPoints.length === 1) recentPoints.push({ value: finalBalance });
  recentPoints[recentPoints.length - 1] = { value: finalBalance };
  return recentPoints;
}

function Sparkline({ points }: { points: SparkPoint[] }) {
  return (
    <div aria-label="Recent account activity" className="h-20 w-full" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={points} margin={{ top: 5, right: 1, bottom: 2, left: 1 }}>
          <defs>
            <linearGradient id="account-sparkline" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c1673b" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#c1673b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="value"
            fill="url(#account-sparkline)"
            isAnimationActive={false}
            stroke="#c1673b"
            strokeWidth={2.15}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AccountCard({ account, points }: { account: AccountBalance; points: SparkPoint[] }) {
  const isCounterparty = account.account_type === "receivable" || account.account_type === "payable";

  return (
    <article className="account-card group rounded-xl border border-terra-tan/75 bg-terra-paper p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-terra-sage-wash text-terra-sage-deep">
            <AccountIcon type={account.account_type} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-terra-heading text-[1.8rem] leading-none tracking-[-.045em] text-terra-ink">
              {account.account_name}
            </h2>
            <p className="mt-2 text-sm text-terra-gray">{typeLabel(account.account_type)}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[.67rem] font-semibold uppercase tracking-[.12em] ${isCounterparty ? "bg-terra-clay-wash text-terra-clay-deep" : "bg-terra-sage-wash text-terra-sage-deep"}`}
        >
          {account.account_type}
        </span>
      </div>
      <p className="mt-8 font-terra-heading text-[clamp(2.45rem,4vw,3.2rem)] leading-none tracking-[-.06em] text-terra-ink">
        {money(account.balance)}
      </p>
      <div className="mt-5 border-t border-terra-tan/55 pt-3">
        <p className="text-[.69rem] font-semibold uppercase tracking-[.12em] text-terra-gray">Recent activity</p>
        <Sparkline points={points} />
      </div>
    </article>
  );
}

function AccountGroup({
  accounts,
  title,
  description,
  sparklineByAccount,
}: {
  accounts: AccountBalance[];
  title: string;
  description: string;
  sparklineByAccount: Map<string, SparkPoint[]>;
}) {
  if (!accounts.length) return null;

  return (
    <section>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-terra-heading text-[1.7rem] leading-none tracking-[-.04em] text-terra-ink">{title}</h2>
        <p className="text-sm text-terra-gray">{description}</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard
            account={account}
            key={account.account_id}
            points={
              sparklineByAccount.get(account.account_id) ?? [
                { value: numberValue(account.balance) },
                { value: numberValue(account.balance) },
              ]
            }
          />
        ))}
      </div>
    </section>
  );
}

export function AccountsScreen() {
  const overviewQuery = useQuery<{ accounts: AccountBalance[]; transactions: AccountActivity[] }>({
    queryKey: queryKeys.accountOverview,
    queryFn: () => fetchAccountOverview() as Promise<{ accounts: AccountBalance[]; transactions: AccountActivity[] }>,
  });
  const accounts = overviewQuery.data?.accounts ?? emptyAccounts;
  const transactions = overviewQuery.data?.transactions ?? emptyTransactions;
  const state = overviewQuery.isPending ? "loading" : overviewQuery.isError ? "error" : "ready";

  const sparklineByAccount = useMemo(() => {
    const transactionMap = new Map<string, AccountActivity[]>();
    transactions.forEach((transaction) => {
      const activity = transactionMap.get(transaction.account_id) ?? [];
      activity.push(transaction);
      transactionMap.set(transaction.account_id, activity);
    });
    return new Map(
      accounts.map((account) => [
        account.account_id,
        buildSparkline(account.balance, transactionMap.get(account.account_id) ?? []),
      ]),
    );
  }, [accounts, transactions]);

  const personalAccounts = accounts.filter((account) => ownedAccountTypes.includes(account.account_type));
  const receivables = accounts.filter((account) => account.account_type === "receivable");
  const payables = accounts.filter((account) => account.account_type === "payable");

  return (
    <div className="accounts-enter space-y-9 lg:space-y-11">
      <header className="flex flex-col gap-4 border-b border-terra-tan/65 pb-6 sm:flex-row sm:items-end sm:justify-between lg:border-0 lg:pb-0">
        <div>
          <h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">
            Accounts
          </h1>
          <p className="mt-3 text-base text-terra-gray">Every place your money sits, at a glance.</p>
        </div>
        <p className="rounded-lg border border-terra-tan bg-terra-paper px-4 py-2.5 text-sm text-terra-gray">
          Balances update from completed activity
        </p>
      </header>

      {state === "loading" && (
        <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">
          Loading your accounts…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          Account balances are unavailable. Apply the latest Supabase migrations, then refresh this page.
        </div>
      )}
      {state === "ready" && (
        <>
          {!accounts.length ? (
            <div className="rounded-xl border border-dashed border-terra-tan bg-terra-paper px-5 py-12 text-center">
              <p className="font-terra-heading text-2xl text-terra-ink">No accounts yet</p>
              <p className="mt-2 text-sm text-terra-gray">
                Add an account to start seeing its balance and activity here.
              </p>
            </div>
          ) : (
            <>
              <AccountGroup
                accounts={personalAccounts}
                description="Bank, cash, and investments"
                sparklineByAccount={sparklineByAccount}
                title="Your accounts"
              />
              <AccountGroup
                accounts={receivables}
                description="Money others owe you"
                sparklineByAccount={sparklineByAccount}
                title="Owed to you"
              />
              <AccountGroup
                accounts={payables}
                description="Money you owe others"
                sparklineByAccount={sparklineByAccount}
                title="You owe"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
