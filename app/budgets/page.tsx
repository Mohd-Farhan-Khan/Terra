import { BudgetsScreen } from "@/components/budgets/budgets-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function BudgetsPage() {
  return (
    <AppShell showHeader={false} title="Budgets">
      <BudgetsScreen />
    </AppShell>
  );
}
