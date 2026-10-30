import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { describeError } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

export type InlineEditProps = {
  value: string;
  /** Throw (or reject) to keep the editor open and show the message. */
  onSave: (value: string) => void | Promise<unknown>;
  /** Names the field for screen readers and the edit button ("Edit email"). */
  label: string;
  type?: "text" | "email" | "number" | "tel";
  validate?: (value: string) => string | null;
  /** What to show when not editing; defaults to the value. */
  children?: ReactNode;
  placeholder?: string;
  className?: string;
};

/**
 * Edit one low-risk field in place (donor name, email). Click or Enter to edit; Enter
 * saves, Escape cancels; errors keep the editor open. Never use for amounts, dates of
 * donations or anything that moves money — those go through a form with an explicit save.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  type = "text",
  validate,
  children,
  placeholder,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const problem = validate?.(draft) ?? null;
    if (problem) return setError(problem);
    if (draft === value) return setEditing(false);
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      const info = describeError(err);
      setError(info.hint || info.title);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") void save();
    if (event.key === "Escape") {
      event.stopPropagation();
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        aria-label={`${strings.actions.edit} ${label.toLowerCase()}`}
        className={cn(
          "group/edit -mx-1.5 inline-flex max-w-[calc(100%+0.75rem)] items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-left",
          "hover:bg-hover focus-ring",
          className,
        )}
      >
        {/* Long names and emails are cut to fit; the whole value is in the tooltip. */}
        <span
          className="min-w-0 truncate"
          title={typeof value === "string" && value ? value : undefined}
        >
          {children ??
            (value || <span className="text-faint-foreground">{placeholder ?? "–"}</span>)}
        </span>
        <PencilIcon
          className="size-3.5 shrink-0 text-faint-foreground opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
          aria-hidden
        />
      </button>
    );
  }

  return (
    <span className={cn("grid gap-1", className)}>
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          type={type}
          value={draft}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="h-7"
        />
        <Button
          size="icon-sm"
          variant="primary"
          aria-label={strings.actions.save}
          pending={saving}
          onClick={() => void save()}
        >
          <CheckIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={strings.actions.cancel}
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          <XIcon />
        </Button>
      </span>
      {error && (
        <span id={errorId} className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
