import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function KeyInfo({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      data-slot="key-info"
      data-columns={columns}
      className={cn(
        "grid gap-x-8 gap-y-4",
        "data-[columns=2]:sm:grid-cols-2 data-[columns=3]:sm:grid-cols-2 data-[columns=3]:xl:grid-cols-3",
        "data-[columns=4]:sm:grid-cols-2 data-[columns=4]:xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function KeyInfoGroup({
  title,
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-slot="key-info-group"
      className={cn("grid content-start gap-3 border-l border-border-strong pl-4", className)}
    >
      {title && <h3 className="label-caps text-muted-foreground">{title}</h3>}
      <dl className="grid gap-3">{children}</dl>
    </section>
  );
}

export function KeyInfoItem({
  label,
  children,
  edit,
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  edit?: InlineEditProps;
  className?: string;
}) {
  return (
    <div data-slot="key-info-item" className={cn("grid min-w-0 gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-base font-semibold">
        {edit ? <InlineEdit {...edit} display={children} /> : children ?? <Missing />}
      </dd>
    </div>
  );
}

function Missing() {
  return <span className="font-normal text-muted-foreground">–</span>;
}

type InlineEditProps = {
  value: string;
  onSave: (value: string) => void | Promise<unknown>;
  type?: "text" | "email" | "number" | "tel";
  label?: string;
  validate?: (value: string) => string | null;
};

export function InlineEdit({
  value,
  onSave,
  type = "text",
  label = "Edit",
  validate,
  display,
}: InlineEditProps & { display?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const problem = validate?.(draft) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") void save();
    if (event.key === "Escape") setEditing(false);
  }

  if (!editing) {
    return (
      <span className="group/edit inline-flex max-w-full items-center gap-1">
        <span className="truncate">{display ?? (value || <Missing />)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={start}
          className="size-6 text-muted-foreground opacity-0 group-hover/edit:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
        >
          <PencilIcon />
        </Button>
      </span>
    );
  }

  return (
    <span className="grid gap-1">
      <span className="flex items-center gap-1">
        <Input
          autoFocus
          type={type}
          value={draft}
          aria-label={label}
          aria-invalid={Boolean(error)}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          className="h-7 font-normal"
        />
        <Button size="icon-sm" aria-label="Save" disabled={saving} onClick={() => void save()}>
          <CheckIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          <XIcon />
        </Button>
      </span>
      {error && <span className="text-xs font-normal text-destructive">{error}</span>}
    </span>
  );
}
