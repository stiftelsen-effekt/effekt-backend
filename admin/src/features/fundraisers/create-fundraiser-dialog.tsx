import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { describeError } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";
import { DonorPicker, type PickedDonor } from "@/features/donors/donor-picker";

/** Create a fundraiser owned by a donor, then open it. */
export function CreateFundraiserDialog({
  trigger,
  donor,
}: {
  trigger: ReactNode;
  /** Preselected owner (from the donor page). */
  donor?: PickedDonor;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState<PickedDonor | null>(donor ?? null);
  const [missing, setMissing] = useState(false);

  const create = useMutation(
    trpc.reports.fundraisers.create.mutationOptions({
      onSuccess: async (fundraiser) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.reports.fundraisers.list.pathKey(),
        });
        notify.success("Fundraiser created", `Fundraiser #${fundraiser.id}`);
        setOpen(false);
        void navigate({ to: "/fundraisers/$id", params: { id: String(fundraiser.id) } });
      },
    }),
  );

  function onOpenChange(next: boolean) {
    if (create.isPending) return;
    setOpen(next);
    if (next) {
      setOwner(donor ?? null);
      setMissing(false);
      create.reset();
    }
  }

  const error = create.error ? describeError(create.error) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create fundraiser</DialogTitle>
          <DialogDescription>
            The owner gets a fundraiser page; donations to it count towards their fundraiser.
          </DialogDescription>
        </DialogHeader>
        <Field label="Owner" error={missing ? "Pick the donor who runs the fundraiser" : undefined}>
          <DonorPicker
            value={owner}
            onValueChange={(next) => {
              setOwner(next);
              setMissing(false);
            }}
          />
        </Field>
        {error && (
          <Callout tone="danger" title={error.title}>
            {error.hint}
          </Callout>
        )}
        <DialogFooter>
          <Button disabled={create.isPending} onClick={() => onOpenChange(false)}>
            {strings.actions.cancel}
          </Button>
          <Button
            variant="primary"
            pending={create.isPending}
            onClick={() => (owner ? create.mutate({ donorId: owner.id }) : setMissing(true))}
          >
            Create fundraiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
