import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { cellPlaceholder, createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { isOpen, type Pledge } from "@/features/analysis/model";
import {
  AddPledgeDialog,
  ChangeAmountDialog,
  MarkReceivedDialog,
  useInvalidateAnalysis,
} from "@/features/analysis/pledge-dialogs";
import { formatDate, formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { pledgeStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/analysis/pledges")({
  loader: ({ context: { queryClient, trpc }, cause }) =>
    loadPage(queryClient, cause, trpc.analysis.pledges.list.queryOptions()),
  component: PledgesPage,
});

const col = createColumns<Pledge>();
const columns = col.columns([
  col.display({
    id: "status",
    header: "Status",
    cell: ({ row: { original: p } }) => (
      <Status catalog={pledgeStatus} value={isOpen(p) ? "open" : "received"} />
    ),
  }),
  col.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, placeholder: cellPlaceholder.money, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("decidedDate", {
    header: "Decided",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("receivedDate", {
    header: "Received",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => {
      const value = getValue();
      return value ? <DateTime value={value} /> : null;
    },
  }),
  col.accessor("donationId", {
    header: "Donation",
    cell: ({ getValue }) => {
      const id = getValue();
      return id ? (
        <Link
          to="/donations/$id"
          params={{ id: String(id) }}
          className="num text-accent hover:underline"
        >
          #{id}
        </Link>
      ) : null;
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { cellClassName: "w-px whitespace-nowrap text-right" },
    cell: ({ row: { original: p } }) => <PledgeActions pledge={p} />,
  }),
]);

function PledgesPage() {
  const trpc = useTRPC();
  const query = useQuery(trpc.analysis.pledges.list.queryOptions());
  const open = (query.data ?? []).filter(isOpen);

  return (
    <ListPage
      title="Pledges"
      description="Decided gifts that haven't arrived (tilsagn). Open pledges are shown on top of the measured total on the overview, never mixed into it. Only the amount and dates are stored, never who pledged."
      actions={
        <AddPledgeDialog
          trigger={
            <Button variant="primary">
              <PlusIcon />
              Add pledge
            </Button>
          }
        />
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load pledges"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Pledges"
          columns={columns}
          data={query.data}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          empty={
            <EmptyState
              size="sm"
              title="No pledges yet"
              description="Add one when a gift is decided, then mark it received when the money is in."
            />
          }
          summary={
            query.data && (
              <TableSummary
                items={[
                  { value: <Num value={open.length} />, suffix: "open" },
                  {
                    label: "Open in total",
                    value: <Money value={sumMoney(open.map((p) => p.sum))} />,
                  },
                  {
                    value: <Num value={query.data.length - open.length} />,
                    suffix: "received",
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

/**
 * Per pledge: open ones can be marked received or have their amount changed; received ones
 * reopened (undoable, no confirmation). Deleting asks first.
 */
function PledgeActions({ pledge }: { pledge: Pledge }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAnalysis();
  const reopen = useMutation(trpc.analysis.pledges.reopen.mutationOptions());
  const markReceived = useMutation(trpc.analysis.pledges.markReceived.mutationOptions());
  const remove = useMutation(trpc.analysis.pledges.delete.mutationOptions());
  const what = `the pledge of ${formatMoney(pledge.sum)} decided ${formatDate(pledge.decidedDate)}`;

  function reopenPledge() {
    const { receivedDate, donationId } = pledge;
    reopen.mutate(
      { id: pledge.id },
      {
        onSuccess: async () => {
          await invalidate();
          notify.undo("Pledge reopened", () =>
            markReceived.mutate(
              { id: pledge.id, receivedDate: receivedDate!, donationId },
              {
                onSuccess: async () => {
                  await invalidate();
                  notify.success("Change undone");
                },
                onError: (error) => notify.error(error, "Couldn't undo"),
              },
            ),
          );
        },
        onError: (error) => notify.error(error, "Couldn't reopen the pledge"),
      },
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {isOpen(pledge) ? (
        <>
          <MarkReceivedDialog
            pledge={pledge}
            trigger={
              <Button size="sm" variant="ghost">
                <CheckIcon />
                Mark received
              </Button>
            }
          />
          <ChangeAmountDialog
            pledge={pledge}
            trigger={
              <Button size="sm" variant="ghost">
                <PencilIcon />
                Change amount
              </Button>
            }
          />
        </>
      ) : (
        <Button size="sm" variant="ghost" pending={reopen.isPending} onClick={reopenPledge}>
          <RotateCcwIcon />
          Reopen
        </Button>
      )}
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" aria-label={`Delete ${what}`}>
            <Trash2Icon />
          </Button>
        }
        tone="danger"
        title={`Delete ${what}?`}
        consequences={[
          isOpen(pledge)
            ? `The open pledges on the overview go down by ${formatMoney(pledge.sum)}`
            : "The overview doesn't change: a received pledge already counts as measured",
          "Use it for a pledge that fell through. It can't be undone.",
        ]}
        confirmLabel="Delete pledge"
        onConfirm={async () => {
          await remove.mutateAsync({ id: pledge.id });
          await invalidate();
          notify.success("Pledge deleted");
        }}
      />
    </span>
  );
}
