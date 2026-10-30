import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { GitMergeIcon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Num } from "@/components/domain/format";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { DonorPicker, type PickedDonor } from "./donor-picker";

export type MergeCounts = {
  donations: number;
  agreements: number;
  taxUnits: number;
  kids: number;
};

/**
 * Merge this donor into another one (the one to keep). Irreversible: typed confirmation of
 * this donor's id, per docs/admin-design.md › Editing, by risk.
 */
export function MergeDonor({
  donor,
  counts,
}: {
  donor: { id: number; name: string; email: string };
  counts?: MergeCounts;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [keep, setKeep] = useState<PickedDonor | null>(null);
  const merge = useMutation(trpc.donors.merge.mutationOptions());
  const keepLabel = keep ? `${keep.name || keep.email} (#${keep.id})` : "the donor you keep";
  const count = (n: number, one: string, many: string) => (
    <>
      <Num value={n} /> {n === 1 ? one : many}
    </>
  );

  return (
    <ConfirmDialog
      title={`Merge ${donor.name || donor.email} into another donor?`}
      description="Pick the donor to keep. Everything on this donor moves there."
      tone="danger"
      confirmLabel={keep ? `Merge into #${keep.id}` : "Merge donors"}
      confirmText={String(donor.id)}
      disabled={!keep}
      consequences={[
        counts ? (
          <>
            {count(counts.donations, "donation", "donations")},{" "}
            {count(counts.agreements, "agreement", "agreements")},{" "}
            {count(counts.taxUnits, "tax unit", "tax units")} and{" "}
            {count(counts.kids, "KID", "KIDs")} move to {keepLabel}.
          </>
        ) : (
          `Donations, agreements, tax units and KIDs move to ${keepLabel}.`
        ),
        <>
          Donor <strong className="num">#{donor.id}</strong> ({donor.email}) is deleted. This can't
          be undone.
        </>,
      ]}
      trigger={
        <Button onClick={() => setKeep(null)}>
          <GitMergeIcon />
          Merge…
        </Button>
      }
      onConfirm={async () => {
        if (!keep) return;
        await merge.mutateAsync({ originId: donor.id, destinationId: keep.id });
        notify.success("Donors merged", `#${donor.id} is now part of #${keep.id}`);
        await queryClient.invalidateQueries({ queryKey: trpc.donors.pathKey() });
        void navigate({ to: "/donors/$id", params: { id: String(keep.id) } });
      }}
    >
      <Field label="Donor to keep">
        <DonorPicker value={keep} onValueChange={setKeep} excludeIds={[donor.id]} />
      </Field>
    </ConfirmDialog>
  );
}
