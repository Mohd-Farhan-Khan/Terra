import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
export function useDialog(open: boolean, onClose: () => void) {
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      let enterFrame = 0;
      const mountFrame = window.requestAnimationFrame(() => {
        setIsMounted(true);
        enterFrame = window.requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(mountFrame);
        window.cancelAnimationFrame(enterFrame);
      };
    }

    const exitTimer = window.setTimeout(() => setIsVisible(false), 0);
    const unmountTimer = window.setTimeout(() => setIsMounted(false), 220);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
        )
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      previousFocus?.focus();
    };
  }, [open, isMounted]);

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
      ) ?? [],
    );
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { isMounted, isVisible, dialogRef, trapFocus };
}
