import { cn } from "@/lib/utils/cn";

export interface ProgressBarProps {
  className?: string;
  label?: string;
  tone?: "clay" | "sage" | "brick";
  value: number;
}

const toneClasses = {
  clay: "bg-terra-clay",
  sage: "bg-terra-sage",
  brick: "bg-terra-brick",
};

export function ProgressBar({ className, label, tone = "clay", value }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("grid gap-2", className)}>
      {label && (
        <div className="flex justify-between text-sm text-terra-gray">
          <span>{label}</span>
          <span>{safeValue}%</span>
        </div>
      )}
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        className="h-2 overflow-hidden rounded-full bg-terra-track"
        role="progressbar"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none",
            toneClasses[tone],
          )}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
