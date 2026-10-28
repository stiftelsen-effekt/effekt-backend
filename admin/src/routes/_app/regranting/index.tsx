import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, PlusIcon, ScaleIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { cellPlaceholder, createColumns, DataTable, TableSummary } from "@/components/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { BooleanFilter, defineList, FilterBar, param, useListState } from "@/components/filters";
import { ListPage } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  balanceRows,
  balanceSorts,
  recipientFlags,
  type BalanceRow,
} from "@/features/regranting/balances";
import { CreateRoundDialog } from "@/features/regranting/create-round-dialog";
import { Flags, RoundLink } from "@/features/regranting/ui";
import { osloDay, parseIsoDay } from "@/lib/dates";
import { sumMoney } from "@/lib/money";
import { usePageQuery } from "@/lib/query";
import { loadPage } from "@/lib/route-data";
import { projectStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const balancesList = defineList({
  id: "regranting-balances",
  filters: { q: param.text, at: param.text, active: param.boolean },
  sortable: balanceSorts,
  defaultSort: { id: "available", desc: true },
});

export const Route = createFileRoute("/_app/regranting/")({
  validateSearch: balancesList.validateSearch,
  // Arriving from another page waits for the balances and the open draft. No loaderDeps: a new
  // date stays on this match and the page keeps the current balances itself (usePageQuery).
  loader: ({ context: { queryClient, trpc }, location, cause }) => {
    const q = balancesQueries(trpc, balancesAt(location.search as { at?: string }));
    return loadPage(queryClient, cause, [q.balances, q.drafts]);
  },
  component: BalancesPage,
});

const balancesAt = (search: { at?: string }) =>
  search.at && parseIsoDay(search.at) ? search.at : undefined;

/** What the Balances page shows; the page reads these and the loader warms them. */
function balancesQueries(trpc: ReturnType<typeof useTRPC>, at: string | undefined) {
  return {
    balances: trpc.regranting.balances.list.queryOptions(at ? { at } : undefined),
    drafts: trpc.regranting.rounds.list.queryOptions({ statuses: ["draft"] }),
  };
}

function BalancesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(balancesList);
  const at = balancesAt(list.filters);
  const today = osloDay();
  // Changing the date keeps the current balances on screen (dimmed) until the new ones are in.
  const queries = balancesQueries(trpc, at);
  const query = usePageQuery(queries.balances);
  const drafts = useQuery(queries.drafts);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const rows = useMemo(
    () =>
      query.data
        ? balanceRows(query.data, {
            sort: list.sort.id,
            desc: list.sort.desc,
            expanded,
            q: list.filters.q,
            hideEmpty: list.filters.active,
          })
        : undefined,
    [query.data, list.sort.id, list.sort.desc, expanded, list.filters.q, list.filters.active],
  );
  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns = useMemo(() => balanceColumns(expanded, toggle), [expanded]);
  const recipients = query.data?.recipients ?? [];
  const nonFunds = recipients.filter((r) => !r.isFund);
  const draft = drafts.data?.[0];

  return (
    <ListPage
      title="Balances"
      description={
        query.isPending ? (
          // The sentence's usual length, so the header keeps its height when the data arrives.
          <>
            What each recipient is owed, calculated from the donations. Inflow is since{" "}
            <SkeletonText>June 2026 regular round</SkeletonText> (cutoff{" "}
            <SkeletonText>{cellPlaceholder.date}</SkeletonText>).
          </>
        ) : query.data?.lastRound ? (
          <>
            What each recipient is owed, calculated from the donations. Inflow is since{" "}
            <RoundLink id={query.data.lastRound.id} underline>
              {query.data.lastRound.name}
            </RoundLink>{" "}
            (cutoff <DateTime value={query.data.lastRound.cutoff} />
            ).
          </>
        ) : (
          "What each recipient is owed, calculated from the donations. No regular round has been paid yet."
        )
      }
      actions={
        // Together once the drafts are known: an Open draft button arriving later would push
        // New round aside under the pointer.
        !drafts.isPending && (
          <>
            {draft && (
              <Button asChild>
                <Link to="/regranting/rounds/$id" params={{ id: String(draft.id) }}>
                  Open draft: {draft.name}
                </Link>
              </Button>
            )}
            <CreateRoundDialog
              trigger={
                <Button variant="primary">
                  <PlusIcon />
                  New round
                </Button>
              }
            />
          </>
        )
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Recipient name or abbreviation"
          end={
            <Field
              label="Balances at"
              className="flex items-center gap-2 [&>label]:whitespace-nowrap"
            >
              <DateInput
                className="w-40"
                value={at ?? today}
                onValueChange={(day) =>
                  list.setFilter("at", day && day !== today ? day : undefined)
                }
              />
            </Field>
          }
        >
          <BooleanFilter
            field="active"
            label="With money"
            trueLabel="Only with a balance"
            falseLabel="All recipients"
          />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load the balances"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Balances"
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => row.id}
          sorting={list.tableState.sorting}
          onSortingChange={list.tableState.onSortingChange}
          onRowOpen={(row) => {
            if (row.kind === "project" && row.project.projectId)
              void navigate({
                to: "/regranting/projects/$id",
                params: { id: String(row.project.projectId) },
              });
            else if (row.kind !== "unassigned")
              void navigate({
                to: "/regranting/recipients/$organizationId",
                params: { organizationId: String(row.recipient.organizationId) },
              });
          }}
          getRowHref={(row) =>
            row.kind === "project" && row.project.projectId
              ? `/regranting/projects/${row.project.projectId}`
              : row.kind === "unassigned"
              ? "/regranting"
              : `/regranting/recipients/${row.recipient.organizationId}`
          }
          pageHotkeys
          empty={
            <EmptyState
              icon={ScaleIcon}
              title={list.filters.q ? "No results" : "No recipients"}
              description={
                list.filters.q
                  ? "No recipient matches the search."
                  : "Recipients appear here when they're active or have entries."
              }
            />
          }
          summary={
            query.data && (
              <TableSummary
                items={[
                  { value: <Num value={nonFunds.length} />, suffix: "recipients" },
                  {
                    label: "Available",
                    value: <Money value={sumMoney(nonFunds.map((r) => r.total.available))} />,
                  },
                  {
                    label: "In own funds",
                    value: (
                      <Money
                        value={sumMoney(
                          recipients.filter((r) => r.isFund).map((r) => r.total.balance),
                        )}
                      />
                    ),
                  },
                  {
                    label: "Committed",
                    value: <Money value={sumMoney(recipients.map((r) => r.total.committed))} />,
                  },
                ]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}

const col = createColumns<BalanceRow>();

/** Balances run into the millions, with øre and a sign: first-load cells as wide as those. */
const balancePlaceholder = "+0 000 000,00 kr";

function balanceColumns(expanded: ReadonlySet<number>, toggle: (id: number) => void) {
  const figure = (key: "balance" | "committed" | "available") => (row: BalanceRow) =>
    row.kind === "unassigned" ? (key === "balance" ? row.amount : null) : row.figures[key];
  return col.columns([
    col.accessor((row) => (row.kind === "unassigned" ? "Unassigned" : row.recipient.name), {
      id: "name",
      header: "Recipient",
      meta: { placeholder: "GiveWell Top Charities Fund TCF Own fun", cellClassName: "max-w-80" },
      cell: ({ row: { original: row } }) => {
        if (row.kind === "unassigned")
          return (
            <span className="inline-flex items-center gap-2 pl-7">
              <span className="font-semibold">Unassigned</span>
              <span className="text-xs text-muted-foreground">
                {row.donationCount} donations without a split
              </span>
            </span>
          );
        if (row.kind === "project")
          return (
            <span className="flex items-center gap-2 pl-12 text-muted-foreground">
              <span className="truncate text-foreground">{row.project.name}</span>
              {row.project.status && <Status catalog={projectStatus} value={row.project.status} />}
            </span>
          );
        const r = row.recipient;
        const open = expanded.has(r.organizationId);
        return (
          <span className="flex min-w-0 items-center gap-1">
            {r.projects.length > 0 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-expanded={open}
                aria-label={`${open ? "Hide" : "Show"} projects of ${r.name}`}
                onClick={() => toggle(r.organizationId)}
              >
                <ChevronRightIcon className={cn("transition-transform", open && "rotate-90")} />
              </Button>
            ) : (
              <span className="w-7 shrink-0" />
            )}
            <span className={cn("truncate font-semibold", !r.isActive && "text-muted-foreground")}>
              {r.name}
            </span>
            <span className="text-xs text-muted-foreground">{r.abbriv}</span>
            {r.isFund && <Badge tone="accent">Own fund</Badge>}
          </span>
        );
      },
    }),
    col.accessor(figure("balance"), {
      id: "balance",
      header: "Balance",
      meta: { numeric: true, placeholder: balancePlaceholder, cellClassName: "font-semibold" },
      cell: ({ getValue }) => <Money value={getValue()} signed />,
    }),
    col.accessor(figure("committed"), {
      id: "committed",
      header: "Committed",
      meta: { numeric: true, placeholder: cellPlaceholder.money, label: "Committed" },
      cell: ({ getValue }) => <Money value={getValue()} />,
    }),
    col.accessor(figure("available"), {
      id: "available",
      header: "Available",
      meta: { numeric: true, placeholder: balancePlaceholder },
      cell: ({ getValue }) => <Money value={getValue()} signed />,
    }),
    col.accessor((row) => (row.kind === "recipient" ? row.recipient.inflowSinceLastRound : null), {
      id: "inflow",
      header: "Inflow since last round",
      meta: { numeric: true, placeholder: "0 000 000,00 kr", label: "Inflow since last round" },
      cell: ({ getValue }) => (getValue() == null ? null : <Money value={getValue()} />),
    }),
    col.accessor((row) => (row.kind === "recipient" ? row.recipient.lastTransfer : null), {
      id: "lastTransfer",
      header: "Last transfer",
      meta: { label: "Last transfer", placeholder: "00.00.0000 00 000 kr" },
      cell: ({ getValue }) => {
        const last = getValue();
        return last ? (
          <span className="inline-flex gap-2">
            <DateTime value={last.paidAt} />
            <Money value={last.amountNok} className="text-muted-foreground" />
          </span>
        ) : null;
      },
    }),
    col.accessor((row) => (row.kind === "recipient" ? row.recipient.payee?.name ?? null : null), {
      id: "payee",
      header: "Payee",
      enableSorting: false,
      meta: { placeholder: "GiveDirectly", cellClassName: "max-w-40 truncate" },
    }),
    col.display({
      id: "flags",
      header: "Flags",
      meta: { placeholder: "Held too long ·" },
      cell: ({ row: { original: row } }) =>
        row.kind === "recipient" ? (
          <Flags flags={recipientFlags(row.recipient)} />
        ) : row.kind === "project" && row.project.hold ? (
          <Badge tone="warning" title={row.project.hold.reason}>
            On hold
          </Badge>
        ) : row.kind === "unassigned" ? (
          <Badge tone="warning" title="Set the donations' split in the donation database">
            Needs a split
          </Badge>
        ) : null,
    }),
  ]);
}
