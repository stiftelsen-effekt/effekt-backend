import type { ReactNode } from "react";
import { PageHeader, type Breadcrumb } from "./page-header";

/**
 * Template for every list of records (donors, donations, agreements, logs …).
 *
 *   <ListPage
 *     title="Donations"
 *     actions={<Button variant="primary">Register donation</Button>}
 *     filters={<FilterBar list={list}>…</FilterBar>}
 *   >
 *     <DataTable … />
 *   </ListPage>
 *
 * Height is the viewport: the table scrolls with a sticky header, the filter bar and the
 * table footer (summary + paging) stay put. Don't put anything else between header and
 * table; summary numbers go in the DataTable footer, explanations in `description`.
 * Rows open their record as a panel over the list (DataTable `getRowHref`, components/panels).
 */
export function ListPage({
  title,
  breadcrumbs,
  description,
  actions,
  filters,
  children,
}: {
  title: ReactNode;
  breadcrumbs?: Breadcrumb[];
  description?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-slot="list-page" className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title={title}
          breadcrumbs={breadcrumbs}
          description={description}
          actions={actions}
          className="pb-3"
        />
        {filters && <div className="px-4 pb-3 sm:px-6">{filters}</div>}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
