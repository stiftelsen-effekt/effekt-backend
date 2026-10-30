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
 *
 * A long related table goes in `<PageSection fill>` (or `<Tabs fill>` for tabbed tables), on
 * the last section only: from lg up it takes the height left in the page (or panel), at least
 * 24rem, and scrolls inside with a sticky header, like a list. A short table keeps its height.
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
    <div
      data-page-scroll
      data-slot="detail-page"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        adornment={adornment}
        meta={meta}
        actions={actions}
      />
      {/* The body grows to the bottom of the scroller and hands the height left to the main
          column, so a PageSection with fill can take it; other children stay at the top. */}
      <div className="flex shrink-0 grow flex-col gap-6 px-4 pb-10 sm:px-6 [&>*]:shrink-0">
        {stats}
        <div
          className={cn(
            "grid grow grid-cols-1 items-start gap-6",
            aside
              ? // Stacked (below xl), the aside follows the main column's content.
                "content-start xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[1fr] xl:content-stretch 2xl:grid-cols-[minmax(0,1fr)_24rem]"
              : "grid-rows-[1fr]",
          )}
        >
          <div className="flex min-w-0 flex-col gap-6 self-stretch [&>*]:shrink-0">{children}</div>
          {aside && (
            <div className="grid min-w-0 grid-cols-1 gap-4 xl:sticky xl:top-4 xl:order-last">
              {aside}
            </div>
          )}
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
      className={cn("min-w-0 rounded-md border border-border bg-surface", className)}
    >
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-4 py-1.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}
