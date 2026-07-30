import { AppShell } from "@/components/layout/app-shell";
import { RecurringScreen } from "@/components/recurring/recurring-screen";

export default function RecurringPage() {
  return <AppShell showHeader={false} title="Recurring"><RecurringScreen /></AppShell>;
}
