import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { Callout } from "@/components/domain/callout";
import { ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pending, Updating } from "@/components/ui/pending";
import { DonationsListLink } from "@/features/regranting/trace";
import {
  reconciliationCsv,
  reconciliationFilename,
  type Reconciliation,
} from "@/features/regranting/trace-model";
import { downloadText } from "@/lib/download";
import { osloDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { moneySign } from "@/lib/money";
import { usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Search = { from?: string; to?: string };
const isMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export const Route = createFileRoute("/_app/regranting/check")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    ...(isMonth(raw.from) ? { from: raw.from } : {}),
    ...(isMonth(raw.to) ? { to: raw.to } : {}),
  }),
  component: CheckPage,
});

/** Default: this year so far (Samlefila has a tab per year) */
function period(search: Search) {
  const thisMonth = osloDay().slice(0, 7);
  const to = search.to ?? thisMonth;
  const from = search.from ?? `${to.slice(0, 4)}-01`;
  return from <= to ? { from, to } : { from: to, to };
}

const monthLabel = (month: string) => formatDate(`${month}-01`, "month");
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function CheckPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { from, to } = period(search);
  const query = usePageQuery(trpc.regranting.reconciliation.monthly.queryOptions({ from, to }));
  const data = query.data;
  const setSearch = (patch: Search) =>
    void navigate({ to: ".", search: (prev: Search) => ({ ...prev, ...patch }) });

  return (
    <ListPage
      breadcrumbs={[{ label: "Regranting", to: "/regranting" }]}
      title="Check numbers"
      description="Before approving a round: the allocations per recipient and month, recomputed straight from the donations, and every month's donations accounted for. The same layout as Samlefila's overview, by UTC month like the balances."
      actions={
        <Button
          disabled={!data}
          onClick={() =>
            data && downloadText(reconciliationFilename(data), reconciliationCsv(data))
          }
        >
          <DownloadIcon />
          Export CSV
        </Button>
      }
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From month">
            <Input
              type="month"
              className="w-44"
              value={from}
              max={to}
              onChange={(e) => isMonth(e.target.value) && setSearch({ from: e.target.value })}
            />
          </Field>
          <Field label="To month">
            <Input
              type="month"
              className="w-44"
              value={to}
              min={from}
              onChange={(e) => isMonth(e.target.value) && setSearch({ to: e.target.value })}
            />
          </Field>
        </div>
      }
    >
      <div className="grid gap-6 px-4 pb-8 sm:px-6">
        {query.isError ? (
          <ErrorState
            error={query.error}
            title="Couldn't check the numbers"
            onRetry={() => void query.refetch()}
          />
        ) : !data ? (
          <Pending className="h-96" label="Checking the numbers" />
        ) : (
          <Updating active={query.isPlaceholderData}>
            <div className="grid gap-6">
              <Verdicts data={data} />
              <MonthTotals data={data} />
              <Overview data={data} />
              {data.splitGaps.length > 0 && <SplitGaps data={data} />}
            </div>
          </Updating>
        )}
      </div>
    </ListPage>
  );
}

function Verdicts({ data }: { data: Reconciliation }) {
  const c = data.checks;
  return (
    <div className="grid gap-2">
      {c.allocationsMatch ? (
        <Callout tone="success" title="Allocations match the donations">
          For every recipient and month, the allocations the balances use equal a recomputation
          straight from the donations and their splits.
        </Callout>
      ) : (
        <Callout tone="danger" title={`${c.mismatchedCells} recipient-months don't match`}>
          The allocations the balances use differ from the recomputation in the cells marked below.
          Don&apos;t approve until this is explained.
        </Callout>
      )}
      {c.totalsMatch ? (
        <Callout tone="success" title="Every month's donations are accounted for">
          Allocations plus donations without a split equal the confirmed donations (Influenced and
          AMF direkte left out) in every month.
        </Callout>
      ) : c.monthsUnexplained === 0 ? (
        <Callout
          tone="warning"
          title={`${c.monthsWithDifference} months have splits that don't add up to 100 %`}
        >
          The difference in those months is the part those splits leave out (listed at the bottom).
          Fix the splits in the donation database.
        </Callout>
      ) : (
        <Callout
          tone="danger"
          title={`${c.monthsUnexplained} months have an unexplained difference`}
        >
          Donations, allocations and Unassigned don&apos;t add up in the months marked below.
        </Callout>
      )}
    </div>
  );
}

const th = "px-3 py-2 text-xs font-semibold text-muted-foreground";
const td = "border-t border-border px-3 py-1.5";

function MonthTotals({ data }: { data: Reconciliation }) {
  const rows = [
    ...data.totals.map((t) => ({ label: monthLabel(t.month), t })),
    { label: "Total", t: { month: "", ...data.total } },
  ];
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-semibold">Per month</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm" aria-label="Per month">
          <thead>
            <tr className="text-left">
              <th scope="col" className={th}>
                Month
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Confirmed donations
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Allocated
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Without a split
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Difference
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Splits not 100 %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, t }) => {
              const unexplained = moneySign(t.unexplained) !== 0;
              const diff = moneySign(t.difference) !== 0;
              return (
                <tr
                  key={label}
                  className={cn(
                    label === "Total" && "font-semibold",
                    unexplained && "bg-danger-subtle/40",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      td,
                      "text-left font-normal",
                      label === "Total" && "font-semibold",
                    )}
                  >
                    {label}
                  </th>
                  <td className={cn(td, "text-right")}>
                    <Money value={t.donations} />{" "}
                    <span className="text-xs text-muted-foreground">
                      (<Num value={t.donationCount} />)
                    </span>
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money value={t.allocated} />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Money value={t.unassigned} />
                    {t.unassignedCount > 0 && (
                      <span className="text-xs text-muted-foreground"> ({t.unassignedCount})</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      td,
                      "text-right",
                      diff && (unexplained ? "text-danger" : "text-warning-foreground"),
                    )}
                  >
                    <Money value={t.difference} signed />
                  </td>
                  <td className={cn(td, "text-right")}>
                    {moneySign(t.splitGap) !== 0 ? <Money value={t.splitGap} signed /> : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Difference = confirmed donations − allocated − without a split. It should be 0; a split that
        doesn&apos;t add up to 100 % explains its part. Unlike the Sheets export, Drift is included
        and AMF direkte left out, as in the balances.
      </p>
    </section>
  );
}

function Overview({ data }: { data: Reconciliation }) {
  const recipients = data.recipients.filter((r) =>
    r.months.some((m) => m.allocated !== "0.00" || m.recomputed !== "0.00"),
  );
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-semibold">Per recipient and month</h2>
      <p className="text-xs text-muted-foreground">
        The recipients&apos; share of the confirmed donations, as the balances count it. Each cell
        opens the Donations list for that recipient and month (Oslo days, each donation&apos;s share
        rounded, so a few kroner can differ). A highlighted cell differs from the recomputation.
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="text-sm" aria-label="Per recipient and month">
          <thead>
            <tr className="text-left">
              <th scope="col" className={cn(th, "sticky left-0 bg-surface")}>
                Recipient
              </th>
              {data.months.map((m) => (
                <th key={m} scope="col" className={cn(th, "text-right whitespace-nowrap")}>
                  {monthLabel(m)}
                </th>
              ))}
              <th scope="col" className={cn(th, "text-right")}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.organizationId}>
                <th
                  scope="row"
                  className={cn(
                    td,
                    "sticky left-0 bg-surface text-left font-normal whitespace-nowrap",
                  )}
                >
                  {r.name} <span className="text-xs text-muted-foreground">{r.abbriv}</span>
                </th>
                {r.months.map((m) => {
                  const bad = moneySign(m.difference) !== 0;
                  return (
                    <td
                      key={m.month}
                      className={cn(td, "text-right", bad && "bg-danger-subtle/60")}
                      title={bad ? `Recomputed: ${m.recomputed}` : undefined}
                    >
                      {m.allocated === "0.00" ? (
                        <span className="text-faint-foreground">–</span>
                      ) : (
                        <DonationsListLink
                          link={{
                            organizationId: r.organizationId,
                            from: `${m.month}-01`,
                            to: lastDay(m.month),
                          }}
                          paymentMethodIds={data.paymentMethodIds}
                        >
                          <Money value={m.allocated} />
                        </DonationsListLink>
                      )}
                      {bad && (
                        <span className="block text-xs text-danger">
                          ≠ <Money value={m.recomputed} />
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className={cn(td, "text-right font-semibold")}>
                  <Money value={r.allocated} />
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <th scope="row" className={cn(td, "sticky left-0 bg-surface text-left")}>
                All recipients
              </th>
              {data.totals.map((t) => (
                <td key={t.month} className={cn(td, "text-right")}>
                  <Money value={t.allocated} />
                </td>
              ))}
              <td className={cn(td, "text-right")}>
                <Money value={data.total.allocated} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SplitGaps({ data }: { data: Reconciliation }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-base font-semibold">Splits that don&apos;t add up to 100 %</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm" aria-label="Splits that don't add up to 100 %">
          <thead>
            <tr className="text-left">
              <th scope="col" className={th}>
                KID
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Split adds up to
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Donations
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Not allocated
              </th>
            </tr>
          </thead>
          <tbody>
            {data.splitGaps.map((g) => (
              <tr key={g.kid}>
                <td className={td}>
                  <Link
                    to="/distributions"
                    search={{ kid: g.kid } as never}
                    className="rounded-xs text-accent hover:underline focus-ring"
                  >
                    {g.kid}
                  </Link>
                </td>
                <td className={cn(td, "text-right")}>{g.sharePercent.replace(".", ",")} %</td>
                <td className={cn(td, "text-right")}>
                  <Money value={g.amount} />{" "}
                  <span className="text-xs text-muted-foreground">({g.donationCount})</span>
                </td>
                <td className={cn(td, "text-right")}>
                  <Money value={g.notAllocated} signed />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
