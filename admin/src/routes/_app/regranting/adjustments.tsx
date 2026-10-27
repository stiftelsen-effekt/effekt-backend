import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import {
  DateRangeFilter,
  defineList,
  FilterBar,
  ListEmpty,
  OptionsFilter,
  param,
  useListState,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AdjustmentDialog } from "@/features/regranting/adjustment-dialog";
import {
  adjustmentTypeLabels,
  adjustmentTypes,
  type Adjustment,
} from "@/features/regranting/model";
import { RecipientLink, RoundLink, useOrganizations } from "@/features/regranting/ui";
import { RecordDialog } from "@/features/settings/record-dialog";
import { formatMoney } from "@/lib/format";
import { compareMoney, sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";

const adjustmentsList = defineList({
  id: "regranting-adjustments",
  filters: {
    q: param.text,
    type: param.list(adjustmentTypes),
    org: param.numberList,
    date: param.dateRange,
  },
  sortable: ["effectiveAt", "amount", "recipient"],
  defaultSort: { id: "effectiveAt", desc: true },
});

export const Route = createFileRoute("/_app/regranting/adjustments")({
  validateSearch: adjustmentsList.validateSearch,
  component: AdjustmentsPage,
});

const col = createColumns<Adjustment>();
const columns = col.columns([
  col.accessor("effectiveAt", {
    header: "Counts from",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("type", {
    header: "Type",
    enableSorting: false,
    cell: ({ row: { original: a } }) => (
      <span className="inline-flex items-center gap-1.5">
        {adjustmentTypeLabels[a.type]}
        {a.type === "fronted" ? (
          <Badge tone="outline">Record</Badge>
        ) : a.pending ? (
          <Badge tone="outline" title="Attached to a draft round; counts once it is approved">
            Pending
          </Badge>
        ) : null}
      </span>
    ),
  }),
  col.accessor("organizationName", {
    id: "recipient",
    header: "Recipient",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("projectName", {
    header: "Project",
    enableSorting: false,
    cell: ({ getValue }) =>
      getValue() ?? <span className="text-muted-foreground">Unrestricted</span>,
  }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} signed />,
  }),
  col.accessor("reason", {
    header: "Reason",
    enableSorting: false,
    meta: { cellClassName: "max-w-sm truncate" },
  }),
  col.accessor("linkedTransferId", {
    header: "Linked",
    enableSorting: false,
    cell: ({ row: { original: a } }) =>
      a.linkedTransferId ? (
        `Transfer #${a.linkedTransferId}`
      ) : a.linkedDonationId ? (
        `Donation #${a.linkedDonationId}`
      ) : a.type === "fronted" ? (
        <Badge tone="warning">Donation not linked</Badge>
      ) : null,
  }),
  col.accessor("documentRef", {
    header: "Bilag",
    enableSorting: false,
    meta: { cellClassName: "max-w-32 truncate" },
  }),
  col.accessor("createdBy", {
    header: "By",
    enableSorting: false,
    meta: { cellClassName: "max-w-40 truncate text-muted-foreground" },
  }),
]);

function AdjustmentsPage() {
  const trpc = useTRPC();
  const list = useListState(adjustmentsList);
  const { type, org, date } = list.filters;
  const query = useQuery({
    ...trpc.regranting.adjustments.list.queryOptions({
      types: type,
      organizationId: org?.length === 1 ? org[0] : undefined,
      from: date?.from,
      to: date?.to,
    }),
    placeholderData: keepPreviousData,
  });
  const orgs = useOrganizations();
  const [peekId, setPeekId] = useState<number | null>(null);
  const rows = useMemo(() => {
    const q = list.filters.q?.trim().toLowerCase();
    const dir = list.sort.desc ? -1 : 1;
    return (query.data ?? [])
      .filter((a) => !org || org.includes(a.organizationId))
      .filter(
        (a) =>
          !q ||
          a.reason.toLowerCase().includes(q) ||
          a.organizationName.toLowerCase().includes(q) ||
          (a.documentRef ?? "").toLowerCase().includes(q) ||
          String(a.id) === q,
      )
      .sort((a, b) =>
        list.sort.id === "amount"
          ? dir * compareMoney(a.amount, b.amount)
          : list.sort.id === "recipient"
          ? dir * a.organizationName.localeCompare(b.organizationName, "nb")
          : dir * a.effectiveAt.localeCompare(b.effectiveAt) || dir * (a.id - b.id),
      );
  }, [query.data, org, list.filters.q, list.sort.id, list.sort.desc]);
  const peeked = rows.find((a) => a.id === peekId);

  return (
    <ListPage
      title="Adjustments"
      description="Typed, signed entries with a reason: opening balances, fees, corrections, reallocations, fronted amounts and own funds."
      actions={
        <AdjustmentDialog
          trigger={
            <Button variant="primary">
              <PlusIcon />
              New adjustment
            </Button>
          }
        />
      }
      filters={
        <FilterBar list={list} searchPlaceholder="Reason, recipient or bilag">
          <OptionsFilter
            field="type"
            label="Type"
            options={adjustmentTypes.map((t) => ({ value: t, label: adjustmentTypeLabels[t] }))}
          />
          <OptionsFilter
            field="org"
            label="Recipient"
            options={(orgs.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
          />
          <DateRangeFilter field="date" label="Counts from" />
        </FilterBar>
      }
      peek={peeked && <AdjustmentPeek adjustment={peeked} onClose={() => setPeekId(null)} />}
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load adjustments"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Adjustments"
          columns={columns}
          data={query.data ? rows : undefined}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          sorting={list.tableState.sorting}
          onSortingChange={list.tableState.onSortingChange}
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={(row) => setPeekId(row.id)}
          peekedRowId={peekId != null ? String(peekId) : null}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="adjustments"
              hint="Adjustments record what the donation data doesn't: opening balances, fees, corrections."
            />
          }
          summary={
            query.data && (
              <TableSummary
                items={[
                  { value: <Num value={rows.length} />, suffix: "adjustments" },
                  {
                    label: "Net effect",
                    value: (
                      <Money
                        value={sumMoney(rows.filter((a) => a.affectsBalance).map((a) => a.amount))}
                        signed
                      />
                    ),
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

function AdjustmentPeek({
  adjustment: a,
  onClose,
}: {
  adjustment: Adjustment;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.adjustments.delete.mutationOptions());
  const link = useMutation(trpc.regranting.adjustments.linkDonation.mutationOptions());
  const round = useQuery({
    ...trpc.regranting.rounds.get.queryOptions({ id: a.roundId ?? 0 }),
    enabled: a.roundId !== null,
  });
  const locked =
    a.roundId !== null && round.data !== undefined && round.data.round.status !== "draft";
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
  return (
    <PeekPanel
      title={`${adjustmentTypeLabels[a.type]} ${formatMoney(a.amount)}`}
      subtitle={`Adjustment #${a.id} · ${a.organizationName}`}
      href={`/regranting/recipients/${a.organizationId}`}
      onClose={onClose}
      actions={
        !locked && (
          <>
            {a.pairedAdjustmentId === null && (
              <AdjustmentDialog
                adjustment={a}
                trigger={
                  <Button size="sm">
                    <PencilIcon />
                    Edit
                  </Button>
                }
              />
            )}
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost" aria-label="Delete adjustment">
                  <Trash2Icon />
                </Button>
              }
              tone="danger"
              title={`Delete this ${adjustmentTypeLabels[a.type].toLowerCase()} of ${formatMoney(
                a.amount,
              )}?`}
              consequences={[
                a.pairedAdjustmentId !== null
                  ? "It's half of an earmark: both halves (unrestricted and project) are deleted. The round's Pay now stays; remove the earmark in the round to move it back."
                  : a.affectsBalance
                  ? `${a.organizationName}'s balance changes by ${formatMoney(
                      a.amount.startsWith("-") ? a.amount.slice(1) : `-${a.amount}`,
                    )}`
                  : a.pending
                  ? "It's pending in a draft round; no balance changes"
                  : "It's a record only; no balance changes",
              ]}
              confirmLabel="Delete adjustment"
              onConfirm={async () => {
                await remove.mutateAsync({ id: a.id });
                await invalidate();
                notify.success("Adjustment deleted");
                onClose();
              }}
            />
          </>
        )
      }
    >
      <PropertyList>
        <Property label="Recipient">
          <RecipientLink organizationId={a.organizationId}>{a.organizationName}</RecipientLink>
        </Property>
        <Property label="Project">
          {a.projectId && (
            <Link
              to="/regranting/projects/$id"
              params={{ id: String(a.projectId) }}
              className="text-accent hover:underline"
            >
              {a.projectName}
            </Link>
          )}
        </Property>
        <Property label="Amount">
          <Money value={a.amount} signed className="font-semibold" />
        </Property>
        <Property label="Counts from">
          <DateTime value={a.effectiveAt} />
        </Property>
        <Property label="In balance">
          {a.affectsBalance
            ? "Yes"
            : a.pending
            ? "Not yet: it counts once its round is approved"
            : "No, a record only"}
        </Property>
        <Property label="Reason">{a.reason}</Property>
        <Property label="Round">
          {a.roundId && (
            <RoundLink id={a.roundId}>{round.data?.round.name ?? `#${a.roundId}`}</RoundLink>
          )}
        </Property>
        <Property label="Corrects">
          {a.linkedTransferId && `Transfer #${a.linkedTransferId}`}
        </Property>
        <Property label="Donation">
          {a.linkedDonationId && (
            <Link
              to="/donations/$id"
              params={{ id: String(a.linkedDonationId) }}
              className="text-accent hover:underline"
            >
              #{a.linkedDonationId}
            </Link>
          )}
        </Property>
        <Property label="Bilag">{a.documentRef}</Property>
        <Property label="Entered">
          {a.createdBy} · <DateTime value={a.createdAt} format="datetime" />
        </Property>
      </PropertyList>
      {a.type === "fronted" && (
        <div className="mt-4">
          <RecordDialog<{ donationId: string }>
            trigger={
              <Button size="sm">
                {a.linkedDonationId ? "Change linked donation" : "Link the donation"}
              </Button>
            }
            title="Link the fronted donation"
            description="Once linked, major donor rounds skip the donation: it's already been passed on. Leave empty to unlink."
            initial={() => ({ donationId: a.linkedDonationId ? String(a.linkedDonationId) : "" })}
            validate={(v) => ({
              donationId:
                v.donationId.trim() === "" || /^\d+$/.test(v.donationId.trim())
                  ? undefined
                  : "Enter a donation ID",
            })}
            saveLabel="Save link"
            onSave={async (v) => {
              await link.mutateAsync({
                id: a.id,
                donationId: v.donationId.trim() ? Number(v.donationId) : null,
              });
              await invalidate();
              notify.success(v.donationId.trim() ? "Donation linked" : "Donation unlinked");
            }}
          >
            {({ values, set, errors }) => (
              <Field label="Donation ID" error={errors.donationId}>
                <Input
                  inputMode="numeric"
                  className="num w-40"
                  value={values.donationId}
                  onChange={(e) => set({ donationId: e.target.value })}
                />
              </Field>
            )}
          </RecordDialog>
        </div>
      )}
    </PeekPanel>
  );
}
