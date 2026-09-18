import type { ReactNode } from "react";

import { AppNavigation } from "@/components/layout/app-navigation";

function MonthContext() {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date());
}

export function AppShell({
  children,
  title,
  showHeader = true,
}: {
  children: ReactNode;
  title: string;
  showHeader?: boolean;
}) {
  return (
    <div className="min-h-screen bg-terra-cream lg:pl-64">
      <AppNavigation />
      <div className="min-h-screen min-w-0">
        {showHeader && (
          <header className="hidden h-20 items-center justify-between border-b border-terra-tan px-8 lg:flex xl:px-12">
            <p className="font-terra-heading text-2xl text-terra-ink">{title}</p>
            <div className="flex items-center gap-3 text-sm text-terra-gray">
              <span className="h-1.5 w-1.5 rounded-full bg-terra-sage" />
              <span>{MonthContext()}</span>
            </div>
          </header>
        )}
        <main className="mx-auto w-full min-w-0 max-w-7xl px-5 py-9 sm:px-8 lg:px-10 lg:py-12 xl:px-12">
          <div className="mb-8 flex items-end justify-between gap-4 lg:hidden">
            <h1 className="font-terra-heading text-4xl leading-none text-terra-ink">{title}</h1>
            <span className="pb-1 text-sm text-terra-gray">{MonthContext()}</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
