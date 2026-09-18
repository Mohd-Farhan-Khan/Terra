"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { fetchSettings } from "@/lib/queries/finance";
import { invalidateReferenceData, queryKeys } from "@/lib/queries/keys";
import type { AccountType, CategoryKind, SettingsAccount, SettingsCategory } from "@/lib/types/database";
import { errorMessage } from "@/lib/utils/error-message";

type CategoryDraft = { id?: string; name: string; kind: CategoryKind; parentCategoryId: string };
type AccountDraft = { id?: string; name: string; type: AccountType; isSavings: boolean };
type ModalState = { kind: "category"; draft: CategoryDraft } | { kind: "account"; draft: AccountDraft } | null;
const emptyCategories: SettingsCategory[] = [];
const emptyAccounts: SettingsAccount[] = [];

const inputClass =
  "h-11 w-full rounded-lg border border-terra-tan bg-terra-paper px-3.5 text-sm text-terra-ink outline-none transition-colors placeholder:text-terra-muted focus:border-terra-clay focus:ring-2 focus:ring-terra-clay/15";

function typeLabel(type: AccountType) {
  return { bank: "Bank", cash: "Cash", investment: "Investment", receivable: "Receivable", payable: "Payable" }[type];
}

function categoryKindLabel(kind: CategoryKind) {
  return kind === "income" ? "Income" : "Expense";
}

function owned(category: SettingsCategory) {
  return category.user_id !== null;
}

export function SettingsScreen() {
  const [tab, setTab] = useState("categories");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<{
    user: { id: string; email?: string | null };
    categories: SettingsCategory[];
    accounts: SettingsAccount[];
  }>({
    queryKey: queryKeys.settings,
    queryFn: () =>
      fetchSettings() as Promise<{
        user: { id: string; email?: string | null };
        categories: SettingsCategory[];
        accounts: SettingsAccount[];
      }>,
  });
  const categories = settingsQuery.data?.categories ?? emptyCategories;
  const accounts = settingsQuery.data?.accounts ?? emptyAccounts;
  const userId = settingsQuery.data?.user.id ?? "";
  const emailValue = email ?? settingsQuery.data?.user.email ?? "";
  const state = settingsQuery.isPending ? "loading" : settingsQuery.isError ? "error" : "ready";

  const visibleCategories = useMemo(
    () => categories.filter((category) => includeArchived || !category.is_archived),
    [categories, includeArchived],
  );
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const rootCategories = visibleCategories.filter(
    (category) =>
      !category.parent_category_id ||
      !visibleCategories.some((candidate) => candidate.id === category.parent_category_id),
  );

  function categoryChildren(parentId: string) {
    return visibleCategories
      .filter((category) => category.parent_category_id === parentId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function isDescendantOf(category: SettingsCategory, ancestorId: string) {
    const visited = new Set<string>();
    let parentId = category.parent_category_id;
    while (parentId && !visited.has(parentId)) {
      if (parentId === ancestorId) return true;
      visited.add(parentId);
      parentId = categoryById.get(parentId)?.parent_category_id ?? null;
    }
    return false;
  }

  async function refreshAfterMutation(message: string) {
    await invalidateReferenceData(queryClient);
    setNotice(message);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.kind !== "category") return;
    if (!modal.draft.name.trim()) {
      setError("Enter a category name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const client = createClient();
      const draft = modal.draft;
      const values = { name: draft.name.trim(), parent_category_id: draft.parentCategoryId || null };
      const result = draft.id
        ? await client.from("categories").update(values).eq("id", draft.id)
        : await client.from("categories").insert({ ...values, user_id: userId, kind: draft.kind });
      if (result.error) throw result.error;
      setModal(null);
      await refreshAfterMutation(draft.id ? "Category updated." : "Category added.");
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t save this category. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.kind !== "account") return;
    if (!modal.draft.name.trim()) {
      setError("Enter an account name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const client = createClient();
      const draft = modal.draft;
      const values = {
        name: draft.name.trim(),
        is_savings: (draft.type === "bank" || draft.type === "cash") && draft.isSavings,
      };
      const result = draft.id
        ? await client.from("accounts").update(values).eq("id", draft.id)
        : await client.from("accounts").insert({ ...values, user_id: userId, type: draft.type });
      if (result.error) throw result.error;
      setModal(null);
      await refreshAfterMutation(draft.id ? "Account updated." : "Account added.");
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t save this account. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function archiveCategory(category: SettingsCategory) {
    setError(null);
    setNotice(null);
    try {
      const { error: archiveError } = await createClient()
        .from("categories")
        .update({ is_archived: !category.is_archived })
        .eq("id", category.id);
      if (archiveError) throw archiveError;
      await refreshAfterMutation(
        category.is_archived ? "Category restored." : "Category archived. Historical transactions are unchanged.",
      );
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t update this category. Please try again."));
    }
  }

  async function archiveAccount(account: SettingsAccount) {
    setError(null);
    setNotice(null);
    try {
      const { error: archiveError } = await createClient()
        .from("accounts")
        .update({ is_archived: !account.is_archived })
        .eq("id", account.id);
      if (archiveError) throw archiveError;
      await refreshAfterMutation(
        account.is_archived ? "Account restored." : "Account archived. Historical transactions are unchanged.",
      );
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t update this account. Please try again."));
    }
  }

  async function updateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailValue.trim()) {
      setError("Enter an email address before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ email: emailValue });
      if (updateError) throw updateError;
      setNotice("Email update requested. Confirm it from your inbox if required.");
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t update your email. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) {
      setError("Enter a password with at least 6 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setNotice("Password updated.");
    } catch (mutationError) {
      setError(errorMessage(mutationError, "We couldn’t update your password. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function categoryRows(parent: SettingsCategory, depth = 0): React.ReactNode[] {
    return [
      <tr className="settings-row border-b border-terra-tan/55 last:border-0" key={parent.id}>
        <td className="px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            <span className="text-terra-gray">{depth ? "↳" : "□"}</span>
            <span className="text-sm font-medium text-terra-ink">{parent.name}</span>
            {!owned(parent) && (
              <span className="rounded-full bg-terra-paper-soft px-2 py-0.5 text-[.62rem] font-medium uppercase tracking-[.08em] text-terra-gray">
                System
              </span>
            )}
          </div>
        </td>
        <td className={`px-4 py-3.5 text-sm ${parent.kind === "income" ? "text-terra-sage-deep" : "text-terra-clay"}`}>
          {categoryKindLabel(parent.kind)}
        </td>
        <td className="px-4 py-3.5">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${parent.is_archived ? "bg-terra-paper-soft text-terra-gray" : "bg-terra-sage-wash text-terra-sage-deep"}`}
          >
            {parent.is_archived ? "Archived" : "Active"}
          </span>
        </td>
        <td className="px-5 py-3.5 text-right sm:px-6">
          {owned(parent) ? (
            <span className="inline-flex gap-2">
              <button
                className="text-xs font-medium text-terra-clay hover:text-terra-clay-deep"
                onClick={() => {
                  setError(null);
                  setModal({
                    kind: "category",
                    draft: {
                      id: parent.id,
                      name: parent.name,
                      kind: parent.kind,
                      parentCategoryId: parent.parent_category_id ?? "",
                    },
                  });
                }}
                type="button"
              >
                Edit
              </button>
              <button
                className="text-xs font-medium text-terra-gray hover:text-terra-ink"
                onClick={() => archiveCategory(parent)}
                type="button"
              >
                {parent.is_archived ? "Restore" : "Archive"}
              </button>
            </span>
          ) : (
            <span className="text-xs text-terra-muted">Protected</span>
          )}
        </td>
      </tr>,
      ...categoryChildren(parent.id).flatMap((child) => categoryRows(child, depth + 1)),
    ];
  }

  const categoryParentOptions =
    modal?.kind === "category"
      ? categories.filter(
          (category) =>
            !category.is_archived &&
            category.kind === modal.draft.kind &&
            category.id !== modal.draft.id &&
            (!modal.draft.id || !isDescendantOf(category, modal.draft.id)),
        )
      : [];

  return (
    <div className="settings-enter space-y-7 lg:space-y-8">
      <header>
        <h1 className="font-terra-heading text-[clamp(2.7rem,5vw,4rem)] leading-none tracking-[-.06em] text-terra-ink">
          Settings
        </h1>
        <p className="mt-3 text-base text-terra-gray">Manage categories, accounts, and profile security.</p>
      </header>
      <Tabs
        items={[
          { label: "Categories", value: "categories" },
          { label: "Accounts", value: "accounts" },
          { label: "Profile & security", value: "profile" },
        ]}
        onValueChange={setTab}
        value={tab}
      />
      {state === "loading" && (
        <div className="rounded-xl border border-terra-tan bg-terra-paper px-5 py-10 text-center text-sm text-terra-gray">
          Loading settings…
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep">
          Settings are unavailable. Apply the latest Supabase migrations, then refresh.
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
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-terra-brick-line bg-terra-brick-wash px-4 py-3 text-sm text-terra-brick-deep"
        >
          {error}
        </p>
      )}
      {state === "ready" && tab === "categories" && (
        <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
          <header className="flex flex-col gap-4 border-b border-terra-tan/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-terra-heading text-2xl text-terra-ink">Categories</h2>
              <p className="mt-1 text-sm text-terra-gray">
                Create nested categories and archive them without changing history.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-terra-gray">
                <input
                  checked={includeArchived}
                  className="accent-terra-clay"
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                  type="checkbox"
                />
                Show archived
              </label>
              <Button
                onClick={() => {
                  setError(null);
                  setModal({ kind: "category", draft: { name: "", kind: "expense", parentCategoryId: "" } });
                }}
                size="sm"
              >
                + Add category
              </Button>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <thead className="border-b border-terra-tan/55 bg-terra-paper-soft/45 text-[.68rem] font-semibold uppercase tracking-[.11em] text-terra-gray">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Name</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rootCategories
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .flatMap((category) => categoryRows(category))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {state === "ready" && tab === "accounts" && (
        <section className="overflow-hidden rounded-xl border border-terra-tan/75 bg-terra-paper">
          <header className="flex flex-col gap-4 border-b border-terra-tan/60 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-terra-heading text-2xl text-terra-ink">Accounts</h2>
              <p className="mt-1 text-sm text-terra-gray">
                Archived accounts stay in your historical ledger but are unavailable for new transactions.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-terra-gray">
                <input
                  checked={includeArchived}
                  className="accent-terra-clay"
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                  type="checkbox"
                />
                Show archived
              </label>
              <Button
                onClick={() => {
                  setError(null);
                  setModal({ kind: "account", draft: { name: "", type: "bank", isSavings: false } });
                }}
                size="sm"
              >
                + Add account
              </Button>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left">
              <thead className="border-b border-terra-tan/55 bg-terra-paper-soft/45 text-[.68rem] font-semibold uppercase tracking-[.11em] text-terra-gray">
                <tr>
                  <th className="px-5 py-3 sm:px-6">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts
                  .filter((account) => includeArchived || !account.is_archived)
                  .map((account) => (
                    <tr className="settings-row border-b border-terra-tan/55 last:border-0" key={account.id}>
                      <td className="px-5 py-3.5 text-sm font-medium text-terra-ink sm:px-6">
                        {account.name}
                        {account.is_savings && (
                          <span className="ml-2 rounded-full bg-terra-sage-wash px-2 py-0.5 text-[.62rem] font-medium uppercase tracking-[.08em] text-terra-sage-deep">
                            Savings
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-terra-gray">{typeLabel(account.type)}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.is_archived ? "bg-terra-paper-soft text-terra-gray" : "bg-terra-sage-wash text-terra-sage-deep"}`}
                        >
                          {account.is_archived ? "Archived" : "Active"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right sm:px-6">
                        <span className="inline-flex gap-2">
                          <button
                            className="text-xs font-medium text-terra-clay hover:text-terra-clay-deep"
                            onClick={() => {
                              setError(null);
                              setModal({
                                kind: "account",
                                draft: {
                                  id: account.id,
                                  name: account.name,
                                  type: account.type,
                                  isSavings: account.is_savings,
                                },
                              });
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs font-medium text-terra-gray hover:text-terra-ink"
                            onClick={() => archiveAccount(account)}
                            type="button"
                          >
                            {account.is_archived ? "Restore" : "Archive"}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {state === "ready" && tab === "profile" && (
        <section className="grid gap-5 lg:grid-cols-2">
          <form className="rounded-xl border border-terra-tan/75 bg-terra-paper p-6" onSubmit={updateEmail}>
            <h2 className="font-terra-heading text-2xl text-terra-ink">Email</h2>
            <p className="mt-1 text-sm text-terra-gray">Use the email associated with your Terra account.</p>
            <label className="mt-6 grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Email address</span>
              <input
                className={inputClass}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={emailValue}
              />
            </label>
            <Button className="mt-5" disabled={saving} size="sm" type="submit">
              {saving ? "Saving…" : "Update email"}
            </Button>
          </form>
          <form className="rounded-xl border border-terra-tan/75 bg-terra-paper p-6" onSubmit={updatePassword}>
            <h2 className="font-terra-heading text-2xl text-terra-ink">Password</h2>
            <p className="mt-1 text-sm text-terra-gray">Choose a new password for your account.</p>
            <label className="mt-6 grid gap-2">
              <span className="text-sm font-medium text-terra-ink">New password</span>
              <input
                className={inputClass}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <Button className="mt-5" disabled={saving} size="sm" type="submit">
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>
        </section>
      )}
      <Modal
        description={
          modal?.kind === "category"
            ? "Choose a type and optionally place it under an active parent."
            : "An account can be archived later without deleting past transactions."
        }
        onClose={() => !saving && setModal(null)}
        open={Boolean(modal)}
        title={
          modal?.kind === "category"
            ? modal.draft.id
              ? "Edit category"
              : "Add category"
            : modal?.kind === "account"
              ? modal.draft.id
                ? "Edit account"
                : "Add account"
              : "Settings"
        }
      >
        {modal?.kind === "category" && (
          <form className="space-y-5" onSubmit={saveCategory}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Name</span>
              <input
                autoFocus
                className={inputClass}
                onChange={(event) =>
                  setModal({ kind: "category", draft: { ...modal.draft, name: event.target.value } })
                }
                required
                value={modal.draft.name}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Kind</span>
              <select
                className={inputClass}
                disabled={Boolean(modal.draft.id)}
                onChange={(event) =>
                  setModal({
                    kind: "category",
                    draft: { ...modal.draft, kind: event.target.value as CategoryKind, parentCategoryId: "" },
                  })
                }
                value={modal.draft.kind}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              {modal.draft.id && (
                <span className="text-xs text-terra-gray">Kind is preserved to protect existing transactions.</span>
              )}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Parent category</span>
              <select
                className={inputClass}
                onChange={(event) =>
                  setModal({ kind: "category", draft: { ...modal.draft, parentCategoryId: event.target.value } })
                }
                value={modal.draft.parentCategoryId}
              >
                <option value="">No parent</option>
                {categoryParentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-3 border-t border-terra-tan/60 pt-5">
              <Button disabled={saving} onClick={() => setModal(null)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? "Saving…" : "Save category"}
              </Button>
            </div>
          </form>
        )}
        {modal?.kind === "account" && (
          <form className="space-y-5" onSubmit={saveAccount}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Name</span>
              <input
                autoFocus
                className={inputClass}
                onChange={(event) => setModal({ kind: "account", draft: { ...modal.draft, name: event.target.value } })}
                required
                value={modal.draft.name}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-terra-ink">Type</span>
              <select
                className={inputClass}
                disabled={Boolean(modal.draft.id)}
                onChange={(event) =>
                  setModal({
                    kind: "account",
                    draft: { ...modal.draft, type: event.target.value as AccountType, isSavings: false },
                  })
                }
                value={modal.draft.type}
              >
                {(["bank", "cash", "investment", "receivable", "payable"] as AccountType[]).map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </select>
              {modal.draft.id && (
                <span className="text-xs text-terra-gray">Type is preserved to protect linked financial records.</span>
              )}
            </label>
            {(modal.draft.type === "bank" || modal.draft.type === "cash") && (
              <label className="flex items-center gap-3 rounded-lg bg-terra-paper-soft px-4 py-3 text-sm text-terra-ink">
                <input
                  checked={modal.draft.isSavings}
                  className="accent-terra-clay"
                  onChange={(event) =>
                    setModal({ kind: "account", draft: { ...modal.draft, isSavings: event.target.checked } })
                  }
                  type="checkbox"
                />
                Savings destination
              </label>
            )}
            <div className="flex justify-end gap-3 border-t border-terra-tan/60 pt-5">
              <Button disabled={saving} onClick={() => setModal(null)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? "Saving…" : "Save account"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
