import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { PercentInput } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { Status } from "@/components/domain/status";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { SettingsSection } from "@/components/templates";
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
import { Pending } from "@/components/ui/pending";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { activeStatus } from "@/lib/status";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  applyPatches,
  byOrdering,
  cleanText,
  move,
  patch,
  pendingChanges,
  shareProblems,
  type Patches,
} from "./drafts";
import { RecordDialog, textError } from "./record-dialog";

type CauseArea = RouterOutputs["config"]["causeAreas"]["listAll"][number];
type Organization = RouterOutputs["config"]["organizations"]["listByCauseArea"][number];

export function CauseAreasSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const areasQuery = useQuery(trpc.config.causeAreas.listAll.queryOptions());
  const orgQueries = useQueries({
    queries: (areasQuery.data ?? []).map((area) =>
      trpc.config.organizations.listByCauseArea.queryOptions({ causeAreaId: area.id }),
    ),
  });
  const [areaPatches, setAreaPatches] = useState<Patches<CauseArea>>({});
  const [orgPatches, setOrgPatches] = useState<Patches<Organization>>({});
  const [saving, setSaving] = useState(false);
  const updateArea = useMutation(trpc.config.causeAreas.update.mutationOptions());
  const updateOrg = useMutation(trpc.config.organizations.update.mutationOptions());

  if (areasQuery.error) {
    return (
      <SettingsSection title="Standard split">
        <ErrorState error={areasQuery.error} onRetry={() => void areasQuery.refetch()} />
      </SettingsSection>
    );
  }
  if (!areasQuery.data) {
    return (
      <SettingsSection title="Standard split">
        <Pending className="min-h-80" />
      </SettingsSection>
    );
  }

  const serverAreas = areasQuery.data;
  const serverOrgs = (index: number) => orgQueries[index]?.data ?? [];
  const allServerOrgs = serverAreas.flatMap((_, index) => serverOrgs(index));

  const areas = byOrdering(applyPatches(serverAreas, areaPatches));
  const orgsOf = (areaId: number) => {
    const index = serverAreas.findIndex((area) => area.id === areaId);
    return byOrdering(applyPatches(serverOrgs(index), orgPatches));
  };
  const orgsLoaded = orgQueries.every((query) => query.data);
  const problems = orgsLoaded
    ? shareProblems(areas.map((area) => ({ ...area, organizations: orgsOf(area.id) })))
    : [];

  const areaChanges = pendingChanges(serverAreas, areaPatches);
  const orgChanges = pendingChanges(allServerOrgs, orgPatches);
  const dirty = areaChanges.length + orgChanges.length > 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.config.pathKey() });

  async function save() {
    setSaving(true);
    try {
      for (const { id, changes } of areaChanges) {
        await updateArea.mutateAsync({
          id,
          ...pick(changes, ["standardPercentageShare", "isActive", "ordering"]),
        });
      }
      for (const { id, changes } of orgChanges) {
        await updateOrg.mutateAsync({
          id,
          ...pick(changes, ["standardShare", "isActive", "ordering"]),
        });
      }
      await invalidate();
      setAreaPatches({});
      setOrgPatches({});
      notify.success("Standard split saved");
    } catch (error) {
      // What did save is refetched; the patches that still differ stay unsaved.
      await invalidate();
      notify.error(error, "Some changes weren't saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingsSection
        title="Standard split"
        description={
          <>
            <p>
              The recommended distribution for donors who don't choose their own. Active cause areas
              must add up to 100 %, and so must the active organizations inside each.
            </p>
            <p className="mt-2">
              Inactive cause areas and organizations are hidden from donors and kept on old
              donations. Changes apply to new donations only.
            </p>
          </>
        }
        actions={
          <CauseAreaDialog
            trigger={
              <Button>
                <PlusIcon />
                New cause area
              </Button>
            }
            onSaved={invalidate}
          />
        }
      >
        <div className="grid gap-4">
          {problems.length > 0 && (
            <Callout tone="warning" title="Shares don't add up">
              <p className="mb-1">
                You can still save, but donors who use the standard split get these shares.
              </p>
              <ul className="list-inside list-disc">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}
          {areas.map((area, areaIndex) => {
            const orgQuery = orgQueries[serverAreas.findIndex((a) => a.id === area.id)];
            const orgs = orgsOf(area.id);
            const orgTotal = orgs
              .filter((org) => org.isActive)
              .reduce((sum, org) => sum + (org.standardShare ?? 0), 0);
            return (
              <section
                key={area.id}
                aria-label={area.name}
                className={cn(
                  "relative overflow-hidden rounded-md border border-border",
                  !area.isActive && "opacity-80",
                )}
              >
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-2">
                  <OrderButtons
                    name={area.name}
                    first={areaIndex === 0}
                    last={areaIndex === areas.length - 1}
                    onMove={(direction) =>
                      setAreaPatches((patches) =>
                        mergePatches(patches, move(areas, area.id, direction)),
                      )
                    }
                  />
                  <h3 className="flex-1 font-semibold">{area.name}</h3>
                  <Status catalog={activeStatus} value={area.isActive ? "active" : "inactive"} />
                  <PercentInput
                    label={`${area.name} standard share`}
                    value={area.standardPercentageShare ?? 0}
                    disabled={!area.isActive}
                    onChange={(value) =>
                      setAreaPatches((patches) =>
                        patch(patches, area.id, { standardPercentageShare: value }),
                      )
                    }
                  />
                  <Switch
                    aria-label={`${area.name} active`}
                    checked={area.isActive}
                    onCheckedChange={(isActive) =>
                      setAreaPatches((patches) => patch(patches, area.id, { isActive }))
                    }
                  />
                  <CauseAreaDialog
                    area={serverAreas.find((a) => a.id === area.id)}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${area.name}`}>
                        <PencilIcon />
                      </Button>
                    }
                    onSaved={invalidate}
                  />
                </div>
                {orgQuery?.error ? (
                  <ErrorState
                    className="m-3"
                    error={orgQuery.error}
                    onRetry={() => void orgQuery.refetch()}
                  />
                ) : !orgQuery?.data ? (
                  <Pending className="h-26" />
                ) : (
                  <Table aria-label={`${area.name} organizations`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">
                          <span className="sr-only">Order</span>
                        </TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead className="w-28 text-right">Share</TableHead>
                        <TableHead className="w-20 text-right">Active</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">Edit</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map((org, orgIndex) => (
                        <TableRow key={org.id}>
                          <TableCell>
                            <OrderButtons
                              name={org.name}
                              first={orgIndex === 0}
                              last={orgIndex === orgs.length - 1}
                              onMove={(direction) =>
                                setOrgPatches((patches) =>
                                  mergePatches(patches, move(orgs, org.id, direction)),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "font-semibold",
                                !org.isActive && "text-muted-foreground",
                              )}
                            >
                              {org.name}
                            </span>
                            <span className="ml-2 text-muted-foreground">{org.abbreviation}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <PercentInput
                              className="ml-auto"
                              label={`${org.name} share`}
                              value={org.standardShare ?? 0}
                              disabled={!org.isActive || !area.isActive}
                              invalid={area.isActive && org.isActive && orgTotal !== 100}
                              onChange={(value) =>
                                setOrgPatches((patches) =>
                                  patch(patches, org.id, { standardShare: value }),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              aria-label={`${org.name} active`}
                              checked={org.isActive}
                              onCheckedChange={(isActive) =>
                                setOrgPatches((patches) => patch(patches, org.id, { isActive }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <OrganizationDialog
                              organization={allServerOrgs.find((o) => o.id === org.id)}
                              causeAreaId={area.id}
                              causeAreas={serverAreas}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${org.name}`}
                                >
                                  <PencilIcon />
                                </Button>
                              }
                              onSaved={invalidate}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={5}>
                          <OrganizationDialog
                            causeAreaId={area.id}
                            causeAreas={serverAreas}
                            trigger={
                              <Button variant="ghost" size="sm">
                                <PlusIcon />
                                Add organization to {area.name}
                              </Button>
                            }
                            onSaved={invalidate}
                          />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </section>
            );
          })}
        </div>
      </SettingsSection>
      <UnsavedChangesBar
        dirty={dirty}
        saving={saving}
        onDiscard={() => {
          setAreaPatches({});
          setOrgPatches({});
        }}
        onSave={() => void save()}
      />
    </>
  );
}

function pick<T extends object, K extends keyof T>(value: Partial<T>, keys: K[]) {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) if (key in value) out[key] = value[key];
  return out;
}

function mergePatches<T>(patches: Patches<T>, more: Patches<Partial<T>>): Patches<T> {
  let next = patches;
  for (const [id, fields] of Object.entries(more)) {
    next = patch(next, Number(id), fields as Partial<T>);
  }
  return next;
}

export function OrderButtons({
  name,
  first,
  last,
  onMove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <span className="inline-flex gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${name} up`}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${name} down`}
        disabled={last}
        onClick={() => onMove(1)}
      >
        <ArrowDownIcon />
      </Button>
    </span>
  );
}

//region Dialogs

type CauseAreaForm = {
  name: string;
  shortDescription: string;
  longDescription: string;
  informationUrl: string;
};

function CauseAreaDialog({
  area,
  trigger,
  onSaved,
}: {
  /** Edit this cause area; create a new one when omitted. */
  area?: CauseArea;
  trigger: React.ReactNode;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const create = useMutation(trpc.config.causeAreas.create.mutationOptions());
  const update = useMutation(trpc.config.causeAreas.update.mutationOptions());
  return (
    <RecordDialog<CauseAreaForm>
      trigger={trigger}
      title={area ? `Edit ${area.name}` : "New cause area"}
      description={
        area
          ? "Name and texts shown to donors. Share and status are set in the standard split."
          : "New cause areas are active straight away with a 0 % share. Add organizations and set the split next, or make it inactive until it's ready."
      }
      initial={() => ({
        name: area?.name ?? "",
        shortDescription: area?.shortDescription ?? "",
        longDescription: area?.longDescription ?? "",
        informationUrl: area?.informationUrl ?? "",
      })}
      validate={(values) => ({
        name: textError(values.name, { label: "a name", max: 45, required: true }),
        shortDescription: textError(values.shortDescription, {
          label: "short description",
          max: 255,
        }),
        longDescription: textError(values.longDescription, { label: "long description", max: 45 }),
        informationUrl: textError(values.informationUrl, { label: "link", max: 156 }),
      })}
      saveLabel={area ? "Save changes" : "Create cause area"}
      onSave={async (values) => {
        if (area) {
          await update.mutateAsync({
            id: area.id,
            name: values.name.trim(),
            shortDescription: cleanText(values.shortDescription) ?? null,
            longDescription: cleanText(values.longDescription) ?? null,
            informationUrl: cleanText(values.informationUrl) ?? null,
          });
        } else {
          await create.mutateAsync({
            name: values.name.trim(),
            shortDescription: cleanText(values.shortDescription),
            longDescription: cleanText(values.longDescription),
            informationUrl: cleanText(values.informationUrl),
          });
        }
        await onSaved();
        notify.success(area ? "Cause area updated" : "Cause area created", values.name.trim());
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Short description" error={errors.shortDescription}>
            <Textarea
              value={values.shortDescription}
              onChange={(e) => set({ shortDescription: e.target.value })}
            />
          </Field>
          <Field
            label="Long description"
            hint="At most 45 characters"
            error={errors.longDescription}
          >
            <Input
              value={values.longDescription}
              onChange={(e) => set({ longDescription: e.target.value })}
            />
          </Field>
          <Field label="Information link" error={errors.informationUrl}>
            <Input
              type="url"
              value={values.informationUrl}
              onChange={(e) => set({ informationUrl: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

type OrganizationForm = CauseAreaForm & { abbreviation: string; causeAreaId: string };

function OrganizationDialog({
  organization,
  causeAreaId,
  causeAreas,
  trigger,
  onSaved,
}: {
  organization?: Organization;
  causeAreaId: number;
  causeAreas: CauseArea[];
  trigger: React.ReactNode;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const create = useMutation(trpc.config.organizations.create.mutationOptions());
  const update = useMutation(trpc.config.organizations.update.mutationOptions());
  const areaName = causeAreas.find((area) => area.id === causeAreaId)?.name ?? "";
  return (
    <RecordDialog<OrganizationForm>
      trigger={trigger}
      title={organization ? `Edit ${organization.name}` : `Add organization to ${areaName}`}
      description={
        organization
          ? "Name and texts shown to donors. Share and status are set in the standard split."
          : "New organizations are active straight away with a 0 % share. Set their share in the standard split."
      }
      initial={() => ({
        name: organization?.name ?? "",
        abbreviation: organization?.abbreviation ?? "",
        shortDescription: organization?.shortDescription ?? "",
        longDescription: organization?.longDescription ?? "",
        informationUrl: organization?.informationUrl ?? "",
        causeAreaId: String(organization?.causeAreaId ?? causeAreaId),
      })}
      validate={(values) => ({
        name: textError(values.name, { label: "a name", max: 45, required: true }),
        abbreviation: textError(values.abbreviation, {
          label: "an abbreviation",
          max: 10,
          required: true,
        }),
        shortDescription: textError(values.shortDescription, {
          label: "short description",
          max: 255,
        }),
        longDescription: textError(values.longDescription, { label: "long description", max: 45 }),
        informationUrl: textError(values.informationUrl, { label: "link", max: 156 }),
      })}
      saveLabel={organization ? "Save changes" : "Add organization"}
      onSave={async (values) => {
        if (organization) {
          await update.mutateAsync({
            id: organization.id,
            name: values.name.trim(),
            abbreviation: values.abbreviation.trim(),
            shortDescription: cleanText(values.shortDescription) ?? null,
            // Organizations.long_desc is NOT NULL
            longDescription: values.longDescription.trim(),
            informationUrl: cleanText(values.informationUrl) ?? null,
            causeAreaId: Number(values.causeAreaId),
          });
        } else {
          await create.mutateAsync({
            causeAreaId,
            name: values.name.trim(),
            abbreviation: values.abbreviation.trim(),
            shortDescription: cleanText(values.shortDescription),
            longDescription: cleanText(values.longDescription),
            informationUrl: cleanText(values.informationUrl),
          });
        }
        await onSaved();
        notify.success(
          organization ? "Organization updated" : "Organization added",
          values.name.trim(),
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Name" required error={errors.name}>
              <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Abbreviation" required error={errors.abbreviation}>
              <Input
                value={values.abbreviation}
                onChange={(e) => set({ abbreviation: e.target.value })}
              />
            </Field>
          </div>
          {organization && (
            <Field
              label="Cause area"
              hint="Moving it changes both cause areas' splits; check them after saving."
              error={errors.causeAreaId}
            >
              <Select
                value={values.causeAreaId}
                onValueChange={(value) => set({ causeAreaId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {causeAreas.map((area) => (
                    <SelectItem key={area.id} value={String(area.id)}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Short description" error={errors.shortDescription}>
            <Textarea
              value={values.shortDescription}
              onChange={(e) => set({ shortDescription: e.target.value })}
            />
          </Field>
          <Field
            label="Long description"
            hint="At most 45 characters"
            error={errors.longDescription}
          >
            <Input
              value={values.longDescription}
              onChange={(e) => set({ longDescription: e.target.value })}
            />
          </Field>
          <Field label="Information link" error={errors.informationUrl}>
            <Input
              type="url"
              value={values.informationUrl}
              onChange={(e) => set({ informationUrl: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

//endregion
