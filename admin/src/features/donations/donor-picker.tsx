import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useFieldControl } from "@/components/ui/field";
import { controlClasses } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * TEMPORARY local donor picker for the money pages. A shared DonorPicker over donors.search
 * is being built in the donors area; swap this for it on merge (same props).
 *
 * Searches name, email or donor id (donors.search) as you type; shows the chosen donor's
 * name and email.
 */
export function DonorPicker({
  value,
  onValueChange,
  placeholder = "Search name, email or donor ID",
  disabled,
  className,
}: {
  value: number | null;
  onValueChange: (donorId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const trpc = useTRPC();
  const field = useFieldControl();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const commit = useDebouncedCallback((next: string) => setDebounced(next.trim()), 250);

  const selected = useQuery({
    ...trpc.donors.get.queryOptions({ donorId: value ?? 0 }),
    enabled: value != null,
  });
  const results = useQuery({
    ...trpc.donors.search.queryOptions({ query: debounced, page: 0, limit: 8 }),
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
  });
  const rows = debounced.length >= 2 ? (results.data?.rows ?? []) : [];

  const label =
    value == null
      ? placeholder
      : selected.data
        ? `${selected.data.name ?? selected.data.email} · #${selected.data.id}`
        : `Donor #${value}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={field.id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-describedby={field["aria-describedby"]}
          aria-invalid={field["aria-invalid"]}
          disabled={disabled}
          data-slot="donor-picker"
          className={cn(
            controlClasses,
            "flex h-control items-center justify-between gap-2 px-2.5 text-left data-[state=open]:border-ring",
            value == null && "text-faint-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={(next) => {
              setQuery(next);
              commit(next);
            }}
            placeholder="Name, email or donor ID"
            aria-label="Search donors"
          />
          <CommandList>
            <CommandEmpty>
              {debounced.length < 2
                ? "Type at least two characters"
                : results.isFetching
                  ? "Searching…"
                  : results.isError
                    ? "Search failed. Try other words."
                    : "No donors match"}
            </CommandEmpty>
            {rows.length > 0 && (
              <CommandGroup>
                {rows.map((donor) => (
                  <CommandItem
                    key={donor.id}
                    value={String(donor.id)}
                    onSelect={() => {
                      onValueChange(donor.id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn("size-4", donor.id === value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{donor.name ?? donor.email}</span>
                      <span className="truncate text-xs text-muted-foreground">{donor.email}</span>
                    </span>
                    <span className="num text-xs text-muted-foreground">#{donor.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
