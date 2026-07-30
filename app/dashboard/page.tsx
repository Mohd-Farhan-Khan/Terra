import { DashboardScreen } from "@/components/dashboard/dashboard-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardPage() {
  return <AppShell showHeader={false} title="Dashboard"><DashboardScreen /></AppShell>;
}
