import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { notify } from "@/lib/notify";
import { projectStatus, type ProjectStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";
import { projectStatuses, type Project } from "./model";
import { OrganizationPicker } from "./ui";

type ProjectForm = {
  organizationId: number | null;
  name: string;
  description: string;
  country: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  agreementRef: string;
  reportDue: string;
  documentsUrl: string;
};

export function validateProject(v: ProjectForm) {
  return {
    organizationId: v.organizationId === null ? "Choose the recipient" : undefined,
    name: textError(v.name, { label: "a name", max: 255, required: true }),
    country: textError(v.country, { label: "the country", max: 64 }),
    endDate:
      v.startDate && v.endDate && v.endDate < v.startDate ? "Ends before it starts" : undefined,
    agreementRef: textError(v.agreementRef, { label: "the agreement reference", max: 255 }),
    documentsUrl:
      textError(v.documentsUrl, { label: "the link", max: 512 }) ??
      (v.documentsUrl.trim() && !/^https?:\/\//.test(v.documentsUrl.trim())
        ? "Enter a link starting with https://"
        : undefined),
  };
}

const orNull = (text: string) => text.trim() || null;

export function ProjectDialog({
  trigger,
  project,
  organizationId,
}: {
  trigger: ReactNode;
  project?: Project;
  organizationId?: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation(trpc.regranting.projects.create.mutationOptions());
  const update = useMutation(trpc.regranting.projects.update.mutationOptions());
  return (
    <RecordDialog<ProjectForm>
      trigger={trigger}
      title={project ? `Edit ${project.name}` : "New project"}
      description="A specific project at one recipient. Lines in rounds and fund grants can point to it."
      contentClassName="sm:max-w-xl"
      initial={() => ({
        organizationId: project?.organizationId ?? organizationId ?? null,
        name: project?.name ?? "",
        description: project?.description ?? "",
        country: project?.country ?? "",
        startDate: project?.startDate ?? "",
        endDate: project?.endDate ?? "",
        status: project?.status ?? "proposed",
        agreementRef: project?.agreementRef ?? "",
        reportDue: project?.reportDue ?? "",
        documentsUrl: project?.documentsUrl ?? "",
      })}
      validate={validateProject}
      saveLabel={project ? "Save project" : "Create project"}
      onSave={async (v) => {
        const input = {
          organizationId: v.organizationId!,
          name: v.name.trim(),
          description: orNull(v.description),
          country: orNull(v.country),
          startDate: v.startDate || null,
          endDate: v.endDate || null,
          status: v.status,
          agreementRef: orNull(v.agreementRef),
          reportDue: v.reportDue || null,
          documentsUrl: orNull(v.documentsUrl),
        };
        const saved = project
          ? await update.mutateAsync({ id: project.id, ...input })
          : await create.mutateAsync(input);
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success(project ? "Project updated" : "Project created", saved.name);
        if (!project)
          void navigate({ to: "/regranting/projects/$id", params: { id: String(saved.id) } });
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field
            label="Recipient"
            required
            error={errors.organizationId}
            hint={project ? "Can only change while nothing points at the project" : undefined}
          >
            <OrganizationPicker
              value={values.organizationId}
              onValueChange={(organizationId) => set({ organizationId })}
            />
          </Field>
          <Field label="Name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={values.status}
                onValueChange={(status) => set({ status: status as ProjectStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {projectStatus[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Country" error={errors.country}>
              <Input value={values.country} onChange={(e) => set({ country: e.target.value })} />
            </Field>
            <Field label="Starts">
              <DateInput
                value={values.startDate}
                onValueChange={(startDate) => set({ startDate })}
              />
            </Field>
            <Field label="Ends" error={errors.endDate}>
              <DateInput value={values.endDate} onValueChange={(endDate) => set({ endDate })} />
            </Field>
            <Field label="Agreement reference" error={errors.agreementRef}>
              <Input
                value={values.agreementRef}
                onChange={(e) => set({ agreementRef: e.target.value })}
              />
            </Field>
            <Field label="Next report due">
              <DateInput
                value={values.reportDue}
                onValueChange={(reportDue) => set({ reportDue })}
              />
            </Field>
          </div>
          <Field
            label="Documents"
            error={errors.documentsUrl}
            hint="Link to the agreement, reports and due diligence"
          >
            <Input
              type="url"
              value={values.documentsUrl}
              onChange={(e) => set({ documentsUrl: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
