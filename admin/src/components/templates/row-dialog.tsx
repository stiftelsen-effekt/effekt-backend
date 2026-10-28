import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A list row that has no page of its own (a charge, an adjustment): its facts and actions in
 * a dialog. Rows that do have a page open it as a panel instead (components/panels).
 */
export function RowDialog({
  title,
  subtitle,
  onClose,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        <div className="grid content-start gap-6">{children}</div>
        {actions && <DialogFooter className="sm:justify-start">{actions}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
