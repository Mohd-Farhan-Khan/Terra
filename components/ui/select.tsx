import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, label, hint, options, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <label className="grid gap-2" htmlFor={selectId}>
      {label && <span className="text-sm font-medium text-terra-ink">{label}</span>}
      <span className="relative block">
        <select
          className={cn(
            "h-11 w-full appearance-none rounded-[8px] border border-terra-tan bg-terra-paper px-3.5 pr-10 text-sm text-terra-ink outline-none transition-colors focus:border-terra-clay focus:ring-2 focus:ring-terra-clay/15",
            className,
          )}
          id={selectId}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-terra-gray">
          ↓
        </span>
      </span>
      {hint && <span className="text-xs text-terra-gray">{hint}</span>}
    </label>
  );
});
