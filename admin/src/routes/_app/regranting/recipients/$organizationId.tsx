import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRecordParams, useRecordSearch } from "@/components/panels";
import { DownloadIcon, ScaleIcon, ScrollTextIcon } from "lucide-react";
import { cellPlaceholder, createColumns, DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { DetailPage, PageSection } from "@/components/templates";
import { BreakdownSheetButton } from "@/features/regranting/trace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Field } from "@/components/ui/field";
import { Updating } from "@/components/ui/pending";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatementEntry } from "@/features/regranting/model";
import {
  describeEntry,
  entryKindLabels,
  statementCsv,
  statementFilename,
  toProjectInput,
  type ProjectFilter,
} from "@/features/regranting/statement";
import { ProjectLink, RoundLink } from "@/features/regranting/ui";
import { addDays, dateOfDay, dayOf, osloDay, parseIsoDay } from "@/lib/dates";
import { downloadText } from "@/lib/download";
import { sumMoney } from "@/lib/money";
import { usePageQuery } from "@/lib/query";
import { loadPage } from "@/lib/route-data";
import { errorCode, useTRPC } from "@/lib/trpc";

type Search = { from?: string; to?: string; project?: string };

export const Route = createFileRoute("/_app/regranting/recipients/$organizationId")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const day = (v: unknown) => (typeof v === "string" && parseIsoDay(v) ? v : undefined);
    const project =
      typeof raw.project === "string" || typeof raw.project === "number"
        ? String(raw.project)
        : undefined;
    return {
      from: day(raw.from),
      to: day(raw.to),
      project: project && /^(unrestricted|\d+)$/.test(project) ? project : undefined,
    };
  },
  // No loaderDeps: changing the period or project stays on this match (`cause: "stay"`), so
  // the page keeps the current entries itself (usePageQuery). Arriving from Balances or a round
  // (links preload on hover) waits for the statement.
  loader: ({ context: { queryClient, trpc }, params, location, cause }) => {
    const organizationId = Number(params.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) return;
    const q = statementQueries(trpc, organizationId, location.search as Search, osloDay());
    return loadPage(queryClient, cause, q.statement, [q.projects]);
  },
  component: StatementPage,
});

/** Default period: the last twelve months. */
const defaultFrom = (today: string) => addDays(today, -365);

/** The statement's period and project from the URL. */
function statementPeriod(search: Search, today: string) {
  const from = search.from ?? defaultFrom(today);
  const to = search.to ?? today;
  const project: ProjectFilter =
    search.project === undefined
      ? "all"
      : search.project === "unrestricted"
      ? "unrestricted"
      : Number(search.project);
  return { from, to, project };
}

/** What the statement page shows; the page reads these and the loader warms them. */
function statementQueries(
  trpc: ReturnType<typeof useTRPC>,
  organizationId: number,
  search: Search,
  today: string,
) {
  const { from, to, project } = statementPeriod(search, today);
  return {
    statement: trpc.regranting.statements.recipient.queryOptions({
      organizationId,
      from,
      to: to < from ? from : to,
      ...toProjectInput(project),
    }),
    projects: trpc.regranting.projects.list.queryOptions({ organizationId }),
  };
}

function StatementPage() {
  const { organizationId } = useRecordParams(Route);
  const id = Number(organizationId);
  if (!Number.isInteger(id) || id <= 0)
    return (
      <EmptyState
        icon={ScaleIcon}
        title="No such recipient"
        description={`“${organizationId}” isn't a recipient ID.`}
        className="flex-1"
      />
    );
  return <Statement organizationId={id} />;
}

const col = createColumns<StatementEntry & { index: number }>();
const columns = col.columns([
  col.accessor("date", {
    header: "Date",
    enableSorting: false,
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("kind", {
    header: "Type",
    enableSorting: false,
    meta: { placeholder: "Donations" },
    cell: ({ row: { original: e } }) => (
      <span className="inline-flex items-center gap-1.5">
        {entryKindLabels[e.kind]}
        {e.pending ? (
          <Badge tone="outline" title="In a draft round; counts once the round is approved">
            Pending
          </Badge>
        ) : (
          !e.affectsBalance && (
            <Badge tone="outline" title="A record only; doesn't change the balance">
              Record
            </Badge>
          )
        )}
      </span>
    ),
  }),
  col.accessor("projectName", {
    header: "Project",
    enableSorting: false,
    meta: { placeholder: "Unrestricted" },
    cell: ({ row: { original: e } }) =>
      e.projectId === null ? (
        <span className="text-muted-foreground">Unrestricted</span>
      ) : (
        <ProjectLink id={e.projectId}>{e.projectName ?? `#${e.projectId}`}</ProjectLink>
      ),
  }),
  col.display({
    id: "description",
    header: "Description",
    meta: { placeholder: "Transfer via GiveWell, REF-123", cellClassName: "max-w-md truncate" },
    cell: ({ row: { original: e } }) => <span title={describeEntry(e)}>{describeEntry(e)}</span>,
  }),
  col.accessor("roundName", {
    header: "Round",
    enableSorting: false,
    meta: { placeholder: "June 2026 regular round", cellClassName: "max-w-48 truncate" },
    cell: ({ row: { original: e } }) =>
      e.roundId !== null ? (
        <RoundLink id={e.roundId}>{e.roundName ?? `#${e.roundId}`}</RoundLink>
      ) : null,
  }),
  col.accessor("amount", {
    header: "Amount",
    enableSorting: false,
    meta: { numeric: true, placeholder: "+000 000,00 kr" },
    cell: ({ row: { original: e } }) => (
      <Money
        value={e.amount}
        signed
        className={e.affectsBalance ? undefined : "text-muted-foreground"}
      />
    ),
  }),
  col.accessor("balanceAfter", {
    header: "Balance",
    enableSorting: false,
    meta: { numeric: true, placeholder: "+000 000,00 kr", cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} signed />,
  }),
]);

function Statement({ organizationId }: { organizationId: number }) {
  const trpc = useTRPC();
  const [search, setRecordSearch] = useRecordSearch(Route);
  const today = osloDay();
  const { from, to, project } = statementPeriod(search, today);
  const queries = statementQueries(trpc, organizationId, search, today);
  // A new period or project keeps the current statement on screen (dimmed) until it's in.
  const query = usePageQuery(queries.statement);
  const projects = useQuery(queries.projects);
  const updating = query.isPlaceholderData;
  const setSearch = (patch: Partial<Search>) => setRecordSearch(patch);

  if (query.isError && !query.data)
    return (
      <div className="p-6">
        <ErrorState
          back={{ to: "/regranting", label: "Balances" }}
          error={query.error}
          title={
            errorCode(query.error) === "NOT_FOUND"
              ? `No recipient #${organizationId}`
              : "Couldn't load the statement"
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );

  const s = query.data;
  const rows = s?.entries.map((e, index) => ({ ...e, index }));
  const counted = s?.entries.filter((e) => e.affectsBalance) ?? [];
  const inflow = sumMoney(counted.filter((e) => !e.amount.startsWith("-")).map((e) => e.amount));
  const outflow = sumMoney(counted.filter((e) => e.amount.startsWith("-")).map((e) => e.amount));
  const committed = sumMoney(s?.committed.map((c) => c.amountNok) ?? []);

  return (
    <DetailPage
      breadcrumbs={[{ label: "Balances", to: "/regranting" }]}
      title={
        s ? (
          `Statement: ${s.name}`
        ) : (
          <>
            Statement: <SkeletonText>GiveWell All Grants Fund</SkeletonText>
          </>
        )
      }
      adornment={s?.isFund && <Badge tone="accent">Own fund</Badge>}
      meta={[
        <span key="period">
          <DateTime value={from} /> – <DateTime value={to} />
        </span>,
        <Link
          key="projects"
          to="/regranting/projects"
          search={{ org: String(organizationId) }}
          className="rounded-xs text-accent hover:underline focus-ring"
        >
          Projects
        </Link>,
      ]}
      actions={
        <>
          <BreakdownSheetButton
            organizationId={organizationId}
            projectId={project === "all" ? undefined : project === "unrestricted" ? null : project}
            at={to}
            title={s ? `Balance: ${s.name}` : "Balance"}
          />
          <Button
            disabled={!s}
            onClick={() => s && downloadText(statementFilename(s), statementCsv(s))}
          >
            <DownloadIcon />
            Export CSV
          </Button>
        </>
      }
      stats={
        // Every stat reserves a hint line while pending; Committed has one, so the strip keeps
        // its height. A new period dims the current figures instead.
        <Updating active={updating}>
          {s ? (
            // A statement: balances reconcile to the øre, so these stay exact.
            <StatGroup>
              <Stat
                label="Opening balance"
                value={<Money precision="exact" value={s.openingBalance} signed />}
              />
              <Stat label="In" value={<Money precision="exact" value={inflow} />} />
              <Stat label="Out" value={<Money precision="exact" value={outflow} signed />} />
              <Stat
                label="Closing balance"
                value={<Money precision="exact" value={s.closingBalance} signed />}
              />
              <Stat
                label="Committed"
                hint="Approved, not yet paid"
                value={<Money precision="exact" value={committed} />}
              />
            </StatGroup>
          ) : (
            <StatGroup>
              <Stat label="Opening balance" pending />
              <Stat label="In" pending />
              <Stat label="Out" pending />
              <Stat label="Closing balance" pending />
              <Stat label="Committed" pending />
            </StatGroup>
          )}
        </Updating>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          <DateRangePicker
            className="w-64"
            value={{ from: dateOfDay(from), to: dateOfDay(to) }}
            onValueChange={(range) =>
              setSearch({
                from: range?.from ? dayOf(range.from) : undefined,
                to: range?.to ? dayOf(range.to) : undefined,
              })
            }
          />
        </Field>
        <Field label="Show">
          <Select
            value={String(project)}
            onValueChange={(v) => setSearch({ project: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              <SelectItem value="unrestricted">Unrestricted only</SelectItem>
              {(projects.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <PageSection
        title="Entries"
        description="Every entry in the period with the running balance. Donations are summed per day."
      >
        <div className="flex max-h-[44rem] flex-col">
          <DataTable
            label="Statement entries"
            columns={columns}
            data={rows}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            getRowId={(row) => String(row.index)}
            empty={
              <EmptyState
                size="sm"
                icon={ScrollTextIcon}
                title="No entries in this period"
                description="Choose a longer period, or another project."
              />
            }
          />
        </div>
      </PageSection>
      {s && s.committed.length > 0 && (
        <PageSection
          title="Committed"
          description="In approved rounds that aren't paid yet; not in the balance until they are."
        >
          <ul className="grid gap-1 text-sm">
            {s.committed.map((c) => (
              <li key={c.transferLineId} className="flex flex-wrap gap-3">
                <Money value={c.amountNok} className="w-28 text-right font-semibold" />
                <RoundLink id={c.roundId}>{c.roundName}</RoundLink>
                <span className="text-muted-foreground">
                  via {c.payeeName}, transfer #{c.transferId}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
    </DetailPage>
  );
}
