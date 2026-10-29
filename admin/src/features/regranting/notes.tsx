/**
 * Free-text notes on a round or a transfer: explanations for the record (calculation errors,
 * held-back amounts, mis-keyed donations). Documentation, not money: editable in any round
 * status, also on approved and paid rounds.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";

export const NOTES_MAX = 5000;

/** Exactly one of the two */
export type NotesTarget = { roundId: number } | { transferId: number };

type NotesForm = { notes: string };

export function validateNotes(v: NotesForm) {
  return { notes: textError(v.notes, { label: "the notes", max: NOTES_MAX }) };
}

/** The notes as written, line breaks kept */
export function NotesText({ notes, className }: { notes: string; className?: string }) {
  return <p className={`whitespace-pre-wrap break-words ${className ?? ""}`}>{notes}</p>;
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
        <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs">
          <PencilIcon />
          {notes ? "Edit notes" : "Add notes"}
        </Button>
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
