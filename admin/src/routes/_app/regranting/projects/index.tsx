import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { cellPlaceholder, createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { FilterBar, ListEmpty, OptionsFilter, useListState } from "@/components/filters";
import { defineList, param } from "@/components/filters/list-state";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { projectStatuses, type Project } from "@/features/regranting/model";
import { ProjectDialog } from "@/features/regranting/project-dialog";
import { useOrganizations } from "@/features/regranting/ui";
import { usePageQuery } from "@/lib/query";
import { projectStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";

const projectsList = defineList({
  id: "regranting-projects",
  filters: { q: param.text, org: param.numberList, status: param.list(projectStatuses) },
  sortable: ["name", "recipient", "reportDue", "startDate"],
  defaultSort: { id: "name", desc: false },
});

export const Route = createFileRoute("/_app/regranting/projects/")({
  validateSearch: projectsList.validateSearch,
  component: ProjectsPage,
});

const col = createColumns<Project>();
const columns = col.columns([
  col.accessor("name", {
    header: "Project",
    meta: { cellClassName: "font-semibold max-w-72 truncate" },
  }),
  col.accessor("organizationName", {
    id: "recipient",
    header: "Recipient",
    meta: { cellClassName: "max-w-56 truncate" },
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ getValue }) => <Status catalog={projectStatus} value={getValue()} />,
  }),
  col.accessor("country", { header: "Country", enableSorting: false }),
  col.accessor("startDate", {
    header: "Period",
    meta: { placeholder: "00.00.0000 – 00.00.0000" },
    cell: ({ row: { original: p } }) =>
      p.startDate || p.endDate ? (
        <span>
          <DateTime value={p.startDate} /> – <DateTime value={p.endDate} />
        </span>
      ) : null,
  }),
  col.accessor("agreementRef", {
    header: "Agreement",
    enableSorting: false,
    meta: { cellClassName: "max-w-40 truncate" },
  }),
  col.accessor("reportDue", {
    header: "Next report due",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function ProjectsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(projectsList);
  const org = list.filters.org;
  const query = usePageQuery(
    trpc.regranting.projects.list.queryOptions({
      organizationId: org?.length === 1 ? org[0] : undefined,
      statuses: list.filters.status,
    }),
  );
  const orgs = useOrganizations();
  const rows = useMemo(() => {
    const q = list.filters.q?.trim().toLowerCase();
    const dir = list.sort.desc ? -1 : 1;
    return (query.data ?? [])
      .filter((p) => !org || org.includes(p.organizationId))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.organizationName.toLowerCase().includes(q) ||
          (p.agreementRef ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const key = (p: Project) =>
          list.sort.id === "recipient"
            ? p.organizationName
            : list.sort.id === "reportDue"
            ? p.reportDue ?? "9999"
            : list.sort.id === "startDate"
            ? p.startDate ?? ""
            : p.name;
        return dir * key(a).localeCompare(key(b), "nb");
      });
  }, [query.data, org, list.filters.q, list.sort.id, list.sort.desc]);

  return (
    <ListPage
      title="Projects"
      description="Specific projects at recipients, for earmarked grants, reports and due diligence."
      actions={
        <ProjectDialog
          organizationId={org?.length === 1 ? org[0] : undefined}
          trigger={
            <Button variant="primary">
              <PlusIcon />
              New project
            </Button>
          }
        />
      }
      filters={
        <FilterBar list={list} searchPlaceholder="Project, recipient or agreement">
          <OptionsFilter
            field="org"
            label="Recipient"
            options={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
          />
          <OptionsFilter
            field="status"
            label="Status"
            options={projectStatuses.map((s) => ({ value: s, label: projectStatus[s].label }))}
          />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load projects"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Projects"
          columns={columns}
          data={query.data ? rows : undefined}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          sorting={list.tableState.sorting}
          onSortingChange={list.tableState.onSortingChange}
          onRowOpen={(row) =>
            void navigate({ to: "/regranting/projects/$id", params: { id: String(row.id) } })
          }
          getRowHref={(row) => `/regranting/projects/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="projects"
              hint="Create a project to earmark grants for it."
            />
          }
          summary={
            query.data && (
              <TableSummary items={[{ value: <Num value={rows.length} />, suffix: "projects" }]} />
            )
          }
        />
      )}
    </ListPage>
  );
}
