import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Page({
  className,
  children,
  aside,
}: {
  className?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <div
        className={cn(
          "mx-auto flex w-full max-w-[100rem] min-w-0 flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-8",
          className,
        )}
      >
        {children}
      </div>
      {aside}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}
    >
      <div className="min-w-0 border-l-6 border-foreground py-1 pl-5">
        {eyebrow && <div className="mb-1 label-caps text-muted-foreground">{eyebrow}</div>}
        <h1 className="font-display text-2xl text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
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
    <section data-slot="section" className={cn("grid min-w-0 content-start gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0">
          <h2 className="font-display text-xl">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
