import { Link } from "@tanstack/react-router";
import { createColumns, DataTable } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { EmptyState } from "@/components/domain/empty-state";
import { DateTime, Money } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { intentStatus } from "@/lib/status";
import { describeIntent, methodLabel, type Intent } from "./model";

/**
 * The donor page's notice for intents still awaiting payment. Quiet for a donor who has given
 * before; a warning for a donor with nothing received yet, where a missing first payment is
 * worth a follow-up.
 */
export function AwaitingIntentsCallout({
  intents,
  firstPayment,
}: {
  intents: readonly Intent[];
  /** The donor has no received donation yet */
  firstPayment: boolean;
}) {
  if (!intents.length) return null;
  return (
    <Callout
      tone={firstPayment ? "warning" : "neutral"}
      title={
        firstPayment
          ? "Waiting on this donor's first payment"
          : intents.length > 1
          ? `${intents.length} payments said, not received yet`
          : "Payment said, not received yet"
      }
    >
      <ul className="grid gap-0.5" data-testid="awaiting-intents">
        {intents.map((intent) => {
          const { said, parts } = describeIntent(intent);
          return (
            <li key={intent.id}>
              {said} · {parts.join(" · ")}
              {" · "}
              <Link
                to="/distributions/$kid"
                params={{ kid: intent.KID }}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                KID {intent.KID}
              </Link>
            </li>
          );
        })}
      </ul>
    </Callout>
  );
}

const col = createColumns<Intent>();
const columns = col.columns([
  col.accessor("created", {
    header: "Said on",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("methodId", {
    header: "Method",
    cell: ({ row }) => methodLabel(row.original.methodId, row.original.method),
  }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={intentStatus} value={getValue()} />,
  }),
  col.accessor("matchedDonation", {
    header: "First donation after",
    cell: ({ getValue }) => {
      const donation = getValue();
      if (!donation) return <span className="text-faint-foreground">–</span>;
      return (
        <Link
          to="/donations/$id"
          params={{ id: String(donation.id) }}
          className="underline-offset-2 hover:underline"
        >
          <Money value={donation.sum} /> on <DateTime value={donation.date} />
        </Link>
      );
    },
  }),
  col.accessor((row) => row.followUps.count, {
    id: "followUps",
    header: "Reminders",
    meta: { numeric: true },
    cell: ({ row }) =>
      row.original.followUps.count ? (
        <>
          {row.original.followUps.count} · <DateTime value={row.original.followUps.last} />
        </>
      ) : (
        <span className="text-faint-foreground">–</span>
      ),
  }),
]);

/** A compact table of intents, for the donor page and the KID page */
export function IntentsTable({
  intents,
  isLoading,
  label,
}: {
  intents: readonly Intent[] | undefined;
  isLoading: boolean;
  label: string;
}) {
  return (
    <DataTable
      label={label}
      columns={columns}
      data={intents as Intent[] | undefined}
      isLoading={isLoading}
      getRowId={(row) => String(row.id)}
      empty={
        <EmptyState
          size="sm"
          title="No donation intents"
          description="They're saved when a donor submits the donation widget."
        />
      }
    />
  );
}
