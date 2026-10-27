import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { PlusIcon, ScaleIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { SettingsSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Field, useFieldControl } from "@/components/ui/field";
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
import { isoDay } from "@/features/home/model";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { ruleValidity } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
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
            The organizations that can own donation data. Imports and registrations choose one;
            the default is used when none is chosen.
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

function FieldDateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const { id } = useFieldControl();
  return (
    <DateRangePicker
      id={id}
      placeholder="Choose dates"
      presets={false}
      value={
        from || to
          ? { from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined }
          : undefined
      }
      onValueChange={(range) =>
        onChange({
          from: range?.from ? isoDay(range.from) : "",
          to: range?.to ? isoDay(range.to) : "",
        })
      }
    />
  );
}

export function MatchingRulesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const rules = useQuery(trpc.vipps.matchingRules.list.queryOptions());
  const create = useMutation(trpc.vipps.matchingRules.create.mutationOptions());
  const remove = useMutation(trpc.vipps.matchingRules.delete.mutationOptions());
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.vipps.matchingRules.pathKey() });
  const today = isoDay(new Date());

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
            Rules apply when a Vipps report is imported, only if the rule covers the report's
            whole period. Payments no rule matches go to the review queue.
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
          description="Applies to Vipps reports imported from now on. Rules can't be edited; delete and recreate to change one."
          initial={() => ({ salesLocation: "", message: "", KID: "", from: today, to: "", precedence: "" })}
          validate={validateMatchingRule}
          saveLabel="Create rule"
          onSave={async (values) => {
            await create.mutateAsync(matchingRuleInput(values));
            await invalidate();
            notify.success("Matching rule created", `${values.salesLocation.trim()} → KID ${values.KID.trim()}`);
          }}
        >
          {({ values, set, errors }) => (
            <>
              <Field label="Sales location" required error={errors.salesLocation} hint="As written in the Vipps report">
                <Input value={values.salesLocation} onChange={(e) => set({ salesLocation: e.target.value })} />
              </Field>
              <Field
                label="Message"
                hint="Leave empty to match any message"
                error={errors.message}
              >
                <Input value={values.message} onChange={(e) => set({ message: e.target.value })} />
              </Field>
              <Field label="KID" required error={errors.resolveKID} hint="Matched payments are registered to this distribution">
                <Input
                  inputMode="numeric"
                  className="num"
                  value={values.KID}
                  onChange={(e) => set({ KID: e.target.value })}
                />
              </Field>
              <Field label="In effect" required error={errors.periodTo ?? errors.periodFrom} hint="First and last day, both included">
                <FieldDateRange
                  from={values.from}
                  to={values.to}
                  onChange={(range) => set(range)}
                />
              </Field>
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
          )}
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
                <TableHead className="w-12">
                  <span className="sr-only">Delete</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortRules(rules.data, today).map((rule) => {
                const validity = ruleValidityOn(rule, today);
                const label = `${rule.salesLocation ?? "no sales location"}${rule.message ? ` / ${rule.message}` : ""}`;
                return (
                  <TableRow key={rule.id} className={cn(validity === "expired" && "text-muted-foreground")}>
                    <TableCell className="font-semibold">{rule.salesLocation ?? "–"}</TableCell>
                    <TableCell>{rule.message ?? <span className="text-muted-foreground">Any</span>}</TableCell>
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
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete rule for ${label}`}>
                            <Trash2Icon />
                          </Button>
                        }
                        tone="danger"
                        title={`Delete the rule for ${label}?`}
                        consequences={[
                          `Vipps payments from ${rule.salesLocation ?? "this location"} will no longer go to KID ${rule.resolveKID} in future imports`,
                          "Unmatched payments go to the review queue instead",
                          "Donations already registered by this rule are not changed",
                          `In effect ${formatDate(rule.periodFrom)} – ${formatDate(rule.periodTo)}`,
                        ]}
                        confirmLabel="Delete rule"
                        onConfirm={async () => {
                          await remove.mutateAsync({ id: rule.id });
                          await invalidate();
                          notify.success("Matching rule deleted", label);
                        }}
                      />
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
