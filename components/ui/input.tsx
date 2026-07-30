import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, id, label, hint, error, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <label className="grid gap-2" htmlFor={inputId}>
      {label && <span className="text-sm font-medium text-terra-ink">{label}</span>}
      <input
        aria-describedby={descriptionId}
        className={cn(
          "h-11 w-full rounded-[8px] border bg-terra-paper px-3.5 text-sm text-terra-ink outline-none transition-colors placeholder:text-terra-muted focus:border-terra-clay focus:ring-2 focus:ring-terra-clay/15",
          error ? "border-terra-brick" : "border-terra-tan",
          className,
        )}
        id={inputId}
        ref={ref}
        {...props}
      />
      {(hint || error) && (
        <span className={cn("text-xs", error ? "text-terra-brick" : "text-terra-gray")} id={descriptionId}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
});
