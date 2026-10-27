import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc";
import type { CauseAreaConfig } from "./model";

/**
 * Cause areas with their organizations and standard split shares, for the distribution
 * editor and summaries. New splits use the active ones (`config.causeAreas.listActive`);
 * reading or editing an existing split needs all of them (`listAll`), so cause areas and
 * organizations deactivated since still have names and stay in the draft.
 */
export function useCauseAreaConfig({ includeInactive = false } = {}) {
  const trpc = useTRPC();
  const active = useQuery({
    ...trpc.config.causeAreas.listActive.queryOptions(),
    staleTime: 5 * 60_000,
    enabled: !includeInactive,
  });
  const all = useQuery({
    ...trpc.config.causeAreas.listAll.queryOptions(),
    staleTime: 5 * 60_000,
    enabled: includeInactive,
  });
  const query = includeInactive ? all : active;
  const data = useMemo(
    () => (query.data ? sortConfig(query.data as CauseAreaConfig[]) : undefined),
    [query.data],
  );
  return { ...query, data };
}

const byOrdering = (a: { ordering: number | null; id: number }, b: typeof a) =>
  (a.ordering ?? Number.MAX_SAFE_INTEGER) - (b.ordering ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;

/** listAll comes in id order and listActive in configured order; show both the configured way. */
export const sortConfig = (config: CauseAreaConfig[]): CauseAreaConfig[] =>
  [...config]
    .sort(byOrdering)
    .map((area) => ({ ...area, organizations: [...area.organizations].sort(byOrdering) }));
