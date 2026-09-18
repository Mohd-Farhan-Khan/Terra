import { CounterpartiesScreen } from "@/components/counterparties/counterparties-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function CounterpartiesPage() {
  return (
    <AppShell showHeader={false} title="Counterparties">
      <CounterpartiesScreen />
    </AppShell>
  );
}
