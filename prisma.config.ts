// Prisma CLI configuration (Prisma 7 no longer reads the connection URL from schema.prisma, nor
// loads .env by itself). The app does not use Prisma Client at runtime, only its generated types;
// the CLI uses this for `migrate deploy` (the Cloud Run migrate jobs), `migrate dev` and `db seed`.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    // Not env("DB_URL"): that throws when unset, and `prisma generate` (Docker build, postinstall)
    // runs without a database
    url: process.env.DB_URL,
  },
});
