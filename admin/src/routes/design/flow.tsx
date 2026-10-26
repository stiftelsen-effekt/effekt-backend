import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingIcon,
  FileSpreadsheetIcon,
  RotateCcwIcon,
  SmartphoneIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { FileDropzone } from "@/components/domain/file-dropzone";
import { Num } from "@/components/domain/format";
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
import { causeAreas, paymentMethods, reviewItems } from "@/design-system/fake-data";
import { ReviewWorkbench } from "@/features/review-queue/review-workbench";
import { addToReviewQueue, reviewQueue, type ImportSource } from "@/features/review-queue/store";
import { usePersistentState } from "@/lib/persistent-store";

export const Route = createFileRoute("/design/flow")({
  component: ImportFlowDemo,
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
  meta?: string;
}[] = [
  {
    value: "ocr",
    label: "Bank OCR",
    description: "Nets OCR file: AvtaleGiro and KID bank payments.",
    icon: BuildingIcon,
    meta: ".txt",
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
    description: "Bank transfers without KID, from the account export.",
    icon: FileSpreadsheetIcon,
    meta: ".csv",
  },
  {
    value: "facebook",
    label: "Facebook",
    description: "Payouts from Facebook fundraisers.",
    icon: ThumbsUpIcon,
    meta: ".csv",
  },
];

type FlowState = {
  step: string;
  source?: ImportSource;
  owner: string;
  fileName?: string;
  result?: { valid: number; ignored: number; invalid: number };
};

const initial: FlowState = { step: "source", owner: "1" };

function ImportFlowDemo() {
  const [state, setState, reset] = usePersistentState<FlowState>("design-import-flow", initial);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<FlowState>) => setState((current) => ({ ...current, ...patch }));
  const openCount = reviewQueue.use().filter((entry) => entry.state === "open").length;

  async function upload() {
    setUploading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const fileName = files[0]?.name ?? "report.txt";
    addToReviewQueue(reviewItems, { source: state.source ?? "ocr", fileName });
    set({
      step: "result",
      fileName,
      result: { valid: 412, ignored: 3, invalid: reviewItems.length },
    });
    setUploading(false);
  }

  const footer = {
    source: (
      <FlowFooter
        info="Pick where the file comes from."
        next={
          <Button
            variant="primary"
            disabled={!state.source}
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
        info="Nothing is registered until the file is processed."
        back={
          <Button onClick={() => set({ step: "source" })}>
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
        info={`${state.fileName} processed.`}
        back={
          <Button
            onClick={() => {
              reset();
              setFiles([]);
            }}
          >
            <RotateCcwIcon />
            Import another file
          </Button>
        }
        next={
          <Button
            variant="primary"
            onClick={() => set({ step: "review" })}
            disabled={openCount === 0}
          >
            Review {openCount} transactions
            <ArrowRightIcon />
          </Button>
        }
      />
    ),
    review: (
      <FlowFooter
        info="Progress is saved in this browser; you can leave and come back."
        next={
          <Button
            onClick={() => {
              reset();
              setFiles([]);
            }}
          >
            Finish
          </Button>
        }
      />
    ),
  }[state.step];

  return (
    <FlowPage
      title="Import payments"
      breadcrumbs={[{ label: "Money in", to: "/design/list" }]}
      steps={steps}
      current={state.step}
      onStepSelect={(step) => set({ step })}
      width={state.step === "review" ? "wide" : "narrow"}
      footer={footer}
      actions={
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            reviewQueue.set([]);
            setFiles([]);
          }}
        >
          Reset demo
        </Button>
      }
    >
      {state.step === "source" && (
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
            hint="Which legal entity the donations belong to."
            className="max-w-xs"
          >
            <Select value={state.owner} onValueChange={(owner) => set({ owner })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Gi Effektivt</SelectItem>
                <SelectItem value="2">Effektiv Altruisme Norge</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {state.step === "upload" && (
        <PageSection
          title={`Upload ${sources.find((s) => s.value === state.source)?.label ?? ""} file`}
        >
          <FileDropzone
            files={files}
            onFilesChange={setFiles}
            hint="One file at a time. Re-uploading the same file is safe: duplicates are ignored."
          />
        </PageSection>
      )}

      {state.step === "result" && state.result && (
        <>
          <StatGroup>
            <Stat label="Registered" value={<Num value={state.result.valid} />} hint="donations" />
            <Stat
              label="Already registered"
              value={<Num value={state.result.ignored} />}
              hint="ignored"
            />
            <Stat
              label="Need review"
              value={<Num value={state.result.invalid} />}
              hint="could not be matched"
            />
          </StatGroup>
          {openCount > 0 ? (
            <Callout tone="warning" title={`${openCount} transactions need a decision`}>
              They are in the review queue now and stay there until registered or skipped, even if
              you close this tab.
            </Callout>
          ) : (
            <Callout tone="success" title="Everything was registered" />
          )}
        </>
      )}

      {state.step === "review" && (
        <ReviewWorkbench
          causeAreas={causeAreas}
          paymentMethods={paymentMethods}
          metaOwnerId={Number(state.owner)}
          register={async (input) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (input.KID === "00000000") throw new Error("NO_KID: no distribution with that KID");
            return { donationId: 99_000 + Math.floor(Math.random() * 900) };
          }}
        />
      )}
    </FlowPage>
  );
}
