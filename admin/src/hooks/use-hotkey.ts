import { useEffect, useRef } from "react";

/** True when the event comes from somewhere typing happens. */
export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
    element.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null
  );
}

/**
 * Global single-key or modifier shortcut. Single keys ("j", "/", "?") are ignored while
 * typing or inside dialogs; modifier combos ("mod+k") always fire.
 * `mod` is ⌘ on macOS and Ctrl elsewhere.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split("+");
    const key = parts.pop()!;
    const wantsMod = parts.includes("mod");
    const wantsShift = parts.includes("shift");

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      if (wantsMod !== mod) return;
      if (wantsShift && !event.shiftKey) return;
      if (event.key.toLowerCase() !== key) return;
      if (!wantsMod && (event.altKey || isTypingTarget(event.target))) return;
      event.preventDefault();
      handlerRef.current(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled]);
}
