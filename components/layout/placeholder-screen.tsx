import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export function PlaceholderScreen({ description, title }: { description: string; title: string }) {
  return (
    <AppShell title={title}>
      <Card description={description} eyebrow="Terra" title={title}>
        <p className="text-sm leading-6 text-terra-gray">This workspace is ready for its next build step.</p>
      </Card>
    </AppShell>
  );
}
