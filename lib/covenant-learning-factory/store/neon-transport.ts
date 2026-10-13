/**
 * Neon Prisma client factory for covenant-learning-factory scripts/lib only.
 *
 * NEON_TRANSPORT=https → dynamic import of @neondatabase/serverless + PrismaNeonHTTP
 * default / unset     → standard Prisma TCP engine (unchanged)
 *
 * Never logs connection strings. Does not touch lib/prisma.ts (Next app default).
 */

import { PrismaClient } from "@prisma/client";
import {
  classifyNeonProbeError,
  resolveNeonDatabaseUrlForPrisma,
} from "./neon-database-url";

export type NeonTransportMode = "tcp" | "https";

export type NeonQueryFn = (
  query: string,
  params?: unknown[],
) => Promise<unknown>;

export type NeonFactory = (connectionString: string) => NeonQueryFn & {
  transaction?: unknown;
};

export function getNeonTransportMode(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): NeonTransportMode {
  return env.NEON_TRANSPORT === "https" ? "https" : "tcp";
}

/** Redact credentials from error text before surfacing. */
export function redactConnectionSecrets(text: string): string {
  return text
    .replace(/postgresql:\/\/[^:\s]+:[^@\s]+@/gi, "postgresql://***:***@")
    .replace(/postgres:\/\/[^:\s]+:[^@\s]+@/gi, "postgres://***:***@");
}

export interface NeonHttpsExecutor {
  /** Run a single SQL statement over Neon HTTPS. Returns row objects. */
  execute(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

/**
 * Create a Neon HTTPS query executor (fetch to Neon HTTP API on 443).
 * Pass `neonFn` in offline tests to avoid loading @neondatabase/serverless.
 */
export async function createNeonHttpsExecutor(
  connectionString: string,
  neonFn?: NeonFactory,
): Promise<NeonHttpsExecutor> {
  if (!connectionString) {
    throw new Error("DATABASE_URL unset");
  }
  const neon =
    neonFn ??
    ((await import("@neondatabase/serverless")).neon as unknown as NeonFactory);
  const sql = neon(connectionString);
  return {
    async execute(statement: string, params: unknown[] = []) {
      // Omit params array when empty so Neon HTTP does not force a multi-command-
      // hostile prepared path for bare DDL / DO $$ blocks.
      const rows =
        params.length > 0 ? await sql(statement, params) : await sql(statement);
      return rows as Record<string, unknown>[];
    },
  };
}

export interface CreateClfPrismaClientResult {
  client: PrismaClient;
  transport: NeonTransportMode;
  /** Present for TCP path when IPv4 rewrite ran. */
  originalHost?: string;
  ipv4?: string | null;
  /** Call after use when a dedicated client was created (always, for CLF). */
  disconnect: () => Promise<void>;
}

/**
 * Prisma client for CLF Neon ops. HTTPS uses PrismaNeonHTTP (no TCP 5432).
 * Only used from CLF scripts/store — not from the Next app prisma singleton.
 */
export async function createClfPrismaClient(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<CreateClfPrismaClientResult> {
  const transport = getNeonTransportMode(env);
  const raw = env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL unset");
  }

  if (transport === "https") {
    const { neon } = await import("@neondatabase/serverless");
    const { PrismaNeonHTTP } = await import("@prisma/adapter-neon");
    const sql = neon(raw);
    const adapter = new PrismaNeonHTTP(sql);
    const client = new PrismaClient({ adapter });
    return {
      client,
      transport,
      disconnect: async () => {
        await client.$disconnect().catch(() => undefined);
      },
    };
  }

  const resolved = await resolveNeonDatabaseUrlForPrisma(raw);
  const client = new PrismaClient({
    datasources: { db: { url: resolved.url } },
  });
  return {
    client,
    transport,
    originalHost: resolved.originalHost,
    ipv4: resolved.ipv4,
    disconnect: async () => {
      await client.$disconnect().catch(() => undefined);
    },
  };
}

export { classifyNeonProbeError };
