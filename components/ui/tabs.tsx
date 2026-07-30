"use client";

import { cn } from "@/lib/utils/cn";

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  className?: string;
  items: TabItem[];
  onValueChange?: (value: string) => void;
  value: string;
}

export function Tabs({ className, items, onValueChange, value }: TabsProps) {
  return (
    <div aria-label="Tabs" className={cn("inline-flex border-b border-terra-tan", className)} role="tablist">
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "relative px-3 py-2.5 text-sm transition-colors",
              isActive ? "font-medium text-terra-clay after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:bg-terra-clay" : "text-terra-gray hover:text-terra-ink",
            )}
            key={item.value}
            onClick={() => onValueChange?.(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl({ className, items, onValueChange, value }: TabsProps) {
  return (
    <div aria-label="Segmented control" className={cn("inline-flex rounded-[8px] border border-terra-tan bg-terra-paper-soft p-1", className)} role="tablist">
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "rounded-[6px] px-3 py-2 text-sm transition-colors",
              isActive ? "bg-terra-paper font-medium text-terra-ink shadow-terra-segment" : "text-terra-gray hover:text-terra-ink",
            )}
            key={item.value}
            onClick={() => onValueChange?.(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
