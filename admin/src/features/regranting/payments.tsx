/**
 * Step 2 of the round builder: payments grouped by payee, in one table so the columns line up
 * across payees (a header row per payee with its transfers, one transfer per payee and
 * currency); per recipient its lines (unrestricted + projects) with balance at
 * cutoff, fund grant in, the round's adjustments (earmarks), available, Pay now (editable in a
 * draft), Carries over and flags.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Money } from "@/components/domain/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseMoneyInput } from "@/features/donations/form";
import { RecordDialog } from "@/features/settings/record-dialog";
import { formatDate, formatMoney, formatMoneyInput } from "@/lib/format";
import { compareMoney, moneySign } from "@/lib/money";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  defaultTransferFor,
  lineFigures,
  lineKey,
  paymentFor,
  recipientLines,
  recipientTotals,
  savedPayments,
  setPayment,
  sumTotals,
  type Edits,
  type LineEdit,
  type LinePayment,
} from "./builder-model";
import {
  issuesFor,
  lineLabel,
  roundKindLabels,
  type Builder,
  type BuilderRecipient,
} from "./model";
import { ExplainLine } from "./trace";
import { InlineIssues, ProjectLink, ProjectPicker, RecipientLink } from "./ui";

export type PaymentsProps = {
  builder: Builder;
  editable: boolean;
  edits: Edits;
  onEditsChange: (edits: Map<string, LineEdit>) => void;
};

export function Payments({ builder, editable, edits, onEditsChange }: PaymentsProps) {
  const saved = savedPayments(builder.transfers);
  const byId = new Map(builder.recipients.map((r) => [r.organizationId, r]));
  // Rounds that don't include direct donations by default list every recipient with a balance;
  // show only those in the round (the API's inRound, or with unsaved edits) unless asked
  const [showAll, setShowAll] = useState(builder.defaultIncludeDirect);
  const inRound = (r: BuilderRecipient) =>
    r.inRound || [...edits.keys()].some((k) => k.startsWith(`${r.organizationId}:`));
  const hidden = builder.recipients.filter((r) => !inRound(r)).length;

  if (builder.recipients.length === 0) {
    return (
      <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
        No recipient has money to pay in this round.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {editable && hidden > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Switch id="show-all-recipients" checked={showAll} onCheckedChange={setShowAll} />
          <label htmlFor="show-all-recipients">
            Show recipients not in this round ({hidden}), e.g. to include their direct donations
          </label>
        </div>
      )}
      {/* One table for every payee, so the columns line up down the page like a spreadsheet;
          each payee is a group of row groups: header, recipients, total. */}
      <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-surface">
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          aria-label="Payments by payee"
        >
          <thead>
            <tr className="text-left text-xs text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
              <th scope="col">Recipient / project</th>
              <th scope="col" className="text-right">
                Balance at cutoff
              </th>
              <th scope="col" className="text-right">
                Committed
              </th>
              <th scope="col" className="text-right">
                Fund grant in
              </th>
              <th
                scope="col"
                className="text-right"
                title="This round's adjustments, e.g. earmarks. They count in balances once the round is approved."
              >
                Adjustments
              </th>
              <th scope="col" className="text-right">
                Available
              </th>
              <th scope="col" className="w-40 text-right">
                Pay now
              </th>
              <th scope="col" className="text-right">
                Carries over
              </th>
              <th scope="col">Flags</th>
            </tr>
          </thead>
          {builder.payeeGroups.map((group) => {
            // Approved and paid rounds show only what the round pays
            const recipients = group.organizationIds
              .map((id) => byId.get(id))
              .filter((r): r is BuilderRecipient => r !== undefined)
              .filter((r) =>
                editable ? showAll || inRound(r) : moneySign(r.totals.inRound) !== 0,
              );
            if (recipients.length === 0) return null;
            const transfers = builder.transfers.filter((t) =>
              group.payee ? t.payee.id === group.payee.id : false,
            );
            const totals = sumTotals(
              recipients.map((r) => recipientTotals(r, saved, edits, builder.transfers)),
            );
            const groupLabel = group.payee ? group.payee.name : "No payee";
            return (
              <Fragment key={group.payee?.id ?? "none"}>
                <PayeeHeader
                  builder={builder}
                  group={group}
                  transfers={transfers}
                  payNow={totals.payNow}
                  editable={editable}
                  dirty={edits.size > 0}
                />
                {recipients.map((recipient) => (
                  <RecipientRows
                    key={recipient.organizationId}
                    builder={builder}
                    recipient={recipient}
                    saved={saved}
                    edits={edits}
                    editable={editable}
                    onEditsChange={onEditsChange}
                  />
                ))}
                <tbody>
                  <tr className="font-semibold [&>td]:border-b [&>td]:border-border-strong [&>td]:px-3 [&>td]:py-2">
                    <td>Total {groupLabel}</td>
                    <td />
                    <td />
                    <td />
                    <td />
                    <td className="text-right">
                      <Money value={totals.available} />
                    </td>
                    <td
                      className="text-right"
                      data-testid={`payee-total-${group.payee?.id ?? "none"}`}
                    >
                      <Money value={totals.payNow} />
                    </td>
                    <td className="text-right">
                      <Money value={totals.carriesOver} signed />
                    </td>
                    <td />
                  </tr>
                </tbody>
              </Fragment>
            );
          })}
        </table>
      </div>
    </div>
  );
}

function PayeeHeader({
  builder,
  group,
  transfers,
  payNow,
  editable,
  dirty,
}: {
  builder: Builder;
  group: Builder["payeeGroups"][number];
  transfers: Builder["transfers"];
  payNow: string;
  editable: boolean;
  dirty: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(trpc.regranting.transfers.create.mutationOptions());
  const remove = useMutation(trpc.regranting.transfers.delete.mutationOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
  const payee = group.payee;
  return (
    <tbody aria-label={`Payments to ${payee ? payee.name : "No payee"}`}>
      <tr className="bg-muted [&>td]:border-b [&>td]:border-border [&>td]:px-3 [&>td]:py-2.5">
        <td colSpan={6}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <h3 className="text-base font-semibold">
                {payee ? payee.name : "No payee"}
                {payee && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {payee.currency}
                  </span>
                )}
              </h3>
              {payee ? (
                <ul
                  className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                  aria-label="Transfers"
                >
                  {transfers.length === 0 && (
                    <li>
                      Not in this round
                      {moneySign(payNow) > 0 ? " yet (saving creates a transfer)" : ""}
                    </li>
                  )}
                  {transfers.map((t) => (
                    <li key={t.id} className="inline-flex items-center gap-1">
                      Transfer #{t.id} · {t.currency} ·{" "}
                      <Money value={t.amountNok} className="text-foreground" />
                      <InlineIssues issues={issuesFor(builder.issues, { transferId: t.id })} />
                      {editable && (
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-6"
                              aria-label={`Remove transfer #${t.id}`}
                              disabled={dirty}
                            >
                              <Trash2Icon />
                            </Button>
                          }
                          tone="danger"
                          title={`Remove transfer #${t.id} to ${t.payee.name}?`}
                          consequences={[
                            `Its ${t.lines.length} lines (${formatMoney(
                              t.amountNok,
                            )}) are taken out of the round`,
                            "The money stays in the recipients' balances",
                          ]}
                          confirmLabel="Remove transfer"
                          onConfirm={async () => {
                            await remove.mutateAsync({ id: t.id });
                            await invalidate();
                            notify.success("Transfer removed", `#${t.id} to ${t.payee.name}`);
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  These recipients can't be paid until they have a payee at the cutoff.{" "}
                  <Link
                    to="/regranting/settings"
                    search={{ section: "routing" }}
                    className="rounded-xs text-accent underline focus-ring"
                  >
                    Add a routing
                  </Link>
                </p>
              )}
            </div>
            {payee && editable && (
              <RecordDialog<{ currency: string }>
                trigger={
                  <Button
                    size="sm"
                    disabled={dirty}
                    title={dirty ? "Save or discard your changes first" : undefined}
                  >
                    <PlusIcon />
                    Add transfer
                  </Button>
                }
                title={`New transfer to ${payee.name}`}
                description="A separate bank transaction, e.g. in another currency. Move lines to it with the Transfer column."
                initial={() => ({ currency: payee.currency })}
                validate={(v) => ({
                  currency: /^[A-Z]{3,8}$/.test(v.currency.trim())
                    ? undefined
                    : "Enter a currency code like NOK, EUR or BTC",
                })}
                saveLabel="Add transfer"
                onSave={async (v) => {
                  await create.mutateAsync({
                    roundId: builder.round.id,
                    payeeId: payee.id,
                    currency: v.currency.trim(),
                  });
                  await invalidate();
                  notify.success("Transfer added", `${payee.name} · ${v.currency.trim()}`);
                }}
              >
                {({ values, set, errors }) => (
                  <Field
                    label="Currency"
                    required
                    error={errors.currency}
                    hint="Lines are always in NOK; the paid amount in this currency is recorded with the payment"
                  >
                    <Input
                      className="num w-32"
                      value={values.currency}
                      onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                    />
                  </Field>
                )}
              </RecordDialog>
            )}
          </div>
        </td>
        <td className="text-right font-semibold">
          {payee && (
            <>
              <span className="sr-only">Pay now </span>
              <Money value={payNow} />
            </>
          )}
        </td>
        <td colSpan={2} />
      </tr>
    </tbody>
  );
}

function RecipientRows({
  builder,
  recipient,
  saved,
  edits,
  editable,
  onEditsChange,
}: {
  builder: Builder;
  recipient: BuilderRecipient;
  saved: ReadonlyMap<string, LinePayment>;
  edits: Edits;
  editable: boolean;
  onEditsChange: (edits: Map<string, LineEdit>) => void;
}) {
  const lines = recipientLines(recipient, saved, edits, builder.transfers);
  const totals = recipientTotals(recipient, saved, edits, builder.transfers);
  const orgId = recipient.organizationId;
  const payeeTransfers = recipient.payee
    ? builder.transfers.filter((t) => t.payee.id === recipient.payee!.id)
    : [];
  const recipientIssues = issuesFor(builder.issues, {
    organizationId: orgId,
    transferId: null,
    fundGrantId: null,
    donationId: null,
  }).filter((i) => i.code === "recipient_without_payee");
  const hasOwnEdits = [...edits.keys()].some((k) => k.startsWith(`${orgId}:`));

  return (
    <tbody
      data-recipient={orgId}
      className="[&>tr>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-3 [&>tr>td]:py-1.5"
    >
      <tr className="bg-muted/40">
        <td colSpan={6}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Preloads the statement on hover and focus (its route loader). */}
            <RecipientLink organizationId={orgId} className="font-semibold">
              {recipient.name}
            </RecipientLink>
            <span className="text-xs text-muted-foreground">{recipient.abbriv}</span>
            <IncludeDirectSwitch
              builder={builder}
              recipient={recipient}
              editable={editable}
              onApplied={() => {
                if (hasOwnEdits)
                  onEditsChange(new Map([...edits].filter(([k]) => !k.startsWith(`${orgId}:`))));
              }}
            />
            {recipient.chosenAllocations !== null && (
              <span className="text-xs text-muted-foreground">
                Chosen donations <Money value={recipient.chosenAllocations} />
              </span>
            )}
          </div>
          <InlineIssues issues={recipientIssues} className="mt-1" />
        </td>
        <td className="text-right font-semibold" data-testid={`recipient-pay-${orgId}`}>
          <Money value={totals.payNow} />
        </td>
        <td className="text-right font-semibold">
          <Money value={totals.carriesOver} signed />
        </td>
        <td>
          <RecipientFlags recipient={recipient} />
        </td>
      </tr>
      {lines.map((line) => {
        const payment = paymentFor(saved, edits, orgId, line.projectId);
        const savedAmount = saved.get(lineKey(orgId, line.projectId))?.amount ?? "0.00";
        const figures = lineFigures(line, payment, savedAmount);
        const label = `${recipient.name}, ${lineLabel(line)}`;
        const transferId = defaultTransferFor(builder, recipient.payee, payment.transferId);
        const lineIssues = issuesFor(builder.issues, {
          organizationId: orgId,
          projectId: line.projectId,
          transferId: null,
          fundGrantId: null,
        }).filter((i) => i.code !== "recipient_without_payee");
        return (
          <tr
            key={line.projectId ?? "u"}
            data-line={lineKey(orgId, line.projectId)}
            className={cn(figures.changed && "bg-warning-subtle/40")}
          >
            <td className="pl-6">
              <span className="inline-flex items-center gap-1">
                {line.projectId === null ? (
                  <span className="text-muted-foreground">Unrestricted</span>
                ) : (
                  <ProjectLink id={line.projectId}>{lineLabel(line)}</ProjectLink>
                )}
                <ExplainLine
                  roundId={builder.round.id}
                  organizationId={orgId}
                  projectId={line.projectId}
                  label={label}
                  hasPayment={moneySign(savedAmount) > 0}
                />
              </span>
              <InlineIssues issues={lineIssues} className="mt-0.5" />
            </td>
            <td className="text-right">
              <Money value={line.balanceAtCutoff} signed />
            </td>
            <td className="text-right text-muted-foreground">
              {moneySign(line.committed) !== 0 && <Money value={line.committed} />}
            </td>
            <td className="text-right">
              {moneySign(line.fundGrants) !== 0 && <Money value={line.fundGrants} />}
            </td>
            <td className="text-right">
              {moneySign(line.roundAdjustments) !== 0 && (
                <Money value={line.roundAdjustments} signed />
              )}
            </td>
            <td className="text-right">
              <Money value={line.available} signed />
            </td>
            <td className="text-right">
              {editable ? (
                <div className="flex items-center justify-end gap-1">
                  {payeeTransfers.length > 1 && moneySign(payment.amount) > 0 && (
                    <Select
                      value={transferId === null ? undefined : String(transferId)}
                      onValueChange={(id) =>
                        onEditsChange(
                          setPayment(edits, saved, orgId, line.projectId, {
                            ...payment,
                            transferId: Number(id),
                            projectName: line.projectName,
                          }),
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-24"
                        aria-label={`Transfer for ${label}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {payeeTransfers.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            #{t.id} {t.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <PayNowInput
                    label={`Pay now, ${label}`}
                    value={payment.amount}
                    disabled={!recipient.payee}
                    onChange={(amount) =>
                      onEditsChange(
                        setPayment(edits, saved, orgId, line.projectId, {
                          amount,
                          transferId,
                          projectName: line.projectId === null ? undefined : line.projectName,
                        }),
                      )
                    }
                  />
                </div>
              ) : (
                <Money value={payment.amount} className="font-semibold" />
              )}
            </td>
            <td className="text-right" data-testid={`carries-${lineKey(orgId, line.projectId)}`}>
              <Money value={figures.carriesOver} signed />
            </td>
            <td>
              <span className="inline-flex flex-wrap gap-1">
                {line.held && (
                  <Badge tone="warning" title={line.hold?.reason ?? recipient.hold?.reason}>
                    On hold
                  </Badge>
                )}
                {editable &&
                recipient.payee &&
                compareMoney(line.proposed, payment.amount) !== 0 ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      onEditsChange(
                        setPayment(edits, saved, orgId, line.projectId, {
                          amount: line.proposed,
                          transferId,
                          projectName: line.projectName,
                        }),
                      )
                    }
                  >
                    Use proposed {formatMoney(line.proposed)}
                  </Button>
                ) : null}
              </span>
            </td>
          </tr>
        );
      })}
      {editable && recipient.payee && (
        <tr>
          <td colSpan={9} className="pl-6">
            <div className="flex flex-wrap gap-2">
              <AddProjectLineDialog
                builder={builder}
                recipient={recipient}
                edits={edits}
                saved={saved}
                onEditsChange={onEditsChange}
              />
              <EarmarkDialog builder={builder} recipient={recipient} dirty={edits.size > 0} />
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

function RecipientFlags({ recipient }: { recipient: BuilderRecipient }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {recipient.hold && (
        <Badge
          tone="warning"
          title={`${recipient.hold.reason}${
            recipient.hold.until ? ` (until ${formatDate(recipient.hold.until)})` : ""
          }`}
        >
          On hold
        </Badge>
      )}
      {!recipient.payee && <Badge tone="warning">No payee</Badge>}
      {recipient.frontedOutstanding.map((f) => (
        <Badge
          key={f.adjustmentId}
          tone="warning"
          title={`Fronted on ${formatDate(
            f.effectiveAt,
          )}; the donation hasn't arrived by the cutoff`}
        >
          Fronted {formatMoney(f.amount)}
        </Badge>
      ))}
    </span>
  );
}

/** Money input that reports every valid value as it's typed (decimal comma, no grouping). */
export function PayNowInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (amount: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatMoneyInput(value));
  useEffect(() => {
    // Follow outside changes (discard, proposal) unless the text already means the same amount
    if (parseMoneyInput(text || "0") !== value) setText(formatMoneyInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text.trim() !== "" && parseMoneyInput(text) === null;
  return (
    <Input
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={invalid ? "Enter an amount in kroner, like 1000 or 249,50" : undefined}
      inputMode="decimal"
      disabled={disabled}
      className="num h-7 w-32 text-right"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseMoneyInput(e.target.value.trim() === "" ? "0" : e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
    />
  );
}

function IncludeDirectSwitch({
  builder,
  recipient,
  editable,
  onApplied,
}: {
  builder: Builder;
  recipient: BuilderRecipient;
  editable: boolean;
  onApplied: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(trpc.regranting.rounds.setIncludeDirect.mutationOptions());
  const kindDefault = builder.defaultIncludeDirect;
  const apply = async (includeDirect: boolean | null, announce = true) => {
    const before = recipient.includeDirectOverride;
    try {
      await mutation.mutateAsync({
        roundId: builder.round.id,
        organizationId: recipient.organizationId,
        includeDirect,
      });
      onApplied();
      await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
      if (announce)
        notify.undo(
          `Direct donations ${includeDirect ?? kindDefault ? "included" : "left out"} for ${
            recipient.name
          }`,
          () => void apply(before, false).then(() => notify.success("Change undone")),
          "Its payments were proposed again.",
        );
    } catch (error) {
      notify.error(error);
    }
  };
  const id = `include-direct-${recipient.organizationId}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Switch
        id={id}
        checked={recipient.includeDirect}
        disabled={!editable || mutation.isPending}
        onCheckedChange={(checked) => void apply(checked === kindDefault ? null : checked)}
      />
      <label htmlFor={id} className="text-muted-foreground">
        Include direct donations
      </label>
      {recipient.includeDirectOverride !== null && (
        <span className="text-muted-foreground">
          (changed; {roundKindLabels[builder.round.kind].toLowerCase()} rounds{" "}
          {kindDefault ? "include" : "leave out"} them)
        </span>
      )}
    </span>
  );
}

function AddProjectLineDialog({
  builder,
  recipient,
  edits,
  saved,
  onEditsChange,
}: {
  builder: Builder;
  recipient: BuilderRecipient;
  edits: Edits;
  saved: ReadonlyMap<string, LinePayment>;
  onEditsChange: (edits: Map<string, LineEdit>) => void;
}) {
  const unrestricted = paymentFor(saved, edits, recipient.organizationId, null);
  return (
    <RecordDialog<{ projectId: number | null; projectName: string | null; amount: string }>
      trigger={
        <Button variant="ghost" size="sm">
          <PlusIcon />
          Add project line
        </Button>
      }
      title={`Pay a project at ${recipient.name}`}
      description="Adds a line to this round. It's saved with your other changes. To move money from the unrestricted balance to the project first, use Earmark."
      initial={() => ({ projectId: null, projectName: null, amount: "" })}
      validate={(v) => ({
        projectId: v.projectId === null ? "Choose a project" : undefined,
        amount:
          parseMoneyInput(v.amount) === null || moneySign(parseMoneyInput(v.amount)!) <= 0
            ? "Enter an amount in kroner, like 1000 or 249,50"
            : undefined,
      })}
      saveLabel="Add line"
      onSave={async (v) => {
        onEditsChange(
          setPayment(edits, saved, recipient.organizationId, v.projectId, {
            amount: parseMoneyInput(v.amount)!,
            transferId: defaultTransferFor(builder, recipient.payee, unrestricted.transferId),
            projectName: v.projectName,
          }),
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field
            label="Project"
            required
            error={errors.projectId}
            hint={
              <Link to="/regranting/projects" className="text-accent hover:underline">
                Create a project
              </Link>
            }
          >
            <ProjectPicker
              organizationId={recipient.organizationId}
              allowUnrestricted={false}
              value={values.projectId}
              onValueChange={(projectId, projectName) => set({ projectId, projectName })}
            />
          </Field>
          <Field label="Pay now" required error={errors.amount}>
            <Input
              inputMode="decimal"
              className="num w-40"
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

/**
 * Earmarks part of the unrestricted balance to a project (regranting.rounds.earmark): two paired
 * reallocation entries attached to this draft and dated its cutoff (unrestricted −X, project +X),
 * and the same amount of Pay now moves from the unrestricted line to the project line, in one
 * transaction. Balances change only once the round is approved.
 */
function EarmarkDialog({
  builder,
  recipient,
  dirty,
}: {
  builder: Builder;
  recipient: BuilderRecipient;
  dirty: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const earmark = useMutation(trpc.regranting.rounds.earmark.mutationOptions());
  const unrestricted = recipient.lines.find((l) => l.projectId === null);
  const available = unrestricted?.available ?? "0.00";
  return (
    <RecordDialog<{
      projectId: number | null;
      projectName: string | null;
      amount: string;
      note: string;
    }>
      trigger={
        <Button
          variant="ghost"
          size="sm"
          disabled={dirty || moneySign(available) <= 0}
          title={dirty ? "Save or discard your changes first" : undefined}
        >
          Earmark to project…
        </Button>
      }
      title={`Earmark part of ${recipient.name}'s unrestricted balance`}
      description={`Moves money from the unrestricted balance (${formatMoney(
        available,
      )} available) to a project, with two reallocation entries dated the cutoff (${formatDate(
        builder.round.cutoff,
      )}). Pay now moves with it. Balances change when the round is approved.`}
      initial={() => ({ projectId: null, projectName: null, amount: "", note: "" })}
      validate={(v) => {
        const amount = parseMoneyInput(v.amount);
        return {
          projectId: v.projectId === null ? "Choose a project" : undefined,
          amount:
            amount === null || moneySign(amount) <= 0
              ? "Enter an amount in kroner, like 1000 or 249,50"
              : compareMoney(amount, available) > 0
              ? `At most ${formatMoney(available)} is available`
              : undefined,
          note: v.note.length > 1000 ? "Keep the note under 1000 characters" : undefined,
        };
      }}
      saveLabel="Earmark"
      onSave={async (v) => {
        const amount = parseMoneyInput(v.amount)!;
        await earmark.mutateAsync({
          roundId: builder.round.id,
          organizationId: recipient.organizationId,
          projectId: v.projectId!,
          amount: Number(amount),
          note: v.note.trim() || null,
        });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Earmarked", `${formatMoney(amount)} to ${v.projectName ?? "the project"}`);
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Project" required error={errors.projectId}>
            <ProjectPicker
              organizationId={recipient.organizationId}
              allowUnrestricted={false}
              value={values.projectId}
              onValueChange={(projectId, projectName) => set({ projectId, projectName })}
            />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input
              inputMode="decimal"
              className="num w-40"
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
          <Field
            label="Note"
            error={errors.note}
            hint="Added to the reason, which names the project and the round (e.g. the grant letter)"
          >
            <Textarea value={values.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
