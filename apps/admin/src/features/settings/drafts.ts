/**
 * Draft edits for settings lists, kept as patches over the server data (not a copy of it),
 * so a refetch after creating something keeps unsaved edits to everything else.
 */

export type Patches<T> = Record<number, Partial<T>>;

type Ordered = { id: number; ordering: number | null };

/** Display order: by `ordering`, unordered last, ties by id. */
export function byOrdering<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (a.ordering ?? Number.MAX_SAFE_INTEGER) - (b.ordering ?? Number.MAX_SAFE_INTEGER) ||
      a.id - b.id,
  );
}

export function applyPatches<T extends { id: number }>(
  items: readonly T[],
  patches: Patches<T>,
): T[] {
  return items.map((item) => (patches[item.id] ? { ...item, ...patches[item.id] } : item));
}

/** The fields of `patch` that differ from `item`. */
export function changedFields<T extends object>(item: T, patch: Partial<T> | undefined) {
  const changed: Partial<T> = {};
  for (const key of Object.keys(patch ?? {}) as (keyof T)[]) {
    if (patch![key] !== item[key]) changed[key] = patch![key];
  }
  return changed;
}

/** Items whose patch changes something, with only the changed fields. */
export function pendingChanges<T extends { id: number }>(
  items: readonly T[],
  patches: Patches<T>,
): { id: number; changes: Partial<T> }[] {
  return items
    .map((item) => ({ id: item.id, changes: changedFields(item, patches[item.id]) }))
    .filter((entry) => Object.keys(entry.changes).length > 0);
}

export function patch<T>(patches: Patches<T>, id: number, fields: Partial<T>): Patches<T> {
  return { ...patches, [id]: { ...patches[id], ...fields } };
}

/**
 * Moves one item up or down in an ordered list and numbers the whole list 1…n, so
 * duplicate or missing orderings are tidied up as a side effect. Returns ordering patches.
 */
export function move<T extends Ordered>(
  ordered: readonly T[],
  id: number,
  direction: -1 | 1,
): Patches<Ordered> {
  const index = ordered.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return {};
  const next = [...ordered];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return Object.fromEntries(next.map((item, position) => [item.id, { ordering: position + 1 }]));
}

type ShareArea = {
  name: string;
  isActive: boolean;
  standardPercentageShare?: number | null;
  organizations: { isActive: boolean; standardShare?: number | null }[];
};

const total = (values: (number | null | undefined)[]) =>
  // Shares are whole percents (the API rejects decimals), so float addition is exact here.
  values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

/**
 * Where the standard split doesn't add up: active cause areas must total 100 %, and so must
 * the active organizations inside each active cause area.
 */
export function shareProblems(areas: readonly ShareArea[]): string[] {
  const active = areas.filter((area) => area.isActive);
  const problems: string[] = [];
  const areaTotal = total(active.map((area) => area.standardPercentageShare));
  if (active.length > 0 && areaTotal !== 100) {
    problems.push(`Active cause areas add up to ${areaTotal} %`);
  }
  for (const area of active) {
    const orgs = area.organizations.filter((org) => org.isActive);
    const orgTotal = total(orgs.map((org) => org.standardShare));
    if (orgs.length === 0) problems.push(`${area.name} has no active organizations`);
    else if (orgTotal !== 100) problems.push(`${area.name}: organizations add up to ${orgTotal} %`);
  }
  return problems;
}

/** Trims text fields and turns empty optional ones into undefined. */
export function cleanText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
