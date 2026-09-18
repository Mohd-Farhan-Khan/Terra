import { GoalsScreen } from "@/components/goals/goals-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function GoalsPage() {
  return (
    <AppShell showHeader={false} title="Goals">
      <GoalsScreen />
    </AppShell>
  );
}
