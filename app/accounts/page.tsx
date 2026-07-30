import { AccountsScreen } from "@/components/accounts/accounts-screen";
import { AppShell } from "@/components/layout/app-shell";

export default function AccountsPage() {
  return <AppShell showHeader={false} title="Accounts"><AccountsScreen /></AppShell>;
}
