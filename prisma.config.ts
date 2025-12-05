import { defineConfig, env } from "prisma/config";
import "dotenv/config";

const databaseUrl = env("DATABASE_URL") || "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: databaseUrl,
  },
});
