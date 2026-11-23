import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsPage() {
  return (
    <AppShell showHeader={false} title="Settings">
      <Suspense fallback={<p role="status">Loading settings…</p>}>
        <SettingsScreen />
      </Suspense>
    </AppShell>
  );
}
