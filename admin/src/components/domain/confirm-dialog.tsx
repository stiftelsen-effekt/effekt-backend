import { useId, useState, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { describeError } from "@/components/domain/error-state";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/strings";

export type ConfirmDialogProps = {
  trigger: ReactNode;
  /** A question naming the action and the object: "Refund 500 kr to Kari Nordmann?" */
  title: ReactNode;
  description?: ReactNode;
  /** What will happen, one fact per item. Shown as a list so nothing hides in prose. */
  consequences?: ReactNode[];
  /** The verb, repeated from the title: "Refund 500 kr", never "OK" or "Yes". */
  confirmLabel: string;
  /** danger for irreversible actions (delete, refund, cancel agreement, merge). */
  tone?: "default" | "danger";
  /**
   * For money and merges: the person must type this (an amount, an id) to enable the
   * confirm button. Use it when a slip would be expensive to undo.
   */
  confirmText?: string;
  /** Throw to keep the dialog open and show the error inside it. */
  onConfirm: () => void | Promise<unknown>;
};

/**
 * The confirmation step for irreversible and financial actions. Errors are shown in the
 * dialog (not a toast) so the person sees that the action did not happen.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  consequences,
  confirmLabel,
  tone = "default",
  confirmText,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<unknown>(null);
  const inputId = useId();
  const blocked = confirmText !== undefined && typed.trim() !== confirmText;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setTyped("");
      setError(null);
    }
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const errorInfo = error ? describeError(error) : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {consequences && consequences.length > 0 && (
          <ul className="grid gap-1.5 text-sm">
            {consequences.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-foreground" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {confirmText !== undefined && (
          <div className="grid gap-1.5">
            <Label htmlFor={inputId} className="font-normal">
              Type <strong className="num font-semibold">{confirmText}</strong> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              className="num"
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !blocked) void confirm();
              }}
            />
          </div>
        )}
        {errorInfo && (
          <Callout tone="danger" title={errorInfo.title}>
            {errorInfo.hint}
          </Callout>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{strings.actions.cancel}</AlertDialogCancel>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            pending={pending}
            disabled={blocked}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
