import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const calloutVariants = cva("flex items-start gap-3 rounded-md px-4 py-3 text-sm", {
  variants: {
    tone: {
      neutral: "bg-muted text-foreground [&>svg]:text-muted-foreground",
      accent: "bg-accent-subtle text-foreground [&>svg]:text-accent",
      success: "bg-success-subtle text-foreground [&>svg]:text-success",
      warning: "bg-warning-subtle text-foreground [&>svg]:text-warning",
      danger: "bg-danger-subtle text-foreground [&>svg]:text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const icons = {
  neutral: InfoIcon,
  accent: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  danger: CircleAlertIcon,
};

/**
 * Inline message tied to a place on the page: a warning before a risky form, the result of
 * an import, why something is read-only. For transient feedback use notify (toasts).
 */
export function Callout({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: VariantProps<typeof calloutVariants> & {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone ?? "neutral"];
  return (
    <div
      data-slot="callout"
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(calloutVariants({ tone }), className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/85">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
