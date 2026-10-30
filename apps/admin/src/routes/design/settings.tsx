import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { PercentInput } from "@/components/domain/distribution-editor";
import { Status } from "@/components/domain/status";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { SettingsPage, SettingsSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  causeAreas as initialCauseAreas,
  referralTypes,
  type CauseArea,
} from "@/design-system/fake-data";
import { sum } from "@/features/distribution/model";
import { notify } from "@/lib/notify";
import { activeStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/design/settings")({
  component: SettingsDemo,
});

const nav = [
  { id: "cause-areas", label: "Cause areas", count: initialCauseAreas.length },
  { id: "referrals", label: "Referral types", count: referralTypes.length },
  { id: "matching", label: "Vipps matching rules" },
];

function SettingsDemo() {
  const [section, setSection] = useState("cause-areas");
  const [saved, setSaved] = useState(initialCauseAreas);
  const [draft, setDraft] = useState(initialCauseAreas);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  const activeAreas = draft.filter((area) => area.isActive);
  const areaTotal = sum(activeAreas.map((area) => area.standardPercentageShare ?? 0));
  const problems = [
    areaTotal !== 100 && `Cause area shares add up to ${areaTotal} %`,
    ...activeAreas.map((area) => {
      const total = sum(
        area.organizations.filter((o) => o.isActive).map((o) => o.standardShare ?? 0),
      );
      return total !== 100 && `${area.name}: organizations add up to ${total} %`;
    }),
  ].filter(Boolean) as string[];

  const updateArea = (id: number, patch: Partial<CauseArea>) =>
    setDraft((areas) => areas.map((area) => (area.id === id ? { ...area, ...patch } : area)));
  const updateOrg = (
    areaId: number,
    orgId: number,
    patch: Partial<CauseArea["organizations"][number]>,
  ) =>
    setDraft((areas) =>
      areas.map((area) =>
        area.id === areaId
          ? {
              ...area,
              organizations: area.organizations.map((o) =>
                o.id === orgId ? { ...o, ...patch } : o,
              ),
            }
          : area,
      ),
    );

  return (
    <SettingsPage
      nav={nav}
      value={section}
      onValueChange={setSection}
      description="Changes here affect what donors see in the donation widget."
    >
      {section === "cause-areas" && (
        <>
          <SettingsSection
            title="Standard split"
            description={
              <>
                <p>
                  The recommended distribution for donors who don't choose. Active cause areas must
                  add up to 100 %, and so must the organizations inside each.
                </p>
                <p className="mt-2">Changing it affects new donations only.</p>
              </>
            }
          >
            <div className="grid gap-4">
              {problems.length > 0 && (
                <Callout tone="warning" title="Shares don't add up yet">
                  <ul className="list-inside list-disc">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              {draft.map((area) => {
                const orgTotal = sum(
                  area.organizations.filter((o) => o.isActive).map((o) => o.standardShare ?? 0),
                );
                return (
                  <div
                    key={area.id}
                    className={cn(
                      "overflow-hidden rounded-md border border-border",
                      !area.isActive && "opacity-70",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-2">
                      <span className="flex-1 font-semibold">{area.name}</span>
                      <Status
                        catalog={activeStatus}
                        value={area.isActive ? "active" : "inactive"}
                      />
                      <PercentInput
                        label={`${area.name} standard share`}
                        value={area.standardPercentageShare ?? 0}
                        disabled={!area.isActive}
                        onChange={(value) =>
                          updateArea(area.id, { standardPercentageShare: value })
                        }
                      />
                      <Switch
                        aria-label={`${area.name} active`}
                        checked={area.isActive}
                        onCheckedChange={(isActive) => updateArea(area.id, { isActive })}
                      />
                    </div>
                    <Table aria-label={`${area.name} organizations`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead className="w-28 text-right">Share</TableHead>
                          <TableHead className="w-20 text-right">Active</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {area.organizations.map((org) => (
                          <TableRow key={org.id}>
                            <TableCell>{org.name}</TableCell>
                            <TableCell className="text-right">
                              <PercentInput
                                className="ml-auto"
                                label={`${org.name} share`}
                                value={org.standardShare ?? 0}
                                disabled={!org.isActive || !area.isActive}
                                invalid={orgTotal !== 100}
                                onChange={(value) =>
                                  updateOrg(area.id, org.id, { standardShare: value })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Switch
                                aria-label={`${org.name} active`}
                                checked={org.isActive}
                                onCheckedChange={(isActive) =>
                                  updateOrg(area.id, org.id, { isActive })
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          </SettingsSection>
          <SettingsSection
            title="Add a cause area"
            description="New cause areas start inactive, so you can add organizations before donors see it."
          >
            <Button>
              <PlusIcon />
              New cause area
            </Button>
          </SettingsSection>
          <UnsavedChangesBar
            dirty={dirty}
            saving={saving}
            invalid={problems.length ? "Fix the shares before saving" : undefined}
            onDiscard={() => setDraft(saved)}
            onSave={async () => {
              setSaving(true);
              await new Promise((resolve) => setTimeout(resolve, 600));
              setSaved(draft);
              setSaving(false);
              notify.success("Standard split saved");
            }}
          />
        </>
      )}
      {section === "referrals" && (
        <SettingsSection
          title="Referral types"
          description="The answers to “How did you hear about us?”. Inactive types are hidden from the form but kept on old answers."
        >
          <div className="overflow-hidden rounded-md border border-border">
            <Table aria-label="Referral types">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referralTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-semibold">{type.name}</TableCell>
                    <TableCell>
                      <Status
                        catalog={activeStatus}
                        value={type.isActive ? "active" : "inactive"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SettingsSection>
      )}
      {section === "matching" && (
        <SettingsSection
          title="Vipps matching rules"
          description="Route Vipps payments to a KID by sales location or message."
        >
          <Callout tone="neutral" title="Not designed yet">
            Rules list as a small DataTable, create in a dialog, delete with confirmation.
          </Callout>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
