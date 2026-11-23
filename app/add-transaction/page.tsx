import { AppShell } from "@/components/layout/app-shell";
import { TransactionEntryScreen } from "@/components/transactions/transaction-entry-screen";
export default function AddTransactionPage() {
  return (
    <AppShell title="Add transaction" showHeader={false}>
      <TransactionEntryScreen />
    </AppShell>
  );
}
