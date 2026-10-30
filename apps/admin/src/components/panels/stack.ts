/*
 * The panel stack lives in one search param: `?panel=donor:12,donation:345`.
 * Each token is a kind and its path params in path order, values URI-encoded so ids
 * containing `:` or `,` survive. Pure functions; the host (panel-host.tsx) does the rest.
 */

/** A record kind that can open as a panel: its route's path (`/donors/$id`). */
export type PanelKind = { kind: string; path: string; label: (params: string[]) => string };

export type PanelEntry = { kind: string; params: string[] };

/** More than this is a loop, not a workflow; the oldest panels drop off. */
export const MAX_PANELS = 8;

/** `/agreements/$provider/$id` → ["provider", "id"]. */
export function paramNames(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment.startsWith("$"))
    .map((segment) => segment.slice(1));
}

export function tokenOf(entry: PanelEntry): string {
  return [entry.kind, ...entry.params.map(encodeURIComponent)].join(":");
}

export function serializePanels(entries: PanelEntry[]): string | undefined {
  return entries.length === 0 ? undefined : entries.map(tokenOf).join(",");
}

/** Unknown kinds, wrong param counts and empty values are dropped, not errors. */
export function parsePanels(raw: unknown, kinds: PanelKind[]): PanelEntry[] {
  if (typeof raw !== "string" && typeof raw !== "number") return [];
  const entries: PanelEntry[] = [];
  for (const token of String(raw).split(",")) {
    const [kind, ...encoded] = token.split(":");
    const definition = kinds.find((k) => k.kind === kind);
    if (!definition || encoded.length !== paramNames(definition.path).length) continue;
    let params: string[];
    try {
      params = encoded.map(decodeURIComponent);
    } catch {
      continue;
    }
    if (params.some((value) => value === "")) continue;
    entries.push({ kind: definition.kind, params });
  }
  return entries.slice(-MAX_PANELS);
}

/**
 * A layout route's `validateSearch` for the stack: `{ panel }` when there are valid panels,
 * otherwise `{}` (no `panel: undefined` key for pages that list their search params).
 */
export function validatePanelSearch(
  search: Record<string, unknown>,
  kinds: PanelKind[],
): { panel?: string } {
  const panel = serializePanels(parsePanels(search.panel, kinds));
  return panel ? { panel } : {};
}

/** The record's own page: `{ kind: "donor", params: ["12"] }` → `/donors/12`. */
export function panelPath(entry: PanelEntry, kinds: PanelKind[]): string {
  const definition = kinds.find((k) => k.kind === entry.kind);
  if (!definition) return "/";
  let index = 0;
  return definition.path
    .split("/")
    .map((segment) =>
      segment.startsWith("$") ? encodeURIComponent(entry.params[index++] ?? "") : segment,
    )
    .join("/");
}

/** A path (no query) as a panel entry, when it's one of `kinds`' pages. */
export function matchPanelPath(pathname: string, kinds: PanelKind[]): PanelEntry | null {
  const parts = trimSlash(pathname).split("/");
  for (const definition of kinds) {
    const pattern = trimSlash(definition.path).split("/");
    if (pattern.length !== parts.length) continue;
    const params: string[] = [];
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      const segment = pattern[i]!;
      const part = parts[i]!;
      if (segment.startsWith("$")) {
        if (!part) ok = false;
        else
          try {
            params.push(decodeURIComponent(part));
          } catch {
            ok = false;
          }
      } else if (segment !== part) ok = false;
      if (!ok) break;
    }
    if (ok) return { kind: definition.kind, params };
  }
  return null;
}

export function sameEntry(a: PanelEntry, b: PanelEntry) {
  return tokenOf(a) === tokenOf(b);
}

function trimSlash(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
