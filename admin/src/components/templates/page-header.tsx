import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Breadcrumb = { label: string; to: string };

/**
 * Every page starts with this. Title in the display face (the only place it is used),
 * breadcrumbs above, a meta line of facts below, actions on the right with at most one
 * primary button.
 */
export function PageHeader({
  title,
  breadcrumbs,
  adornment,
  meta,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Sits right of the title, e.g. a <Status>. */
  adornment?: ReactNode;
  /** Facts about the record, rendered as a dot-separated line. */
  meta?: ReactNode[];
  /** One sentence about the page, for pages people don't visit daily. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end gap-x-6 gap-y-3 px-4 pt-4 pb-4 sm:px-6 sm:pt-5",
        className,
      )}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              {breadcrumbs.map((crumb) => (
                <Fragment key={crumb.to}>
                  <li>
                    <Link
                      to={crumb.to as LinkProps["to"]}
                      className="rounded-xs hover:text-foreground hover:underline focus-ring"
                    >
                      {crumb.label}
                    </Link>
                  </li>
                  <li aria-hidden>
                    <ChevronRightIcon className="size-3.5 text-faint-foreground" />
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl text-balance">{title}</h1>
          {adornment}
        </div>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        {meta && meta.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {meta.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden className="size-0.75 rounded-full bg-faint-foreground" />
                )}
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled block inside a page body. */
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="page-section" className={cn("grid min-w-0 content-start gap-3", className)}>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
