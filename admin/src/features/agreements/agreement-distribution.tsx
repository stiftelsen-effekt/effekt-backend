/**
 * An agreement's split: read with the shared summary, edited in place with the one
 * distribution editor, saved through a before → after confirmation. The donor and tax unit
 * stay as they are; only the shares change.
 */
import { PencilIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DistributionEditor, DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  draftFromApi,
  draftToApi,
  sameDistribution,
  validateDraft,
  type ApiCauseAreaShare,
  type ApiDistributionRead,
  type CauseAreaConfig,
  type DistributionDraft,
} from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { strings } from "@/lib/strings";
import { splitChanges } from "./edits";

export type SplitInput = { taxUnitId: number | null; causeAreas: ApiCauseAreaShare[] };

export function AgreementDistribution({
  distribution,
  error,
  onRetry,
  title,
  consequences = [],
  onSave,
}: {
  /** The current split (donations.distributions.get or the provider's get). */
  distribution: (ApiDistributionRead & { taxUnitId: number | null }) | undefined;
  error?: unknown;
  onRetry?: () => void;
  /** Names the agreement in the confirmation question. */
  title: string;
  /** Provider-specific facts about what saving does. */
  consequences?: ReactNode[];
  onSave: (split: SplitInput) => Promise<unknown>;
}) {
  const config = useCauseAreaConfig({ includeInactive: true });
  const [editing, setEditing] = useState(false);

  const failed = error ?? config.error;
  return (
    <PageSection
      title="Distribution"
      description={editing ? undefined : "How each payment is split between cause areas."}
      actions={
        !editing &&
        distribution &&
        config.data && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            Edit distribution
          </Button>
        )
      }
    >
      {failed ? (
        <ErrorState
          error={failed}
          title="Couldn't load the distribution"
          onRetry={() => {
            onRetry?.();
            void config.refetch();
          }}
        />
      ) : !distribution || !config.data ? (
        <Skeleton className="h-24 w-full" />
      ) : editing ? (
        <SplitEditor
          key={JSON.stringify(distribution.causeAreas)}
          config={config.data}
          initial={draftFromApi(config.data, distribution)}
          taxUnitId={distribution.taxUnitId}
          title={title}
          consequences={consequences}
          onSave={onSave}
          onDone={() => setEditing(false)}
        />
      ) : (
        <DistributionSummary draft={draftFromApi(config.data, distribution)} config={config.data} />
      )}
    </PageSection>
  );
}

function SplitEditor({
  config,
  initial,
  taxUnitId,
  title,
  consequences,
  onSave,
  onDone,
}: {
  config: CauseAreaConfig[];
  initial: DistributionDraft;
  taxUnitId: number | null;
  title: string;
  consequences: ReactNode[];
  onSave: (split: SplitInput) => Promise<unknown>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);
  const validation = validateDraft(draft);
  const dirty = !sameDistribution(draft, initial);
  const changes = splitChanges(config, initial, draft);

  return (
    <div className="grid max-w-3xl gap-4">
      <DistributionEditor config={config} value={draft} onChange={setDraft} />
      <div className="flex gap-2">
        {!dirty && (
          <Button size="sm" onClick={onDone}>
            {strings.actions.cancel}
          </Button>
        )}
      </div>
      <UnsavedChangesBar
        dirty={dirty}
        onDiscard={() => {
          setDraft(initial);
          setTouched(false);
          onDone();
        }}
        onSave={() => {
          setTouched(true);
          if (validation.valid) setConfirming(true);
        }}
        invalid={
          touched && !validation.valid ? validation.error ?? "Fix the marked shares" : undefined
        }
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Change the distribution of ${title}?`}
        consequences={[
          ...changes.map((change) => (
            <span key={change.label}>
              <span className="text-muted-foreground">{change.label}:</span>{" "}
              <span className="num">{change.before}</span> →{" "}
              <strong className="num font-semibold">{change.after}</strong>
            </span>
          )),
          ...consequences,
          "The donor gets an email about the change.",
        ]}
        confirmLabel="Save distribution"
        onConfirm={async () => {
          await onSave({ taxUnitId, causeAreas: draftToApi(draft) });
          onDone();
        }}
      />
    </div>
  );
}
