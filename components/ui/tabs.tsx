"use client";

import { cn } from "@/lib/utils/cn";
import type { KeyboardEvent } from "react";

export interface TabItem {
  label: string;
  value: string;
}

export interface TabsProps {
  ariaLabel?: string;
  className?: string;
  items: TabItem[];
  onValueChange?: (value: string) => void;
  value: string;
}

function tabKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  items: TabItem[],
  onValueChange?: (value: string) => void,
) {
  const nextIndex =
    event.key === "ArrowRight"
      ? (index + 1) % items.length
      : event.key === "ArrowLeft"
        ? (index - 1 + items.length) % items.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : null;
  if (nextIndex === null) return;
  event.preventDefault();
  onValueChange?.(items[nextIndex].value);
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[nextIndex]?.focus();
}

export function Tabs({ ariaLabel = "Tabs", className, items, onValueChange, value }: TabsProps) {
  return (
    <div aria-label={ariaLabel} className={cn("inline-flex border-b border-terra-tan", className)} role="tablist">
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "relative px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "font-medium text-terra-clay after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:bg-terra-clay"
                : "text-terra-gray hover:text-terra-ink",
            )}
            key={item.value}
            onKeyDown={(event) => tabKeyDown(event, items.indexOf(item), items, onValueChange)}
            onClick={() => onValueChange?.(item.value)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl({
  ariaLabel = "Segmented control",
  className,
  items,
  onValueChange,
  value,
}: TabsProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-[8px] border border-terra-tan bg-terra-paper-soft p-1", className)}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              "rounded-[6px] px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-terra-paper font-medium text-terra-ink shadow-terra-segment"
                : "text-terra-gray hover:text-terra-ink",
            )}
            key={item.value}
            onKeyDown={(event) => tabKeyDown(event, items.indexOf(item), items, onValueChange)}
            onClick={() => onValueChange?.(item.value)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
