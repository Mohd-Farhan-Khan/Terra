"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

const primaryItems = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/transactions", label: "Transactions", icon: "list" },
  { href: "/add-transaction", label: "Add transaction", icon: "plus" },
  { href: "/accounts", label: "Accounts", icon: "wallet" },
  { href: "/budgets", label: "Budgets", icon: "pie" },
  { href: "/recurring", label: "Recurring", icon: "repeat" },
  { href: "/counterparties", label: "Counterparties", icon: "people" },
  { href: "/goals", label: "Goals", icon: "target" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

function NavIcon({ name }: { name: (typeof primaryItems)[number]["icon"] }) {
  const common = "h-[18px] w-[18px] fill-none stroke-current stroke-[1.7]";
  const paths = {
    home: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 21v-6h6v6" />,
    list: <path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01" />,
    plus: <path d="M12 5v14M5 12h14" />,
    wallet: (
      <path d="M4 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2H6a2 2 0 0 0 0 4h15v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM17 15h.01" />
    ),
    pie: <path d="M12 3a9 9 0 1 0 9 9h-9zM14 3.25A8.75 8.75 0 0 1 20.75 10H14z" />,
    repeat: <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />,
    people: (
      <path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 3a4 4 0 0 1 0 7M22 20v-1.5a4.5 4.5 0 0 0-3-4.24" />
    ),
    target: (
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Zm0-6a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM12 2v3M22 12h-3M12 22v-3M2 12h3" />
    ),
    settings: (
      <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.1 2.1-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51v.08h-3v-.08a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.1-2.1.06-.06A1.65 1.65 0 0 0 7.22 15a1.65 1.65 0 0 0-1.51-1H5.63v-3h.08a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.1-2.1.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V4.82h3v.08a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.1 2.1-.06.06A1.65 1.65 0 0 0 19.4 10a1.65 1.65 0 0 0 1.51 1h.08v3h-.08a1.65 1.65 0 0 0-1.51 1Z" />
    ),
  } as const;

  return (
    <svg aria-hidden className={common} viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function Brand() {
  return (
    <Link className="flex items-center gap-3 px-3" href="/dashboard">
      <span className="grid h-8 w-8 place-items-center rounded-full border border-terra-tan bg-terra-paper text-terra-sage">
        <span className="font-terra-heading text-lg leading-none">T</span>
      </span>
      <span className="font-terra-heading text-[28px] leading-none tracking-tight text-terra-clay">Terra</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1" aria-label="Primary navigation">
      {primaryItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            className={cn(
              "group flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-terra-clay-wash text-terra-clay"
                : "text-terra-gray hover:bg-terra-paper-soft hover:text-terra-ink",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNavigation() {
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(
      () => mobileNavRef.current?.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus(),
      0,
    );
    return () => {
      window.clearTimeout(focusTimer);
      previousFocus?.focus();
    };
  }, [open]);

  function trapMobileNavFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      mobileNavRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
    );
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function signOut() {
    setIsSigningOut(true);
    try {
      await createClient().auth.signOut();
      window.location.assign("/login");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-terra-tan bg-terra-paper px-5 py-7 lg:flex lg:flex-col">
        <Brand />
        <div className="mt-8 flex-1">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-terra-gray">Your space</p>
          <NavLinks />
        </div>
        <div className="border-t border-terra-tan pt-4">
          <button
            className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left text-sm text-terra-gray transition-colors hover:bg-terra-paper-soft hover:text-terra-ink disabled:cursor-wait"
            disabled={isSigningOut}
            onClick={signOut}
            type="button"
          >
            <span
              aria-hidden
              className="grid h-[18px] w-[18px] place-items-center rounded-full border border-current text-[10px]"
            >
              →
            </span>
            {isSigningOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      </aside>

      <header className="flex h-16 items-center border-b border-terra-tan bg-terra-paper px-4 lg:hidden">
        <Button
          aria-expanded={open}
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          size="sm"
          variant="ghost"
        >
          <span aria-hidden className="text-lg leading-none">
            ☰
          </span>
        </Button>
        <Brand />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div
            aria-hidden
            className="absolute inset-0 cursor-default bg-terra-ink/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <aside
            aria-label="Mobile navigation"
            className="relative h-full w-[min(19rem,86vw)] overflow-y-auto border-r border-terra-tan bg-terra-paper px-5 py-7 shadow-terra-panel"
            onKeyDown={trapMobileNavFocus}
            ref={mobileNavRef}
          >
            <div className="flex items-center justify-between">
              <Brand />
              <Button aria-label="Close navigation" onClick={() => setOpen(false)} size="sm" variant="ghost">
                ×
              </Button>
            </div>
            <div className="mt-8">
              <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-terra-gray">Your space</p>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <button
              className="mt-8 border-t border-terra-tan pt-5 text-sm text-terra-gray"
              disabled={isSigningOut}
              onClick={signOut}
              type="button"
            >
              {isSigningOut ? "Signing out…" : "Log out"}
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
