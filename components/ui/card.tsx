import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
}

export function Card({
  className,
  eyebrow,
  title,
  description,
  children,
  ...props
}: CardProps) {
  return (
    <section
      className={cn("rounded-[10px] border border-terra-tan bg-terra-paper p-6 sm:p-7", className)}
      {...props}
    >
      {(eyebrow || title || description) && (
        <header className="mb-5 space-y-1.5">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terra-gray">
              {eyebrow}
            </p>
          )}
          {title && <h2 className="font-terra-heading text-2xl leading-none text-terra-ink">{title}</h2>}
          {description && <p className="max-w-2xl text-sm leading-6 text-terra-gray">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
