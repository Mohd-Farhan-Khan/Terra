import { AppShell } from "@/components/layout/app-shell";
import { TransactionsScreen } from "@/components/transactions/transactions-screen";

export default function TransactionsPage() {
  return (
    <AppShell showHeader={false} title="Transactions">
      <TransactionsScreen />
    </AppShell>
  );
}
