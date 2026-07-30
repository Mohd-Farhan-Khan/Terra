"use client";

import { useEffect } from "react";
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b2621]/25 p-4" role="presentation">
      <button aria-label="Close modal" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <section
        aria-describedby={description ? "modal-description" : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-[10px] border border-terra-tan bg-terra-paper p-6 shadow-terra-modal sm:p-7"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-5">
          <div className="space-y-1.5">
            <h2 className="font-terra-heading text-3xl leading-none text-terra-ink" id="modal-title">
              {title}
            </h2>
            {description && <p className="text-sm leading-6 text-terra-gray" id="modal-description">{description}</p>}
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
