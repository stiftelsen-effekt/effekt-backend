/**
 * Toasts, with one voice. Toasts confirm something that already happened or offer undo;
 * they never carry information the person must act on (use a Callout or keep the dialog
 * open for that).
 *
 *   notify.success("Donor updated")
 *   notify.error(error)                       // plain-language copy from describeError
 *   notify.undo("Review item skipped", restore)
 */
import { toast } from "sonner";
import { describeError } from "@/components/domain/error-state";
import { strings } from "./strings";

export const notify = {
  success(title: string, description?: string) {
    return toast.success(title, { description });
  },
  info(title: string, description?: string) {
    return toast.info(title, { description });
  },
  error(error: unknown, title?: string) {
    const info = describeError(error);
    return toast.error(title ?? info.title, { description: info.hint, duration: 8000 });
  },
  /** For cheap-to-reverse actions done without a confirmation (skip, archive, hide). */
  undo(title: string, onUndo: () => void, description?: string) {
    return toast(title, {
      description,
      duration: 8000,
      action: { label: strings.actions.undo, onClick: onUndo },
    });
  },
};
