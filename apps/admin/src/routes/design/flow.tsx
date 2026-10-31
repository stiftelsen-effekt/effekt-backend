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
import {
  addDemoItems,
  demoReviewQueue,
  reopenDemoItem,
  resolveDemoItem,
} from "@/design-system/fake-review-queue";
import { fakeDonorSearch } from "@/design-system/fake-search";
import { nextOpenId, type ImportSource } from "@/features/review-queue/model";
import { ReviewWorkbench } from "@/features/review-queue/review-workbench";
import { usePersistentState } from "@/lib/persistent-store";
import { notify } from "@/lib/notify";

const owners = [
  { id: 1, name: "Gi Effektivt", default: true },
  { id: 2, name: "Effektiv Altruisme Norge", default: false },
];

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
    description:
      "OCR Giro file from Mastercard Payment Services: AvtaleGiro and KID bank payments.",
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
  const queue = demoReviewQueue.use();
  const openIds = queue.filter((item) => item.status === "open").map((item) => item.id);
  const openCount = openIds.length;
  const [currentId, setCurrentId] = useState<number | null>(null);
  const current =
    queue.find((item) => item.id === currentId) ??
    queue.find((item) => item.status === "open") ??
    null;
  const moveOn = (id: number) => setCurrentId(nextOpenId(openIds, id) ?? id);

  async function upload() {
    setUploading(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const fileName = files[0]?.name ?? "report.txt";
    addDemoItems(reviewItems);
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
        info="The real queue is shared by the team; this demo keeps it in the browser."
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
            demoReviewQueue.set([]);
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
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={String(owner.id)}>
                    {owner.name}
                  </SelectItem>
                ))}
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

      {state.step === "review" &&
        (current ? (
          <ReviewWorkbench
            key={`${current.id}:${current.status}`}
            item={current}
            config={causeAreas}
            paymentMethods={paymentMethods}
            owners={owners}
            defaultOwnerId={state.owner}
            importInfo={state.fileName}
            donationLink={(donationId) => (
              <Button size="sm" asChild>
                <a href="/design/detail">Open donation #{donationId}</a>
              </Button>
            )}
            donorSearch={fakeDonorSearch}
            kidPreview={(kid) =>
              /^\d{5,32}$/.test(kid) && (
                <Callout tone="neutral" title={`KID ${kid} belongs to Kari Nordby`} />
              )
            }
            register={async (input) => {
              await new Promise((resolve) => setTimeout(resolve, 500));
              if (input.KID === "00000000")
                throw new Error("NO_KID: no distribution with that KID");
              const donationId = 99_000 + current.id;
              resolveDemoItem(current.id, { status: "registered", donationId });
              notify.success(`Registered item #${current.id}`, `Donation #${donationId}`);
              moveOn(current.id);
            }}
            ignore={async (note) => {
              resolveDemoItem(current.id, { status: "ignored", note });
              notify.undo(`Ignored item #${current.id}`, () => reopenDemoItem(current.id));
              moveOn(current.id);
            }}
            reopen={async () => reopenDemoItem(current.id)}
            onSkip={openCount > 1 ? () => moveOn(current.id) : undefined}
            onResolvedElsewhere={() => moveOn(current.id)}
          />
        ) : (
          <Callout tone="neutral" title="The review queue is empty">
            Upload a payment report to fill it.
          </Callout>
        ))}
    </FlowPage>
  );
}
