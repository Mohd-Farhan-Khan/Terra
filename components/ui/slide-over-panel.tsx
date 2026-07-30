"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface SlideOverPanelProps {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function SlideOverPanel({ children, description, onClose, open, title }: SlideOverPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#2b2621]/25" role="presentation">
      <button aria-label="Close panel" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside
        aria-describedby={description ? "panel-description" : undefined}
        aria-labelledby="panel-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-terra-tan bg-terra-paper p-6 shadow-terra-panel sm:p-8"
        role="dialog"
      >
        <header className="mb-8 flex items-start justify-between gap-5">
          <div className="space-y-1.5">
            <h2 className="font-terra-heading text-3xl leading-none text-terra-ink" id="panel-title">
              {title}
            </h2>
            {description && <p className="text-sm leading-6 text-terra-gray" id="panel-description">{description}</p>}
          </div>
          <Button aria-label="Close panel" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
