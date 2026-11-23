"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { networkMode: "always", retry: false },
          queries: {
            networkMode: "always",
            // Reference data is shared by several routes. Mutations explicitly
            // invalidate it, so retain it between navigations instead of issuing
            // another identical Supabase request on every focus or route change.
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  const identity = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (identity.current !== undefined && identity.current !== next) {
        queryClient.clear();
        // Remount private screens, including open forms with the previous user's data.
        if (window.location.pathname !== "/login") window.location.replace(next ? "/dashboard" : "/login");
      }
      identity.current = next;
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
