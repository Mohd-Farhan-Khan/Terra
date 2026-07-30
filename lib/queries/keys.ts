import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  accounts: ["accounts"] as const,
  activeAccounts: ["accounts", "active"] as const,
  categories: ["categories"] as const,
  activeCategories: ["categories", "active"] as const,
  dashboard: (month: string) => ["dashboard", month] as const,
  transactions: (filters: Record<string, string | number>) => ["transactions", filters] as const,
  transactionFilters: ["transaction-filters"] as const,
  accountOverview: ["account-overview"] as const,
  budgets: (month: string) => ["budgets", month] as const,
  counterparties: ["counterparties"] as const,
  counterpartyStatement: (accountId: string) => ["counterparty-statement", accountId] as const,
  recurring: (month: string) => ["recurring", month] as const,
  goals: ["goals"] as const,
  settings: ["settings"] as const,
};

/** Invalidate every derived read model that can change when ledger data changes. */
export async function invalidateTransactionData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accountOverview }),
    queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.counterparties }),
    queryClient.invalidateQueries({ queryKey: ["counterparty-statement"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  ]);
}

export async function invalidateReferenceData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
    queryClient.invalidateQueries({ queryKey: queryKeys.transactionFilters }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accountOverview }),
    queryClient.invalidateQueries({ queryKey: queryKeys.counterparties }),
    queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  ]);
}
