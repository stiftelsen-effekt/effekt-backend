/**
 * On the round page: what each transfer contained (rounds.composition, FIFO) and the checklist
 * before approval. The checklist is a reminder kept in this browser, not stored with the round
 * (docs/regranting.md, "Checking the numbers").
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/domain/error-state";
import { Money } from "@/components/domain/format";
import { PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Pending } from "@/components/ui/pending";
import { moneySign } from "@/lib/money";
import { useTRPC } from "@/lib/trpc";
import type { Builder } from "./model";
import { CompositionView } from "./trace";
import { summarizeLine, type Composition } from "./trace-model";

export function TransferContents({ roundId, editable }: { roundId: number; editable: boolean }) {
  const trpc = useTRPC();
  const [shown, setShown] = useState(false);
  const query = useQuery({
    ...trpc.regranting.rounds.composition.queryOptions({ roundId }),
    enabled: shown,
  });
  return (
    <PageSection
      title="What each transfer contains"
      description={
        editable
          ? "Per line, which money it pays: what the round passes on itself, money carried over from earlier rounds, and money since the recipient's last transfer. Oldest money is paid first. Uses the saved Pay now."
          : "Per line, which money it paid: what the round passed on itself, money carried over from earlier rounds, and money since the recipient's last transfer. Oldest money is paid first."
      }
      actions={
        !shown && (
          <Button size="sm" onClick={() => setShown(true)}>
            Show
          </Button>
        )
      }
    >
      {shown &&
        (query.isError ? (
          <ErrorState
            error={query.error}
            title="Couldn't load what the transfers contain"
            onRetry={() => void query.refetch()}
          />
        ) : !query.data ? (
          <Pending className="h-40" label="Loading what the transfers contain" />
        ) : (
          <ContentsList composition={query.data} />
        ))}
    </PageSection>
  );
}

function ContentsList({ composition }: { composition: Composition }) {
  if (composition.lines.length === 0)
    return <p className="text-sm text-muted-foreground">The round has no saved transfer lines.</p>;
  const transfers = [...new Set(composition.lines.map((l) => l.transferId))];
  return (
    <div className="grid gap-4">
      {transfers.map((id) => {
        const lines = composition.lines.filter((l) => l.transferId === id);
        return (
          <section
            key={id}
            aria-label={`Transfer #${id} to ${lines[0]!.payee.name}`}
            className="rounded-md border border-border"
          >
            <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">
              Transfer #{id} to {lines[0]!.payee.name}
            </h3>
            <ul>
              {lines.map((line) => (
                <li key={line.transferLineId} className="border-b border-border last:border-b-0">
                  <details className="px-3 py-2">
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 rounded-xs focus-ring">
                      <span className="font-semibold">
                        {line.organizationName}
                        {line.projectName ? ` · ${line.projectName}` : ""}
                      </span>
                      <span className="flex-1 text-xs text-muted-foreground">
                        {summarizeLine(line)}
                      </span>
                      <Money value={line.amount} className="font-semibold" />
                    </summary>
                    <div className="mt-2">
                      <CompositionView
                        line={line}
                        paymentMethodIds={composition.paymentMethodIds}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

//region Checklist

export type ChecklistItem = { id: string; label: string; hint?: React.ReactNode };

/** The checks that apply to a round, in order */
export function checklistItems(builder: Builder, checkLink: React.ReactNode): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "overview",
      label: "Balances checked against the overview",
      hint: <>Explain (ⓘ) on each line shows where a balance comes from; {checkLink}.</>,
    },
  ];
  if (builder.round.kind === "major_donor" || builder.donations.length > 0)
    items.push({ id: "major", label: "Major donations confirmed in the bank" });
  if (moneySign(builder.unassigned.amount) !== 0)
    items.push({ id: "unassigned", label: "Donations without a split have been given one" });
  if (builder.fundGrants.length > 0)
    items.push({ id: "grants", label: "Fund grant rationales read" });
  items.push({ id: "payees", label: "Payees, accounts and currencies checked" });
  return items;
}

const storageKey = (roundId: number) => `regranting-checklist-${roundId}`;

/** Ticked items of a round's checklist, kept in this browser only */
export function useChecklist(roundId: number) {
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(roundId));
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(roundId), JSON.stringify([...checked]));
    } catch {
      // private window or blocked storage: the checklist just isn't remembered
    }
  }, [roundId, checked]);
  const toggle = (id: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return { checked, toggle };
}

/** The months to compare: from the month after the last regular round's cutoff to this cutoff */
export const checkMonths = (cutoff: string) => {
  const [y, m] = cutoff.split("-").map(Number) as [number, number];
  const to = `${y}-${String(m).padStart(2, "0")}`;
  const fromDate = new Date(Date.UTC(y, m - 1 - 11, 1));
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
  return { from, to };
};

export function ApprovalChecklist({
  builder,
  checklist,
}: {
  builder: Builder;
  checklist: ReturnType<typeof useChecklist>;
}) {
  const months = checkMonths(builder.round.cutoff);
  const items = checklistItems(
    builder,
    <Link
      to="/regranting/check"
      search={months as never}
      className="text-accent underline focus-ring"
    >
      compare the months in Check numbers
    </Link>,
  );
  const done = items.filter((i) => checklist.checked.has(i.id)).length;
  return (
    <PageSection
      title="Before approving"
      description={`${done} of ${items.length} checked. A reminder for whoever approves; it is kept in this browser, not stored with the round.`}
    >
      <ul className="grid gap-2" aria-label="Checklist before approval">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <Checkbox
              id={`check-${item.id}`}
              checked={checklist.checked.has(item.id)}
              onCheckedChange={(c) => checklist.toggle(item.id, c === true)}
              className="mt-0.5"
            />
            <div className="grid gap-0.5">
              <Label htmlFor={`check-${item.id}`} className="font-normal">
                {item.label}
              </Label>
              {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

//endregion
