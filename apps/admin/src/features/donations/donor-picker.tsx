import { useQuery } from "@tanstack/react-query";
import {
  DonorPicker as SharedDonorPicker,
  type DonorSearch,
  type PickedDonor,
} from "@/features/donors/donor-picker";
import { useTRPC } from "@/lib/trpc";

/**
 * The shared DonorPicker for forms that hold a donor id rather than a picked donor: looks up the
 * donor for display and reports only the id.
 */
export function DonorPicker({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  search,
  "aria-invalid": ariaInvalid,
}: {
  value: number | null;
  onChange: (donorId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Replace the API search (the /design demo uses fake data). */
  search?: DonorSearch;
  "aria-invalid"?: boolean;
}) {
  const trpc = useTRPC();
  const donor = useQuery({
    ...trpc.donors.get.queryOptions({ donorId: value ?? 0 }),
    enabled: value != null,
  });
  const picked: PickedDonor | null =
    value == null
      ? null
      : donor.data
        ? { id: donor.data.id, name: donor.data.name, email: donor.data.email }
        : { id: value, name: null, email: "" };

  return (
    <SharedDonorPicker
      value={picked}
      onValueChange={(next) => onChange(next?.id ?? null)}
      placeholder={placeholder}
      disabled={disabled}
      id={id}
      search={search}
      aria-invalid={ariaInvalid}
    />
  );
}
