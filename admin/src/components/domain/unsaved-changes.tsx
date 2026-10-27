import { useBlocker } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";

/**
 * Sticky bar for forms that save explicitly (settings, donation edit). Appears only when
 * there are changes, so "is this saved?" always has a visible answer. Also blocks leaving
 * the page (in-app navigation and tab close) while dirty.
 */
export function UnsavedChangesBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel = strings.actions.saveChanges,
  invalid,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  /** Explains why Save is disabled. */
  invalid?: string;
}) {
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !saving,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  return (
    <>
      {dirty && (
        <div
          role="region"
          aria-label={strings.form.unsaved}
          className="sticky bottom-0 z-20 -mx-4 flex animate-in flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur fade-in-0 slide-in-from-bottom-2 sm:-mx-6 sm:px-6"
        >
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          <p className="flex-1 text-sm font-semibold">
            {strings.form.unsaved}
            {invalid && <span className="ml-2 font-normal text-danger">{invalid}</span>}
          </p>
          <Button onClick={onDiscard} disabled={saving}>
            {strings.actions.discard}
          </Button>
          <Button variant="primary" onClick={onSave} pending={saving} disabled={Boolean(invalid)}>
            {saveLabel}
          </Button>
        </div>
      )}
      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>{strings.form.unsavedLeave}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay</AlertDialogCancel>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              {strings.actions.discard}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * For forms in dialogs: closing (Esc, outside click, Cancel) while there are changes asks
 * before discarding them. Call `requestClose` where the dialog would close and render
 * `dialog` next to it.
 *
 *   const guard = useDiscardGuard(dirty, () => setOpen(false));
 *   <Dialog open={open} onOpenChange={(next) => next ? setOpen(true) : guard.requestClose()}>
 *   {guard.dialog}
 */
export function useDiscardGuard(dirty: boolean, close: () => void) {
  const [asking, setAsking] = useState(false);
  const requestClose = () => (dirty ? setAsking(true) : close());
  const dialog = (
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{strings.form.discardTitle}</AlertDialogTitle>
          <AlertDialogDescription>{strings.form.discardHint}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{strings.form.keepEditing}</AlertDialogCancel>
          <Button
            variant="danger"
            onClick={() => {
              setAsking(false);
              close();
            }}
          >
            {strings.actions.discard}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { requestClose, dialog };
}
