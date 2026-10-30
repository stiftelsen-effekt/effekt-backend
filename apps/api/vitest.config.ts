import ts from "typescript";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The API is CommonJS, and its specs depend on CommonJS semantics: they stub module exports with
 * sinon (`sinon.stub(authMiddleware, "auth")`) and `require()` routes after stubbing, sometimes
 * after deleting them from `require.cache`. Vite would load the specs as ES modules, giving them
 * frozen namespace objects and a module graph separate from `require`. So, like ts-node under
 * Mocha before, compile each spec to CommonJS with TypeScript and let every import (including
 * `vitest`'s own, which must stay an ES import) go through Node's `require`; ts-node (registered
 * in setup/register.ts) compiles the application code. Specs and application code then share one
 * module instance per file, as under Mocha.
 */
const vitestImport = /^import \{[^}]*\} from "vitest";$/m;

const commonJsSpecs = (): Plugin => ({
  name: "effekt:commonjs-specs",
  enforce: "pre",
  transform(code, id) {
    if (!/\/src\/__test__\/.*\.spec\.ts$/.test(id)) return;
    const vitest = (code.match(vitestImport)?.[0] ?? "").replace(/\s+/g, " ");
    // Blank the import (keeping its newlines) rather than remove it, so line numbers in stack traces stay right
    const out = ts.transpileModule(
      code.replace(vitestImport, (line) => line.replace(/[^\n]/g, "")),
      {
        fileName: id,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          sourceMap: true,
          inlineSources: true,
        },
      },
    );
    return {
      // Prepended to the first line, again to keep line numbers. Specs export nothing, but
      // TypeScript marks every CommonJS module with `exports.__esModule`.
      code: `${vitest} var exports = {}; ${out.outputText.replace(/\/\/# sourceMappingURL=.*$/m, "")}`,
      map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null,
    };
  },
});

// The DB specs (src/__test__/DAO/*.db.spec.ts) run only when one of these points at a local
// database, and the regranting ones share REGRANTING_TEST_DB_URL and clear its tables. Mocha ran
// files one after another, so do the same whenever a test database is configured.
const testDbConfigured = [
  "AVTALEGIRO_TEST_DB_URL",
  "REGRANTING_TEST_DB_URL",
  "REGRANTING_SEED_DB_URL",
  "TIMESTAMPS_TEST_DB_URL",
].some((name) => !!process.env[name]);

export default defineConfig({
  plugins: [commonJsSpecs()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./src/__test__/setup/register.ts"],
    // As in the old .mocharc.json
    testTimeout: 5000,
    hookTimeout: 5000,
    // Child processes, one per spec file, so each file gets a fresh require cache and stubs or
    // env changes cannot leak between files. Node's own type stripping is off so ts-node compiles
    // every .ts file (it handles enums and other syntax that stripping rejects).
    pool: "forks",
    fileParallelism: !testDbConfigured,
    execArgv: ["--no-experimental-strip-types"],
    // Mocha ran with --exit; do not let a handle left open by a spec hang the run.
    teardownTimeout: 5000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__test__/**"],
      reporter: ["text"],
    },
  },
});
