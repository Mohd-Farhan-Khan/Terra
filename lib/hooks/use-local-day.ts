"use client";
import { useSyncExternalStore } from "react";
import { dateString } from "@/lib/utils/calendar";

function subscribe(notify: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function schedule() {
    clearTimeout(timer);
    notify();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    timer = setTimeout(schedule, Math.max(1, midnight.getTime() - Date.now()));
  }
  schedule();
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", schedule);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", schedule);
    document.removeEventListener("visibilitychange", schedule);
  };
}
export function useLocalDay() {
  return useSyncExternalStore(
    subscribe,
    () => dateString(),
    () => "",
  );
}
