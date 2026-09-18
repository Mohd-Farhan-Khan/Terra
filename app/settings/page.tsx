import { AppShell } from "@/components/layout/app-shell";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsPage() {
  return (
    <AppShell showHeader={false} title="Settings">
      <SettingsScreen />
    </AppShell>
  );
}
