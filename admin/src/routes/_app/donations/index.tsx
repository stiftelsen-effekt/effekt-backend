import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import {
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  TextFilter,
  useListState,
  ListEmpty,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/pending";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { downloadCsv, visiblePaymentMethods } from "@/features/donations/api";
import { ResendReceiptDialog } from "@/features/donations/resend-receipt";
import {
  donationsList,
  histogramBins,
  taxUnitTypeLabels,
  taxUnitTypes,
  toDonationFilter,
} from "@/features/donations/list";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";
import { PaymentMethodName } from "@/features/donations/payment-method-name";

export const Route = createFileRoute("/_app/donations/")({
  validateSearch: donationsList.validateSearch,
  component: DonationsPage,
});

type DonationRow = RouterOutputs["donations"]["list"]["rows"][number];

const col = createColumns<DonationRow>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("timestamp", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("donor", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("paymentMethod", {
    header: "Method",
    cell: ({ getValue }) => <PaymentMethodName value={getValue()} />,
  }),
  col.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("transactionCost", {
    header: "Fee",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("kid", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("taxUnitType", {
    header: "Tax unit",
    meta: { cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => taxUnitTypeLabels[getValue() ?? "none"],
  }),
]);

function DonationsPage() {
  const list = useListState(donationsList);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [peekId, setPeekId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = toDonationFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.donations.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });

  // Log-scale buckets: most donations are small, so fixed 5 000 kr buckets put nearly all of
  // them in the first bar.
  const histogram = useQuery({
    ...trpc.donations.histogram.queryOptions({ scale: "log", buckets: 24 }),
    staleTime: 300_000,
  });
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const causeAreas = useCauseAreaConfig({ includeInactive: true });

  const amountBins = useMemo(() => histogramBins(histogram.data ?? []), [histogram.data]);
  const methodOptions = useMemo(
    () => visiblePaymentMethods(methods.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    [methods.data],
  );
  const organizationOptions = useMemo(
    () =>
      (causeAreas.data ?? []).flatMap((area) =>
        area.organizations.map((org) => ({ value: org.id, label: org.name })),
      ),
    [causeAreas.data],
  );

  async function exportCsv() {
    setExporting(true);
    try {
      downloadCsv(
        await queryClient.fetchQuery(trpc.donations.export.queryOptions({ sort, filter })),
      );
    } catch (error) {
      notify.error(error, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const stats = query.data?.statistics;
  const total = stats?.numDonations;

  return (
    <ListPage
      title="Donations"
      actions={
        <>
          <Button onClick={() => void exportCsv()} pending={exporting} disabled={!total}>
            <DownloadIcon />
            {strings.actions.export}
          </Button>
          <Button variant="primary" asChild>
            <Link to="/donations/register">
              <PlusIcon />
              Register donation
            </Link>
          </Button>
        </>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor, KID or donation ID"
          end={<SavedViews list={list} />}
        >
          <DateRangeFilter field="date" label="Date" />
          <RangeFilter
            field="amount"
            label="Amount"
            format="money"
            unit="kr"
            histogram={amountBins.length ? amountBins : undefined}
          />
          <OptionsFilter field="method" label="Payment method" options={methodOptions} />
          <TextFilter field="id" label="Donation ID" numeric />
          <TextFilter field="kid" label="KID" numeric />
          <TextFilter field="fundraiser" label="Fundraiser ID" numeric />
          <OptionsFilter
            field="taxUnit"
            label="Tax unit"
            options={taxUnitTypes.map((type) => ({ value: type, label: taxUnitTypeLabels[type] }))}
          />
          <OptionsFilter field="org" label="Organization" options={organizationOptions} />
          <OptionsFilter
            field="owner"
            label="Data owner"
            options={(owners.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
          />
        </FilterBar>
      }
      peek={
        peekId != null && (
          <DonationPeek
            id={peekId}
            row={query.data?.rows.find((row) => row.id === peekId)}
            onClose={() => setPeekId(null)}
          />
        )
      }
    >
      {query.isError ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          className="mx-4 sm:mx-6"
        />
      ) : (
        <DataTable
          label="Donations"
          columns={columns}
          data={query.data?.rows}
          rowCount={total}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          {...list.tableState}
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={(row) =>
            void navigate({ to: "/donations/$id", params: { id: String(row.id) } })
          }
          peekedRowId={peekId != null ? String(peekId) : null}
          getRowHref={(row) => `/donations/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="donations"
              hint="Donations appear when payments are imported or registered."
            />
          }
          summary={
            stats && (
              <TableSummary
                items={[
                  { value: <Num value={stats.numDonations} />, suffix: "donations" },
                  {
                    label: "Sum",
                    value: <Money value={stats.sumDonations} />,
                  },
                  { label: "Average", value: <Money value={stats.avgDonation} /> },
                ]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}

const donationPeekLabels = [
  "Donor",
  "Email",
  "Date",
  "Method",
  "Fee",
  "KID",
  "External ref",
  "Data owner",
];

function DonationPeek({
  id,
  row,
  onClose,
}: {
  id: number;
  /** The list row, for the header while the details load. */
  row: { sum: string; donor: string | null } | undefined;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  // j/k moves the peek: the previous donation's details stay (dimmed) until the next's are in.
  const donation = usePageQuery(trpc.donations.get.queryOptions({ id }));
  const causeAreas = useCauseAreaConfig({ includeInactive: true });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const d = donation.data;
  const current = d && !donation.isPlaceholderData ? d : undefined;
  const sum = row?.sum ?? current?.sum;
  const donor = row?.donor ?? current?.donor;

  return (
    <PeekPanel
      title={sum !== undefined ? <Money value={sum} /> : `Donation #${id}`}
      subtitle={`Donation #${id}${donor ? ` · ${donor}` : ""}`}
      href={`/donations/${id}`}
      onClose={onClose}
      actions={
        current && <ResendReceiptDialog donationId={current.id} email={current.email} size="sm" />
      }
    >
      {donation.isError ? (
        <ErrorState error={donation.error} onRetry={() => void donation.refetch()} />
      ) : !d ? (
        <PropertyList labelWidth="7rem">
          {donationPeekLabels.map((label) => (
            <Property key={label} label={label} pending />
          ))}
        </PropertyList>
      ) : (
        <Updating active={donation.isPlaceholderData} className="grid content-start gap-6">
          <PropertyList labelWidth="7rem">
            <Property label="Donor">
              <Link
                to="/donors/$id"
                params={{ id: String(d.donorId) }}
                className="font-semibold text-accent hover:underline"
              >
                {d.donor}
              </Link>
            </Property>
            <Property label="Email">{d.email}</Property>
            <Property label="Date">
              <DateTime value={d.timestamp} format="datetime" />
            </Property>
            <Property label="Method">
              <PaymentMethodName value={d.paymentMethod} />
            </Property>
            <Property label="Fee">
              <Money value={d.transactionCost} />
            </Property>
            <Property label="KID">
              <Link
                to="/distributions/$kid"
                params={{ kid: d.KID }}
                className="num text-accent hover:underline"
              >
                {d.KID}
              </Link>
            </Property>
            <Property label="External ref">
              {d.paymentExternalRef && (
                <CopyValue value={d.paymentExternalRef} label="external reference" />
              )}
            </Property>
            <Property label="Data owner">
              {owners.data?.find((o) => o.id === d.metaOwnerId)?.name}
            </Property>
          </PropertyList>
          {causeAreas.data && (
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold">Distribution</h3>
              <DistributionSummary
                draft={draftFromApi(causeAreas.data, d.distribution)}
                config={causeAreas.data}
                amount={d.sum}
              />
            </section>
          )}
        </Updating>
      )}
    </PeekPanel>
  );
}
