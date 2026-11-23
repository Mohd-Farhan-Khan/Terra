"use client";

import { useDialog } from "@/lib/hooks/use-dialog";
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
  const { isMounted, isVisible, dialogRef, trapFocus } = useDialog(open, onClose);
  if (!isMounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#2b2621]/35 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none ${isVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      role="presentation"
    >
      <div aria-hidden className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        aria-describedby={description ? "panel-description" : undefined}
        aria-labelledby="panel-title"
        aria-modal="true"
        className={`absolute inset-0 flex w-full flex-col bg-terra-paper p-5 shadow-terra-panel transition-transform duration-200 ease-out motion-reduce:transition-none sm:inset-y-0 sm:left-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:border-l sm:border-terra-tan sm:p-8 ${isVisible ? "translate-x-0 translate-y-0" : "translate-y-full sm:translate-x-full sm:translate-y-0"}`}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-6 flex items-start justify-between gap-4 sm:mb-8 sm:gap-5">
          <div className="space-y-1.5">
            <h2 className="font-terra-heading text-3xl leading-none text-terra-ink" id="panel-title">
              {title}
            </h2>
            {description && (
              <p className="text-sm leading-6 text-terra-gray" id="panel-description">
                {description}
              </p>
            )}
          </div>
          <Button aria-label="Close panel" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}
