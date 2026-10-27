/**
 * Regranting setup: payees, which payee handles each recipient (dated routing), own funds and
 * holds. Small tables with create/edit dialogs, like the Settings page.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { SettingsSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { activeStatus, ruleValidity } from "@/lib/status";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { Fund, Hold, Payee, Routing } from "./model";
import {
  OrganizationPicker,
  PayeePicker,
  ProjectPicker,
  RecipientLink,
  useOrganizations,
} from "./ui";

const th =
  "text-left text-xs text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold";
const td = "[&>td]:border-b [&>td]:border-border [&>td]:px-3 [&>td]:py-1.5 last:[&>td]:border-b-0";

function useInvalidate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
}

function TableShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

function Loading<T>({
  query,
  empty,
  children,
}: {
  query: { data?: T[]; error: unknown; refetch: () => unknown };
  empty: ReactNode;
  children: (rows: T[]) => ReactNode;
}) {
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <div className="h-28" aria-busy />;
  if (query.data.length === 0) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

//region Payees

type PayeeForm = {
  name: string;
  currency: string;
  bankAccount: string;
  iban: string;
  swift: string;
  wallet: string;
  paymentReferenceTemplate: string;
  isActive: boolean;
};

export function validatePayee(v: PayeeForm) {
  return {
    name: textError(v.name, { label: "a name", max: 255, required: true }),
    currency: /^[A-Z]{3,8}$/.test(v.currency.trim())
      ? undefined
      : "Enter a code like NOK, EUR or BTC",
    bankAccount: textError(v.bankAccount, { label: "the account number", max: 64 }),
    iban: textError(v.iban, { label: "the IBAN", max: 64 }),
    swift: textError(v.swift, { label: "the SWIFT/BIC", max: 16 }),
    wallet: textError(v.wallet, { label: "the wallet", max: 128 }),
    paymentReferenceTemplate: textError(v.paymentReferenceTemplate, {
      label: "the reference",
      max: 255,
    }),
  };
}

const orNull = (s: string) => s.trim() || null;

function PayeeDialog({ payee, trigger }: { payee?: Payee; trigger: ReactNode }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const create = useMutation(trpc.regranting.payees.create.mutationOptions());
  const update = useMutation(trpc.regranting.payees.update.mutationOptions());
  return (
    <RecordDialog<PayeeForm>
      trigger={trigger}
      title={payee ? `Edit ${payee.name}` : "New payee"}
      description="Who we actually send money to. One payee can cover several recipients."
      initial={() => ({
        name: payee?.name ?? "",
        currency: payee?.currency ?? "NOK",
        bankAccount: payee?.bankAccount ?? "",
        iban: payee?.iban ?? "",
        swift: payee?.swift ?? "",
        wallet: payee?.wallet ?? "",
        paymentReferenceTemplate: payee?.paymentReferenceTemplate ?? "",
        isActive: payee?.isActive ?? true,
      })}
      validate={validatePayee}
      saveLabel={payee ? strings.actions.saveChanges : "Create payee"}
      onSave={async (v) => {
        const input = {
          name: v.name.trim(),
          currency: v.currency.trim(),
          bankAccount: orNull(v.bankAccount),
          iban: orNull(v.iban),
          swift: orNull(v.swift),
          wallet: orNull(v.wallet),
          paymentReferenceTemplate: orNull(v.paymentReferenceTemplate),
          isActive: v.isActive,
        };
        if (payee) await update.mutateAsync({ id: payee.id, ...input });
        else await create.mutateAsync(input);
        await invalidate();
        notify.success(payee ? "Payee updated" : "Payee created", input.name);
      }}
    >
      {({ values, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Field label="Name" required error={errors.name}>
              <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Currency" required error={errors.currency}>
              <Input
                className="num"
                value={values.currency}
                onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account number" error={errors.bankAccount}>
              <Input
                className="num"
                value={values.bankAccount}
                onChange={(e) => set({ bankAccount: e.target.value })}
              />
            </Field>
            <Field label="IBAN" error={errors.iban}>
              <Input
                className="num"
                value={values.iban}
                onChange={(e) => set({ iban: e.target.value })}
              />
            </Field>
            <Field label="SWIFT/BIC" error={errors.swift}>
              <Input
                className="num"
                value={values.swift}
                onChange={(e) => set({ swift: e.target.value })}
              />
            </Field>
            <Field label="Wallet" error={errors.wallet} hint="For crypto payees">
              <Input value={values.wallet} onChange={(e) => set({ wallet: e.target.value })} />
            </Field>
          </div>
          <Field
            label="Payment reference"
            error={errors.paymentReferenceTemplate}
            hint="e.g. Gi Effektivt {round}"
          >
            <Input
              value={values.paymentReferenceTemplate}
              onChange={(e) => set({ paymentReferenceTemplate: e.target.value })}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="payee-active"
              checked={values.isActive}
              onCheckedChange={(c) => set({ isActive: c === true })}
            />
            <Label htmlFor="payee-active" className="font-normal">
              Active (can be chosen for new routings)
            </Label>
          </div>
        </>
      )}
    </RecordDialog>
  );
}

export function PayeesSection() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const payees = useQuery(trpc.regranting.payees.list.queryOptions());
  const remove = useMutation(trpc.regranting.payees.delete.mutationOptions());
  return (
    <SettingsSection
      title="Payees"
      description={
        <>
          <p>
            Who we actually pay. GiveWell, for instance, receives the money for several recipients
            in one transfer.
          </p>
          <p className="mt-2">A payee in use can't be deleted; make it inactive instead.</p>
        </>
      }
      actions={
        <PayeeDialog
          trigger={
            <Button>
              <PlusIcon />
              New payee
            </Button>
          }
        />
      }
    >
      <Loading
        query={payees}
        empty={
          <EmptyState
            size="sm"
            title="No payees yet"
            description="Add one, then route recipients to it."
            className="rounded-md border border-border"
          />
        }
      >
        {(rows) => (
          <TableShell label="Payees">
            <thead>
              <tr className={th}>
                <th scope="col">Name</th>
                <th scope="col">Currency</th>
                <th scope="col">Account</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
                <th scope="col" className="w-20">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={cn(td, !p.isActive && "text-muted-foreground")}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="num">{p.currency}</td>
                  <td className="num max-w-56 truncate">
                    {p.iban ?? p.bankAccount ?? p.wallet ?? "–"}
                    {p.swift && ` · ${p.swift}`}
                  </td>
                  <td className="max-w-48 truncate">{p.paymentReferenceTemplate ?? "–"}</td>
                  <td>
                    <Status catalog={activeStatus} value={p.isActive ? "active" : "inactive"} />
                  </td>
                  <td>
                    <div className="flex gap-0.5">
                      <PayeeDialog
                        payee={p}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}>
                            <PencilIcon />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`}>
                            <Trash2Icon />
                          </Button>
                        }
                        tone="danger"
                        title={`Delete the payee ${p.name}?`}
                        consequences={[
                          "Only possible while no routing or transfer uses it",
                          "Otherwise, make it inactive",
                        ]}
                        confirmLabel="Delete payee"
                        onConfirm={async () => {
                          await remove.mutateAsync({ id: p.id });
                          await invalidate();
                          notify.success("Payee deleted", p.name);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Loading>
    </SettingsSection>
  );
}

//endregion

//region Routing

type RoutingForm = {
  organizationId: number | null;
  payeeId: number | null;
  validFrom: string;
  validTo: string;
};

export function validateRouting(v: RoutingForm) {
  return {
    organizationId: v.organizationId === null ? "Choose a recipient" : undefined,
    payeeId: v.payeeId === null ? "Choose a payee" : undefined,
    validFrom: v.validFrom ? undefined : "Enter the first day",
    validTo:
      v.validTo && v.validFrom && v.validTo < v.validFrom ? "Ends before it starts" : undefined,
  };
}

/** in effect / upcoming / ended, for a dated routing. */
export function routingValidity(r: Pick<Routing, "validFrom" | "validTo">, today: string) {
  if (r.validFrom > today) return "upcoming" as const;
  if (r.validTo !== null && r.validTo < today) return "expired" as const;
  return "current" as const;
}

function RoutingDialog({ routing, trigger }: { routing?: Routing; trigger: ReactNode }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const create = useMutation(trpc.regranting.routings.create.mutationOptions());
  const update = useMutation(trpc.regranting.routings.update.mutationOptions());
  return (
    <RecordDialog<RoutingForm>
      trigger={trigger}
      title={routing ? `Edit routing of ${routing.organizationName}` : "New routing"}
      description="Which payee receives a recipient's money, from a date. Rounds use the routing valid at their cutoff. Periods can't overlap; end the old one first."
      initial={() => ({
        organizationId: routing?.organizationId ?? null,
        payeeId: routing?.payeeId ?? null,
        validFrom: routing?.validFrom ?? osloDay(),
        validTo: routing?.validTo ?? "",
      })}
      validate={validateRouting}
      saveLabel={routing ? strings.actions.saveChanges : "Add routing"}
      onSave={async (v) => {
        const input = {
          organizationId: v.organizationId!,
          payeeId: v.payeeId!,
          validFrom: v.validFrom,
          validTo: v.validTo || null,
        };
        const saved = routing
          ? await update.mutateAsync({ id: routing.id, ...input })
          : await create.mutateAsync(input);
        await invalidate();
        notify.success(
          routing ? "Routing updated" : "Routing added",
          `${saved.organizationName} → ${saved.payeeName}`,
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Recipient" required error={errors.organizationId}>
            <OrganizationPicker
              value={values.organizationId}
              onValueChange={(organizationId) => set({ organizationId })}
            />
          </Field>
          <Field label="Payee" required error={errors.payeeId}>
            <PayeePicker value={values.payeeId} onValueChange={(payeeId) => set({ payeeId })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" required error={errors.validFrom}>
              <DateInput
                value={values.validFrom}
                onValueChange={(validFrom) => set({ validFrom })}
              />
            </Field>
            <Field label="To" error={errors.validTo} hint="Empty: until changed">
              <DateInput value={values.validTo} onValueChange={(validTo) => set({ validTo })} />
            </Field>
          </div>
        </>
      )}
    </RecordDialog>
  );
}

export function RoutingSection() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const routings = useQuery(trpc.regranting.routings.list.queryOptions());
  const remove = useMutation(trpc.regranting.routings.delete.mutationOptions());
  const today = osloDay();
  return (
    <SettingsSection
      title="Routing"
      description={
        <>
          <p>
            Which payee handles each recipient, and from when. Malaria Consortium, for example, was
            paid through GiveWell until it went direct.
          </p>
          <p className="mt-2">
            Both days are included. A recipient can only have one routing on any day.
          </p>
        </>
      }
      actions={
        <RoutingDialog
          trigger={
            <Button>
              <PlusIcon />
              New routing
            </Button>
          }
        />
      }
    >
      <Loading
        query={routings}
        empty={
          <EmptyState
            size="sm"
            title="No routings yet"
            description="Recipients without a payee can't be paid in a round."
            className="rounded-md border border-border"
          />
        }
      >
        {(rows) => (
          <TableShell label="Routing">
            <thead>
              <tr className={th}>
                <th scope="col">Recipient</th>
                <th scope="col">Payee</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Status</th>
                <th scope="col" className="w-20">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort(
                  (a, b) =>
                    a.organizationName.localeCompare(b.organizationName, "nb") ||
                    b.validFrom.localeCompare(a.validFrom),
                )
                .map((r) => {
                  const validity = routingValidity(r, today);
                  return (
                    <tr
                      key={r.id}
                      className={cn(td, validity === "expired" && "text-muted-foreground")}
                    >
                      <td>
                        <RecipientLink organizationId={r.organizationId}>
                          {r.organizationName}
                        </RecipientLink>
                      </td>
                      <td className="font-semibold">{r.payeeName}</td>
                      <td>
                        <DateTime value={r.validFrom} />
                      </td>
                      <td>
                        {r.validTo ? (
                          <DateTime value={r.validTo} />
                        ) : (
                          <span className="text-muted-foreground">Until changed</span>
                        )}
                      </td>
                      <td>
                        <Status catalog={ruleValidity} value={validity} />
                      </td>
                      <td>
                        <div className="flex gap-0.5">
                          <RoutingDialog
                            routing={r}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit routing of ${
                                  r.organizationName
                                } from ${formatDate(r.validFrom)}`}
                              >
                                <PencilIcon />
                              </Button>
                            }
                          />
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete routing of ${
                                  r.organizationName
                                } from ${formatDate(r.validFrom)}`}
                              >
                                <Trash2Icon />
                              </Button>
                            }
                            tone="danger"
                            title={`Delete the routing ${r.organizationName} → ${r.payeeName}?`}
                            consequences={[
                              "Draft rounds with a cutoff in this period lose the payee for this recipient",
                              "Approved and paid rounds keep their transfers",
                            ]}
                            confirmLabel="Delete routing"
                            onConfirm={async () => {
                              await remove.mutateAsync({ id: r.id });
                              await invalidate();
                              notify.success("Routing deleted");
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        )}
      </Loading>
    </SettingsSection>
  );
}

//endregion

//region Own funds

type FundForm = { organizationId: number | null; maxHoldDays: string };

function FundDialog({ fund, trigger }: { fund?: Fund; trigger: ReactNode }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const create = useMutation(trpc.regranting.funds.create.mutationOptions());
  const update = useMutation(trpc.regranting.funds.update.mutationOptions());
  return (
    <RecordDialog<FundForm>
      trigger={trigger}
      title={fund ? `Edit ${fund.name}` : "Mark a recipient as an own fund"}
      description="Own funds are never paid directly. Their money moves through fund grants decided in a round."
      initial={() => ({
        organizationId: fund?.organizationId ?? null,
        maxHoldDays: fund?.maxHoldDays ? String(fund.maxHoldDays) : "",
      })}
      validate={(v) => ({
        organizationId: v.organizationId === null ? "Choose the recipient" : undefined,
        maxHoldDays:
          v.maxHoldDays.trim() === "" || /^[1-9]\d{0,4}$/.test(v.maxHoldDays.trim())
            ? undefined
            : "Enter a number of days",
      })}
      saveLabel={fund ? strings.actions.saveChanges : "Mark as own fund"}
      onSave={async (v) => {
        const maxHoldDays = v.maxHoldDays.trim() ? Number(v.maxHoldDays) : null;
        if (fund) await update.mutateAsync({ organizationId: fund.organizationId, maxHoldDays });
        else await create.mutateAsync({ organizationId: v.organizationId!, maxHoldDays });
        await invalidate();
        notify.success(fund ? "Fund updated" : "Own fund added");
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Recipient" required error={errors.organizationId}>
            <OrganizationPicker
              value={values.organizationId}
              disabled={Boolean(fund)}
              onValueChange={(organizationId) => set({ organizationId })}
            />
          </Field>
          <Field
            label="Hold money at most"
            error={errors.maxHoldDays}
            hint="Days. Older money is flagged on Balances (not enforced). Empty: no limit."
          >
            <Input
              inputMode="numeric"
              className="num w-32"
              value={values.maxHoldDays}
              onChange={(e) => set({ maxHoldDays: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

export function FundsSection() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const funds = useQuery(trpc.regranting.funds.list.queryOptions());
  const remove = useMutation(trpc.regranting.funds.delete.mutationOptions());
  return (
    <SettingsSection
      title="Own funds"
      description="Recipients Gi Effektivt distributes itself, like the Gi Effektivt fund. Donations to them stay in the fund until a fund grant moves them on."
      actions={
        <FundDialog
          trigger={
            <Button>
              <PlusIcon />
              Add own fund
            </Button>
          }
        />
      }
    >
      <Loading
        query={funds}
        empty={
          <EmptyState
            size="sm"
            title="No own funds"
            description="Every recipient is paid directly."
            className="rounded-md border border-border"
          />
        }
      >
        {(rows) => (
          <TableShell label="Own funds">
            <thead>
              <tr className={th}>
                <th scope="col">Fund</th>
                <th scope="col">Abbreviation</th>
                <th scope="col" className="text-right">
                  Max hold
                </th>
                <th scope="col" className="w-20">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.organizationId} className={td}>
                  <td>
                    <RecipientLink organizationId={f.organizationId} className="font-semibold">
                      {f.name}
                    </RecipientLink>
                  </td>
                  <td>{f.abbriv}</td>
                  <td className="num text-right">
                    {f.maxHoldDays ? `${f.maxHoldDays} days` : "No limit"}
                  </td>
                  <td>
                    <div className="flex gap-0.5">
                      <FundDialog
                        fund={f}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`}>
                            <PencilIcon />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Stop treating ${f.name} as an own fund`}
                          >
                            <Trash2Icon />
                          </Button>
                        }
                        tone="danger"
                        title={`Stop treating ${f.name} as an own fund?`}
                        consequences={[
                          "Only possible while it has no fund grants",
                          "It is then proposed and paid like any recipient",
                        ]}
                        confirmLabel="Remove own fund"
                        onConfirm={async () => {
                          await remove.mutateAsync({ organizationId: f.organizationId });
                          await invalidate();
                          notify.success("Own fund removed", f.name);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Loading>
    </SettingsSection>
  );
}

//endregion

//region Holds

type HoldForm = {
  organizationId: number | null;
  projectId: number | null;
  reason: string;
  until: string;
};

function HoldDialog({ hold, trigger }: { hold?: Hold; trigger: ReactNode }) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const create = useMutation(trpc.regranting.holds.create.mutationOptions());
  const update = useMutation(trpc.regranting.holds.update.mutationOptions());
  return (
    <RecordDialog<HoldForm>
      trigger={trigger}
      title={hold ? "Edit hold" : "New hold"}
      description="While a hold is active, the recipient (or project) is shown in rounds but proposed 0. The money stays in its balance."
      initial={() => ({
        organizationId: hold?.organizationId ?? null,
        projectId: hold?.projectId ?? null,
        reason: hold?.reason ?? "",
        until: hold?.until ?? "",
      })}
      validate={(v) => ({
        organizationId: v.organizationId === null ? "Choose the recipient" : undefined,
        reason: textError(v.reason, { label: "a reason", max: 5000, required: true }),
      })}
      saveLabel={hold ? strings.actions.saveChanges : "Add hold"}
      onSave={async (v) => {
        if (hold)
          await update.mutateAsync({
            id: hold.id,
            projectId: v.projectId,
            reason: v.reason.trim(),
            until: v.until || null,
          });
        else
          await create.mutateAsync({
            organizationId: v.organizationId!,
            projectId: v.projectId,
            reason: v.reason.trim(),
            until: v.until || null,
          });
        await invalidate();
        notify.success(hold ? "Hold updated" : "Hold added");
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Recipient" required error={errors.organizationId}>
            <OrganizationPicker
              value={values.organizationId}
              disabled={Boolean(hold)}
              onValueChange={(organizationId) => set({ organizationId, projectId: null })}
            />
          </Field>
          <Field label="Project" hint="Unrestricted holds the whole recipient">
            <ProjectPicker
              organizationId={values.organizationId}
              value={values.projectId}
              onValueChange={(projectId) => set({ projectId })}
            />
          </Field>
          <Field label="Reason" required error={errors.reason}>
            <Textarea value={values.reason} onChange={(e) => set({ reason: e.target.value })} />
          </Field>
          <Field
            label="Until"
            hint="Active for rounds with a cutoff on or before this day. Empty: until removed."
          >
            <DateInput value={values.until} onValueChange={(until) => set({ until })} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

export function HoldsSection() {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const holds = useQuery(trpc.regranting.holds.list.queryOptions());
  const projects = useQuery(trpc.regranting.projects.list.queryOptions());
  const orgs = useOrganizations();
  const remove = useMutation(trpc.regranting.holds.delete.mutationOptions());
  const orgName = (id: number) => orgs.data?.find((o) => o.id === id)?.name ?? `Recipient #${id}`;
  const projectName = (id: number | null) =>
    id === null
      ? "Whole recipient"
      : projects.data?.find((p) => p.id === id)?.name ?? `Project #${id}`;
  const today = osloDay();
  return (
    <SettingsSection
      title="Holds"
      description="Keep a recipient or project out of proposals, e.g. while a grant letter is pending."
      actions={
        <HoldDialog
          trigger={
            <Button>
              <PlusIcon />
              New hold
            </Button>
          }
        />
      }
    >
      <Loading
        query={holds}
        empty={
          <EmptyState
            size="sm"
            title="No holds"
            description="Every recipient is proposed its balance."
            className="rounded-md border border-border"
          />
        }
      >
        {(rows) => (
          <TableShell label="Holds">
            <thead>
              <tr className={th}>
                <th scope="col">Recipient</th>
                <th scope="col">Applies to</th>
                <th scope="col">Reason</th>
                <th scope="col">Until</th>
                <th scope="col">Status</th>
                <th scope="col" className="w-20">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const ended = h.until !== null && h.until < today;
                return (
                  <tr key={h.id} className={cn(td, ended && "text-muted-foreground")}>
                    <td>
                      <RecipientLink organizationId={h.organizationId}>
                        {orgName(h.organizationId)}
                      </RecipientLink>
                    </td>
                    <td>{projectName(h.projectId)}</td>
                    <td className="max-w-sm truncate" title={h.reason}>
                      {h.reason}
                    </td>
                    <td>
                      {h.until ? (
                        <DateTime value={h.until} />
                      ) : (
                        <span className="text-muted-foreground">Until removed</span>
                      )}
                    </td>
                    <td>
                      <Status catalog={ruleValidity} value={ended ? "expired" : "current"} />
                    </td>
                    <td>
                      <div className="flex gap-0.5">
                        <HoldDialog
                          hold={h}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit hold on ${orgName(h.organizationId)}`}
                            >
                              <PencilIcon />
                            </Button>
                          }
                        />
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove hold on ${orgName(h.organizationId)}`}
                            >
                              <Trash2Icon />
                            </Button>
                          }
                          title={`Remove the hold on ${orgName(h.organizationId)}?`}
                          consequences={[
                            "Draft rounds propose its balance again after Propose again",
                          ]}
                          confirmLabel="Remove hold"
                          onConfirm={async () => {
                            await remove.mutateAsync({ id: h.id });
                            await invalidate();
                            notify.success("Hold removed");
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Loading>
    </SettingsSection>
  );
}

//endregion
