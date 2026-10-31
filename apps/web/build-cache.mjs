// Shared by build-studio.mjs and build-api-types.mjs: reuse a build's output from .next/cache
// (which Vercel and the GitHub workflows keep between builds) when a hash of everything it is
// built from matches, else build and keep the output for next time.
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Files under dir, sorted, leaving out directories named in skip */
export function files(dir, skip = new Set()) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !skip.has(entry.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return files(path, skip);
      return entry.isFile() ? [path] : [];
    })
    .sort();
}

const unquote = (text) => text.replace(/^(['"])(.*)\1$/, "$2");
// `name: value`, `name:` or `name: {}`; names may be quoted and contain colons (tarball URLs)
const ENTRY = /^(['"]?)(.+?)\1:(?:\s+(.*))?$/;

/**
 * What one workspace package resolves to in pnpm-lock.yaml: every package in its dependency
 * closure (name, version and peers, with the lockfile's resolution entry), as sorted lines, and
 * the directories of the workspace packages it links to. A change elsewhere in the lockfile, in
 * another package's dependencies, leaves it unchanged.
 *
 * pnpm writes the lockfile as YAML in a fixed layout; this reads that layout line by line rather
 * than depending on a YAML parser the website's install doesn't have. With pnpm 11+ the file is
 * two documents (the pnpm version first); the workspace's is the last.
 */
export function lockfileClosure(lockfile, importer) {
  const documents = readFileSync(lockfile, "utf8").split(/^---$/m);
  const lines = documents[documents.length - 1].split("\n");
  const importers = new Map(); // importer -> Map(name -> version)
  const snapshots = new Map(); // key -> Map(name -> version)
  const packages = new Map(); // key -> lines
  let section = "";
  let current = null;
  let group = "";
  let dependency = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const match = ENTRY.exec(line.trim());
    if (indent === 0) {
      section = line.replace(/:.*$/, "");
      continue;
    }
    if (section === "importers") {
      if (indent === 2 && match) importers.set(match[2], (current = new Map()));
      else if (indent === 4 && match) group = match[2];
      else if (indent === 6 && match) dependency = match[2];
      else if (indent === 8 && match?.[2] === "version" && group.endsWith("ependencies"))
        current.set(dependency, unquote(match[3] ?? ""));
    } else if (section === "snapshots") {
      if (indent === 2 && match) snapshots.set(match[2], (current = new Map()));
      else if (indent === 4 && match) group = match[2];
      else if (indent === 6 && match && /^(optionalD|d)ependencies$/.test(group))
        current.set(match[2], unquote(match[3] ?? ""));
    } else if (section === "packages") {
      if (indent === 2 && match) packages.set(match[2], (current = []));
      else current?.push(line.trim());
    }
  }

  const root = importers.get(importer);
  if (!root) throw new Error(`${importer} is not an importer in ${lockfile}`);
  const workspace = dirname(lockfile);
  const links = new Set();
  const seen = new Set();
  const queue = [];
  const visit = (from, dependencies) => {
    for (const [name, version] of dependencies) {
      if (version.startsWith("link:")) {
        // A workspace package: its files count, and so do its own dependencies
        const path = relative(workspace, resolve(workspace, from, version.slice(5)));
        if (!links.has(path)) {
          links.add(path);
          visit(path, importers.get(path) ?? new Map());
        }
      } else {
        // An alias (npm:...) or a plain version, maybe with peers in parentheses
        const key = version.split("(")[0].includes("@", 1) ? version : `${name}@${version}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(key);
        }
      }
    }
  };
  visit(importer, root);
  while (queue.length) visit(importer, snapshots.get(queue.shift()) ?? new Map());

  const entries = [...seen].sort().map((key) => {
    const base = key.replace(/(.)\(.*$/, "$1");
    return `${key} ${(packages.get(base) ?? []).join(" ")}`;
  });
  return { entries, links: [...links].sort() };
}

/** A short hex digest of strings and the contents of files (each named relative to base) */
export function digest({ strings = [], paths = [], base = "/" }) {
  const hash = createHash("sha256");
  for (const text of strings) hash.update(`${text}\n`);
  for (const path of paths) {
    hash.update(`${relative(base, path)}\n`);
    hash.update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 32);
}

/**
 * Copies the output kept under cacheRoot/key into output if it is there (marker is a file every
 * complete output has), else runs build and keeps output under cacheRoot/key, replacing older ones.
 */
export function reuseOrBuild({ label, cacheRoot, key, output, marker, build, describe = "" }) {
  const cached = join(cacheRoot, key);
  const present = existsSync(cacheRoot) ? readdirSync(cacheRoot) : [];
  console.log(`${label} key ${key}; cached: ${present.join(", ") || "none"}${describe}`);
  if (existsSync(join(cached, marker))) {
    rmSync(output, { recursive: true, force: true });
    cpSync(cached, output, { recursive: true });
    console.log(`${label} unchanged, reused the build in ${relative(process.cwd(), cached)}`);
    return;
  }
  build();
  rmSync(cacheRoot, { recursive: true, force: true });
  cpSync(output, cached, { recursive: true });
}
