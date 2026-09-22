import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env on its own.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file (CI / Vercel provide real environment variables).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Direct (non-pooled) connection: migrations must not go through PgBouncer.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
