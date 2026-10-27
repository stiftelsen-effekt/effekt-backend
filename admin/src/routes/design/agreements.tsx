import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BanIcon, DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import {
  DateRangeFilter,
  defineList,
  FilterBar,
  OptionsFilter,
  param,
  RangeFilter,
  SavedViews,
  useListState,
  type FilterValues,
} from "@/components/filters";
import { ListPage, PageSection, PeekPanel } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  avtaleGiroAgreements,
  avtaleGiroDetail,
  causeAreas,
  vippsAgreements,
} from "@/design-system/fake-data";
import {
  agreementTypes,
  describeChargeDay,
  fromAvtaleGiro,
  fromVipps,
  type AgreementRow,
  type AgreementType,
} from "@/features/agreements/model";
import { draftFromApi } from "@/features/distribution/model";
import { sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { agreementStatus, type AgreementStatus } from "@/lib/status";
import { strings } from "@/lib/strings";

const statusKeys = Object.keys(agreementStatus) as AgreementStatus[];
const typeKeys = ["vipps", "avtalegiro"] as const satisfies AgreementType[];

const agreementsList = defineList({
  id: "design-agreements",
  filters: {
    q: param.text,
    type: param.list(typeKeys),
    status: param.list(statusKeys),
    amount: param.range,
    chargeDay: param.range,
    created: param.dateRange,
  },
  sortable: ["created", "amount", "chargeDay", "donorName"],
  defaultSort: { id: "created", desc: true },
});

export const Route = createFileRoute("/design/agreements")({
  validateSearch: agreementsList.validateSearch,
  component: AgreementsDemo,
});

const allAgreements: AgreementRow[] = [
  ...vippsAgreements.map(fromVipps),
  ...avtaleGiroAgreements.map(fromAvtaleGiro),
];

type Filters = FilterValues<typeof agreementsList.filters>;

async function fetchAgreements(
  filters: Filters,
  sort: { id: string; desc: boolean },
  page: number,
  size: number,
) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const q = filters.q?.toLowerCase();
  const rows = allAgreements.filter(
    (row) =>
      (!q || row.donorName.toLowerCase().includes(q) || row.KID.includes(q) || row.id === q) &&
      (!filters.type?.length || (filters.type as string[]).includes(row.type)) &&
      (!filters.status?.length || filters.status.includes(row.status)) &&
      (filters.amount?.min === undefined || row.amount >= filters.amount.min) &&
      (filters.amount?.max === undefined || row.amount <= filters.amount.max) &&
      (filters.chargeDay?.min === undefined || row.chargeDay >= filters.chargeDay.min) &&
      (filters.chargeDay?.max === undefined || row.chargeDay <= filters.chargeDay.max) &&
      (!filters.created?.from || (row.created ?? "") >= filters.created.from) &&
      (!filters.created?.to || (row.created ?? "").slice(0, 10) <= filters.created.to),
  );
  const key = sort.id as "created" | "amount" | "chargeDay" | "donorName";
  const dir = sort.desc ? -1 : 1;
  const sorted = [...rows].sort((a, b) =>
    (a[key] ?? "") < (b[key] ?? "") ? -dir : (a[key] ?? "") > (b[key] ?? "") ? dir : 0,
  );
  const active = rows.filter((row) => row.status === "active");
  return {
    rows: sorted.slice((page - 1) * size, page * size),
    total: rows.length,
    active: active.length,
    monthly: sumMoney(active.map((row) => row.amount)),
  };
}

const col = createColumns<AgreementRow>();
const columns = col.columns([
  col.accessor("donorName", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("type", {
    header: "Type",
    enableSorting: false,
    cell: ({ getValue }) => <Badge tone="outline">{agreementTypes[getValue()].label}</Badge>,
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ getValue }) => <Status catalog={agreementStatus} value={getValue()} />,
  }),
  col.accessor("amount", {
    header: "Monthly",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("chargeDay", {
    header: "Charge day",
    meta: { numeric: true },
    cell: ({ getValue }) => (getValue() === 0 ? "Last" : `${getValue()}.`),
  }),
  col.accessor("KID", {
    header: "KID",
    enableSorting: false,
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("created", {
    header: "Created",
    meta: { numeric: true },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function AgreementsDemo() {
  const list = useListState(agreementsList);
  const navigate = useNavigate();
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["design-agreements", list.filters, list.sort, list.page, list.pageSize],
    queryFn: () => fetchAgreements(list.filters, list.sort, list.page, list.pageSize),
    placeholderData: keepPreviousData,
  });
  const peeked = allAgreements.find((row) => row.key === peekKey);
  const distribution = useMemo(() => draftFromApi(causeAreas, avtaleGiroDetail.distribution), []);
  const statusCounts = Object.fromEntries(
    statusKeys.map((status) => [status, allAgreements.filter((a) => a.status === status).length]),
  );

  return (
    <ListPage
      title="Agreements"
      actions={
        <Button onClick={() => notify.success("Export started")}>
          <DownloadIcon />
          {strings.actions.export}
        </Button>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor, KID or agreement ID"
          end={<SavedViews list={list} />}
        >
          <OptionsFilter
            field="status"
            label="Status"
            options={statusKeys.map((s) => ({
              value: s,
              label: agreementStatus[s].label,
              count: statusCounts[s],
            }))}
          />
          <OptionsFilter
            field="type"
            label="Type"
            options={typeKeys.map((t) => ({ value: t, label: agreementTypes[t].label }))}
          />
          <RangeFilter field="amount" label="Monthly amount" format="money" unit="kr" />
          <RangeFilter field="chargeDay" label="Charge day" />
          <DateRangeFilter field="created" label="Created" />
        </FilterBar>
      }
      peek={
        peeked && (
          <PeekPanel
            title={peeked.donorName}
            subtitle={`${agreementTypes[peeked.type].label} agreement · ${peeked.KID}`}
            href="/design/detail"
            onClose={() => setPeekKey(null)}
            actions={
              peeked.status === "active" && (
                <ConfirmDialog
                  tone="danger"
                  title={`Stop ${peeked.donorName}'s ${
                    agreementTypes[peeked.type].label
                  } agreement?`}
                  consequences={[
                    <>
                      No more charges of <Money value={peeked.amount} className="font-semibold" />{" "}
                      from next month.
                    </>,
                    "The donor gets an email confirming the cancellation.",
                    "This can't be undone here; the donor must sign up again.",
                  ]}
                  confirmLabel="Stop agreement"
                  onConfirm={async () => {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    notify.success("Agreement stopped", peeked.donorName);
                  }}
                  trigger={
                    <Button size="sm">
                      <BanIcon />
                      Stop agreement
                    </Button>
                  }
                />
              )
            }
          >
            <PropertyList>
              <Property label="Status">
                <Status catalog={agreementStatus} value={peeked.status} />
              </Property>
              <Property label="Monthly">
                <Money value={peeked.amount} className="font-semibold" />
              </Property>
              <Property label="Charged">{describeChargeDay(peeked.chargeDay)}</Property>
              <Property label="KID">
                <CopyValue value={peeked.KID} label="KID" />
              </Property>
              <Property label="Agreement ID">
                <CopyValue value={peeked.id} label="agreement ID" />
              </Property>
              <Property label="Created">
                <DateTime value={peeked.created} />
              </Property>
            </PropertyList>
            <PageSection title="Distribution">
              <DistributionSummary draft={distribution} config={causeAreas} />
            </PageSection>
          </PeekPanel>
        )
      }
    >
      <DataTable
        label="Agreements"
        columns={columns}
        data={query.data?.rows}
        rowCount={query.data?.total}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        getRowId={(row) => row.key}
        {...list.tableState}
        onRowPeek={(row) => setPeekKey(row.key)}
        onRowOpen={() => void navigate({ to: "/design/detail" })}
        peekedRowId={peekKey}
        pageHotkeys
        summary={
          query.data && (
            <TableSummary
              items={[
                { value: <Num value={query.data.total} />, suffix: "agreements" },
                { label: "Active", value: <Num value={query.data.active} /> },
                { label: "Monthly when active", value: <Money value={query.data.monthly} /> },
              ]}
            />
          )
        }
      />
    </ListPage>
  );
}
