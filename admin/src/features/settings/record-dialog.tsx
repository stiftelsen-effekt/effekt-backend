import { useState, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { describeError } from "@/components/domain/error-state";
import { useDiscardGuard } from "@/components/domain/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { strings } from "@/lib/strings";
import { fieldErrors } from "@/lib/trpc";

export type FieldErrors = Record<string, string | undefined>;

/**
 * A short create/edit form in a dialog with explicit save. `validate` returns client-side
 * errors by field; server validation messages (`error.data.fieldErrors`) are merged in by
 * the same field names, and anything else shows as a callout in the dialog, which stays
 * open so it's clear nothing was saved. Closing with unsaved changes asks first.
 */
export function RecordDialog<V>({
  trigger,
  title,
  description,
  initial,
  validate,
  onSave,
  saveLabel,
  children,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  initial: () => V;
  validate: (values: V) => FieldErrors;
  /** Throw to keep the dialog open. */
  onSave: (values: V) => Promise<unknown>;
  saveLabel: string;
  children: (form: {
    values: V;
    set: (patch: Partial<V>) => void;
    errors: FieldErrors;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<V>(initial);
  const [start, setStart] = useState<V>(values);
  const dirty = JSON.stringify(values) !== JSON.stringify(start);
  const guard = useDiscardGuard(dirty, () => setOpen(false));
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const serverErrors = Object.fromEntries(
    Object.entries(fieldErrors(error)).map(([key, messages]) => [key, messages?.[0]]),
  );
  const clientErrors = submitted ? validate(values) : {};
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };
  const generalError =
    error && Object.keys(serverErrors).length === 0 ? describeError(error) : null;

  function onOpenChange(next: boolean) {
    if (pending) return;
    if (!next) return guard.requestClose();
    const fresh = initial();
    setValues(fresh);
    setStart(fresh);
    setSubmitted(false);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setSubmitted(true);
    if (Object.values(validate(values)).some(Boolean)) return;
    setPending(true);
    setError(null);
    try {
      await onSave(values);
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {children({
            values,
            set: (patch) => {
              setValues((current) => ({ ...current, ...patch }));
              if (error) setError(null);
            },
            errors,
          })}
          {generalError && (
            <Callout tone="danger" title={generalError.title}>
              {generalError.hint}
            </Callout>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)} disabled={pending}>
              {strings.actions.cancel}
            </Button>
            <Button type="submit" variant="primary" pending={pending}>
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}

/** Client-side text checks matching the API's column limits. */
export function textError(
  value: string,
  { label, max, required = false }: { label: string; max: number; required?: boolean },
) {
  const length = value.trim().length;
  if (required && length === 0) return `Enter ${label}`;
  if (length > max)
    return `${label[0]!.toUpperCase()}${label.slice(1)} can be at most ${max} characters`;
  return undefined;
}
