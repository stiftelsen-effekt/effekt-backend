import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, LoaderCircleIcon, UserIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { errorCode, useTRPCClient } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/** What a picker holds: enough to show who was picked without another request. */
export type PickedDonor = { id: number; name: string | null; email: string };

/** Resolves a typed query to donors. The default searches the API (donors.search). */
export type DonorSearch = (query: string, signal: AbortSignal) => Promise<PickedDonor[]>;

/** The API search: full text over name and email (+word, -word, "phrase", prefix*), or an id. */
export function useApiDonorSearch(limit = 8): DonorSearch {
  const client = useTRPCClient();
  return useCallback(
    async (query, signal) => {
      try {
        const result = await client.donors.search.query({ query, page: 0, limit }, { signal });
        return result.rows.map(({ id, name, email }) => ({ id, name, email }));
      } catch (error) {
        // Only operators left (e.g. "-"): nothing to search for yet.
        if (errorCode(error) === "BAD_REQUEST") return [];
        throw error;
      }
    },
    [client, limit],
  );
}

const searchable = (query: string) => {
  const q = query.trim();
  return /^\d+$/.test(q) || q.replace(/[+\-"*]/g, "").trim().length >= 2;
};

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type DonorPickerProps = {
  value: PickedDonor | null;
  onValueChange: (donor: PickedDonor | null) => void;
  placeholder?: string;
  /** Donors that can't be picked here, e.g. the donor being merged away. */
  excludeIds?: number[];
  disabled?: boolean;
  /** Show a clear button while a donor is picked. */
  clearable?: boolean;
  /** Replace the API search (the /design demo uses fake data). */
  search?: DonorSearch;
  id?: string;
  "aria-invalid"?: boolean;
  className?: string;
};

/**
 * Pick one donor by name, email or donor id. Controlled: the parent holds the picked donor.
 * Opens on click, Enter, Space or ↓; typing searches (debounced), ↑/↓ moves, Enter picks,
 * Esc closes. Put it inside a <Field> for the label.
 *
 *   const [donor, setDonor] = useState<PickedDonor | null>(null);
 *   <Field label="Donor"><DonorPicker value={donor} onValueChange={setDonor} /></Field>
 */
export function DonorPicker({
  value,
  onValueChange,
  placeholder = "Find a donor…",
  excludeIds,
  disabled,
  clearable = true,
  search,
  id,
  "aria-invalid": ariaInvalid,
  className,
}: DonorPickerProps) {
  const field = useFieldControl();
  const apiSearch = useApiDonorSearch();
  const runSearch = search ?? apiSearch;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const enabled = open && searchable(debounced);

  const results = useQuery({
    queryKey: ["donor-picker", search ? "custom" : "api", debounced],
    queryFn: ({ signal }) => runSearch(debounced, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const excluded = new Set(excludeIds ?? []);
  const rows = enabled ? (results.data ?? []).filter((donor) => !excluded.has(donor.id)) : [];
  const loading = enabled && (results.isFetching || debounced !== query.trim());

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            id={id ?? field.id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-describedby={field["aria-describedby"]}
            aria-invalid={ariaInvalid ?? field["aria-invalid"]}
            disabled={disabled}
            data-slot="donor-picker"
            className={cn(
              controlClasses,
              "flex h-control min-w-0 flex-1 items-center justify-between gap-2 px-2.5 text-left data-[state=open]:border-ring",
              !value && "text-faint-foreground",
            )}
          >
            {value ? (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="max-w-[65%] shrink-0 truncate font-semibold text-foreground">
                  {value.name || value.email}
                </span>
                <span className="num shrink-0 text-xs text-muted-foreground">#{value.id}</span>
                {value.name && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground max-sm:hidden">
                    {value.email}
                  </span>
                )}
              </span>
            ) : (
              <span className="truncate">{placeholder}</span>
            )}
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0">
          <Command shouldFilter={false} loop>
            <div className="relative">
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Name, email or donor ID"
                aria-label="Search donors"
              />
              {loading && (
                <LoaderCircleIcon
                  aria-hidden
                  className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              )}
            </div>
            <CommandList aria-label="Donors">
              {!searchable(query) ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Type a name, email or donor ID. Use <span className="font-mono">+word</span> to
                  require and <span className="font-mono">-word</span> to exclude a word.
                </p>
              ) : results.isError && enabled ? (
                <p role="alert" className="px-3 py-3 text-sm text-danger">
                  Search failed. Try again.
                </p>
              ) : loading ? (
                rows.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p>
                )
              ) : (
                <CommandEmpty>No donors match “{query.trim()}”</CommandEmpty>
              )}
              {rows.length > 0 && (
                <CommandGroup>
                  {rows.map((donor) => (
                    <CommandItem
                      key={donor.id}
                      value={String(donor.id)}
                      onSelect={() => {
                        onValueChange(donor);
                        onOpenChange(false);
                      }}
                      className="gap-2.5"
                    >
                      <UserIcon className="text-muted-foreground" aria-hidden />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-semibold">
                          {donor.name || <span className="text-muted-foreground">No name</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {donor.email}
                        </span>
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
      {clearable && value && !disabled && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear donor"
          onClick={() => onValueChange(null)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
