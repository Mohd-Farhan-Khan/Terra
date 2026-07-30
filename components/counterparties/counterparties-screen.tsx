"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SlideOverPanel } from "@/components/ui/slide-over-panel";
import { fetchCounterparties, fetchCounterpartyStatement } from "@/lib/queries/finance";
import { queryKeys } from "@/lib/queries/keys";

type Relationship = "parent" | "friend" | "other";
type AccountType = "receivable" | "payable";

type Counterparty = { id: string; name: string; relationship_tag: Relationship; linked_account_id: string };
type DisplayCounterparty = Counterparty & { account_type: AccountType; balance: number | string };
type AccountTransaction = { id: string; amount: number | string; direction: "debit" | "credit"; type: "income" | "expense" | "transfer"; date: string; note: string | null; created_at: string };
const emptyCounterparties: DisplayCounterparty[] = [];

const relationshipOrder: Relationship[] = ["parent", "friend", "other"];

function numberValue(value: number | string | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue(value));
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function relationshipLabel(relationship: Relationship) {
  return { parent: "Parent", friend: "Friend", other: "Other" }[relationship];
}

function balanceCopy(value: number | string) {
  const balance = numberValue(value);
  if (balance > 0) return { label: "Owes you", tone: "text-terra-sage-deep" };
  if (balance < 0) return { label: "You owe", tone: "text-terra-clay" };
  return { label: "Settled", tone: "text-terra-gray" };
}

function signedAmount(transaction: AccountTransaction) {
  return transaction.direction === "credit" ? numberValue(transaction.amount) : -numberValue(transaction.amount);
}

function statementDescription(transaction: AccountTransaction, accountType: AccountType) {
  if (transaction.note) return transaction.note;
  if (transaction.type !== "transfer") return transaction.type === "income" ? "Credit" : "Expense";
  if (accountType === "receivable") return transaction.direction === "credit" ? "Loan given" : "Repayment received";
  return transaction.direction === "debit" ? "Borrowing received" : "Repayment made";
}

function buildStatement(transactions: AccountTransaction[]) {
  const chronological = [...transactions].sort((left, right) => `${left.date}-${left.created_at}`.localeCompare(`${right.date}-${right.created_at}`));
  let runningBalance = 0;
  return chronological.map((transaction) => {
    runningBalance += signedAmount(transaction);
    return { ...transaction, runningBalance };
  }).reverse();
}

function Avatar({ name, relationship }: { name: string; relationship: Relationship }) {
  const tone = relationship === "other" ? "bg-terra-clay-wash text-terra-clay" : "bg-terra-sage-wash text-terra-sage-deep";
  return <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-medium ${tone}`}>{name.trim().charAt(0).toUpperCase()}</span>;
}

function CounterpartyRow({ counterparty, onSelect }: { counterparty: DisplayCounterparty; onSelect: (counterparty: DisplayCounterparty) => void }) {
  const balance = numberValue(counterparty.balance);
  const copy = balanceCopy(balance);
  return <button className="counterparty-row flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6" onClick={() => onSelect(counterparty)} type="button"><span className="flex min-w-0 items-center gap-3"><Avatar name={counterparty.name} relationship={counterparty.relationship_tag} /><span className="truncate text-sm font-medium text-terra-ink">{counterparty.name}</span></span><span className="flex items-center gap-3 sm:gap-5"><span className={`whitespace-nowrap text-sm font-medium ${copy.tone}`}><span className="hidden sm:inline">{copy.label} </span>{money(Math.abs(balance))}</span><span aria-hidden className="text-xl leading-none text-terra-gray">›</span></span></button>;
}

export function CounterpartiesScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DisplayCounterparty | null>(null);
  const counterpartiesQuery = useQuery<DisplayCounterparty[]>({ queryKey: queryKeys.counterparties, queryFn: () => fetchCounterparties() as Promise<DisplayCounterparty[]> });
  const counterparties = counterpartiesQuery.data ?? emptyCounterparties;
  const state = counterpartiesQuery.isPending ? "loading" : counterpartiesQuery.isError ? "error" : "ready";
  const statementQuery = useQuery<AccountTransaction[]>({ queryKey: queryKeys.counterpartyStatement(selected?.linked_account_id ?? ""), queryFn: () => fetchCounterpartyStatement(selected!.linked_account_id) as Promise<AccountTransaction[]>, enabled: Boolean(selected) });
  const statement = selected ? buildStatement(statementQuery.data ?? []) : [];
  const statementState = !selected ? "idle" : statementQuery.isPending ? "loading" : statementQuery.isError ? "error" : "ready";

  const filteredCounterparties = useMemo(() => counterparties.filter((counterparty) => counterparty.name.toLowerCase().includes(search.trim().toLowerCase())), [counterparties, search]);

  async function openStatement(counterparty: DisplayCounterparty) {
    setSelected(counterparty);
  }

  return <div className="counterparties-enter space-y-7 lg:space-y-8">
    <header className="flex flex-col gap-4 border-b border-terra-tan/65 pb-6 lg:flex-row lg:items-end lg:justify-between lg:border-0 lg:pb-0"><div><h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">Counterparties</h1><p className="mt-3 text-base text-terra-gray">People you have money owed to you, or owe money to.</p></div><p className="text-sm text-terra-gray">{counterparties.length} people</p></header>
    {state === "loading" && <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">Loading counterparties…</div>}
    {state === "error" && <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">Counterparty balances are unavailable. Apply the latest Supabase migrations, then refresh.</div>}
    {state === "ready" && <>
      <label className="block max-w-xl"><span className="sr-only">Search people</span><span className="flex h-12 items-center gap-3 rounded-lg border border-terra-tan bg-terra-paper px-4 text-terra-gray"><span aria-hidden className="text-lg">⌕</span><input className="min-w-0 flex-1 bg-transparent text-sm text-terra-ink outline-none placeholder:text-terra-muted" onChange={(event) => setSearch(event.target.value)} placeholder="Search people…" value={search} /></span></label>
      {!filteredCounterparties.length ? <div className="rounded-xl border border-dashed border-terra-tan bg-terra-paper px-5 py-12 text-center"><p className="font-terra-heading text-2xl text-terra-ink">{counterparties.length ? "No people match your search" : "No counterparties yet"}</p><p className="mt-2 text-sm text-terra-gray">Linked receivable and payable accounts will appear here.</p></div> : <div className="space-y-5">{relationshipOrder.map((relationship) => { const group = filteredCounterparties.filter((counterparty) => counterparty.relationship_tag === relationship); if (!group.length) return null; const groupBalance = group.reduce((total, counterparty) => total + numberValue(counterparty.balance), 0); const copy = balanceCopy(groupBalance); return <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper" key={relationship}><header className="flex items-center justify-between gap-4 border-b border-terra-tan/60 bg-terra-paper-soft/40 px-5 py-3 sm:px-6"><h2 className="text-[.7rem] font-semibold uppercase tracking-[.13em] text-terra-gray">{relationshipLabel(relationship)} <span className="ml-1 rounded-full bg-terra-track px-2 py-1 text-[.62rem] text-terra-gray">{group.length}</span></h2><p className={`text-xs font-semibold uppercase tracking-[.08em] ${copy.tone}`}>{copy.label} {money(Math.abs(groupBalance))}</p></header><div className="divide-y divide-terra-tan/55">{group.map((counterparty) => <CounterpartyRow counterparty={counterparty} key={counterparty.id} onSelect={openStatement} />)}</div></section>; })}</div>}
    </>}
    <SlideOverPanel description={selected ? `${relationshipLabel(selected.relationship_tag)} · ${selected.account_type === "receivable" ? "Receivable" : "Payable"} account` : undefined} onClose={() => setSelected(null)} open={Boolean(selected)} title={selected?.name ?? "Counterparty"}>
      {selected && <><div className="rounded-xl bg-terra-paper-soft p-5"><p className="text-xs font-semibold uppercase tracking-[.12em] text-terra-gray">Current balance</p><p className="mt-3 font-terra-heading text-[2.65rem] leading-none tracking-[-.06em] text-terra-ink">{money(Math.abs(numberValue(selected.balance)))}</p><p className={`mt-2 text-sm font-medium ${balanceCopy(selected.balance).tone}`}>{balanceCopy(selected.balance).label}</p></div><div className="mt-8"><div className="flex items-baseline justify-between"><h3 className="font-terra-heading text-2xl text-terra-ink">Mini statement</h3><p className="text-xs text-terra-gray">Running balance</p></div>{statementState === "loading" && <p className="py-10 text-center text-sm text-terra-gray">Loading transaction history…</p>}{statementState === "error" && <p className="mt-4 rounded-lg border border-terra-brick-line bg-terra-brick-wash px-4 py-3 text-sm text-terra-brick-deep">This statement could not be loaded.</p>}{statementState === "ready" && (statement.length ? <div className="mt-4 divide-y divide-terra-tan/60">{statement.map((transaction) => { const amount = signedAmount(transaction); return <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-4" key={transaction.id}><div><p className="text-sm font-medium text-terra-ink">{statementDescription(transaction, selected.account_type)}</p><p className="mt-1 text-xs text-terra-gray">{displayDate(transaction.date)}</p></div><div className="text-right"><p className={`text-sm font-medium ${amount >= 0 ? "text-terra-sage-deep" : "text-terra-clay"}`}>{amount >= 0 ? "+" : "−"}{money(Math.abs(amount))}</p><p className="mt-1 text-xs text-terra-gray">{money(transaction.runningBalance)}</p></div></div>; })}</div> : <p className="py-10 text-center text-sm text-terra-gray">No completed transactions yet.</p>)}</div></>}
    </SlideOverPanel>
  </div>;
}
