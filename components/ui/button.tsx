import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-terra-clay bg-terra-clay text-terra-cream hover:border-terra-clay-deep hover:bg-terra-clay-deep focus-visible:outline-terra-clay",
  secondary:
    "border-terra-tan bg-transparent text-terra-ink hover:border-terra-gray hover:bg-terra-cream focus-visible:outline-terra-clay",
  ghost:
    "border-transparent bg-transparent text-terra-gray hover:bg-terra-paper-soft hover:text-terra-ink focus-visible:outline-terra-clay",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
