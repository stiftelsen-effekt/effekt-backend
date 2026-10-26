import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

/**
 * An identifier people copy into other systems: donor id, KID, donation id, agreement id,
 * external reference. Tabular digits, copy button on hover/focus, never truncated in the
 * middle. `label` names the thing for screen readers ("KID").
 */
export function CopyValue({
  value,
  label,
  prefix,
  className,
}: {
  value: string | number;
  label: string;
  /** Visual prefix that is not copied, e.g. "#" for ids. */
  prefix?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = String(value);

  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked (insecure origin); the value is still selectable.
    }
  }

  return (
    <span
      data-slot="copy-value"
      className={cn("group/copy inline-flex max-w-full items-center gap-1 align-middle", className)}
    >
      <span className="num truncate select-all">
        {prefix && <span className="text-faint-foreground select-none">{prefix}</span>}
        {text}
      </span>
      <button
        type="button"
        onClick={(event) => void copy(event)}
        aria-label={`${strings.actions.copy} ${label}`}
        className={cn(
          "grid size-5 shrink-0 place-content-center rounded-xs text-faint-foreground focus-ring",
          "opacity-0 group-hover/copy:opacity-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100",
          copied && "text-success opacity-100",
        )}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
    </span>
  );
}
