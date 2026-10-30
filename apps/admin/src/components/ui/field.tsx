import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

const FieldContext = createContext<FieldControlProps | null>(null);

/**
 * Wiring for controls inside a <Field>: Input, Textarea and SelectTrigger call this, so
 * any of them (however deeply nested) gets the label's id, hint/error description and
 * invalid state. Explicit props on the control win.
 */
export function useFieldControl(): Partial<FieldControlProps> {
  return useContext(FieldContext) ?? {};
}

/**
 * Label + control + hint/error, wired for screen readers. Use for every form field that
 * isn't managed by react-hook-form's <FormField>; both render the same.
 *
 *   <Field label="Amount" hint="In kroner" error={errors.amount}>
 *     <Input … />
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint && !error && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div data-slot="field" className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="font-normal text-muted-foreground" aria-hidden>
            (required)
          </span>
        )}
      </Label>
      <FieldContext.Provider
        value={{ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined }}
      >
        {children}
      </FieldContext.Provider>
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
