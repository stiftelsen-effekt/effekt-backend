import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { importOfSelection, type ReviewItem } from "./model";

const plural = (count: number) => `${formatNumber(count)} ${count === 1 ? "item" : "items"}`;

/**
 * Footer actions for the selected review items: ignore them with one note, or, when they all
 * come from one import, every open item from that import (also those on other pages), e.g.
 * after uploading the wrong report. Ignored items can be reopened one by one.
 */
export function BulkIgnoreActions({
  selectedIds,
  rows,
  onDone,
}: {
  selectedIds: string[];
  /** The rows on this page, to find which import the selection comes from */
  rows: ReviewItem[] | undefined;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ignoreMany = useMutation(trpc.reports.reviewQueue.ignoreMany.mutationOptions());
  const ignoreImport = useMutation(trpc.reports.reviewQueue.ignoreImport.mutationOptions());
  const importLogId = importOfSelection(selectedIds, rows);
  const importCount = useQuery({
    ...trpc.reports.reviewQueue.importOpenCount.queryOptions({ importLogId: importLogId ?? 0 }),
    enabled: importLogId !== null,
  });
  const [note, setNote] = useState("");

  const finish = async (ignored: number, skipped = 0) => {
    await queryClient.invalidateQueries({ queryKey: trpc.reports.reviewQueue.pathKey() });
    notify.success(
      `Ignored ${plural(ignored)}`,
      skipped > 0
        ? `${plural(skipped)} already registered or ignored, left as they were`
        : undefined,
    );
    setNote("");
    onDone();
  };

  const noteField = (
    <Field label="Note" hint="Optional. Saved on every item, e.g. why no donations are registered.">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
    </Field>
  );
  const ids = selectedIds.map(Number);
  const openInImport = importCount.data?.open;

  return (
    <>
      <ConfirmDialog
        trigger={<Button size="sm">Ignore selected</Button>}
        title={`Ignore ${plural(ids.length)}?`}
        consequences={[
          "No donations are registered for them.",
          "Items already registered or ignored are left as they are.",
          "Each can be reopened from its page if this was a mistake.",
        ]}
        confirmLabel={`Ignore ${plural(ids.length)}`}
        onConfirm={async () => {
          const result = await ignoreMany.mutateAsync({ ids, note: note.trim() || undefined });
          await finish(result.ignored, result.skipped);
        }}
      >
        {noteField}
      </ConfirmDialog>
      {importLogId !== null && openInImport !== undefined && openInImport > ids.length && (
        <ConfirmDialog
          trigger={
            <Button size="sm">Ignore all {formatNumber(openInImport)} open from this import</Button>
          }
          title={`Ignore all ${plural(openInImport)} still open from import #${importLogId}?`}
          consequences={[
            "Every open item from this import is ignored, also those on other pages.",
            "No donations are registered for them; registered items are left as they are.",
            "Each can be reopened from its page if this was a mistake.",
          ]}
          confirmLabel={`Ignore ${plural(openInImport)}`}
          onConfirm={async () => {
            const result = await ignoreImport.mutateAsync({
              importLogId,
              note: note.trim() || undefined,
            });
            await finish(result.ignored);
          }}
        >
          {noteField}
        </ConfirmDialog>
      )}
    </>
  );
}
