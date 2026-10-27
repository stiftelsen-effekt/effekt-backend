import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, ScaleIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { SettingsSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { osloDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { ruleValidity } from "@/lib/status";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  matchingRuleForm,
  matchingRuleInput,
  ruleValidityOn,
  sortRules,
  validateMatchingRule,
  type MatchingRuleForm,
} from "./matching-rules";
import { RecordDialog } from "./record-dialog";

export function DataOwnersSection() {
  const trpc = useTRPC();
  const owners = useQuery(trpc.meta.owners.queryOptions());
  return (
    <SettingsSection
      title="Data owners"
      description={
        <>
          <p>
            The organizations that can own donation data. Imports and registrations choose one; the
            default is used when none is chosen.
          </p>
          <p className="mt-2">Changed in the database, not here.</p>
        </>
      }
    >
      {owners.error ? (
        <ErrorState error={owners.error} onRetry={() => void owners.refetch()} />
      ) : !owners.data ? (
        <Skeleton className="h-28" />
      ) : (
        <div className="relative overflow-hidden rounded-md border border-border">
          <Table aria-label="Data owners">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-right">ID</TableHead>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.data.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell className="num text-right text-muted-foreground">{owner.id}</TableCell>
                  <TableCell>
                    <span className="font-semibold">{owner.name}</span>
                    {owner.default && <Badge className="ml-2">Default</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SettingsSection>
  );
}

function MatchingRuleFields({
  values,
  set,
  errors,
}: {
  values: MatchingRuleForm;
  set: (patch: Partial<MatchingRuleForm>) => void;
  errors: Record<string, string | undefined>;
}) {
  return (
    <>
      <Field
        label="Sales location"
        required
        error={errors.salesLocation}
        hint="As written in the Vipps report"
      >
        <Input
          value={values.salesLocation}
          onChange={(e) => set({ salesLocation: e.target.value })}
        />
      </Field>
      <Field label="Message" hint="Leave empty to match any message" error={errors.message}>
        <Input value={values.message} onChange={(e) => set({ message: e.target.value })} />
      </Field>
      <Field
        label="KID"
        required
        error={errors.resolveKID}
        hint="Matched payments are registered to this distribution"
      >
        <Input
          inputMode="numeric"
          className="num"
          value={values.KID}
          onChange={(e) => set({ KID: e.target.value })}
        />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">In effect</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day" required error={errors.periodFrom}>
            <DateInput value={values.from} onValueChange={(from) => set({ from })} />
          </Field>
          <Field label="Last day" required error={errors.periodTo}>
            <DateInput value={values.to} onValueChange={(to) => set({ to })} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Both days included.</p>
      </fieldset>
      <Field
        label="Precedence"
        hint="Higher wins when several rules match. Leave empty for lowest."
        error={errors.precedence}
        className="max-w-48"
      >
        <Input
          inputMode="numeric"
          className="num"
          value={values.precedence}
          onChange={(e) => set({ precedence: e.target.value })}
        />
      </Field>
    </>
  );
}

export function MatchingRulesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const rules = useQuery(trpc.vipps.matchingRules.list.queryOptions());
  const create = useMutation(trpc.vipps.matchingRules.create.mutationOptions());
  const update = useMutation(trpc.vipps.matchingRules.update.mutationOptions());
  const remove = useMutation(trpc.vipps.matchingRules.delete.mutationOptions());
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.vipps.matchingRules.pathKey() });
  const today = osloDay();

  return (
    <SettingsSection
      title="Vipps matching rules"
      description={
        <>
          <p>
            A rule registers Vipps payments that arrive without a KID: payments from the sales
            location (and with the message, if set) go to the rule's KID while the rule is in
            effect. When several rules match, the highest precedence wins.
          </p>
          <p className="mt-2">
            Rules apply when a Vipps report is imported, only if the rule covers the report's whole
            period. Payments no rule matches go to the review queue.
          </p>
        </>
      }
      actions={
        <RecordDialog<MatchingRuleForm>
          trigger={
            <Button>
              <PlusIcon />
              New matching rule
            </Button>
          }
          title="New matching rule"
          description="Applies to Vipps reports imported from now on."
          initial={() => ({
            salesLocation: "",
            message: "",
            KID: "",
            from: today,
            to: "",
            precedence: "",
          })}
          validate={validateMatchingRule}
          saveLabel="Create rule"
          onSave={async (values) => {
            await create.mutateAsync(matchingRuleInput(values));
            await invalidate();
            notify.success(
              "Matching rule created",
              `${values.salesLocation.trim()} → KID ${values.KID.trim()}`,
            );
          }}
        >
          {(form) => <MatchingRuleFields {...form} />}
        </RecordDialog>
      }
    >
      {rules.error ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : !rules.data ? (
        <Skeleton className="h-48" />
      ) : rules.data.length === 0 ? (
        <EmptyState
          icon={ScaleIcon}
          size="sm"
          title="No matching rules"
          description="Vipps payments without a KID all go to the review queue."
          className="rounded-md border border-border"
        />
      ) : (
        <div className="relative overflow-x-auto rounded-md border border-border">
          <Table aria-label="Vipps matching rules">
            <TableHeader>
              <TableRow>
                <TableHead>Sales location</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>KID</TableHead>
                <TableHead>In effect</TableHead>
                <TableHead className="text-right">Precedence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRules(rules.data, today).map((rule) => {
                const validity = ruleValidityOn(rule, today);
                const label = `${rule.salesLocation ?? "no sales location"}${
                  rule.message ? ` / ${rule.message}` : ""
                }`;
                return (
                  <TableRow
                    key={rule.id}
                    className={cn(validity === "expired" && "text-muted-foreground")}
                  >
                    <TableCell className="font-semibold">{rule.salesLocation ?? "–"}</TableCell>
                    <TableCell>
                      {rule.message ?? <span className="text-muted-foreground">Any</span>}
                    </TableCell>
                    <TableCell>
                      <CopyValue value={rule.resolveKID} label="KID" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DateTime value={rule.periodFrom} /> – <DateTime value={rule.periodTo} />
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.precedence === null ? "–" : <Num value={rule.precedence} />}
                    </TableCell>
                    <TableCell>
                      <Status catalog={ruleValidity} value={validity} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <RecordDialog<MatchingRuleForm>
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit rule for ${label}`}
                            >
                              <PencilIcon />
                            </Button>
                          }
                          title={`Edit the rule for ${label}`}
                          description="Changes apply to Vipps reports imported from now on. Donations this rule already registered keep their KID."
                          initial={() => matchingRuleForm(rule)}
                          validate={validateMatchingRule}
                          saveLabel={strings.actions.saveChanges}
                          onSave={async (values) => {
                            await update.mutateAsync({ id: rule.id, ...matchingRuleInput(values) });
                            await invalidate();
                            notify.success(
                              "Matching rule updated",
                              `${values.salesLocation.trim()} → KID ${values.KID.trim()}`,
                            );
                          }}
                        >
                          {(form) => <MatchingRuleFields {...form} />}
                        </RecordDialog>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete rule for ${label}`}
                            >
                              <Trash2Icon />
                            </Button>
                          }
                          tone="danger"
                          title={`Delete the rule for ${label}?`}
                          consequences={[
                            `Vipps payments from ${
                              rule.salesLocation ?? "this location"
                            } will no longer go to KID ${rule.resolveKID} in future imports`,
                            "Unmatched payments go to the review queue instead",
                            "Donations already registered by this rule are not changed",
                            `In effect ${formatDate(rule.periodFrom)} – ${formatDate(
                              rule.periodTo,
                            )}`,
                          ]}
                          confirmLabel="Delete rule"
                          onConfirm={async () => {
                            await remove.mutateAsync({ id: rule.id });
                            await invalidate();
                            notify.success("Matching rule deleted", label);
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SettingsSection>
  );
}
