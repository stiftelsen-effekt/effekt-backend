import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/domain/error-state";
import { Status } from "@/components/domain/status";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { SettingsSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import { activeStatus } from "@/lib/status";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { OrderButtons } from "./cause-areas-section";
import { applyPatches, byOrdering, move, patch, pendingChanges, type Patches } from "./drafts";
import { RecordDialog, textError } from "./record-dialog";

type ReferralType = RouterOutputs["config"]["referralTypes"]["listAll"][number];

export function ReferralTypesSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useQuery(trpc.config.referralTypes.listAll.queryOptions());
  const [patches, setPatches] = useState<Patches<ReferralType>>({});
  const [saving, setSaving] = useState(false);
  const update = useMutation(trpc.config.referralTypes.update.mutationOptions());
  const create = useMutation(trpc.config.referralTypes.create.mutationOptions());
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.config.referralTypes.pathKey() });

  const server = query.data ?? [];
  const types = byOrdering(applyPatches(server, patches));
  const changes = pendingChanges(server, patches);
  // Only names cleared here block saving; old rows without a name are left alone.
  const clearedName = (type: ReferralType) =>
    patches[type.id]?.name !== undefined && type.name.trim() === "";
  const emptyName = types.find(clearedName);

  async function save() {
    setSaving(true);
    try {
      for (const { id, changes: fields } of changes) {
        await update.mutateAsync({
          id,
          ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
          ...(fields.ordering != null ? { ordering: fields.ordering } : {}),
          ...(fields.isActive !== undefined ? { isActive: fields.isActive } : {}),
        });
      }
      await invalidate();
      setPatches({});
      notify.success("Referral types saved");
    } catch (error) {
      await invalidate();
      notify.error(error, "Some changes weren't saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingsSection
        title="Referral types"
        description={
          <>
            <p>The answers donors can pick for “How did you hear about us?”, in this order.</p>
            <p className="mt-2">Inactive types are hidden from the form but kept on old answers.</p>
          </>
        }
        actions={
          <RecordDialog<{ name: string }>
            trigger={
              <Button>
                <PlusIcon />
                New referral type
              </Button>
            }
            title="New referral type"
            description="It's added last and shown to donors straight away."
            initial={() => ({ name: "" })}
            validate={(values) => ({
              name: textError(values.name, { label: "a name", max: 256, required: true }),
            })}
            saveLabel="Create referral type"
            onSave={async (values) => {
              const last = Math.max(0, ...server.map((type) => type.ordering ?? 0));
              await create.mutateAsync({ name: values.name.trim(), ordering: last + 1 });
              await invalidate();
              notify.success("Referral type created", values.name.trim());
            }}
          >
            {({ values, set, errors }) => (
              <Field label="Name" required error={errors.name}>
                <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
            )}
          </RecordDialog>
        }
      >
        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="relative overflow-hidden rounded-md border border-border">
            <Table aria-label="Referral types">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">
                    <span className="sr-only">Order</span>
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20 text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((type, index) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <OrderButtons
                        name={type.name}
                        first={index === 0}
                        last={index === types.length - 1}
                        onMove={(direction) =>
                          setPatches((current) => {
                            let next = current;
                            for (const [id, fields] of Object.entries(
                              move(types, type.id, direction),
                            )) {
                              next = patch(next, Number(id), fields);
                            }
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Name of referral type ${type.id}`}
                        aria-invalid={clearedName(type) || undefined}
                        value={type.name}
                        maxLength={256}
                        className="max-w-sm"
                        onChange={(e) =>
                          setPatches((current) => patch(current, type.id, { name: e.target.value }))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Status catalog={activeStatus} value={type.isActive ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        aria-label={`${type.name || "Referral type"} active`}
                        checked={type.isActive}
                        onCheckedChange={(isActive) =>
                          setPatches((current) => patch(current, type.id, { isActive }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsSection>
      <UnsavedChangesBar
        dirty={changes.length > 0}
        saving={saving}
        invalid={emptyName ? "Every referral type needs a name" : undefined}
        onDiscard={() => setPatches({})}
        onSave={() => void save()}
      />
    </>
  );
}
