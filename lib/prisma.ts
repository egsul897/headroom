import { PrismaClient } from "@prisma/client";
import { resolvePrismaDatasourceUrl } from "./db-connection";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  // Absent connect_timeout / pgbouncer / pool settings are filled in here.
  // See lib/db-connection.ts. The Vercel DATABASE_URL value is left as-is.
  const url = resolvePrismaDatasourceUrl(process.env.DATABASE_URL);
  return url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
