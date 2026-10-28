import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRecordParams } from "@/components/panels";
import {
  CircleAlertIcon,
  PencilIcon,
  RefreshCwIcon,
  ScaleIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/auth/context";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { Stat, StatGroup } from "@/components/domain/stat";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { DetailPage, PageSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pending } from "@/components/ui/pending";
import { SkeletonText } from "@/components/ui/skeleton";
import { parseMoneyInput } from "@/features/donations/form";
import {
  planSave,
  summarizeEdits,
  totalToPay,
  transferCountAfter,
  type LineEdit,
} from "@/features/regranting/builder-model";
import { DonationChooser } from "@/features/regranting/create-round-dialog";
import { FundGrants } from "@/features/regranting/fund-grants";
import {
  countIssues,
  generalIssues,
  identityOf,
  roundKindLabels,
  type Builder,
  type Issue,
  type RoundDetail,
} from "@/features/regranting/model";
import { Payments } from "@/features/regranting/payments";
import {
  ApprovalChecklist,
  checklistItems,
  TransferContents,
  useChecklist,
} from "@/features/regranting/round-trace";
import { Transfers } from "@/features/regranting/transfers";
import { InlineIssues, RecipientLink } from "@/features/regranting/ui";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { formatDate, formatMoney, formatMoneyInput } from "@/lib/format";
import { moneySign, sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { roundStatus } from "@/lib/status";
import { errorCode, useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/regranting/rounds/$id")({
  loader: ({ context: { queryClient, trpc }, params, cause }) => {
    const roundId = Number(params.id);
    if (!Number.isInteger(roundId) || roundId <= 0) return;
    const q = roundQueries(trpc, roundId);
    return loadPage(queryClient, cause, q.builder, [q.detail]);
  },
  component: RoundPage,
});

/** What the round page shows; the page reads these and the loader warms them. */
function roundQueries(trpc: ReturnType<typeof useTRPC>, roundId: number) {
  return {
    builder: trpc.regranting.rounds.builder.queryOptions({ id: roundId }),
    detail: trpc.regranting.rounds.get.queryOptions({ id: roundId }),
  };
}

function RoundPage() {
  const { id } = useRecordParams(Route);
  const roundId = Number(id);
  if (!Number.isInteger(roundId) || roundId <= 0)
    return (
      <EmptyState
        icon={ScaleIcon}
        title="No such round"
        description={`“${id}” isn't a round ID.`}
        className="flex-1"
      />
    );
  // Keyed by the round: another round starts without this one's unsaved edits.
  return <Round key={roundId} roundId={roundId} />;
}

function Round({ roundId }: { roundId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const me = identityOf(user);
  // The round is the route's record (plain useQuery). Background refetches (after a mutation)
  // replace the builder data underneath; the unsaved Pay now edits are local state on top of it
  // and stay until saved or discarded.
  const queries = roundQueries(trpc, roundId);
  const builderQuery = useQuery(queries.builder);
  const detail = useQuery(queries.detail);
  const [edits, setEdits] = useState<Map<string, LineEdit>>(new Map());
  const [confirmSave, setConfirmSave] = useState(false);
  const [approvalIssues, setApprovalIssues] = useState<Issue[] | null>(null);
  const checklist = useChecklist(roundId);
  const setLines = useMutation(trpc.regranting.transfers.setLines.mutationOptions());
  const createTransfer = useMutation(trpc.regranting.transfers.create.mutationOptions());
  if (builderQuery.isError) {
    return (
      <div className="p-6">
        <ErrorState
          back={{ to: "/regranting/rounds", label: "All rounds" }}
          error={builderQuery.error}
          title={
            errorCode(builderQuery.error) === "NOT_FOUND"
              ? `No round #${roundId}`
              : "Couldn't load the round"
          }
          onRetry={() => void builderQuery.refetch()}
        />
      </div>
    );
  }

  // Only drafts are validated: issues of approved and paid rounds aren't meaningful (the backend
  // counts later rounds' grants as committed at the earlier cutoff), so they aren't shown.
  const builder =
    builderQuery.data && builderQuery.data.round.status !== "draft"
      ? { ...builderQuery.data, issues: [] }
      : builderQuery.data;
  const round = builder?.round;
  const editable = round?.status === "draft";
  const isCreator = round !== undefined && me !== null && round.createdBy === me;
  const counts = countIssues(builder?.issues ?? []);
  const total = builder ? totalToPay(builder, edits) : null;
  const transferCount = builder ? transferCountAfter(builder, edits) : null;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });

  async function save() {
    if (!builder) return;
    const plan = planSave(builder, edits);
    for (const s of plan.setLines) await setLines.mutateAsync(s);
    for (const c of plan.create) await createTransfer.mutateAsync({ roundId, ...c });
    await invalidate();
    setEdits(new Map());
    notify.success(
      "Payments saved",
      `${plan.setLines.length + plan.create.length} transfers updated`,
    );
  }

  return (
    <DetailPage
      breadcrumbs={[
        { label: "Regranting", to: "/regranting" },
        { label: "Rounds", to: "/regranting/rounds" },
      ]}
      title={round?.name ?? <SkeletonText>September 2026 regular round</SkeletonText>}
      adornment={round && <Status catalog={roundStatus} value={round.status} />}
      meta={
        round
          ? [
              <span key="kind">{roundKindLabels[round.kind]}</span>,
              <span key="cutoff">
                Cutoff <DateTime value={round.cutoff} />
              </span>,
              moneySign(round.minTransfer) > 0 && (
                <span key="min">
                  Minimum transfer <Money value={round.minTransfer} />
                </span>
              ),
              <span key="created">Created by {isCreator ? "you" : round.createdBy}</span>,
              round.approvedBy && (
                <span key="approved">
                  Approved by {round.approvedBy} <DateTime value={round.approvedAt} />
                </span>
              ),
              <CopyValue key="id" value={round.id} prefix="#" label="round ID" />,
            ]
          : [
              <SkeletonText key="kind">Regular round</SkeletonText>,
              <SkeletonText key="cutoff">Cutoff 00.00.0000</SkeletonText>,
              <SkeletonText key="created">Created by ops@example.org</SkeletonText>,
            ]
      }
      actions={
        builder && (
          <RoundActions
            builder={builder}
            adjustments={detail.data?.adjustments ?? []}
            isCreator={isCreator}
            dirty={edits.size > 0}
            onBlocked={setApprovalIssues}
            checklistDone={
              builder
                ? {
                    done: checklistItems(builder, null).filter((i) => checklist.checked.has(i.id))
                      .length,
                    of: checklistItems(builder, null).length,
                  }
                : null
            }
          />
        )
      }
      stats={
        // No hint lines, so the values alone are placeholders (Stat pending reserves a hint).
        <StatGroup>
          <Stat
            label="Total to pay"
            value={
              total !== null ? <Money value={total} /> : <SkeletonText>00 000 kr</SkeletonText>
            }
          />
          <Stat
            label="Transfers"
            value={
              transferCount !== null ? (
                <Num value={transferCount} />
              ) : (
                <SkeletonText>00</SkeletonText>
              )
            }
          />
          <Stat
            label="Fund grants"
            value={
              builder ? (
                <Money value={builder.totals.fundGranted} />
              ) : (
                <SkeletonText>00 000 kr</SkeletonText>
              )
            }
          />
          <Stat
            label="Issues"
            value={
              builder && !editable ? (
                <span className="text-muted-foreground">Checked at approval</span>
              ) : builder ? (
                <span className={counts.errors ? "text-danger" : undefined}>
                  {counts.errors} errors · {counts.warnings} warnings
                </span>
              ) : (
                <SkeletonText>0 errors · 0 warnings</SkeletonText>
              )
            }
          />
        </StatGroup>
      }
    >
      {round && <StatusCallout builder={builder!} isCreator={isCreator} />}
      {approvalIssues && (
        <Callout tone="danger" title="The round wasn't approved">
          Fix these errors first:
          <InlineIssues
            issues={approvalIssues.filter((i) => i.severity === "error")}
            className="mt-1"
          />
        </Callout>
      )}
      {/* The builder has no shape worth sketching: its space is reserved (taller than the
          window, so the totals bar stays put at the bottom) until it arrives whole. */}
      {!builder && <Pending className="min-h-screen" label="Loading the round" />}
      {builder && (
        <div className="grid gap-8">
          <IssuesPanel issues={builder.issues} unassigned={builder.unassigned} />
          {builder.round.kind === "major_donor" && (
            <ChosenDonations builder={builder} editable={editable} />
          )}
          <PageSection
            title="Step 1 · Fund grants"
            description="Grants from our own funds. Granted money is added to the recipients' balances and paid in step 2. The fund itself is never paid."
          >
            <FundGrants builder={builder} editable={editable} />
          </PageSection>
          <PageSection
            title="Step 2 · Payments by payee"
            description={
              editable
                ? "Change Pay now to pay less or more; whatever isn't paid carries over to the next round. One transfer per payee and currency."
                : "What this round pays, by payee."
            }
          >
            <Payments
              builder={builder}
              editable={editable}
              edits={edits}
              onEditsChange={setEdits}
            />
          </PageSection>
          <TransferContents roundId={round!.id} editable={editable} />
          {editable && <ApprovalChecklist builder={builder} checklist={checklist} />}
          {round!.status !== "draft" && (
            <PageSection
              title={round!.status === "approved" ? "Record payments" : "Transfers"}
              description={
                round!.status === "approved"
                  ? "Enter each transfer's payment from the bank statement, then mark the round paid."
                  : "Paid rounds are never changed. Fix a mistake with a correction linked to the transfer, in a later round."
              }
            >
              <Transfers round={round!} transfers={builder.transfers} />
            </PageSection>
          )}
          {detail.data && detail.data.adjustments.length > 0 && (
            <RoundAdjustments adjustments={detail.data.adjustments} editable={editable} />
          )}
          {detail.data && detail.data.snapshot.length > 0 && (
            <Snapshot snapshot={detail.data.snapshot} />
          )}
        </div>
      )}
      <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6">
        {editable && (
          <div className="px-4 sm:px-6">
            <UnsavedChangesBar
              dirty={edits.size > 0}
              saving={setLines.isPending || createTransfer.isPending}
              saveLabel={`Save ${edits.size} ${edits.size === 1 ? "change" : "changes"}…`}
              onSave={() => setConfirmSave(true)}
              onDiscard={() => setEdits(new Map())}
            />
          </div>
        )}
        <footer
          aria-label="Round totals"
          className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-surface px-4 py-2.5 text-sm sm:px-6"
        >
          <span>
            Total to pay{" "}
            <span data-testid="round-total" className="font-semibold">
              {total !== null ? <Money value={total} /> : <SkeletonText>00 000 kr</SkeletonText>}
            </span>
          </span>
          <span>
            <span data-testid="round-transfers">{transferCount ?? "–"}</span>{" "}
            {transferCount === 1 ? "transfer" : "transfers"}
          </span>
          {builder && editable && (
            <span className={counts.errors ? "font-semibold text-danger" : "text-muted-foreground"}>
              {counts.errors === 0 && counts.warnings === 0
                ? "All checks pass"
                : `${counts.errors} errors, ${counts.warnings} warnings`}
              {edits.size > 0 && " (as saved)"}
            </span>
          )}
        </footer>
      </div>
      {builder && (
        <ConfirmDialog
          open={confirmSave}
          onOpenChange={setConfirmSave}
          title={`Save ${edits.size} payment ${edits.size === 1 ? "change" : "changes"}?`}
          description={`Total to pay goes from ${formatMoney(
            totalToPay(builder, new Map()),
          )} to ${formatMoney(
            totalToPay(builder, edits),
          )}. Nothing is paid until the round is approved.`}
          consequences={summarizeEdits(builder, edits).map((e) => (
            <span key={`${e.organizationId}-${e.line}`}>
              {e.recipient}, {e.line}: {formatMoney(e.before)} →{" "}
              <strong>{formatMoney(e.after)}</strong>
            </span>
          ))}
          confirmLabel={`Save ${formatMoney(totalToPay(builder, edits))} to pay`}
          onConfirm={save}
        />
      )}
    </DetailPage>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function StatusCallout({ builder, isCreator }: { builder: Builder; isCreator: boolean }) {
  const round = builder.round;
  if (round.status === "draft")
    return isCreator ? (
      <Callout tone="accent" title="You created this round, so someone else must approve it">
        When it's ready, use Ready for approval and send the link to a colleague. You can keep
        editing until they approve.
      </Callout>
    ) : (
      <Callout tone="accent" title={`Created by ${round.createdBy}; you can approve it`}>
        Check the fund grants and payments below. Approving locks the round and snapshots the
        balances.
      </Callout>
    );
  if (round.status === "approved")
    return (
      <Callout tone="warning" title="Approved: record the payments">
        The lines are locked. Record each transfer's payment as it leaves the bank, then mark the
        round paid. To change amounts, reopen it (only while no payment is recorded).
      </Callout>
    );
  return (
    <Callout tone="success" title={`Paid${round.paidAt ? ` on ${formatDate(round.paidAt)}` : ""}`}>
      This round is read-only. The balance snapshot below shows what the decision was based on. Fix
      mistakes with a correction linked to a transfer, in a later round.
    </Callout>
  );
}

function IssuesPanel({
  issues,
  unassigned,
}: {
  issues: Issue[];
  unassigned: Builder["unassigned"];
}) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const general = generalIssues(issues);
  return (
    <section aria-label="Issues" className="grid gap-2 rounded-md border border-border px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {errors.length > 0 ? (
          <CircleAlertIcon className="size-4 text-danger" aria-hidden />
        ) : (
          <TriangleAlertIcon className="size-4 text-warning" aria-hidden />
        )}
        {errors.length > 0
          ? `${errors.length} ${errors.length === 1 ? "error blocks" : "errors block"} approval`
          : "Nothing blocks approval"}
        {warnings.length > 0 && (
          <span className="font-normal text-muted-foreground">· {warnings.length} warnings</span>
        )}
      </h2>
      <p className="text-xs text-muted-foreground">
        Each issue is also shown next to the row it's about.
      </p>
      <InlineIssues
        issues={[...errors, ...warnings.filter((w) => !general.includes(w))].slice(0, 12)}
      />
      {general.length > 0 && <InlineIssues issues={general} />}
      {moneySign(unassigned.amount) !== 0 && (
        <p className="text-xs text-muted-foreground">
          Unassigned: <Money value={unassigned.amount} /> in {unassigned.donationCount} donations
          without a split.
        </p>
      )}
    </section>
  );
}

function RoundActions({
  builder,
  adjustments,
  isCreator,
  dirty,
  onBlocked,
  checklistDone,
}: {
  builder: Builder;
  /** Attached to the round (e.g. earmarks); the API deletes them with a draft */
  adjustments: RoundDetail["adjustments"];
  isCreator: boolean;
  dirty: boolean;
  onBlocked: (issues: Issue[] | null) => void;
  /** The checklist before approval (kept in this browser) */
  checklistDone: { done: number; of: number } | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const round = builder.round;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
  const propose = useMutation(trpc.regranting.rounds.propose.mutationOptions());
  const approve = useMutation(trpc.regranting.rounds.approve.mutationOptions());
  const reopen = useMutation(trpc.regranting.rounds.reopen.mutationOptions());
  const markPaid = useMutation(trpc.regranting.rounds.markPaid.mutationOptions());
  const remove = useMutation(trpc.regranting.rounds.delete.mutationOptions());
  const counts = countIssues(builder.issues);
  const grants = builder.fundGrants;
  const unpaid = builder.transfers.filter((t) => !t.paidAt);
  const totalText = formatMoneyInput(builder.totals.inRound);

  if (round.status === "draft")
    return (
      <>
        <EditRoundDialog builder={builder} disabled={dirty} />
        <ConfirmDialog
          trigger={
            <Button
              disabled={dirty}
              title={dirty ? "Save or discard your changes first" : undefined}
            >
              <RefreshCwIcon />
              Propose again
            </Button>
          }
          title="Replace the payments with the proposal?"
          consequences={[
            "Every recipient's Pay now is set to what the rules propose at the cutoff",
            "Changes you made by hand to the payments are lost",
            "Fund grants are kept",
          ]}
          confirmLabel="Propose again"
          onConfirm={async () => {
            await propose.mutateAsync({ id: round.id });
            await invalidate();
            notify.success("Payments proposed again");
          }}
        />
        <ReadyDialog builder={builder} />
        <ConfirmDialog
          trigger={
            <Button
              variant="primary"
              disabled={isCreator || dirty}
              title={
                isCreator
                  ? "You created this round; someone else must approve it"
                  : dirty
                  ? "Save or discard your changes first"
                  : undefined
              }
            >
              Approve round
            </Button>
          }
          title={`Approve ${round.name}?`}
          description={
            counts.errors > 0 ? `${counts.errors} errors still block approval.` : undefined
          }
          consequences={[
            <span key="pay">
              {builder.totals.transferCount} transfers,{" "}
              <strong>{formatMoney(builder.totals.inRound)}</strong> in total, are locked for
              payment
            </span>,
            grants.length > 0
              ? `${plural(grants.length, "fund grant")} (${formatMoney(
                  builder.totals.fundGranted,
                )}) are approved with it, under your name`
              : "No fund grants",
            "The balances at the cutoff are snapshotted as the basis of the decision",
            counts.warnings > 0 ? `${counts.warnings} warnings are accepted` : "No warnings",
            ...(checklistDone
              ? [
                  checklistDone.done === checklistDone.of
                    ? "Every check before approval is ticked"
                    : `${checklistDone.done} of ${checklistDone.of} checks before approval are ticked`,
                ]
              : []),
          ]}
          confirmText={totalText}
          confirmLabel={`Approve ${formatMoney(builder.totals.inRound)}`}
          onConfirm={async () => {
            const result = await approve.mutateAsync({ id: round.id });
            await invalidate();
            if (!result.approved) {
              onBlocked(result.issues);
              return;
            }
            onBlocked(null);
            notify.success("Round approved", round.name);
          }}
        />
        <ConfirmDialog
          trigger={
            <Button variant="ghost" aria-label="Delete draft">
              <Trash2Icon />
            </Button>
          }
          tone="danger"
          title={`Delete the draft ${round.name}?`}
          consequences={[
            `Its ${builder.transfers.length} transfers and ${grants.length} fund grants are deleted`,
            ...(adjustments.length > 0
              ? [
                  `Its ${plural(
                    adjustments.length,
                    "adjustment",
                  )} (earmarks, corrections) are deleted with it`,
                ]
              : []),
            "Nothing was paid and a draft's adjustments never counted; the balances don't change",
          ]}
          confirmText={String(round.id)}
          confirmLabel="Delete draft"
          onConfirm={async () => {
            await remove.mutateAsync({ id: round.id });
            await invalidate();
            notify.success("Draft deleted", round.name);
            void navigate({ to: "/regranting/rounds" });
          }}
        />
      </>
    );

  if (round.status === "approved")
    return (
      <>
        <ConfirmDialog
          trigger={
            <Button disabled={builder.transfers.some((t) => t.paidAt)}>Reopen as draft</Button>
          }
          title={`Reopen ${round.name} as a draft?`}
          consequences={[
            "The approval and the balance snapshot are removed",
            "The lines can be edited again",
            "Someone other than the creator must approve it again",
          ]}
          confirmLabel="Reopen round"
          onConfirm={async () => {
            await reopen.mutateAsync({ id: round.id });
            await invalidate();
            notify.success("Round reopened", round.name);
          }}
        />
        <ConfirmDialog
          trigger={
            <Button
              variant="primary"
              disabled={unpaid.length > 0}
              title={
                unpaid.length > 0
                  ? `Record the payment of ${unpaid.length} transfers first`
                  : undefined
              }
            >
              Mark paid
            </Button>
          }
          title={`Mark ${round.name} paid?`}
          consequences={[
            <span key="t">
              {builder.transfers.length} transfers,{" "}
              <strong>{formatMoney(builder.totals.inRound)}</strong>, enter the ledger on their paid
              dates
            </span>,
            "The recipients' balances go down by what was paid",
            "The round becomes read-only; mistakes are fixed with corrections in a later round",
            `Bank fees ${formatMoney(
              sumMoney(builder.transfers.map((t) => t.bankFee)),
            )} are paid by operations`,
          ]}
          confirmText={totalText}
          confirmLabel={`Mark ${formatMoney(builder.totals.inRound)} paid`}
          onConfirm={async () => {
            await markPaid.mutateAsync({ id: round.id });
            await invalidate();
            notify.success("Round marked paid", round.name);
          }}
        />
      </>
    );

  return (
    <Button asChild>
      <Link to="/regranting/adjustments">Add a correction</Link>
    </Button>
  );
}

/** "Ready for approval": shows what approval would see and the link to send to the approver. */
function ReadyDialog({ builder }: { builder: Builder }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const validate = useQuery({
    ...trpc.regranting.rounds.validate.queryOptions({ id: builder.round.id }),
    enabled: open,
  });
  const counts = countIssues(validate.data ?? []);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button>Ready for approval…</Button>}
      title="Send this round for approval"
      description="Someone other than the creator approves it. Send them this link."
      consequences={
        validate.data
          ? [
              counts.errors > 0
                ? `${counts.errors} errors block approval; fix them first`
                : "Nothing blocks approval",
              `${counts.warnings} warnings`,
              `${plural(builder.totals.transferCount, "transfer")}, ${formatMoney(
                builder.totals.inRound,
              )}`,
            ]
          : ["Checking the round…"]
      }
      confirmLabel="Done"
      onConfirm={() => undefined}
    >
      <CopyValue value={window.location.href} label="round link" />
    </ConfirmDialog>
  );
}

type RoundForm = { name: string; cutoff: string; minTransfer: string; repropose: boolean };

function EditRoundDialog({ builder, disabled }: { builder: Builder; disabled: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const update = useMutation(trpc.regranting.rounds.update.mutationOptions());
  const propose = useMutation(trpc.regranting.rounds.propose.mutationOptions());
  const round = builder.round;
  return (
    <RecordDialog<RoundForm>
      trigger={
        <Button disabled={disabled} aria-label="Edit round">
          <PencilIcon />
          Edit
        </Button>
      }
      title={`Edit ${round.name}`}
      initial={() => ({
        name: round.name,
        cutoff: round.cutoff,
        minTransfer: moneySign(round.minTransfer) > 0 ? formatMoneyInput(round.minTransfer) : "",
        repropose: true,
      })}
      validate={(v) => ({
        name: textError(v.name, { label: "a name", max: 255, required: true }),
        cutoff: v.cutoff ? undefined : "Enter the cutoff date",
        minTransfer:
          v.minTransfer.trim() === "" || parseMoneyInput(v.minTransfer)
            ? undefined
            : "Enter an amount in kroner",
      })}
      saveLabel="Save round"
      onSave={async (v) => {
        await update.mutateAsync({
          id: round.id,
          name: v.name.trim(),
          cutoff: v.cutoff,
          minTransfer: Number(parseMoneyInput(v.minTransfer || "0")),
        });
        if (v.repropose) await propose.mutateAsync({ id: round.id });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Round updated", v.repropose ? "Payments proposed again" : undefined);
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cutoff" required error={errors.cutoff}>
              <DateInput value={values.cutoff} onValueChange={(cutoff) => set({ cutoff })} />
            </Field>
            <Field label="Minimum transfer" error={errors.minTransfer}>
              <Input
                inputMode="decimal"
                className="num"
                placeholder="0"
                value={values.minTransfer}
                onChange={(e) => set({ minTransfer: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="round-repropose"
              checked={values.repropose}
              onCheckedChange={(c) => set({ repropose: c === true })}
            />
            <Label htmlFor="round-repropose" className="font-normal">
              Propose the payments again (needed after changing the cutoff or minimum; replaces hand
              edits)
            </Label>
          </div>
        </>
      )}
    </RecordDialog>
  );
}

function ChosenDonations({ builder, editable }: { builder: Builder; editable: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setDonations = useMutation(trpc.regranting.rounds.setDonations.mutationOptions());
  const propose = useMutation(trpc.regranting.rounds.propose.mutationOptions());
  const reasons = {
    after_cutoff: "Confirmed after the cutoff",
    passed_on: "Already passed on",
  } as const;
  return (
    <PageSection
      title="Chosen donations"
      description="A major donor round proposes these donations' allocations, capped at what is available."
      actions={
        editable && (
          <RecordDialog<{
            donations: { id: number; donor: string; sum: string; timestamp: string }[];
          }>
            trigger={<Button size="sm">Change donations</Button>}
            title="Change the chosen donations"
            contentClassName="sm:max-w-2xl"
            initial={() => ({
              donations: builder.donations.map((d) => ({
                id: d.donationId,
                donor: `Donor #${d.donorId}`,
                sum: d.sum,
                timestamp: String(d.timestampConfirmed),
              })),
            })}
            validate={(v) => ({
              donationIds: v.donations.length ? undefined : "Choose at least one donation",
            })}
            saveLabel="Save and propose again"
            onSave={async (v) => {
              await setDonations.mutateAsync({
                id: builder.round.id,
                donationIds: v.donations.map((d) => d.id),
              });
              await propose.mutateAsync({ id: builder.round.id });
              await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
              notify.success("Donations changed", "Payments proposed again");
            }}
          >
            {({ values, set, errors }) => (
              <DonationChooser
                chosen={values.donations}
                onChange={(donations) => set({ donations })}
                error={errors.donationIds}
              />
            )}
          </RecordDialog>
        )
      }
    >
      <ul className="grid gap-1 text-sm">
        {builder.donations.map((d) => (
          <li key={d.donationId} className="flex flex-wrap items-center gap-x-3">
            <Link
              to="/donations/$id"
              params={{ id: String(d.donationId) }}
              className="num rounded-xs text-accent hover:underline focus-ring"
            >
              #{d.donationId}
            </Link>
            <DateTime value={d.timestampConfirmed} />
            <Money value={d.sum} className="font-semibold" />
            {d.inScope ? (
              <span className="text-muted-foreground">{d.allocations.length} recipients</span>
            ) : (
              <span className="text-warning">
                {d.excludedReason ? reasons[d.excludedReason] : "Not in scope"}
              </span>
            )}
            <InlineIssues issues={builder.issues.filter((i) => i.donationId === d.donationId)} />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

/**
 * The round's adjustments (earmarks, corrections). In a draft they are pending: shown in the
 * builder's Adjustments column, in balances only once the round is approved. An earmark (two
 * paired entries) is listed once and can be removed, which also moves its Pay now back.
 */
function RoundAdjustments({
  adjustments,
  editable,
}: {
  adjustments: RoundDetail["adjustments"];
  editable: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const removeEarmark = useMutation(trpc.regranting.rounds.removeEarmark.mutationOptions());
  // An earmark is shown by its project half
  const shown = adjustments.filter((a) => a.pairedAdjustmentId === null || a.projectId !== null);
  return (
    <PageSection
      title="Adjustments in this round"
      description={
        editable
          ? "Pending: they count in the Pay now figures above, and in balances once the round is approved."
          : undefined
      }
    >
      <ul className="grid gap-1 text-sm" aria-label="Adjustments in this round">
        {shown.map((a) => {
          const earmark = a.pairedAdjustmentId !== null;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <Money value={a.amount} signed className="w-28 text-right" />
              <RecipientLink organizationId={a.organizationId}>{a.organizationName}</RecipientLink>
              {a.projectName && (
                <span className="text-muted-foreground">
                  {earmark ? `Unrestricted → ${a.projectName}` : a.projectName}
                </span>
              )}
              <span className="text-muted-foreground">{a.reason}</span>
              {a.pending && <Badge tone="outline">Pending</Badge>}
              {editable && earmark && (
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto px-1 py-0 text-xs"
                      aria-label={`Remove the earmark of ${formatMoney(a.amount)} to ${
                        a.projectName ?? "the project"
                      }`}
                    >
                      Remove earmark
                    </Button>
                  }
                  tone="danger"
                  title={`Remove the earmark of ${formatMoney(a.amount)} to ${
                    a.projectName ?? "the project"
                  }?`}
                  consequences={[
                    "Both entries (unrestricted and project) are deleted",
                    "Pay now moves back from the project line to the unrestricted line",
                  ]}
                  confirmLabel="Remove earmark"
                  onConfirm={async () => {
                    await removeEarmark.mutateAsync({ adjustmentId: a.id });
                    await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
                    notify.success("Earmark removed", a.projectName ?? undefined);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}

function Snapshot({ snapshot }: { snapshot: RoundDetail["snapshot"] }) {
  return (
    <PageSection
      title="Balance snapshot"
      description="Written when the round was approved: the balances the decision was based on."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm" aria-label="Balance snapshot">
          <thead>
            <tr className="text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th scope="col">Recipient</th>
              <th scope="col">Project</th>
              <th scope="col" className="text-right">
                Balance at cutoff
              </th>
              <th scope="col" className="text-right">
                Committed
              </th>
              <th scope="col" className="text-right">
                Fund grants
              </th>
              <th scope="col" className="text-right">
                Adjustments
              </th>
              <th scope="col" className="text-right">
                In round
              </th>
              <th scope="col">Direct included</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.map((s) => (
              <tr
                key={`${s.organizationId}-${s.projectId}`}
                className="[&>td]:border-t [&>td]:border-border [&>td]:px-3 [&>td]:py-1"
              >
                <td>{s.organizationName}</td>
                <td className="text-muted-foreground">{s.projectName ?? "Unrestricted"}</td>
                <td className="text-right">
                  <Money value={s.balanceAtCutoff} signed />
                </td>
                <td className="text-right">
                  <Money value={s.committed} />
                </td>
                <td className="text-right">
                  <Money value={s.fundGrants} signed />
                </td>
                <td className="text-right">
                  <Money value={s.roundAdjustments} signed />
                </td>
                <td className="text-right">
                  <Money value={s.inRound} />
                </td>
                <td>{s.includedDirect ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}
