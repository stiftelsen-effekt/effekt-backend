import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Callout } from "@/components/domain/callout";
import { ErrorState } from "@/components/domain/error-state";
import { FileDropzone } from "@/components/domain/file-dropzone";
import { Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { FlowFooter, FlowPage, PageSection, type FlowStep } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/components/domain/error-state";
import { defaultOwner } from "@/features/donations/api";
import {
  queueOutcome,
  sourceLabel,
  type QueueOutcome,
  summariseUpload,
  uploadForm,
  type ImportSource,
  type UploadResult,
  type UploadSummary,
} from "@/features/review-queue/model";
import { usePersistentState } from "@/lib/persistent-store";
import { notify } from "@/lib/notify";
import { errorCode, useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/import/")({
  component: ImportPage,
});

const steps: FlowStep[] = [
  { id: "source", label: "Source" },
  { id: "upload", label: "Upload" },
  { id: "result", label: "Result" },
  { id: "review", label: "Review" },
];

const sources: {
  value: ImportSource;
  label: string;
  description: string;
  icon: typeof BuildingIcon;
  meta: string;
}[] = [
  {
    value: "ocr",
    label: "Bank OCR",
    description:
      "OCR Giro file from Mastercard Payment Services: AvtaleGiro and KID bank payments.",
    icon: BuildingIcon,
    meta: ".ocr / .txt",
  },
  {
    value: "vipps",
    label: "Vipps settlement",
    description: "Vipps settlement report for one-off payments.",
    icon: SmartphoneIcon,
    meta: ".csv",
  },
  {
    value: "bankNo",
    label: "Bank account export",
    description: "Bank transfers, matched on a KID in the message.",
    icon: FileSpreadsheetIcon,
    meta: ".csv",
  },
  {
    value: "facebook",
    label: "Facebook payouts",
    description: "Payout report from Facebook fundraisers. Lists campaigns that need shares.",
    icon: ThumbsUpIcon,
    meta: ".csv",
  },
];

type FlowState = {
  step: "source" | "upload" | "result";
  source?: ImportSource;
  /** Data owner id; empty until the owners have loaded. */
  owner: string;
  fileName?: string;
  summary?: UploadSummary;
};

const initial: FlowState = { step: "source", owner: "" };
const breadcrumbs = [{ label: "Money in", to: "/donations" }];

function ImportPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const [state, setState, reset] = usePersistentState<FlowState>("import-flow", initial);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<{ title: string; hint: string } | null>(null);
  const set = (patch: Partial<FlowState>) => setState((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (!state.owner && owners.data) {
      setState((current) => ({ ...current, owner: String(defaultOwner(owners.data)?.id ?? "") }));
    }
  }, [state.owner, owners.data, setState]);

  const uploads = {
    ocr: useMutation(trpc.reports.uploads.ocr.mutationOptions()),
    vipps: useMutation(trpc.reports.uploads.vipps.mutationOptions()),
    bankNo: useMutation(trpc.reports.uploads.bankNo.mutationOptions()),
    facebook: useMutation(trpc.reports.uploads.facebook.mutationOptions()),
  };
  const uploading = Object.values(uploads).some((m) => m.isPending);

  // Where "Review" starts: the oldest open item from this source.
  const reviewSource = state.source !== "facebook" ? state.source : undefined;
  const firstOpen = useQuery({
    ...trpc.reports.reviewQueue.list.queryOptions({
      page: 0,
      limit: 1,
      sort: { id: "id", desc: false },
      filter: { statuses: ["open"], sources: reviewSource ? [reviewSource] : undefined },
    }),
    enabled: state.step === "result" && reviewSource !== undefined,
  });
  const openCount = firstOpen.data?.counts.open ?? 0;
  const firstOpenId = firstOpen.data?.rows[0]?.id;

  async function upload() {
    const file = files[0];
    const source = state.source;
    if (!file || !source) return;
    setUploadError(null);
    const form = uploadForm(file, state.owner);
    try {
      let result: UploadResult;
      if (source === "ocr") result = { source, result: await uploads.ocr.mutateAsync(form) };
      else if (source === "vipps")
        result = { source, result: await uploads.vipps.mutateAsync(form) };
      else if (source === "bankNo")
        result = { source, result: await uploads.bankNo.mutateAsync(form) };
      else result = { source, result: await uploads.facebook.mutateAsync(form) };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.reports.reviewQueue.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() }),
      ]);
      set({ step: "result", fileName: file.name, summary: summariseUpload(result) });
      notify.success(`Processed ${file.name}`);
    } catch (error) {
      // Unreadable files come back as BAD_REQUEST with the parser's message.
      setUploadError(
        errorCode(error) === "BAD_REQUEST" && error instanceof Error
          ? { title: "The file couldn't be processed", hint: error.message }
          : describeError(error),
      );
    }
  }

  function restart() {
    reset();
    setFiles([]);
    setUploadError(null);
  }

  function review() {
    if (firstOpenId == null) return;
    const owner = state.owner;
    restart();
    void navigate({
      to: "/import/review/$id",
      params: { id: String(firstOpenId) },
      search: { source: reviewSource, owner },
    });
  }

  const sourceInfo = sources.find((s) => s.value === state.source);
  const ownerName = owners.data?.find((o) => String(o.id) === state.owner)?.name;

  const footer = {
    source: (
      <FlowFooter
        info="Pick where the file comes from and who the donations belong to."
        next={
          <Button
            variant="primary"
            disabled={!state.source || !state.owner}
            onClick={() => set({ step: "upload" })}
          >
            Continue
            <ArrowRightIcon />
          </Button>
        }
      />
    ),
    upload: (
      <FlowFooter
        info="Uploading the same file again is safe: registered payments and queued items aren't duplicated."
        back={
          <Button onClick={() => set({ step: "source" })} disabled={uploading}>
            <ArrowLeftIcon />
            Back
          </Button>
        }
        next={
          <Button
            variant="primary"
            disabled={files.length === 0}
            pending={uploading}
            onClick={() => void upload()}
          >
            Process file
          </Button>
        }
      />
    ),
    result: (
      <FlowFooter
        info={state.fileName && `${state.fileName} processed.`}
        back={
          <Button onClick={restart}>
            <RotateCcwIcon />
            Import another file
          </Button>
        }
        next={
          state.summary?.kind === "payments" && (
            <Button variant="primary" onClick={review} disabled={firstOpenId == null}>
              Review <Num value={openCount} /> {openCount === 1 ? "item" : "items"}
              <ArrowRightIcon />
            </Button>
          )
        }
      />
    ),
  }[state.step];

  return (
    <FlowPage
      title="Import payments"
      breadcrumbs={breadcrumbs}
      steps={steps}
      current={state.step}
      onStepSelect={
        state.step === "upload" && !uploading ? () => set({ step: "source" }) : undefined
      }
      footer={footer}
    >
      {state.step === "source" &&
        (owners.error ? (
          <ErrorState error={owners.error} onRetry={() => void owners.refetch()} />
        ) : (
          <>
            <PageSection title="Where is the file from?">
              <ChoiceCards
                label="Report source"
                value={state.source}
                onValueChange={(source) => set({ source })}
                options={sources}
              />
            </PageSection>
            <Field
              label="Data owner"
              hint="Which legal entity the registered donations belong to."
              className="max-w-xs"
            >
              {owners.data ? (
                <Select value={state.owner} onValueChange={(owner) => set({ owner })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a data owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.data.map((owner) => (
                      <SelectItem key={owner.id} value={String(owner.id)}>
                        {owner.name}
                        {owner.default ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Skeleton className="h-control w-full" />
              )}
            </Field>
          </>
        ))}

      {state.step === "upload" && (
        <>
          <PageSection title={`Upload ${sourceInfo?.label ?? ""} file`}>
            <FileDropzone
              files={files}
              onFilesChange={(next) => {
                setFiles(next);
                setUploadError(null);
              }}
              disabled={uploading}
              hint={`One file at a time${sourceInfo ? ` (${sourceInfo.meta})` : ""}.`}
            />
          </PageSection>
          <PropertyList labelWidth="7rem">
            <Property label="Source">{sourceInfo?.label}</Property>
            <Property label="Data owner">{ownerName}</Property>
          </PropertyList>
          {uploadError && (
            <Callout tone="danger" title={uploadError.title}>
              {uploadError.hint}
            </Callout>
          )}
        </>
      )}

      {state.step === "result" && state.summary && (
        <ResultStep summary={state.summary} source={state.source} openCount={openCount} />
      )}
    </FlowPage>
  );
}

function ResultStep({
  summary,
  source,
  openCount,
}: {
  summary: UploadSummary;
  source?: ImportSource;
  openCount: number;
}) {
  if (summary.kind === "facebook") {
    return summary.campaigns.length === 0 ? (
      <Callout tone="success" title="Every campaign in the report has organization shares" />
    ) : (
      <>
        <Callout
          tone="warning"
          title={`${summary.campaigns.length} ${
            summary.campaigns.length === 1 ? "campaign needs" : "campaigns need"
          } organization shares`}
        >
          The report is stored. Register the shares for these campaigns in the current admin;
          Facebook donations aren't registered from here yet.
        </Callout>
        <ul className="grid divide-y divide-border rounded-md border border-border">
          {summary.campaigns.map((campaign) => (
            <li key={campaign.ID} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
              <span className="font-semibold">{campaign.fundraiserTitle}</span>
              <span className="text-sm text-muted-foreground">{campaign.campaignOwnerName}</span>
              <span className="num text-sm text-muted-foreground">#{campaign.ID}</span>
              {campaign.permalink && (
                <a
                  href={campaign.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                  Open on Facebook
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  const { registered, ignored, review, queue, importLogId } = summary;
  const sourceName = sources.find((s) => s.value === source)?.label;
  return (
    <>
      <StatGroup>
        <Stat label="Registered" value={<Num value={registered} />} hint="new donations" />
        <Stat
          label="Skipped"
          value={<Num value={ignored} />}
          hint="registered by an earlier import"
        />
        <Stat label="Sent to review" value={<Num value={review} />} hint="couldn't be matched" />
      </StatGroup>
      {importLogId != null && (
        <p className="text-sm text-muted-foreground">
          Recorded in the import log as{" "}
          <Link
            to="/logs/$id"
            params={{ id: String(importLogId) }}
            className="text-accent hover:underline"
          >
            entry #{importLogId}
          </Link>
          , with the file.
        </p>
      )}
      {registered + ignored + review === 0 ? (
        <Callout tone="warning" title="No payments found in the file">
          Nothing was registered or queued. Check that it is{" "}
          {sourceName ? `a ${sourceName}` : "the right"} file and that it covers the period you
          expected.
        </Callout>
      ) : review === 0 ? (
        <Callout tone="success" title="Everything in the file was handled" />
      ) : queue === null ? (
        <Callout tone="neutral" title={`${review} transactions couldn't be matched`}>
          This was a trial run, so nothing was put in the review queue.
        </Callout>
      ) : (
        <QueueCallouts outcome={queueOutcome(queue)} openCount={openCount} source={source} />
      )}
    </>
  );
}

function QueueCallouts({
  outcome,
  openCount,
  source,
}: {
  outcome: QueueOutcome;
  openCount: number;
  source?: ImportSource;
}) {
  const { open, handled, added, skipped } = outcome;
  const items = (count: number) => `${count} ${count === 1 ? "transaction" : "transactions"}`;
  return (
    <>
      {skipped > 0 && (
        <Callout tone="danger" title={`${items(skipped)} couldn't be put in the review queue`}>
          They have no usable amount or payment method, or saving them failed. They are listed in
          the import log entry; register them by hand, or tell the tech team if it keeps happening.
        </Callout>
      )}
      {open > 0 ? (
        <Callout
          tone="warning"
          title={`${items(open)} ${open === 1 ? "needs" : "need"} a decision`}
        >
          {added} new in the review queue
          {handled > 0 && `, ${handled} already handled by the team`}. {openCount}{" "}
          {sourceLabel(source ?? "")} {openCount === 1 ? "item is" : "items are"} open now. The
          queue is shared, so anyone on the team can{" "}
          <Link to="/import/review" className="text-accent hover:underline">
            pick them up
          </Link>
          .
        </Callout>
      ) : (
        handled > 0 && (
          <Callout tone="success" title="Nothing in the file needs a decision">
            The {items(handled)} that couldn't be matched were already registered or ignored after
            an earlier upload of the same file.
          </Callout>
        )
      )}
    </>
  );
}
