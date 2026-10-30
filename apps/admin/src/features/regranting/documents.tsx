/**
 * Links to documents (bilag, receipts, bank confirmations; usually Google Drive) on a round, a
 * transfer or an adjustment. Documentation, not money: they can be added and removed in any
 * round status, also on approved and paid rounds.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlusIcon, FileTextIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { notify } from "@/lib/notify";
import { useTRPC, type RouterInputs, type RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { IconAction } from "./ui";

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

/**
 * One document as a small bordered chip: icon and label, opening in a new tab. A long label is
 * truncated, the whole label (or the link) in its tooltip. `remove`, if given, sits inside the
 * chip after the link.
 */
function DocumentChip({ document: d, remove }: { document: RegrantDocument; remove?: ReactNode }) {
  const text = documentText(d);
  return (
    <li className="inline-flex h-6 max-w-56 min-w-0 items-center rounded-sm border border-border bg-surface text-xs">
      <a
        href={d.url}
        target="_blank"
        rel="noopener noreferrer"
        title={d.label ?? d.url}
        className="inline-flex h-full min-w-0 items-center gap-1 rounded-sm px-1.5 text-foreground hover:bg-hover focus-ring"
      >
        <FileTextIcon className="size-3.5 shrink-0 text-faint-foreground" aria-hidden />
        <span className="truncate">{text}</span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      {remove}
    </li>
  );
}

/**
 * The documents as chips, wrapping within their own box (right-aligned with `align="end"`).
 * With `parent`, each chip has a remove button and, unless `add` is false, an Add document
 * button follows the chips; `what` names the parent in dialogs ("transfer #12").
 */
export function DocumentLinks({
  documents,
  parent,
  what,
  add = true,
  align = "start",
  className,
}: {
  documents: RegrantDocument[];
  parent?: DocumentParent;
  what?: string;
  /** Show Add document after the chips (with `parent`). Off where the row groups its actions. */
  add?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.documents.remove.mutationOptions());
  const showAdd = Boolean(parent) && add;
  if (documents.length === 0 && !showAdd) return null;
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-1",
        align === "end" && "justify-end",
        className,
      )}
      aria-label={what ? `Documents of ${what}` : "Documents"}
    >
      {documents.map((d) => (
        <DocumentChip
          key={d.id}
          document={d}
          remove={
            parent && (
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    className="mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-faint-foreground hover:bg-hover hover:text-foreground focus-ring"
                    aria-label={`Remove the link ${documentText(d)}`}
                    title="Remove link"
                  >
                    <XIcon className="size-3" aria-hidden />
                  </button>
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
            )
          }
        />
      ))}
      {showAdd && parent && (
        <li className="inline-flex">
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
        <IconAction label={`Add a document${what ? ` to ${what}` : ""}`}>
          <FilePlusIcon />
        </IconAction>
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
