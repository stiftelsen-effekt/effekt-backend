import { useNavigate } from "@tanstack/react-router";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CornerDownLeftIcon, LoaderCircleIcon, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { overlayClasses } from "@/components/ui/overlay";
import { useSearchProviders, type SearchResult } from "@/features/search/providers";
import { cn } from "@/lib/utils";

export type PaletteCommand = {
  id: string;
  label: string;
  group: "Go to" | "Actions" | "Preferences";
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
};

type ProviderState = { group: string; results: SearchResult[]; loading: boolean };

function useProviderResults(query: string) {
  const providers = useSearchProviders();
  const [state, setState] = useState<Record<string, ProviderState>>({});

  useEffect(() => {
    const trimmed = query.trim();
    const active = providers.filter((provider) => trimmed && provider.applies(trimmed));
    // oxlint-disable-next-line react/set-state-in-effect -- marks the providers for the new query as loading
    setState(
      Object.fromEntries(active.map((p) => [p.id, { group: p.group, results: [], loading: true }])),
    );
    if (active.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      for (const provider of active) {
        provider
          .search(trimmed, controller.signal)
          .catch(() => [])
          .then((results) => {
            if (controller.signal.aborted) return;
            setState((current) => ({
              ...current,
              [provider.id]: { group: provider.group, results, loading: false },
            }));
          });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, providers]);

  return state;
}

function matches(command: PaletteCommand, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [command.label, ...(command.keywords ?? [])].some((text) =>
    text.toLowerCase().includes(q),
  );
}

/**
 * ⌘K. One box that finds any record by name, email, id, KID or agreement id, jumps to any
 * page, and runs common actions. Records come first when the query looks like an id.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const providerState = useProviderResults(open ? query : "");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- clears the query when the palette closes
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, { results: SearchResult[]; loading: boolean }>();
    for (const entry of Object.values(providerState)) {
      const group = byGroup.get(entry.group) ?? { results: [], loading: false };
      const seen = new Set(group.results.map((r) => r.id));
      group.results.push(...entry.results.filter((r) => !seen.has(r.id)));
      group.loading ||= entry.loading;
      byGroup.set(entry.group, group);
    }
    return [...byGroup.entries()];
  }, [providerState]);

  const loading = groups.some(([, group]) => group.loading);
  const visibleCommands = commands.filter((command) => matches(command, query));
  const commandGroups = (["Go to", "Actions", "Preferences"] as const)
    .map((group) => [group, visibleCommands.filter((c) => c.group === group)] as const)
    .filter(([, items]) => items.length > 0);

  function go(href: string) {
    onOpenChange(false);
    void navigate({ to: href });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden",
            "rounded-lg border border-border bg-popover shadow-overlay outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <Command shouldFilter={false} loop className="bg-transparent">
            <div className="relative">
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search donors, donations, KIDs, agreements… or type a command"
                className="h-12 text-base"
              />
              {loading && (
                <LoaderCircleIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <CommandList ref={listRef} className="max-h-[min(60vh,28rem)]">
              {!loading && <CommandEmpty>No matches for “{query}”</CommandEmpty>}
              {groups.map(([group, { results }]) =>
                results.length ? (
                  <CommandGroup key={group} heading={group}>
                    {results.map((result) => {
                      const Icon = result.icon;
                      return (
                        <CommandItem
                          key={result.id}
                          value={result.id}
                          onSelect={() => go(result.href)}
                          className="h-10"
                        >
                          {Icon && <Icon className="text-muted-foreground" />}
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold">{result.title}</span>
                            {result.subtitle && (
                              <span className="ml-2 text-muted-foreground">{result.subtitle}</span>
                            )}
                          </span>
                          {result.meta && (
                            <span className="num text-xs text-muted-foreground">{result.meta}</span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null,
              )}
              {commandGroups.map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((command) => {
                    const Icon = command.icon;
                    return (
                      <CommandItem
                        key={command.id}
                        value={command.id}
                        onSelect={() => {
                          onOpenChange(false);
                          command.run();
                        }}
                      >
                        {Icon && <Icon className="text-muted-foreground" />}
                        <span className="flex-1">{command.label}</span>
                        {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
            <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>
                  <CornerDownLeftIcon className="size-3" />
                </Kbd>
                open
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>esc</Kbd> close
              </span>
              <span className="ml-auto">Try a name, email, donor id, KID or agr_…</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
