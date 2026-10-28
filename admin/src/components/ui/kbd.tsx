import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A key or key combination, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border-strong bg-surface px-1 font-sans text-xs leading-none text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
