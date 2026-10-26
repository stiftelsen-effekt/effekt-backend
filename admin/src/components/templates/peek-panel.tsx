import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useHotkey } from "@/hooks/use-hotkey";
import { useMediaQuery } from "@/hooks/use-media-query";
import { strings } from "@/lib/strings";

/**
 * Quick look at a list row without leaving the list. Docked beside the table on wide
 * screens (the list stays usable, j/k moves the peek), a sheet on narrow ones.
 * Show the facts needed to decide what to do next; deep work happens on the full page.
 */
export function PeekPanel({
  title,
  subtitle,
  href,
  onClose,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The record's full page. */
  href: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const docked = useMediaQuery("(min-width: 80rem)");
  useHotkey("escape", onClose);

  const header = (
    <div className="flex items-start gap-2 border-b border-border px-5 py-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Button asChild size="sm">
        <Link to={href as LinkProps["to"]}>
          {strings.actions.open}
          <ArrowUpRightIcon />
        </Link>
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={strings.actions.close} onClick={onClose}>
        <XIcon />
      </Button>
    </div>
  );
  const body = <div className="grid content-start gap-6 overflow-y-auto px-5 py-4">{children}</div>;
  const footer = actions && (
    <div className="mt-auto flex flex-wrap gap-2 border-t border-border px-5 py-3">{actions}</div>
  );

  if (docked) {
    return (
      <aside
        data-slot="peek-panel"
        aria-label="Preview"
        className="flex w-[26rem] shrink-0 animate-panel-in flex-col border-l border-border bg-surface shadow-panel"
      >
        {header}
        {body}
        {footer}
      </aside>
    );
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full max-w-md flex-col gap-0 p-0"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">Preview</SheetDescription>
        {header}
        {body}
        {footer}
      </SheetContent>
    </Sheet>
  );
}
