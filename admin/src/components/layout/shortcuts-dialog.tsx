import { Fragment } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import type { NavItem } from "./nav";
import { shortcutGroups } from "./shortcuts";

/** Lists the shortcuts that exist (`shortcuts.ts`). Opens with ?, or from ⌘K. */
export function ShortcutsDialog({
  open,
  onOpenChange,
  navItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pages with a go-to shortcut. */
  navItems: NavItem[];
}) {
  const shortcuts = shortcutGroups(navItems);
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
