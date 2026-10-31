import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Whether the hotkeys below are live. Panels (components/panels) turn off the page under
 * them, and every panel but the top one, so j/k and page shortcuts act on what's in front.
 */
export const HotkeyScope = createContext(true);

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

/** A dialog, palette, sheet or popover is open: the page under it takes no single keys. */
export function modalOpen() {
  return (
    document.querySelector("[role=dialog][data-state=open],[role=alertdialog][data-state=open]") !==
    null
  );
}

/**
 * Whether a single-key shortcut (no ⌘/Ctrl) should ignore this event: typing, a modifier
 * held, a menu or listbox focused, or a modal open over the page.
 */
export function ignoresSingleKey(event: KeyboardEvent) {
  return (
    event.altKey || event.metaKey || event.ctrlKey || isTypingTarget(event.target) || modalOpen()
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
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  const scopeActive = useContext(HotkeyScope);
  enabled = enabled && scopeActive;

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
      if (!wantsMod && ignoresSingleKey(event)) return;
      event.preventDefault();
      handlerRef.current(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled]);
}
