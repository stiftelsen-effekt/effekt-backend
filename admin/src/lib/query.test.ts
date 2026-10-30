import { describe, expect, it } from "vitest";

/*
 * Conventions from DESIGN.md › Loading that a type checker can't see: pages keep their data
 * on parameter changes through usePageQuery, and never build skeleton layouts by hand.
 */
const pages = import.meta.glob<string>("../routes/_app/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("loading conventions", () => {
  it("finds the app's pages", () => {
    expect(Object.keys(pages).length).toBeGreaterThan(10);
  });

  it.each(Object.entries(pages))("%s keeps data through usePageQuery", (_, source) => {
    // keepPreviousData directly is how a page ends up without the progress line and prefetch.
    expect(source).not.toMatch(/\bkeepPreviousData\b/);
    // URL-backed lists change their query input: it must be a usePageQuery.
    if (source.includes("useListState(")) expect(source).toMatch(/\busePageQuery\(/);
  });

  it.each(Object.entries(pages))("%s has no hand-built skeleton layout", (_, source) => {
    // Two or more skeleton bars in a row is a layout drawn by hand; use the components'
    // own pending states (DataTable isLoading, Stat/Property pending, SkeletonText).
    expect(source).not.toMatch(/<Skeleton [^>]*\/>\s*<Skeleton /);
  });
});
