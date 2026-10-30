import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { cellPlaceholder } from "@/components/data-table/features";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { OrgSplitCell, orgSplitColumnMeta } from "@/components/domain/org-split";
import {
  BooleanFilter,
  DateRangeFilter,
  FilterBar,
  ListEmpty,
  OptionsFilter,
  SavedViews,
  useListState,
} from "@/components/filters";
import { ListPage } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  cancelledAgreementsList,
  otherActiveShare,
  reasonText,
  toCancelledFilter,
  type CancelledAgreementRow,
  type CancelledSummary,
} from "@/features/agreements/cancelled";
import { listProviders } from "@/features/agreements/list";
import { agreementTypes } from "@/features/agreements/model";
import { formatPercent } from "@/lib/format";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/agreements/cancelled")({
  validateSearch: cancelledAgreementsList.validateSearch,
  component: CancelledAgreementsPage,
});

const none = <span className="text-faint-foreground">–</span>;

/** Which other agreements the donor still has: a chip, or a dash when none */
function OtherActiveChip({
  providers,
}: {
  providers: CancelledAgreementRow["otherActiveProviders"];
}) {
  if (providers.length === 0) return <span className="text-sm text-muted-foreground">No</span>;
  return (
    <Badge tone="success" title="The donor still gives through this agreement">
      {providers.map((provider) => agreementTypes[provider].label).join(" + ")}
    </Badge>
  );
}

function ReasonCell({ reasons }: { reasons: CancelledAgreementRow["reasons"] }) {
  if (reasons.length === 0) return <span className="text-faint-foreground">Not given</span>;
  const text = reasonText(reasons);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block max-w-64 truncate" data-testid="reason">
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid max-w-80 gap-1">
        {reasons.map((reason, index) => (
          <span key={index}>
            <span className="font-semibold">{reason.name}</span>
            {reason.comment && <span className="whitespace-pre-wrap">: {reason.comment}</span>}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

const col = createColumns<CancelledAgreementRow>();
const columns = col.columns([
  col.accessor("cancelled", {
    header: "Cancelled",
    meta: { numeric: true, placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("donorName", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate", placeholder: cellPlaceholder.name },
    cell: ({ getValue }) => getValue() || none,
  }),
  col.accessor("provider", {
    header: "Type",
    enableSorting: false,
    cell: ({ getValue }) => <Badge tone="outline">{agreementTypes[getValue()].label}</Badge>,
  }),
  col.accessor("amount", {
    header: "Monthly",
    meta: { numeric: true, placeholder: cellPlaceholder.money },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("otherActiveProviders", {
    id: "otherActive",
    header: "Other active",
    enableSorting: false,
    meta: { label: "Other active agreement", placeholder: "AvtaleGiro" },
    cell: ({ getValue }) => <OtherActiveChip providers={getValue()} />,
  }),
  col.accessor("reasons", {
    id: "reason",
    header: "Reason",
    enableSorting: false,
    meta: { placeholder: "Økonomiske grunner" },
    cell: ({ getValue }) => <ReasonCell reasons={getValue()} />,
  }),
  col.accessor((row) => row.donorStats.latestDonation, {
    id: "latestDonation",
    header: "Last donation",
    meta: { numeric: true, placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor((row) => row.donorStats.donationSum, {
    id: "donationSum",
    header: "Donated",
    meta: { numeric: true, label: "Donated in total", placeholder: cellPlaceholder.money },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor((row) => row.donorStats.donationCount, {
    id: "donationCount",
    header: "Donations",
    meta: { numeric: true, placeholder: cellPlaceholder.count },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor("orgSplit", {
    header: "Organisations",
    enableSorting: false,
    meta: orgSplitColumnMeta,
    cell: ({ getValue }) => <OrgSplitCell split={getValue()} />,
  }),
  col.accessor("KID", {
    header: "KID",
    enableSorting: false,
    // Secondary facts (also in the agreement panel): only where there's room for them
    meta: {
      placeholder: cellPlaceholder.kid,
      headerClassName: "max-2xl:hidden",
      cellClassName: "max-2xl:hidden",
    },
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("created", {
    header: "Created",
    meta: {
      numeric: true,
      placeholder: cellPlaceholder.date,
      headerClassName: "max-2xl:hidden",
      cellClassName: "max-2xl:hidden",
    },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

/** Count, share with another active agreement and the three most given reasons */
function Summary({ summary }: { summary: CancelledSummary }) {
  const share = otherActiveShare(summary);
  const top = summary.reasons.slice(0, 3);
  return (
    <TableSummary
      items={[
        { value: <Num value={summary.count} />, suffix: "cancelled" },
        {
          label: "Another active agreement",
          value: (
            <>
              <Num value={summary.withOtherActiveCount} />
              {share !== null && ` (${formatPercent(share, { decimals: 0 })})`}
            </>
          ),
        },
        {
          label: "Top reasons",
          value: top.length ? (
            <span data-testid="top-reasons">
              {top.map((reason, index) => (
                <span key={reason.reasonId}>
                  {index > 0 && ", "}
                  {reason.name} <Num value={reason.count} className="font-normal" />
                </span>
              ))}
            </span>
          ) : (
            "none given"
          ),
        },
      ]}
    />
  );
}

function CancelledAgreementsPage() {
  const trpc = useTRPC();
  const list = useListState(cancelledAgreementsList);
  const filter = toCancelledFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.agreements.cancelled.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const reasons = useQuery(trpc.agreements.cancellationReasons.queryOptions());
  const summary = query.data?.summary;
  const reasonCounts = new Map(summary?.reasons.map((reason) => [reason.reasonId, reason.count]));

  return (
    <ListPage
      title="Cancelled agreements"
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor name, email, donor ID or KID"
          end={<SavedViews list={list} />}
        >
          <DateRangeFilter field="cancelled" label="Cancelled" />
          <OptionsFilter
            field="provider"
            label="Type"
            options={listProviders.map((provider) => ({
              value: provider,
              label: agreementTypes[provider].label,
            }))}
          />
          <OptionsFilter
            field="reason"
            label="Reason"
            options={(reasons.data ?? []).map((reason) => ({
              value: reason.id,
              label: reason.name,
              count: summary ? (reasonCounts.get(reason.id) ?? 0) : undefined,
            }))}
          />
          <BooleanFilter field="otherActive" label="Other active agreement" />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load cancelled agreements"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Cancelled agreements"
          columns={columns}
          data={query.data?.rows}
          rowCount={summary?.count}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => `${row.provider}:${row.id}`}
          {...list.tableState}
          getRowHref={(row) => `/agreements/${row.provider}/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="cancelled agreements"
              hint="Agreements appear here when a donor or we stop a Vipps or AvtaleGiro agreement."
            />
          }
          summary={summary && <Summary summary={summary} />}
        />
      )}
    </ListPage>
  );
}
