import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader, type Breadcrumb } from "./page-header";

/**
 * Template for one record (a donor, a donation, an agreement).
 *
 *   <DetailPage
 *     breadcrumbs={[{ label: "Donors", to: "/donors" }]}
 *     title={donor.name}
 *     adornment={<Status … />}
 *     meta={[<CopyValue …/>, donor.email]}
 *     actions={<>…secondary buttons… <OverflowMenu/></>}
 *     stats={<StatGroup>…</StatGroup>}
 *     aside={<DetailPanel title="Contact">…PropertyList…</DetailPanel>}
 *   >
 *     <Tabs>…related records…</Tabs>
 *   </DetailPage>
 *
 * Facts about the record live in the aside (right) as PropertyLists; the main column is for
 * what is related to it (donations, agreements, history). The body scrolls; the header
 * scrolls with it.
 */
export function DetailPage({
  title,
  breadcrumbs,
  adornment,
  meta,
  actions,
  stats,
  aside,
  children,
}: {
  title: ReactNode;
  breadcrumbs?: Breadcrumb[];
  adornment?: ReactNode;
  meta?: ReactNode[];
  actions?: ReactNode;
  stats?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-page-scroll data-slot="detail-page" className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        adornment={adornment}
        meta={meta}
        actions={actions}
      />
      <div className="grid gap-6 px-4 pb-10 sm:px-6">
        {stats}
        <div
          className={cn(
            "grid items-start gap-6",
            aside && "xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]",
          )}
        >
          <div className="grid min-w-0 gap-6">{children}</div>
          {aside && <div className="grid gap-4 xl:sticky xl:top-4 xl:order-last">{aside}</div>}
        </div>
      </div>
    </div>
  );
}

/** A bordered group of facts in the detail aside. */
export function DetailPanel({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="detail-panel"
      className={cn("rounded-md border border-border bg-surface", className)}
    >
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-4 py-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}
