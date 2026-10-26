import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Specimen({
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-2", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div
        className={cn("flex flex-wrap items-center gap-3 border border-border p-4", bodyClassName)}
      >
        {children}
      </div>
    </div>
  );
}

export function SpecimenGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-6 lg:grid-cols-2", className)}>{children}</div>;
}
