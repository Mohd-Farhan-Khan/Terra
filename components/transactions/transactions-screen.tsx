"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { fetchActiveAccounts, fetchActiveCategories, fetchTransactions } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";
import type { ActiveCategory, NamedRecord, TransactionListEntry, TransactionSummary } from "@/lib/types/database";

const pageSize = 12;

function firstDayOfMonth() {
  const date = new Date();
  return localDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function today() {
  return localDateString(new Date());
}
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
function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function EntryGlyph({ type }: { type: TransactionListEntry["type"] }) {
  if (type === "income")
    return (
      <span aria-hidden className="text-terra-sage">
        ↗
      </span>
    );
  if (type === "transfer")
    return (
      <span aria-hidden className="text-terra-clay">
        ⇄
      </span>
    );
  return (
    <span aria-hidden className="text-terra-clay">
      −
    </span>
  );
}

export function TransactionsScreen() {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(0);
  const dateRangeError = Boolean(fromDate && toDate && fromDate > toDate);

  const rangeLabel = useMemo(() => {
    if (!fromDate && !toDate) return "All dates";
    if (!fromDate) return `Until ${displayDate(toDate)}`;
    if (!toDate) return `From ${displayDate(fromDate)}`;
    return `${displayDate(fromDate)} – ${displayDate(toDate)}`;
  }, [fromDate, toDate]);

  // These are the same keys used by transaction entry, so navigating between
  // the pages reuses the in-memory reference data rather than refetching it.
  const accountsQuery = useQuery<NamedRecord[]>({ queryKey: queryKeys.activeAccounts, queryFn: fetchActiveAccounts });
  const categoriesQuery = useQuery<ActiveCategory[]>({
    queryKey: queryKeys.activeCategories,
    queryFn: fetchActiveCategories,
  });
  const filters = useMemo(
    () => ({ fromDate, toDate, accountId, categoryId, page, pageSize }),
    [fromDate, toDate, accountId, categoryId, page],
  );
  const transactionsQuery = useQuery<{
    rows: TransactionListEntry[];
    count: number;
    summary: TransactionSummary | null;
  }>({
    enabled: !dateRangeError,
    placeholderData: keepPreviousData,
    queryKey: queryKeys.transactions(filters),
    queryFn: () =>
      fetchTransactions(filters) as Promise<{
        rows: TransactionListEntry[];
        count: number;
        summary: TransactionSummary | null;
      }>,
  });
  const rows = transactionsQuery.data?.rows ?? [];
  const count = transactionsQuery.data?.count ?? 0;
  const summary = transactionsQuery.data?.summary ?? null;
  const accounts = accountsQuery.data ?? [];
  const categories = (categoriesQuery.data ?? []).filter((category) => category.kind === "expense");
  const state = transactionsQuery.isPending ? "loading" : transactionsQuery.isError ? "error" : "ready";

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setAccountId("");
    setCategoryId("");
    setPage(0);
  };
  const onFilter =
    (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setter(event.target.value);
      setPage(0);
    };

  return (
    <div className="transactions-enter space-y-6">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">
            Transactions
          </h1>
          <p className="mt-3 text-sm text-terra-gray">Cleared and pending activity, excluding reversed entries.</p>
        </div>
        <Link href="/add-transaction">
          <Button className="w-full sm:w-auto">
            <span aria-hidden className="text-xl font-normal leading-none">
              +
            </span>
            Add transaction
          </Button>
        </Link>
      </header>

      <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
        <button
          aria-expanded={filtersOpen}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-7"
          onClick={() => setFiltersOpen((open) => !open)}
          type="button"
        >
          <span className="min-w-0 text-sm font-medium text-terra-ink">
            Filters{" "}
            <span className="mt-1 block truncate font-normal text-terra-gray sm:ml-2 sm:mt-0 sm:inline">
              {rangeLabel}
            </span>
          </span>
          <span className="shrink-0 text-terra-clay">{filtersOpen ? "−" : "+"}</span>
        </button>
        {filtersOpen && (
          <div className="grid gap-4 border-t border-terra-tan/65 px-5 py-5 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] sm:px-7">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-terra-gray">
                From
                <input
                  className="h-11 rounded-lg border border-terra-tan bg-terra-paper px-3 text-sm text-terra-ink outline-none focus:border-terra-clay"
                  onChange={onFilter(setFromDate)}
                  type="date"
                  value={fromDate}
                />
              </label>
              <label className="grid gap-1 text-xs text-terra-gray">
                To
                <input
                  className="h-11 rounded-lg border border-terra-tan bg-terra-paper px-3 text-sm text-terra-ink outline-none focus:border-terra-clay"
                  onChange={onFilter(setToDate)}
                  type="date"
                  value={toDate}
                />
              </label>
            </div>
            <Select
              aria-label="Filter by account"
              className="self-end"
              onChange={onFilter(setAccountId)}
              options={[
                { label: "All accounts", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: account.id })),
              ]}
              value={accountId}
            />
            <Select
              aria-label="Filter by category"
              className="self-end"
              onChange={onFilter(setCategoryId)}
              options={[
                { label: "All categories", value: "" },
                ...categories.map((category) => ({ label: category.name, value: category.id })),
              ]}
              value={categoryId}
            />
            <Button className="self-end" onClick={clearFilters} variant="secondary">
              Clear filters
            </Button>
          </div>
        )}
        {dateRangeError && (
          <p
            className="border-t border-terra-brick-line bg-terra-brick-wash px-5 py-3 text-sm text-terra-brick-deep"
            role="alert"
          >
            The start date must be on or before the end date.
          </p>
        )}
      </section>

      {summary && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-1 text-xs text-terra-gray">
          <span>
            <strong className="font-medium text-terra-ink">{summary.transaction_count}</strong> cleared entries
          </span>
          <span>
            Income <strong className="font-medium text-terra-sage">{money(summary.income_amount)}</strong>
          </span>
          <span>
            Outflow <strong className="font-medium text-terra-clay">{money(summary.outflow_amount)}</strong>
          </span>
          <span>
            Net <strong className="font-medium text-terra-ink">{money(summary.net_amount)}</strong>
          </span>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          The transaction ledger view is unavailable. Apply the latest Supabase migration, then refresh.
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead className="border-b border-terra-tan/75 bg-terra-paper-soft/50 text-sm text-terra-gray">
              <tr>
                <th className="px-7 py-4 font-medium">Date</th>
                <th className="px-5 py-4 font-medium">Account</th>
                <th className="px-5 py-4 font-medium">Category</th>
                <th className="px-5 py-4 font-medium">Note</th>
                <th className="px-7 py-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {state === "loading" ? (
                <tr>
                  <td className="px-7 py-12 text-center text-sm text-terra-gray" colSpan={5}>
                    Loading transactions…
                  </td>
                </tr>
              ) : dateRangeError ? (
                <tr>
                  <td className="px-7 py-12 text-center text-sm text-terra-gray" colSpan={5}>
                    Correct the date range to view transactions.
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr
                    className="group border-b border-terra-tan/55 transition-colors hover:bg-terra-paper-soft/50"
                    key={row.transaction_id}
                  >
                    <td className="whitespace-nowrap px-7 py-4 text-sm text-terra-ink">{displayDate(row.date)}</td>
                    <td className="px-5 py-4 text-sm text-terra-ink">{row.account_name}</td>
                    <td className="px-5 py-4 text-sm text-terra-ink">
                      <span className="mr-2 inline-block text-terra-gray">
                        <EntryGlyph type={row.type} />
                      </span>
                      {row.category_name ?? "—"}
                    </td>
                    <td className="max-w-[17rem] truncate px-5 py-4 text-sm text-terra-gray">{row.note ?? "—"}</td>
                    <td
                      className={`whitespace-nowrap px-7 py-4 text-right font-medium ${row.type === "income" ? "text-terra-sage-deep" : "text-terra-clay"}`}
                    >
                      {row.type === "income" ? "+" : "−"}
                      {money(row.amount)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-7 py-12 text-center text-sm text-terra-gray" colSpan={5}>
                    {accountId || categoryId || fromDate || toDate
                      ? "No transactions match these filters."
                      : "No transactions yet. Add your first transaction to start your ledger."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-terra-tan/60 lg:hidden">
          {state === "loading" ? (
            <p className="px-5 py-12 text-center text-sm text-terra-gray">Loading transactions…</p>
          ) : dateRangeError ? (
            <p className="px-5 py-12 text-center text-sm text-terra-gray">
              Correct the date range to view transactions.
            </p>
          ) : rows.length ? (
            rows.map((row) => (
              <article className="min-w-0 px-5 py-4" key={row.transaction_id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-terra-ink">
                      {row.note ?? row.category_name ?? "Transaction"}
                    </p>
                    <p className="mt-1 truncate text-xs text-terra-gray">
                      {displayDate(row.date)} · {row.account_name}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 whitespace-nowrap text-sm font-medium ${row.type === "income" ? "text-terra-sage-deep" : "text-terra-clay"}`}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {money(row.amount)}
                  </p>
                </div>
                <p className="mt-2 truncate text-xs text-terra-gray">{row.category_name ?? "Transfer"}</p>
              </article>
            ))
          ) : (
            <p className="px-5 py-12 text-center text-sm text-terra-gray">
              {accountId || categoryId || fromDate || toDate
                ? "No transactions match these filters."
                : "No transactions yet. Add your first transaction to start your ledger."}
            </p>
          )}
        </div>
        <footer className="flex flex-col gap-3 border-t border-terra-tan/65 px-5 py-4 text-sm text-terra-gray sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <span>
            {count
              ? `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, count)} of ${count} transactions`
              : "No transactions"}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-terra-paper-soft disabled:opacity-30"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
              type="button"
            >
              ‹
            </button>
            <span className="min-w-16 text-center text-xs">
              Page {page + 1} of {totalPages}
            </span>
            <button
              aria-label="Next page"
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-terra-paper-soft disabled:opacity-30"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              ›
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
