import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionEntryScreen } from "@/components/transactions/transaction-entry-screen";

export default function AddTransactionPage() {
  return (
    <>
      <AppShell showHeader={false} title="Dashboard">
        <DashboardScreen />
      </AppShell>
      <TransactionEntryScreen />
    </>
  );
}
