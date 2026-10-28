import { Fragment } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

/** The shortcuts every page supports. Keep in sync with DESIGN.md › Keyboard. */
export const shortcuts: { group: string; items: { keys: string[]; label: string }[] }[] = [
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
      { keys: ["/"], label: "Focus the search box" },
      { keys: ["J"], label: "Next row (also ↓)" },
      { keys: ["K"], label: "Previous row (also ↑)" },
      { keys: ["Enter"], label: "Open the row as a panel (also Space)" },
      { keys: ["X"], label: "Select the row" },
    ],
  },
  {
    group: "Panels",
    items: [
      { keys: ["Esc"], label: "Close the top panel (also Back)" },
      { keys: ["⌘", "Click"], label: "Open a row or link in a new tab" },
    ],
  },
  {
    group: "Forms and review",
    items: [
      { keys: ["⌘", "Enter"], label: "Save / register" },
      { keys: ["J"], label: "Next open review item" },
      { keys: ["K"], label: "Previous open review item" },
      { keys: ["Esc"], label: "Cancel inline edit" },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts are off while you type.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {shortcuts.map((section) => (
            <section key={section.group} className="grid gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{section.group}</h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                {section.items.map((item) => (
                  <Fragment key={item.label}>
                    <dt>{item.label}</dt>
                    <dd className="flex gap-1">
                      {item.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
