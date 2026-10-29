/**
 * Links to documents (bilag, receipts, bank confirmations; usually Google Drive) on a round, a
 * transfer or an adjustment. Documentation, not money: they can be added and removed in any
 * round status, also on approved and paid rounds.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRightIcon, PlusIcon, XIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { notify } from "@/lib/notify";
import { useTRPC, type RouterInputs, type RouterOutputs } from "@/lib/trpc";

export type RegrantDocument = RouterOutputs["regranting"]["documents"]["list"][number];
/** Exactly one of roundId, transferId, adjustmentId */
export type DocumentParent = RouterInputs["regranting"]["documents"]["list"];

/** The label, or the link's host ("drive.google.com") without one */
export function documentText(d: { url: string; label: string | null }): string {
  if (d.label) return d.label;
  try {
    return new URL(d.url).hostname.replace(/^www\./, "");
  } catch {
    return d.url;
  }
}

type DocumentForm = { url: string; label: string };

export function validateDocument(v: DocumentForm) {
  return {
    url:
      textError(v.url, { label: "the link", max: 1024, required: true }) ??
      (!/^https?:\/\/\S+$/i.test(v.url.trim()) ? "Enter a link starting with https://" : undefined),
    label: textError(v.label, { label: "the label", max: 255 }),
  };
}

function DocumentLink({ document: d }: { document: RegrantDocument }) {
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noopener noreferrer"
      title={d.url}
      className="inline-flex max-w-64 items-center gap-0.5 rounded-xs text-accent hover:underline focus-ring"
    >
      <span className="truncate">{documentText(d)}</span>
      <ArrowUpRightIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * The links, each opening in a new tab. With `parent`, also Add link and a remove button per
 * link; `what` names the parent in dialogs ("transfer #12").
 */
export function DocumentLinks({
  documents,
  parent,
  what,
  className,
}: {
  documents: RegrantDocument[];
  parent?: DocumentParent;
  what?: string;
  className?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.documents.remove.mutationOptions());
  if (!parent && documents.length === 0) return null;
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className ?? ""}`}
      aria-label={what ? `Documents of ${what}` : "Documents"}
    >
      {documents.map((d) => (
        <li key={d.id} className="inline-flex items-center gap-0.5">
          <DocumentLink document={d} />
          {parent && (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0.5 py-0 text-muted-foreground"
                  aria-label={`Remove the link ${documentText(d)}`}
                >
                  <XIcon className="size-3.5" />
                </Button>
              }
              tone="danger"
              title={`Remove the link ${documentText(d)}?`}
              description={`Only the link${
                what ? ` on ${what}` : ""
              } is removed; the document itself stays where it is.`}
              confirmLabel="Remove link"
              onConfirm={async () => {
                await remove.mutateAsync({ id: d.id });
                await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
                notify.success("Link removed", documentText(d));
              }}
            />
          )}
        </li>
      ))}
      {parent && (
        <li>
          <AddDocumentDialog parent={parent} what={what} />
        </li>
      )}
    </ul>
  );
}

export function AddDocumentDialog({ parent, what }: { parent: DocumentParent; what?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const add = useMutation(trpc.regranting.documents.add.mutationOptions());
  return (
    <RecordDialog<DocumentForm>
      trigger={
        <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs">
          <PlusIcon />
          Add link
        </Button>
      }
      title={`Add a document${what ? ` to ${what}` : ""}`}
      description="A link to the bilag, receipt or bank confirmation, usually in Google Drive."
      initial={() => ({ url: "", label: "" })}
      validate={validateDocument}
      saveLabel="Add link"
      onSave={async (v) => {
        const saved = await add.mutateAsync({
          ...parent,
          url: v.url.trim(),
          label: v.label.trim() || null,
        });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Link added", documentText(saved));
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Link" required error={errors.url}>
            <Input
              type="url"
              placeholder="https://drive.google.com/…"
              value={values.url}
              onChange={(e) => set({ url: e.target.value })}
            />
          </Field>
          <Field label="Label" error={errors.label} hint="E.g. Bilag 16-043. Optional.">
            <Input value={values.label} onChange={(e) => set({ label: e.target.value })} />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
