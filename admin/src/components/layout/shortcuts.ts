import { useEffect, useRef } from "react";
import { ignoresSingleKey } from "@/hooks/use-hotkey";
import type { NavItem } from "./nav";

/**
 * Every keyboard shortcut, in one place: the ? dialog lists these, docs/admin-design.md › Keyboard
 * describes them. The go-to group comes from the nav (`goKey`), so it lists only pages that exist.
 */
export type Shortcut = { keys: string[]; label: string };
export type ShortcutGroup = { group: string; items: Shortcut[] };

const fixedGroups: ShortcutGroup[] = [
  {
    group: "Anywhere",
    items: [
      { keys: ["⌘", "K"], label: "Search and commands" },
      { keys: ["?"], label: "Show shortcuts" },
    ],
  },
  {
    group: "Lists",
    items: [
      { keys: ["/"], label: "Focus the search box (↓ back to the list)" },
      { keys: ["J"], label: "Next row (also ↓)" },
      { keys: ["K"], label: "Previous row (also ↑)" },
      { keys: ["Enter"], label: "Open the row as a panel (also Space)" },
      { keys: ["X"], label: "Select the row" },
      { keys: ["]"], label: "Next page" },
      { keys: ["["], label: "Previous page" },
    ],
  },
  {
    group: "Panels",
    items: [
      { keys: ["J"], label: "Next row's panel" },
      { keys: ["K"], label: "Previous row's panel" },
      { keys: ["F"], label: "Open the full page" },
      { keys: ["Esc"], label: "Close the top panel (also Back)" },
      { keys: ["⌘", "Click"], label: "Open a row or link in a new tab" },
    ],
  },
  {
    group: "Forms and review",
    items: [
      { keys: ["⌘", "Enter"], label: "Save / register / submit the dialog" },
      { keys: ["Esc"], label: "Cancel (asks first when there are changes)" },
      { keys: ["J"], label: "Next open review item" },
      { keys: ["K"], label: "Previous open review item" },
    ],
  },
];

export function shortcutGroups(navItems: NavItem[]): ShortcutGroup[] {
  const goTo = navItems
    .filter((item) => item.goKey)
    .map((item) => ({ keys: ["G", item.goKey!.toUpperCase()], label: item.label }));
  return [
    fixedGroups[0]!,
    ...(goTo.length > 0 ? [{ group: "Go to", items: goTo }] : []),
    ...fixedGroups.slice(1),
  ];
}

/** How long after g the second key counts. */
const SEQUENCE_MS = 1200;

/**
 * g then a letter goes to a page (g d donors, g o donations …). Listens in the capture phase
 * so the second key never reaches a page shortcut (g k must not also move the list cursor).
 * Off while typing, in menus, or with a dialog open.
 */
export function useGoToShortcuts(items: NavItem[], go: (item: NavItem) => void) {
  const latest = useRef({ items, go });
  latest.current = { items, go };

  useEffect(() => {
    let pendingUntil = 0;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.shiftKey || ignoresSingleKey(event)) {
        pendingUntil = 0;
        return;
      }
      const key = event.key.toLowerCase();
      if (pendingUntil > event.timeStamp) {
        pendingUntil = 0;
        const item = latest.current.items.find((i) => i.goKey === key);
        if (!item) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        latest.current.go(item);
        return;
      }
      if (key === "g") {
        event.preventDefault();
        event.stopImmediatePropagation();
        pendingUntil = event.timeStamp + SEQUENCE_MS;
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
