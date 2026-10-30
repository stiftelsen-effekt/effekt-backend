import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { ListPage } from "@/components/templates";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Pending, Updating } from "@/components/ui/pending";
import { OnwardLineLink, OnwardStatusBadge } from "@/features/regranting/onward";
import { RoundLink } from "@/features/regranting/ui";
import { usePageQuery } from "@/lib/query";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

type AwaitingLine = RouterOutputs["regranting"]["onward"]["awaiting"][number]["lines"][number];

type Search = { from?: string; to?: string };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/_app/regranting/onward")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    ...(isDay(raw.from) ? { from: raw.from } : {}),
    ...(isDay(raw.to) ? { to: raw.to } : {}),
  }),
  component: AwaitingReportPage,
});

/**
 * Paid lines to intermediary payees (GiveWell) that the payee hasn't reported on yet, oldest
 * first and grouped by payee, to chase the reports. Assumed (backfilled) amounts are listed
 * separately: they count as forwarded but aren't confirmed.
 */
function AwaitingReportPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const query = usePageQuery(
    trpc.regranting.onward.awaiting.queryOptions({ from: search.from, to: search.to }),
  );
  const setSearch = (patch: Search) =>
    void navigate({ to: ".", search: (prev: Search) => ({ ...prev, ...patch }) });

  return (
    <ListPage
      breadcrumbs={[{ label: "Regranting", to: "/regranting" }]}
      title="Awaiting report"
      description="Paid lines to intermediary payees such as GiveWell, until the payee reports where the money went. Enter reports on the round page's transfers."
      actions={
        <Link
          to="/regranting/onward-reports"
          className="rounded-xs text-sm text-accent hover:underline focus-ring"
        >
          Onward reports
        </Link>
      }
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Paid from">
            <DateInput
              value={search.from ?? ""}
              onValueChange={(from) => setSearch({ from: from || undefined })}
            />
          </Field>
          <Field label="Paid to">
            <DateInput
              value={search.to ?? ""}
              onValueChange={(to) => setSearch({ to: to || undefined })}
            />
          </Field>
        </div>
      }
    >
      <div className="grid gap-8 px-4 pb-8 sm:px-6">
        {query.isError ? (
          <ErrorState
            error={query.error}
            title="Couldn't load the lines awaiting a report"
            onRetry={() => void query.refetch()}
          />
        ) : !query.data ? (
          <Pending className="h-96" label="Loading the lines awaiting a report" />
        ) : query.data.length === 0 ? (
          <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
            Every paid line to an intermediary payee is reported.
          </p>
        ) : (
          <Updating active={query.isPlaceholderData}>
            <div className="grid gap-8">
              {query.data.map((group) => {
                const awaiting = group.lines.filter((l) => l.awaitingNok !== "0.00");
                const assumed = group.lines.filter((l) => l.assumedNok !== "0.00");
                return (
                  <section key={group.payeeId} aria-label={group.payeeName} className="grid gap-3">
                    <h2 className="text-lg font-semibold">
                      {group.payeeName}
                      <span className="ml-3 text-sm font-normal text-muted-foreground">
                        Awaiting <Money value={group.awaitingNok} /> · assumed{" "}
                        <Money value={group.assumedNok} />
                      </span>
                    </h2>
                    <LinesTable
                      label={`Awaiting report from ${group.payeeName}`}
                      lines={awaiting}
                      amount="awaitingNok"
                      amountLabel="Awaiting"
                      empty="Nothing awaiting a report."
                    />
                    {assumed.length > 0 && (
                      <>
                        <h3 className="text-sm font-semibold">
                          Assumed, not confirmed by {group.payeeName}
                        </h3>
                        <LinesTable
                          label={`Assumed from ${group.payeeName}`}
                          lines={assumed}
                          amount="assumedNok"
                          amountLabel="Assumed"
                          empty=""
                        />
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          </Updating>
        )}
      </div>
    </ListPage>
  );
}

function LinesTable({
  label,
  lines,
  amount,
  amountLabel,
  empty,
}: {
  label: string;
  lines: AwaitingLine[];
  amount: "awaitingNok" | "assumedNok";
  amountLabel: string;
  empty: string;
}) {
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full text-sm" aria-label={label}>
        <thead>
          <tr className="text-left text-xs text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th scope="col">Paid</th>
            <th scope="col">Round</th>
            <th scope="col">Recipient</th>
            <th scope="col" className="text-right">
              Line
            </th>
            <th scope="col" className="text-right">
              {amountLabel}
            </th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-3 [&>tr>td]:py-1.5">
          {lines.map((l) => (
            <tr key={l.id} data-line={l.id}>
              <td className="whitespace-nowrap">
                <DateTime value={l.paidAt} />
              </td>
              <td>
                <RoundLink id={l.roundId}>{l.roundName}</RoundLink>
                <span className="ml-1 text-xs text-muted-foreground">#{l.transferId}</span>
              </td>
              <td>
                <OnwardLineLink line={l} />
              </td>
              <td className="text-right">
                <Money value={l.amountNok} />
              </td>
              <td className="text-right font-semibold">
                <Money value={l[amount]} />
              </td>
              <td>
                <OnwardStatusBadge status={l.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
