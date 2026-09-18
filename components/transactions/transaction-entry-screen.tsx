"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SlideOverPanel } from "@/components/ui/slide-over-panel";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { fetchActiveAccounts, fetchActiveCategories } from "@/lib/queries/finance";
import { invalidateTransactionData, queryKeys } from "@/lib/queries/keys";
import { errorMessage } from "@/lib/utils/error-message";
import type { ActiveCategory, NamedRecord, TransactionType } from "@/lib/types/database";

type EntryType = TransactionType;
type Split = { categoryId: string; amount: string };
const entryTypes: EntryType[] = ["income", "expense", "transfer"];

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputClassName() {
  return "h-12 w-full rounded-lg border border-terra-tan bg-terra-paper px-3.5 text-sm text-terra-ink outline-none transition-colors placeholder:text-terra-muted focus:border-terra-clay focus:ring-2 focus:ring-terra-clay/15";
}

export function TransactionEntryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [type, setType] = useState<EntryType>("expense");
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [splits, setSplits] = useState<Split[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const accountsQuery = useQuery<NamedRecord[]>({ queryKey: queryKeys.activeAccounts, queryFn: fetchActiveAccounts });
  const categoriesQuery = useQuery<ActiveCategory[]>({
    queryKey: queryKeys.activeCategories,
    queryFn: fetchActiveCategories,
  });
  const accounts = accountsQuery.data ?? [];
  const incomeCategories = (categoriesQuery.data ?? []).filter((category) => category.kind === "income");
  const expenseCategories = (categoriesQuery.data ?? []).filter((category) => category.kind === "expense");

  const availableCategories = type === "income" ? incomeCategories : expenseCategories;
  const splitTotal = splits.reduce((total, split) => total + Number(split.amount || 0), 0);
  const numericAmount = Number(amount);
  const hasSplitMismatch = splits.length > 0 && numericAmount > 0 && Math.abs(splitTotal - numericAmount) > 0.001;

  const transactionMutation = useMutation({
    mutationFn: async () => {
      const client = createClient();
      if (type === "transfer") {
        const { error: transferError } = await client.rpc("create_transfer", {
          p_from_account_id: accountId,
          p_to_account_id: destinationAccountId,
          p_amount: numericAmount,
          p_date: date,
          p_note: note || null,
        });
        if (transferError) throw transferError;
      } else if (type === "expense" && splits.length) {
        const { error: splitError } = await client.rpc("create_expense_with_splits", {
          p_account_id: accountId,
          p_amount: numericAmount,
          p_date: date,
          p_note: note || null,
          p_splits: splits.map((split) => ({ category_id: split.categoryId, amount: Number(split.amount) })),
        });
        if (splitError) throw splitError;
      } else {
        const { data: authData, error: authError } = await client.auth.getUser();
        if (authError || !authData.user) throw new Error("Your session has ended.");
        const { error: insertError } = await client.from("transactions").insert({
          user_id: authData.user.id,
          account_id: accountId,
          type,
          category_id: categoryId,
          amount: numericAmount,
          direction: type === "income" ? "credit" : "debit",
          date,
          note: note || null,
        });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => invalidateTransactionData(queryClient),
  });

  function chooseType(nextType: EntryType) {
    setType(nextType);
    setCategoryId("");
    setSplits([]);
    setError(null);
    setFieldErrors({});
  }

  function handleTypeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? entryTypes.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + entryTypes.length) % entryTypes.length;
    chooseType(entryTypes[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  function addSplit() {
    setSplits((current) =>
      current.length
        ? [...current, { categoryId: "", amount: "" }]
        : [
            { categoryId, amount: "" },
            { categoryId: "", amount: "" },
          ],
    );
    setCategoryId("");
  }

  function changeSplit(index: number, key: keyof Split, value: string) {
    setSplits((current) =>
      current.map((split, splitIndex) => (splitIndex === index ? { ...split, [key]: value } : split)),
    );
  }

  function removeSplit(index: number) {
    setSplits((current) => current.filter((_, splitIndex) => splitIndex !== index));
  }

  function closePanel() {
    if (!panelOpen) return;
    setPanelOpen(false);
    window.setTimeout(() => router.back(), 220);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors: Record<string, string> = {};
    if (!accountId) nextErrors.account = "Choose the account this transaction belongs to.";
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0)
      nextErrors.amount = "Enter an amount greater than ₹0.00.";
    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime()))
      nextErrors.date = "Choose a valid transaction date.";
    if (type === "transfer" && !destinationAccountId)
      nextErrors.destination = "Choose the account receiving this transfer.";
    if (type === "transfer" && destinationAccountId === accountId)
      nextErrors.destination = "The destination must be different from the source account.";
    if (type !== "transfer" && !splits.length && !categoryId)
      nextErrors.category = "Choose a category for this transaction.";
    if (
      splits.length &&
      (splits.length < 2 ||
        splits.some(
          (split) => !split.categoryId || !Number.isFinite(Number(split.amount)) || Number(split.amount) <= 0,
        ) ||
        hasSplitMismatch)
    )
      nextErrors.splits = "Add at least two complete splits that total exactly to the amount.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Review the highlighted fields and try again.");
      return;
    }

    try {
      await transactionMutation.mutateAsync();
      router.replace("/transactions");
    } catch (submitError) {
      setError(errorMessage(submitError, "We could not save this transaction. Please try again."));
    }
  }

  return (
    <SlideOverPanel onClose={closePanel} open={panelOpen} title="Add transaction">
      <form className="space-y-6 pb-4" onSubmit={submit}>
        <div
          aria-label="Transaction type"
          className="grid grid-cols-3 overflow-hidden rounded-lg border border-terra-tan"
          role="tablist"
        >
          {entryTypes.map((entryType, index) => (
            <button
              aria-selected={type === entryType}
              className={`h-14 border-r border-terra-tan text-base font-medium last:border-r-0 ${type === entryType ? (entryType === "expense" ? "bg-terra-clay-wash text-terra-clay" : "bg-terra-sage-wash text-terra-sage-deep") : "text-terra-ink hover:bg-terra-paper-soft"}`}
              key={entryType}
              onClick={() => chooseType(entryType)}
              onKeyDown={(event) => handleTypeKeyDown(event, index)}
              role="tab"
              tabIndex={type === entryType ? 0 : -1}
              type="button"
            >
              {entryType === "income" ? "↓ Income" : entryType === "expense" ? "↑ Expense" : "↔ Transfer"}
            </button>
          ))}
        </div>

        {type === "transfer" ? (
          <div className="grid gap-5">
            <Select
              label="From account"
              onChange={(event) => {
                setAccountId(event.target.value);
                setFieldErrors((current) => ({ ...current, account: "" }));
              }}
              options={[
                { label: "Select source account", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: account.id })),
              ]}
              value={accountId}
            />
            {fieldErrors.account && (
              <p className="-mt-3 text-xs text-terra-brick" role="alert">
                {fieldErrors.account}
              </p>
            )}
            <Select
              label="To account"
              onChange={(event) => {
                setDestinationAccountId(event.target.value);
                setFieldErrors((current) => ({ ...current, destination: "" }));
              }}
              options={[
                { label: "Select destination account", value: "" },
                ...accounts
                  .filter((account) => account.id !== accountId)
                  .map((account) => ({ label: account.name, value: account.id })),
              ]}
              value={destinationAccountId}
            />
            {fieldErrors.destination && (
              <p className="-mt-3 text-xs text-terra-brick" role="alert">
                {fieldErrors.destination}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-5">
            <Select
              label="Account"
              onChange={(event) => {
                setAccountId(event.target.value);
                setFieldErrors((current) => ({ ...current, account: "" }));
              }}
              options={[
                { label: "Select account", value: "" },
                ...accounts.map((account) => ({ label: account.name, value: account.id })),
              ]}
              value={accountId}
            />
            {fieldErrors.account && (
              <p className="-mt-3 text-xs text-terra-brick" role="alert">
                {fieldErrors.account}
              </p>
            )}
            {!splits.length && (
              <>
                <Select
                  label="Category"
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setFieldErrors((current) => ({ ...current, category: "" }));
                  }}
                  options={[
                    { label: "Select category", value: "" },
                    ...availableCategories.map((category) => ({ label: category.name, value: category.id })),
                  ]}
                  value={categoryId}
                />
                {fieldErrors.category && (
                  <p className="-mt-3 text-xs text-terra-brick" role="alert">
                    {fieldErrors.category}
                  </p>
                )}
              </>
            )}
            {type === "expense" && !splits.length && (
              <button
                className="h-12 rounded-lg border border-dashed border-terra-clay-line text-sm font-medium text-terra-clay transition-colors hover:bg-terra-clay-wash"
                onClick={addSplit}
                type="button"
              >
                ＋ Add another category (split)
              </button>
            )}
            {splits.length > 0 && (
              <div className="space-y-3 rounded-lg border border-terra-clay-line bg-terra-clay-wash/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-terra-ink">Expense splits</p>
                  <button
                    className="text-xs text-terra-clay hover:text-terra-clay-deep"
                    onClick={() => setSplits([])}
                    type="button"
                  >
                    Use one category
                  </button>
                </div>
                {splits.map((split, index) => (
                  <div className="flex gap-2" key={index}>
                    <select
                      aria-label={`Split category ${index + 1}`}
                      className={`${inputClassName()} min-w-0 flex-1`}
                      onChange={(event) => {
                        changeSplit(index, "categoryId", event.target.value);
                        setFieldErrors((current) => ({ ...current, splits: "" }));
                      }}
                      value={split.categoryId}
                    >
                      <option value="">Select category</option>
                      {expenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Split amount ${index + 1}`}
                      className={`${inputClassName()} w-28`}
                      min="0.01"
                      onChange={(event) => {
                        changeSplit(index, "amount", event.target.value);
                        setFieldErrors((current) => ({ ...current, splits: "" }));
                      }}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={split.amount}
                    />
                    {splits.length > 2 && (
                      <button
                        aria-label="Remove split"
                        className="w-8 text-terra-gray hover:text-terra-brick"
                        onClick={() => removeSplit(index)}
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {fieldErrors.splits && (
                  <p className="text-xs text-terra-brick" role="alert">
                    {fieldErrors.splits}
                  </p>
                )}
                <button
                  className="text-sm font-medium text-terra-clay hover:text-terra-clay-deep"
                  onClick={() => setSplits((current) => [...current, { categoryId: "", amount: "" }])}
                  type="button"
                >
                  ＋ Add category
                </button>
              </div>
            )}
          </div>
        )}

        <label className="grid gap-2">
          <span className="text-sm font-medium text-terra-ink">Amount</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-terra-gray">₹</span>
            <input
              aria-invalid={Boolean(fieldErrors.amount)}
              className={`${inputClassName()} ${fieldErrors.amount ? "border-terra-brick" : ""} pl-8`}
              min="0.01"
              onChange={(event) => {
                setAmount(event.target.value);
                setFieldErrors((current) => ({ ...current, amount: "" }));
              }}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={amount}
            />
          </div>
          {fieldErrors.amount && (
            <p className="text-xs text-terra-brick" role="alert">
              {fieldErrors.amount}
            </p>
          )}
          {splits.length > 0 && (
            <p className={`text-xs ${hasSplitMismatch ? "text-terra-brick" : "text-terra-sage-deep"}`}>
              Split total: ₹{splitTotal.toFixed(2)} {hasSplitMismatch ? "— must equal the amount" : "— matched"}
            </p>
          )}
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-terra-ink">Date</span>
          <input
            aria-invalid={Boolean(fieldErrors.date)}
            className={`${inputClassName()} ${fieldErrors.date ? "border-terra-brick" : ""}`}
            onChange={(event) => {
              setDate(event.target.value);
              setFieldErrors((current) => ({ ...current, date: "" }));
            }}
            type="date"
            value={date}
          />
          {fieldErrors.date && (
            <p className="text-xs text-terra-brick" role="alert">
              {fieldErrors.date}
            </p>
          )}
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-terra-ink">
            Note <span className="font-normal text-terra-gray">(optional)</span>
          </span>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border border-terra-tan bg-terra-paper px-3.5 py-3 text-sm text-terra-ink outline-none placeholder:text-terra-muted focus:border-terra-clay focus:ring-2 focus:ring-terra-clay/15"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note…"
            value={note}
          />
        </label>
        {error && (
          <p
            className="rounded-lg border border-terra-brick-line bg-terra-brick-wash px-4 py-3 text-sm text-terra-brick-deep"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-terra-tan/65 pt-5">
          <Button onClick={closePanel} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={transactionMutation.isPending} type="submit">
            {transactionMutation.isPending ? "Saving…" : "Add transaction"}
          </Button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
