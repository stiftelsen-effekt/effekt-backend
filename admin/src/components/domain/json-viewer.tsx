import { ChevronRightIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function Primitive({ value }: { value: Json }) {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "string") return <span className="text-success">"{value}"</span>;
  if (typeof value === "number") return <span className="text-info">{value}</span>;
  if (typeof value === "boolean") return <span className="text-accent">{String(value)}</span>;
  return null;
}

function Node({
  name,
  value,
  depth,
  defaultExpandDepth,
}: {
  name?: string;
  value: Json;
  depth: number;
  defaultExpandDepth: number;
}) {
  const isObject = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < defaultExpandDepth);
  const label = name !== undefined && <span className="text-foreground">{name}: </span>;

  if (!isObject) {
    return (
      <div className="pl-4">
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  const [openBrace, closeBrace] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 rounded-xs text-left focus-ring hover:bg-muted"
      >
        <ChevronRightIcon
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        {label}
        <span className="text-muted-foreground">
          {openBrace}
          {!open && ` ${entries.length} ${entries.length === 1 ? "item" : "items"} ${closeBrace}`}
        </span>
      </button>
      {open && (
        <div className="ml-1.5 border-l border-border pl-2">
          {entries.map(([key, child]) => (
            <Node
              key={key}
              name={Array.isArray(value) ? undefined : key}
              value={child}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
        </div>
      )}
      {open && <span className="pl-4 text-muted-foreground">{closeBrace}</span>}
    </div>
  );
}

export function JsonViewer({
  data,
  defaultExpandDepth = 2,
  className,
}: {
  data: unknown;
  defaultExpandDepth?: number;
  className?: string;
}) {
  const json = JSON.parse(JSON.stringify(data ?? null)) as Json;
  return (
    <div
      data-slot="json-viewer"
      className={cn(
        "relative overflow-auto border border-border bg-muted p-3 font-mono text-xs leading-5",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy JSON"
        className="absolute top-1.5 right-1.5"
        onClick={() =>
          void navigator.clipboard
            .writeText(JSON.stringify(json, null, 2))
            .then(() => toast.success("Copied to clipboard"))
        }
      >
        <CopyIcon />
      </Button>
      <Node value={json} depth={0} defaultExpandDepth={defaultExpandDepth} />
    </div>
  );
}
