/**
 * Step 1 of the round builder: grants from our own funds. Each fund: what it can grant, its
 * grants in this round (lines per recipient/project, rationale required) and what stays.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Money } from "@/components/domain/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseMoneyInput } from "@/features/donations/form";
import { RecordDialog } from "@/features/settings/record-dialog";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import { compareMoney, fromMinorUnits, moneySign, sumMoney, toMinorUnits } from "@/lib/money";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { issuesFor, lineLabel, type Builder, type BuilderFund, type FundGrant } from "./model";
import { InlineIssues, OrganizationPicker, ProjectLink, ProjectPicker, RecipientLink } from "./ui";

type GrantLineForm = {
  organizationId: number | null;
  projectId: number | null;
  projectName: string | null;
  amount: string;
};
type GrantForm = { rationale: string; lines: GrantLineForm[]; repropose: boolean };

/** Client checks for a fund grant: rationale, at least one line, amounts, no duplicates. */
export function validateGrant(values: GrantForm, availableToGrant: string) {
  const errors: Record<string, string | undefined> = {
    rationale: values.rationale.trim() ? undefined : "Write why the fund grants this",
  };
  if (values.lines.length === 0) errors.lines = "Add at least one recipient";
  const seen = new Set<string>();
  values.lines.forEach((line, i) => {
    if (line.organizationId === null) errors[`line${i}`] = "Choose a recipient";
    const amount = parseMoneyInput(line.amount);
    if (amount === null || moneySign(amount) <= 0) errors[`amount${i}`] = "Enter an amount";
    const key = `${line.organizationId}:${line.projectId}`;
    if (seen.has(key)) errors[`line${i}`] = "This recipient and project is already on another line";
    seen.add(key);
  });
  const total = grantTotal(values);
  if (total !== null && compareMoney(total, availableToGrant) > 0)
    errors.lines = `The lines add up to ${formatMoney(total)}, more than the ${formatMoney(
      availableToGrant,
    )} the fund can grant`;
  return errors;
}

export function grantTotal(values: GrantForm): string | null {
  const amounts = values.lines.map((l) => parseMoneyInput(l.amount));
  return amounts.every((a) => a !== null) ? sumMoney(amounts as string[]) : null;
}

export function FundGrants({ builder, editable }: { builder: Builder; editable: boolean }) {
  if (builder.funds.length === 0) {
    return (
      <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
        No own funds. Mark a recipient as an own fund under Payees &amp; funds to grant from it
        here.
      </p>
    );
  }
  const funds = editable
    ? builder.funds
    : builder.funds.filter((f) => builder.fundGrants.some((g) => g.fundId === f.organizationId));
  if (funds.length === 0)
    return <p className="text-sm text-muted-foreground">No fund grants in this round.</p>;
  return (
    <div className="grid gap-4">
      {funds.map((fund) => (
        <FundCard
          key={fund.organizationId}
          builder={builder}
          fund={fund}
          grants={builder.fundGrants.filter((g) => g.fundId === fund.organizationId)}
          editable={editable}
        />
      ))}
    </div>
  );
}

function FundCard({
  builder,
  fund,
  grants,
  editable,
}: {
  builder: Builder;
  fund: BuilderFund;
  grants: FundGrant[];
  editable: boolean;
}) {
  return (
    <section
      aria-label={`Fund ${fund.name}`}
      className="rounded-md border border-accent/40 bg-accent-subtle/30"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-3 py-2.5">
        <h3 className="flex flex-1 items-center gap-2 text-base font-semibold">
          <RecipientLink organizationId={fund.organizationId}>{fund.name}</RecipientLink>
          <Badge tone="accent">Own fund</Badge>
        </h3>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Available</dt>
            <dd>
              <Money value={fund.availableToGrant} signed />
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Granted</dt>
            <dd>
              <Money value={fund.granted} className="font-semibold" />
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Stays in the fund</dt>
            <dd data-testid={`fund-remaining-${fund.organizationId}`}>
              <Money value={fund.remaining} signed />
            </dd>
          </div>
        </dl>
        {editable && (
          <FundGrantDialog
            builder={builder}
            fund={fund}
            trigger={
              <Button size="sm">
                <PlusIcon />
                Grant from {fund.abbriv || fund.name}
              </Button>
            }
          />
        )}
      </header>
      {grants.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          No grants from this fund in this round.
        </p>
      ) : (
        grants.map((grant) => (
          <GrantRows
            key={grant.id}
            builder={builder}
            fund={fund}
            grant={grant}
            editable={editable}
          />
        ))
      )}
    </section>
  );
}

function GrantRows({
  builder,
  fund,
  grant,
  editable,
}: {
  builder: Builder;
  fund: BuilderFund;
  grant: FundGrant;
  editable: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.fundGrants.delete.mutationOptions());
  const propose = useMutation(trpc.regranting.rounds.propose.mutationOptions());
  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Rationale: </span>
          {grant.rationale}
          <span className="ml-2 text-xs text-muted-foreground">by {grant.createdBy}</span>
        </p>
        {editable && (
          <>
            <FundGrantDialog
              builder={builder}
              fund={fund}
              grant={grant}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Edit grant #${grant.id}`}>
                  <PencilIcon />
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Delete grant #${grant.id}`}>
                  <Trash2Icon />
                </Button>
              }
              tone="danger"
              title={`Delete this grant of ${formatMoney(grant.total)} from ${grant.fundName}?`}
              consequences={[
                `${formatMoney(grant.total)} stays in ${grant.fundName}`,
                "The recipients' payments are proposed again without it",
              ]}
              confirmLabel="Delete grant"
              onConfirm={async () => {
                const orgs = [...new Set(grant.lines.map((l) => l.organizationId))];
                await remove.mutateAsync({ id: grant.id });
                if (orgs.length)
                  await propose.mutateAsync({ id: builder.round.id, organizationIds: orgs });
                await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
                notify.success("Fund grant deleted", grant.fundName);
              }}
            />
          </>
        )}
      </div>
      <InlineIssues
        issues={issuesFor(builder.issues, { fundGrantId: grant.id })}
        className="mt-1"
      />
      {/* Fixed layout and one column template, so recipients, projects and amounts line up
          across the grants. */}
      <table className="mt-2 w-full table-fixed text-sm" aria-label={`Lines of grant #${grant.id}`}>
        <colgroup>
          <col className="w-2/5" />
          <col />
          <col className="w-36" />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th>Recipient</th>
            <th>Project</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {grant.lines.map((line) => (
            <tr key={line.id} className="[&>td]:py-0.5">
              <td>
                <RecipientLink organizationId={line.organizationId}>
                  {line.organizationName}
                </RecipientLink>
              </td>
              <td className="text-muted-foreground">
                {line.projectId === null ? (
                  lineLabel(line)
                ) : (
                  <ProjectLink id={line.projectId}>{lineLabel(line)}</ProjectLink>
                )}
              </td>
              <td className="text-right">
                <Money value={line.amount} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold [&>td]:border-t [&>td]:border-border [&>td]:pt-1">
            <td colSpan={2}>Total</td>
            <td className="text-right">
              <Money value={grant.total} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FundGrantDialog({
  builder,
  fund,
  grant,
  trigger,
}: {
  builder: Builder;
  fund: BuilderFund;
  grant?: FundGrant;
  trigger: React.ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(trpc.regranting.fundGrants.create.mutationOptions());
  const update = useMutation(trpc.regranting.fundGrants.update.mutationOptions());
  const propose = useMutation(trpc.regranting.rounds.propose.mutationOptions());
  const fundIds = new Set(builder.funds.map((f) => f.organizationId));
  // Editing: the grant's own lines are part of what the fund can grant
  const limit = grant ? sumMoney([fund.remaining, grant.total]) : fund.remaining;

  return (
    <RecordDialog<GrantForm>
      trigger={trigger}
      title={grant ? `Edit grant from ${fund.name}` : `Grant from ${fund.name}`}
      description={`Up to ${formatMoney(
        limit,
      )} can be granted. The fund is debited the total; recipients are credited and paid in step 2.`}
      contentClassName="sm:max-w-2xl"
      initial={() => ({
        rationale: grant?.rationale ?? "",
        lines: grant
          ? grant.lines.map((l) => ({
              organizationId: l.organizationId,
              projectId: l.projectId,
              projectName: l.projectName,
              amount: formatMoneyInput(l.amount),
            }))
          : [{ organizationId: null, projectId: null, projectName: null, amount: "" }],
        repropose: true,
      })}
      validate={(v) => validateGrant(v, limit)}
      saveLabel={grant ? "Save grant" : "Add grant"}
      onSave={async (v) => {
        const lines = v.lines.map((l) => ({
          organizationId: l.organizationId!,
          projectId: l.projectId,
          amount: Number(parseMoneyInput(l.amount)!),
        }));
        if (grant) await update.mutateAsync({ id: grant.id, rationale: v.rationale.trim(), lines });
        else
          await create.mutateAsync({
            roundId: builder.round.id,
            fundId: fund.organizationId,
            rationale: v.rationale.trim(),
            lines,
          });
        const orgs = [
          ...new Set([
            ...lines.map((l) => l.organizationId),
            ...(grant?.lines.map((l) => l.organizationId) ?? []),
          ]),
        ];
        // The grant is saved either way: a failed re-proposal mustn't make Save create it twice
        // (the fund would be debited again). Proposing again is a separate step on the round.
        const proposed = v.repropose
          ? await propose
              .mutateAsync({ id: builder.round.id, organizationIds: orgs })
              .then(() => true)
              .catch((err) => {
                notify.error(
                  err,
                  grant
                    ? "The grant was saved, but its recipients' amounts weren't re-proposed"
                    : "The grant was added, but its recipients' amounts weren't re-proposed",
                );
                return false;
              })
          : true;
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        if (!proposed) return;
        notify.success(
          grant ? "Fund grant updated" : "Fund grant added",
          `${formatMoney(grantTotal(v))} from ${fund.name}`,
        );
      }}
    >
      {({ values, set, errors }) => {
        const setLine = (i: number, patch: Partial<GrantLineForm>) =>
          set({ lines: values.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
        const total = grantTotal(values);
        return (
          <>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Recipients</legend>
              {values.lines.map((line, i) => (
                <div
                  key={i}
                  className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
                >
                  <Field label={`Recipient ${i + 1}`} error={errors[`line${i}`]}>
                    <OrganizationPicker
                      value={line.organizationId}
                      exclude={fundIds}
                      onValueChange={(organizationId) =>
                        setLine(i, { organizationId, projectId: null, projectName: null })
                      }
                    />
                  </Field>
                  <Field label={`Project ${i + 1}`}>
                    <ProjectPicker
                      organizationId={line.organizationId}
                      value={line.projectId}
                      onValueChange={(projectId, projectName) =>
                        setLine(i, { projectId, projectName })
                      }
                    />
                  </Field>
                  <Field label={`Amount ${i + 1}`} error={errors[`amount${i}`]}>
                    <Input
                      inputMode="decimal"
                      className="num"
                      value={line.amount}
                      onChange={(e) => setLine(i, { amount: e.target.value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6"
                    aria-label={`Remove recipient ${i + 1}`}
                    disabled={values.lines.length === 1}
                    onClick={() => set({ lines: values.lines.filter((_, j) => j !== i) })}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    set({
                      lines: [
                        ...values.lines,
                        { organizationId: null, projectId: null, projectName: null, amount: "" },
                      ],
                    })
                  }
                >
                  <PlusIcon />
                  Add recipient
                </Button>
                <p className="text-sm" aria-live="polite">
                  Total {total === null ? "–" : <Money value={total} className="font-semibold" />} ·
                  stays in the fund{" "}
                  {total === null ? (
                    "–"
                  ) : (
                    <Money
                      value={fromMinorUnits(toMinorUnits(limit) - toMinorUnits(total))}
                      signed
                    />
                  )}
                </p>
              </div>
              {errors.lines && <p className="text-sm font-semibold text-danger">{errors.lines}</p>}
            </fieldset>
            <Field
              label="Rationale"
              required
              error={errors.rationale}
              hint="Why these recipients and amounts. Shown with the round and in grant letters."
            >
              <Textarea
                value={values.rationale}
                onChange={(e) => set({ rationale: e.target.value })}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox
                id="grant-repropose"
                checked={values.repropose}
                onCheckedChange={(c) => set({ repropose: c === true })}
              />
              <Label htmlFor="grant-repropose" className="font-normal">
                Propose these recipients' payments again (replaces their lines in step 2)
              </Label>
            </div>
          </>
        );
      }}
    </RecordDialog>
  );
}
