import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page wrapper for /design reference pages. */
export function DocPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-page-scroll className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 pt-6 pb-16 sm:px-8">
        <header className="grid gap-2">
          <h1 className="font-display text-3xl">{title}</h1>
          <div className="max-w-2xl text-base text-muted-foreground">{intro}</div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function DocSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-6 gap-5">
      <div className="grid gap-1 border-b border-border pb-3">
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {description && (
          <div className="max-w-3xl text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {children}
    </section>
  );
}

/** One labelled example: what it is, when to use it, and the live component. */
export function Example({
  title,
  use,
  children,
  className,
  surfaceClassName,
}: {
  title: string;
  /** When to use it, one sentence. */
  use?: ReactNode;
  children: ReactNode;
  className?: string;
  surfaceClassName?: string;
}) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {use && <p className="text-sm text-muted-foreground">{use}</p>}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-4",
          surfaceClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
