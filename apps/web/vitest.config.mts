import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The unit tests cover plain functions (no rendering), so they run in Node, as under Jest.
    environment: "node",
    globals: false,
    include: ["**/*.test.{ts,tsx}"],
    // The studio is its own package with its own `pnpm test`
    exclude: ["**/node_modules/**", ".next/**", "public/studio/**", "studio/**", "cypress/**"],
  },
});
