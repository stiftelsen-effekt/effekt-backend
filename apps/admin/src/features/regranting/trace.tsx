/**
 * Where regranting numbers come from: the breakdown of a balance (Balances peek, round builder
 * lines, statement) and what a payment contained (round page). Every figure links to its source
 * or says how it's computed, and every list ends in a sum line that adds up exactly.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pending } from "@/components/ui/pending";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import { moneySign } from "@/lib/money";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { adjustmentTypeLabels } from "./model";
import {
  dayRange,
  donationsSearch,
  lineTotal,
  monthSpan,
  type AllocationMonth,
  type Breakdown,
  type BreakdownEntry,
  type CommittedEntry,
  type CompositionItem,
  type CompositionLine,
  type DonationsLink,
} from "./trace-model";
import { RoundLink } from "./ui";

const linkClass = "rounded-xs text-accent underline underline-offset-2 focus-ring";

export function DonationsListLink({
  link,
  paymentMethodIds,
  children,
}: {
  link: DonationsLink;
  paymentMethodIds: readonly number[];
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/donations"
      search={donationsSearch(link, paymentMethodIds) as never}
      className={linkClass}
    >
      {children}
    </Link>
  );
}

/** A figure with its entries folded underneath: label, amount, and how it's computed */
function Figure({
  sign,
  label,
  amount,
  hint,
  count,
  children,
  strong,
  testId,
}: {
  sign: "" | "+" | "−" | "±" | "=";
  label: string;
  amount: string;
  hint?: React.ReactNode;
  count?: number;
  children?: React.ReactNode;
  strong?: boolean;
  testId?: string;
}) {
  const row = (
    <span className="flex w-full items-baseline gap-2">
      <span className="w-3 shrink-0 text-center text-muted-foreground" aria-hidden>
        {sign}
      </span>
      <span className={cn("flex-1", strong && "font-semibold")}>
        {label}
        {count !== undefined && count > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{count}</span>
        )}
      </span>
      <Money
        value={amount}
        signed={sign !== "="}
        className={cn(strong && "font-semibold")}
        data-testid={testId}
      />
    </span>
  );
  if (!children)
    return (
      <div className={cn("px-2 py-1.5", strong && "border-t border-border-strong")}>
        {row}
        {hint && <p className="ml-5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  return (
    <details className="group rounded-sm px-2 py-1.5 open:bg-muted/30">
      <summary className="cursor-pointer list-none rounded-xs focus-ring [&::-webkit-details-marker]:hidden">
        {row}
        {hint && <p className="ml-5 text-xs text-muted-foreground">{hint}</p>}
      </summary>
      <div className="mt-1.5 ml-5 grid gap-1 text-xs">{children}</div>
    </details>
  );
}

function EntryRow({ children, amount }: { children: React.ReactNode; amount: string }) {
  return (
    <div className="flex items-baseline gap-2 border-t border-border/60 pt-1 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">{children}</div>
      <Money value={amount} signed />
    </div>
  );
}

const projectNote = (e: { projectId: number | null; projectName: string | null }) =>
  e.projectId !== null ? ` · ${e.projectName ?? `Project #${e.projectId}`}` : "";

function AdjustmentEntry({ e }: { e: BreakdownEntry }) {
  return (
    <EntryRow amount={e.amount}>
      <DateTime value={e.date} /> ·{" "}
      <Link
        to="/regranting/adjustments"
        search={{ date: `${e.date}..${e.date}` } as never}
        className={linkClass}
      >
        {e.adjustmentType ? adjustmentTypeLabels[e.adjustmentType] : "Adjustment"}
      </Link>
      {projectNote(e)}: {e.reason}
      {e.documentRef && <span className="text-muted-foreground"> · bilag {e.documentRef}</span>}
      {e.round && (
        <>
          {" "}
          · in <RoundLink id={e.round.id}>{e.round.name}</RoundLink>
        </>
      )}
    </EntryRow>
  );
}

function GrantEntry({ e, out }: { e: BreakdownEntry; out?: boolean }) {
  return (
    <EntryRow amount={e.amount}>
      <DateTime value={e.date} /> · {out ? "To" : "From"} {e.counterpartName}
      {projectNote(e)} in {e.round && <RoundLink id={e.round.id}>{e.round.name}</RoundLink>}
      {e.rationale && <span className="block text-muted-foreground">{e.rationale}</span>}
    </EntryRow>
  );
}

function TransferEntry({ e, paidLabel = "Paid" }: { e: BreakdownEntry; paidLabel?: string }) {
  return (
    <EntryRow amount={e.amount}>
      {e.date ? (
        <>
          {paidLabel} <DateTime value={e.date} />
        </>
      ) : (
        "Not paid yet"
      )}{" "}
      · {e.round && <RoundLink id={e.round.id}>{e.round.name}</RoundLink>} · transfer #
      {e.transferId} to {e.payeeName}
      {projectNote(e)}
      {e.bankRef && <span className="text-muted-foreground"> · ref {e.bankRef}</span>}
      {e.paidBy === "external" && (
        <span className="text-muted-foreground"> · paid by someone else</span>
      )}
    </EntryRow>
  );
}

const committedLabels: Record<CommittedEntry["committedReason"], string> = {
  approved_unpaid: "Approved, not paid yet",
  paid_later: "Paid after the date",
  granted_later: "Granted after the date",
  adjusted_later: "Adjusted in a later round",
};

function CommittedRow({ e }: { e: CommittedEntry }) {
  if (e.committedReason === "adjusted_later") return <AdjustmentEntry e={e} />;
  if (e.committedReason === "granted_later") return <GrantEntry e={e} out />;
  return <TransferEntry e={e} paidLabel={committedLabels[e.committedReason]} />;
}

/** Allocations per month, grouped by year (latest open), each with its Donations list link */
function AllocationMonths({ breakdown }: { breakdown: Breakdown }) {
  const months = [...breakdown.allocations.months].reverse();
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))];
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground">
        The recipient&apos;s share of each donation, by the UTC day it was confirmed (payments
        Influenced and AMF direkte left out). Months are rounded so they add up to the total.
      </p>
      {years.map((year, i) => (
        <details key={year} open={i === 0} className="rounded-xs">
          <summary className="cursor-pointer py-0.5 font-semibold focus-ring">{year}</summary>
          <table className="mt-1 w-full" aria-label={`Donations ${year}`}>
            <thead>
              <tr className="text-left text-muted-foreground [&>th]:px-1 [&>th]:pb-1 [&>th]:font-normal">
                <th scope="col">Month</th>
                <th scope="col" className="text-right">
                  Share
                </th>
                <th scope="col" className="text-right">
                  Donations
                </th>
                <th scope="col" className="pl-3">
                  In the Donations list
                </th>
              </tr>
            </thead>
            <tbody>
              {months
                .filter((m) => m.month.startsWith(year))
                .map((m) => (
                  <MonthRow key={m.month} m={m} paymentMethodIds={breakdown.paymentMethodIds} />
                ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

function MonthRow({ m, paymentMethodIds }: { m: AllocationMonth; paymentMethodIds: number[] }) {
  const same = moneySign(m.list.difference) === 0;
  const notes = [
    moneySign(m.list.rounding) !== 0 &&
      `${formatMoneyText(m.list.rounding)} from rounding each donation's share`,
    moneySign(m.list.timeZone) !== 0 &&
      `${formatMoneyText(m.list.timeZone)} from ${
        Math.abs(m.list.timeZoneDonations) || "some"
      } donations confirmed around midnight (Oslo days there, UTC days here)`,
  ].filter(Boolean);
  return (
    <tr className="align-top [&>td]:border-t [&>td]:border-border/60 [&>td]:px-1 [&>td]:py-1">
      <td className="whitespace-nowrap">{formatDate(`${m.month}-01`, "month")}</td>
      <td className="text-right">
        <Money value={m.amount} />
      </td>
      <td className="text-right" title={`Whole donations: ${formatMoneyText(m.donationsSum)}`}>
        <Num value={m.donationCount} />
      </td>
      <td className="pl-3">
        <DonationsListLink link={m.list.link} paymentMethodIds={paymentMethodIds}>
          <Money value={m.list.sum} /> · <Num value={m.list.donationCount} />
        </DonationsListLink>{" "}
        {same ? (
          <CheckIcon className="inline size-3 text-success" aria-label="Same" />
        ) : (
          <span className="block text-muted-foreground">
            {formatMoneyText(m.list.difference, true)}: {notes.join("; ")}
          </span>
        )}
      </td>
    </tr>
  );
}

const formatMoneyText = (value: string, signed = false) => {
  const n = value.startsWith("-") ? value.slice(1) : value;
  const [int, frac] = n.split(".");
  const text = `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${frac === "00" ? "" : `,${frac}`} kr`;
  return value.startsWith("-") ? `−${text}` : signed && moneySign(value) > 0 ? `+${text}` : text;
};

/**
 * The balance as a sum: opening + donations + fund grants − transfers ± adjustments = balance,
 * − committed = available; in a round, + its fund grants and adjustments = available in the
 * round, − Pay now = carries over. Each figure unfolds into its entries.
 */
export function BreakdownView({ breakdown: b }: { breakdown: Breakdown }) {
  const r = b.inRound;
  return (
    <div className="grid gap-0.5 text-sm" data-testid="balance-breakdown">
      {!b.check.matches && (
        <Callout tone="danger" title="This breakdown doesn't match the balance">
          {b.check.differences.join("; ")}. Don&apos;t approve on these figures; tell the
          developers.
        </Callout>
      )}
      <Figure
        sign=""
        label="Opening balance"
        amount={b.opening.total}
        count={b.opening.entries.length}
      >
        {b.opening.entries.length ? (
          b.opening.entries.map((e) => <AdjustmentEntry key={e.adjustmentId} e={e} />)
        ) : (
          <p className="text-muted-foreground">No opening balance.</p>
        )}
      </Figure>
      {b.scope !== "all" && typeof b.scope === "number" ? null : (
        <Figure
          sign="+"
          label="Donations"
          amount={b.allocations.total}
          count={b.allocations.donationCount}
          hint={`${b.allocations.months.length} months, each linked to the Donations list`}
        >
          <AllocationMonths breakdown={b} />
        </Figure>
      )}
      <Figure
        sign="+"
        label="Fund grants in"
        amount={b.fundGrantsIn.total}
        count={b.fundGrantsIn.entries.length}
      >
        {b.fundGrantsIn.entries.length ? (
          b.fundGrantsIn.entries.map((e) => <GrantEntry key={e.fundGrantLineId} e={e} />)
        ) : (
          <p className="text-muted-foreground">None.</p>
        )}
      </Figure>
      {b.isFund && (
        <Figure
          sign="−"
          label="Fund grants out"
          amount={b.fundGrantsOut.total}
          count={b.fundGrantsOut.entries.length}
        >
          {b.fundGrantsOut.entries.map((e) => (
            <GrantEntry key={e.fundGrantLineId} e={e} out />
          ))}
        </Figure>
      )}
      <Figure
        sign="−"
        label="Transfers"
        amount={b.transfers.total}
        count={b.transfers.entries.length}
      >
        {b.transfers.entries.length ? (
          b.transfers.entries.map((e) => <TransferEntry key={e.transferLineId} e={e} />)
        ) : (
          <p className="text-muted-foreground">None paid by this date.</p>
        )}
      </Figure>
      <Figure
        sign="±"
        label="Adjustments"
        amount={b.adjustments.total}
        count={b.adjustments.entries.length}
      >
        {b.adjustments.entries.length ? (
          b.adjustments.entries.map((e) => <AdjustmentEntry key={e.adjustmentId} e={e} />)
        ) : (
          <p className="text-muted-foreground">
            None. Fronted entries are records and never count.
          </p>
        )}
      </Figure>
      <Figure
        sign="="
        label={`Balance ${r ? "at the cutoff" : "on"} ${formatDate(b.at)}`}
        amount={b.balance}
        strong
        testId="breakdown-balance"
      />
      <Figure
        sign="−"
        label="Committed"
        amount={b.committed.total}
        count={b.committed.entries.length}
        hint="Approved but not paid, or paid, granted or adjusted after the date"
      >
        {b.committed.entries.length ? (
          b.committed.entries.map((e, i) => (
            <CommittedRow key={`${e.committedReason}-${i}`} e={e} />
          ))
        ) : (
          <p className="text-muted-foreground">Nothing committed.</p>
        )}
      </Figure>
      <Figure sign="=" label="Available" amount={b.available} strong testId="breakdown-available" />
      {r && (
        <>
          <Figure sign="+" label="This round's fund grants" amount={r.fundGrants.total}>
            {r.fundGrants.entries.length
              ? r.fundGrants.entries.map((e) => <GrantEntry key={e.fundGrantLineId} e={e} />)
              : undefined}
          </Figure>
          <Figure sign="±" label="This round's adjustments" amount={r.adjustments.total}>
            {r.adjustments.entries.length
              ? r.adjustments.entries.map((e) => <AdjustmentEntry key={e.adjustmentId} e={e} />)
              : undefined}
          </Figure>
          <Figure sign="=" label="Available in this round" amount={r.available} strong />
          <Figure sign="−" label="Pay now (saved)" amount={r.payNow.total} />
          <Figure sign="=" label="Carries over" amount={r.carriesOver} strong />
        </>
      )}
      {b.check.matches && (
        <p className="mt-2 flex items-center gap-1 px-2 text-xs text-muted-foreground">
          <CheckIcon className="size-3 text-success" aria-hidden />
          Adds up, and matches the balance query.
        </p>
      )}
    </div>
  );
}

/** Loads and shows a breakdown (balances.breakdown) */
export function BalanceBreakdown({
  organizationId,
  projectId,
  at,
  roundId,
}: {
  organizationId: number;
  /** undefined = the recipient; null = unrestricted */
  projectId?: number | null;
  at?: string;
  roundId?: number;
}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.regranting.balances.breakdown.queryOptions({
      organizationId,
      ...(projectId !== undefined ? { projectId } : {}),
      ...(roundId !== undefined ? { roundId } : at ? { at } : {}),
    }),
  );
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        title="Couldn't load the breakdown"
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return <Pending className="h-64" label="Loading the breakdown" />;
  return <BreakdownView breakdown={query.data} />;
}

//region Composition

function ItemView({
  item,
  paymentMethodIds,
}: {
  item: CompositionItem;
  paymentMethodIds: number[];
}) {
  switch (item.kind) {
    case "donations":
      return (
        <EntryRow amount={item.amount}>
          <DonationsListLink link={item.link} paymentMethodIds={paymentMethodIds}>
            Donations {dayRange(item.from, item.to)}
          </DonationsListLink>
          : <Num value={item.donationCount} /> donations
          {(item.partialStart || item.partialEnd) && (
            <span className="text-muted-foreground">
              {" "}
              (
              {[item.partialStart && "the first day", item.partialEnd && "the last day"]
                .filter(Boolean)
                .join(" and ")}{" "}
              shared with another payment)
            </span>
          )}
          {item.months.length > 1 && (
            <details className="mt-0.5">
              <summary className="cursor-pointer text-muted-foreground focus-ring">
                By month ({monthSpan(item.from, item.to)})
              </summary>
              <ul className="mt-0.5 grid gap-0.5">
                {item.months.map((m) => (
                  <li key={m.month} className="flex gap-2">
                    <DonationsListLink link={m.link} paymentMethodIds={paymentMethodIds}>
                      {formatDate(`${m.month}-01`, "month")}
                    </DonationsListLink>
                    <span className="flex-1 text-muted-foreground">
                      {m.donationCount} donations{m.partial ? ", partly" : ""}
                    </span>
                    <Money value={m.amount} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </EntryRow>
      );
    case "donation":
      return (
        <EntryRow amount={item.amount}>
          <Badge tone={item.reason === "chosen" ? "accent" : "warning"} className="mr-1">
            {item.reason === "chosen" ? "Major donation" : "Fronted donation"}
          </Badge>
          <Link to="/donations/$id" params={{ id: String(item.donationId) }} className={linkClass}>
            #{item.donationId}
          </Link>{" "}
          · {item.donorName ?? `Donor #${item.donorId}`} ·{" "}
          <DateTime value={item.timestampConfirmed} /> · donation <Money value={item.sum} />
        </EntryRow>
      );
    case "opening":
      return (
        <EntryRow amount={item.amount}>
          Opening balance (<DateTime value={item.date} />
          ): {item.reason}
        </EntryRow>
      );
    case "fund_grant_in":
      return (
        <EntryRow amount={item.amount}>
          Fund grant from {item.fundName} in{" "}
          <RoundLink id={item.round.id}>{item.round.name}</RoundLink>
          {item.rationale && <span className="block text-muted-foreground">{item.rationale}</span>}
        </EntryRow>
      );
    case "adjustment":
      return (
        <EntryRow amount={item.amount}>
          {adjustmentTypeLabels[item.type]} (<DateTime value={item.date} />
          ): {item.reason}
          {item.round && (
            <>
              {" "}
              · in <RoundLink id={item.round.id}>{item.round.name}</RoundLink>
            </>
          )}
        </EntryRow>
      );
  }
}

function Group({
  label,
  hint,
  group,
  paymentMethodIds,
}: {
  label: string;
  hint?: string;
  group: CompositionLine["thisRound"];
  paymentMethodIds: number[];
}) {
  if (group.items.length === 0) return null;
  return (
    <section className="grid gap-1 px-2 py-1.5">
      <h4 className="flex items-baseline gap-2 font-semibold">
        <span className="flex-1">
          {label}
          {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>}
        </span>
        <Money value={group.amount} />
      </h4>
      <div className="ml-3 grid gap-1 text-xs">
        {group.items.map((item, i) => (
          <ItemView key={i} item={item} paymentMethodIds={paymentMethodIds} />
        ))}
      </div>
    </section>
  );
}

/** What one transfer line contained, as a sum that ends in the line's amount */
export function CompositionView({
  line,
  paymentMethodIds,
}: {
  line: CompositionLine;
  paymentMethodIds: number[];
}) {
  const prev = line.previous;
  return (
    <div className="grid gap-0.5 text-sm" data-testid="composition">
      <p className="px-2 text-xs text-muted-foreground">
        {prev ? (
          <>
            Previous transfer:{" "}
            <RoundLink id={prev.round.id} underline>
              {prev.round.name}
            </RoundLink>{" "}
            (cutoff {formatDate(prev.round.cutoff)}, to {prev.payeeName}
            {prev.paidAt ? `, paid ${formatDate(prev.paidAt)}` : ", not paid yet"}).
          </>
        ) : (
          "No earlier transfer to this recipient."
        )}{" "}
        Oldest money is paid first; what the round passes on itself comes first.
      </p>
      <Group
        label="Passed on in this round"
        group={line.thisRound}
        paymentMethodIds={paymentMethodIds}
      />
      <Group
        label="Carried over"
        hint={
          prev
            ? `not paid in earlier rounds, from before ${formatDate(line.window.from!)}`
            : undefined
        }
        group={line.carriedOver}
        paymentMethodIds={paymentMethodIds}
      />
      <Group
        label={prev ? "Since the last transfer" : "Since the start"}
        hint={
          line.window.from
            ? dayRange(line.window.from, line.window.to)
            : `up to ${formatDate(line.window.to)}`
        }
        group={line.sinceLastTransfer}
        paymentMethodIds={paymentMethodIds}
      />
      {line.ahead && (
        <section className="grid gap-1 px-2 py-1.5">
          <h4 className="flex items-baseline gap-2 font-semibold">
            <span className="flex-1">
              Paid ahead of the money
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                the balance went negative (fronted)
              </span>
            </span>
            <Money value={line.ahead.amount} />
          </h4>
          <div className="ml-3 grid gap-1 text-xs">
            {line.ahead.settledBy.length > 0 && (
              <p className="text-muted-foreground">Covered later by:</p>
            )}
            {line.ahead.settledBy.map((item, i) => (
              <ItemView key={i} item={item} paymentMethodIds={paymentMethodIds} />
            ))}
            {moneySign(line.ahead.unsettled) !== 0 && (
              <EntryRow amount={line.ahead.unsettled}>Not covered yet</EntryRow>
            )}
          </div>
        </section>
      )}
      <Figure
        sign="="
        label="This payment"
        amount={lineTotal(line)}
        strong
        testId="composition-total"
      />
      <p className="px-2 text-xs text-muted-foreground">
        {moneySign(line.leftAfter.amount) > 0 ? (
          <>
            <Money value={line.leftAfter.amount} /> up to the cutoff wasn&apos;t paid and carries
            over
            {line.leftAfter.oldest && <> (the oldest from {formatDate(line.leftAfter.oldest)})</>}.
          </>
        ) : (
          "Nothing up to the cutoff was left unpaid."
        )}
      </p>
    </div>
  );
}

/** Loads one line's composition */
export function LineComposition({
  roundId,
  organizationId,
  projectId,
}: {
  roundId: number;
  organizationId: number;
  projectId: number | null;
}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.regranting.rounds.composition.queryOptions({ roundId, organizationId, projectId }),
  );
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        title="Couldn't load what the payment contains"
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return <Pending className="h-64" label="Loading the payment" />;
  if (query.data.lines.length === 0)
    return (
      <p className="px-2 text-sm text-muted-foreground">
        Nothing is saved to pay this line in the round yet.
      </p>
    );
  return (
    <div className="grid gap-4">
      {query.data.lines.map((line) => (
        <div key={line.transferLineId}>
          {query.data.lines.length > 1 && (
            <h4 className="px-2 text-xs text-muted-foreground">
              Transfer #{line.transferId} to {line.payee.name}
            </h4>
          )}
          <CompositionView line={line} paymentMethodIds={query.data.paymentMethodIds} />
        </div>
      ))}
    </div>
  );
}

//endregion

/**
 * "Explain" for a round builder line: a side sheet with the balance at the cutoff and what the
 * saved payment contains.
 */
export function ExplainLine({
  roundId,
  organizationId,
  projectId,
  label,
  hasPayment,
}: {
  roundId: number;
  organizationId: number;
  projectId: number | null;
  label: string;
  hasPayment: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label={`Explain ${label}`}
        title="Where these numbers come from"
        onClick={() => setOpen(true)}
      >
        <InfoIcon />
      </Button>
      <SheetContent className="w-[min(44rem,calc(100%-2rem))] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription>
            Where the numbers come from, and what the payment contains.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <Tabs defaultValue={hasPayment ? "contains" : "balance"} className="px-3 py-3">
            <TabsList>
              <TabsTrigger value="balance">Balance at cutoff</TabsTrigger>
              <TabsTrigger value="contains">What the payment contains</TabsTrigger>
            </TabsList>
            <TabsContent value="balance" className="pt-3">
              <BalanceBreakdown
                organizationId={organizationId}
                projectId={projectId}
                roundId={roundId}
              />
            </TabsContent>
            <TabsContent value="contains" className="pt-3">
              <LineComposition
                roundId={roundId}
                organizationId={organizationId}
                projectId={projectId}
              />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A button that opens the breakdown of a balance on a date in a side sheet (statement page) */
export function BreakdownSheetButton({
  organizationId,
  projectId,
  at,
  title,
}: {
  organizationId: number;
  projectId?: number | null;
  at: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <InfoIcon />
        Where the balance comes from
      </Button>
      <SheetContent className="w-[min(44rem,calc(100%-2rem))] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>The balance on {formatDate(at)}, entry by entry.</SheetDescription>
        </SheetHeader>
        {open && (
          <div className="px-3 py-3">
            <BalanceBreakdown organizationId={organizationId} projectId={projectId} at={at} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
