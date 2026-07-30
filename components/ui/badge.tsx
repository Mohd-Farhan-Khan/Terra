import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "sage" | "clay" | "brick";
}

const toneClasses = {
  neutral: "border-terra-tan bg-terra-paper-soft text-terra-gray",
  sage: "border-terra-sage-line bg-terra-sage-wash text-terra-sage-deep",
  clay: "border-terra-clay-line bg-terra-clay-wash text-terra-clay-deep",
  brick: "border-terra-brick-line bg-terra-brick-wash text-terra-brick-deep",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClasses[tone], className)} {...props} />;
}
