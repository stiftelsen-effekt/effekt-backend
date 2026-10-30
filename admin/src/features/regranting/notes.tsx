/**
 * Free-text notes on a round or a transfer: explanations for the record (calculation errors,
 * held-back amounts, mis-keyed donations). Documentation, not money: editable in any round
 * status, also on approved and paid rounds.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotebookPenIcon, PencilIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { DocumentLinks, type DocumentParent, type RegrantDocument } from "./documents";
import { IconAction } from "./ui";

export const NOTES_MAX = 5000;

/** Exactly one of the two */
export type NotesTarget = { roundId: number } | { transferId: number };

type NotesForm = { notes: string };

export function validateNotes(v: NotesForm) {
  return { notes: textError(v.notes, { label: "the notes", max: NOTES_MAX }) };
}

/** The notes as written, line breaks kept */
export function NotesText({ notes, className }: { notes: string; className?: string }) {
  return <p className={cn("whitespace-pre-wrap break-words", className)}>{notes}</p>;
}

/**
 * The documentation line of a round, transfer or report: notes on the left (always starting at
 * the same place), document chips on the right, wrapping within their own column, then the
 * row's actions as one quiet group. Missing notes or documents leave no gap; stacks on narrow
 * screens.
 */
export function NotesAndDocuments({
  notes,
  empty,
  documents,
  parent,
  what,
  actions,
  className,
}: {
  notes: string | null;
  /** Shown in place of missing notes; nothing by default */
  empty?: ReactNode;
  documents: RegrantDocument[];
  /** Makes the chips removable */
  parent?: DocumentParent;
  what?: string;
  /** Edit notes, Add document, then any row actions */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-x-4 gap-y-2 text-sm sm:flex-row sm:items-start", className)}
    >
      <div className="min-w-0 flex-1 empty:max-sm:hidden sm:pt-0.5">
        {notes ? <NotesText notes={notes} /> : empty}
      </div>
      {documents.length > 0 && (
        <DocumentLinks
          documents={documents}
          parent={parent}
          what={what}
          add={false}
          align="end"
          className="max-sm:justify-start sm:max-w-[min(50%,30rem)]"
        />
      )}
      {actions && (
        <div className="-my-0.5 flex shrink-0 flex-wrap items-center justify-end gap-0.5 max-sm:justify-start">
          {actions}
        </div>
      )}
    </div>
  );
}

export function EditNotesDialog({
  target,
  notes,
  what,
}: {
  target: NotesTarget;
  notes: string | null;
  /** Names the round or transfer in the dialog ("transfer #12") */
  what: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const setRound = useMutation(trpc.regranting.rounds.setNotes.mutationOptions());
  const setTransfer = useMutation(trpc.regranting.transfers.setNotes.mutationOptions());
  return (
    <RecordDialog<NotesForm>
      trigger={
        <IconAction label={`${notes ? "Edit" : "Add"} notes on ${what}`}>
          {notes ? <PencilIcon /> : <NotebookPenIcon />}
        </IconAction>
      }
      title={`Notes on ${what}`}
      description="For the record: calculation errors, held-back amounts, mis-keyed donations. Can be edited in any status. Leave empty to remove."
      contentClassName="sm:max-w-2xl"
      initial={() => ({ notes: notes ?? "" })}
      validate={validateNotes}
      saveLabel="Save notes"
      onSave={async (v) => {
        const value = v.notes.trim() || null;
        if ("roundId" in target) await setRound.mutateAsync({ id: target.roundId, notes: value });
        else await setTransfer.mutateAsync({ id: target.transferId, notes: value });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success(value ? "Notes saved" : "Notes removed", what);
      }}
    >
      {({ values, set, errors }) => (
        <Field label="Notes" error={errors.notes} hint={`At most ${NOTES_MAX} characters.`}>
          <Textarea
            rows={8}
            className="max-h-[60vh]"
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      )}
    </RecordDialog>
  );
}
