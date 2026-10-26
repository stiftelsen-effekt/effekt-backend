import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, type Breadcrumb } from "./page-header";

export type FlowStep = { id: string; label: string };

/**
 * Template for multi-step jobs (import a payment report → review what didn't match).
 * Steps show where you are; the footer holds Back / Continue so the main action is always
 * in the same place. Keep flow state in a persistent store (see usePersistentState) so a
 * reload or a closed tab resumes where the person left off.
 *
 *   <FlowPage title="Import payments" steps={steps} current="upload"
 *     footer={<FlowFooter back={…} next={…} />}>
 *     …step content…
 *   </FlowPage>
 */
export function FlowPage({
  title,
  breadcrumbs,
  description,
  actions,
  steps,
  current,
  onStepSelect,
  width = "narrow",
  footer,
  children,
}: {
  title: ReactNode;
  breadcrumbs?: Breadcrumb[];
  description?: ReactNode;
  actions?: ReactNode;
  steps: FlowStep[];
  current: string;
  /** Lets people jump back to completed steps. */
  onStepSelect?: (id: string) => void;
  /** narrow for forms, wide for side-by-side review. */
  width?: "narrow" | "wide";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  );
  return (
    <div data-slot="flow-page" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageHeader
          title={title}
          breadcrumbs={breadcrumbs}
          description={description}
          actions={actions}
        />
        <nav aria-label="Steps" className="px-4 pb-5 sm:px-6">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
            {steps.map((step, index) => {
              const state =
                index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
              const selectable = state === "done" && onStepSelect;
              const content = (
                <>
                  <span
                    className={cn(
                      "num grid size-5 shrink-0 place-content-center rounded-full text-xs font-semibold",
                      state === "done" && "bg-primary text-primary-foreground",
                      state === "current" && "bg-accent text-accent-foreground",
                      state === "upcoming" && "border border-input text-muted-foreground",
                    )}
                  >
                    {state === "done" ? (
                      <CheckIcon className="size-3" strokeWidth={3} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      state === "current" ? "font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </>
              );
              return (
                <li key={step.id} className="flex items-center gap-2">
                  {index > 0 && <span aria-hidden className="h-px w-6 bg-border-strong" />}
                  {selectable ? (
                    <button
                      type="button"
                      onClick={() => onStepSelect(step.id)}
                      className="flex items-center gap-2 rounded-sm px-1 hover:bg-hover focus-ring"
                    >
                      {content}
                    </button>
                  ) : (
                    <span
                      className="flex items-center gap-2 px-1"
                      aria-current={state === "current" ? "step" : undefined}
                    >
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div
          className={cn(
            "grid gap-6 px-4 pb-10 sm:px-6",
            width === "narrow" ? "max-w-3xl" : "max-w-[96rem]",
          )}
        >
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}

/** Sticky footer for FlowPage: info on the left, Back / Continue on the right. */
export function FlowFooter({
  info,
  back,
  next,
}: {
  info?: ReactNode;
  back?: ReactNode;
  next?: ReactNode;
}) {
  return (
    <div
      data-slot="flow-footer"
      className="flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-3 sm:px-6"
    >
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">{info}</div>
      {back}
      {next}
    </div>
  );
}
