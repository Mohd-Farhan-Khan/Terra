"use client";

import { useDialog } from "@/lib/hooks/use-dialog";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface ModalProps {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function Modal({ children, description, onClose, open, title }: ModalProps) {
  const { isMounted, isVisible, dialogRef, trapFocus } = useDialog(open, onClose);
  if (!isMounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#2b2621]/35 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none sm:grid sm:place-items-center sm:p-4 ${isVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      role="presentation"
    >
      <div aria-hidden className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        aria-describedby={description ? "modal-description" : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`absolute inset-0 z-10 w-full overflow-y-auto bg-terra-paper p-5 shadow-terra-modal transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:relative sm:inset-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-[10px] sm:border sm:border-terra-tan sm:p-7 ${isVisible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-2 opacity-0 sm:scale-[.985]"}`}
        onKeyDown={trapFocus}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-6 flex items-start justify-between gap-4 sm:gap-5">
          <div className="space-y-1.5">
            <h2 className="font-terra-heading text-3xl leading-none text-terra-ink" id="modal-title">
              {title}
            </h2>
            {description && (
              <p className="text-sm leading-6 text-terra-gray" id="modal-description">
                {description}
              </p>
            )}
          </div>
          <Button aria-label="Close modal" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
