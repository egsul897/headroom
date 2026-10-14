import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import RootError from "../app/error";
import { augmentDatabaseUrl, resolvePrismaDatasourceUrl } from "../lib/db-connection";
import { DB_COLD_START_ATTEMPTS, DB_COLD_START_DELAYS_MS, withDbRetry } from "../lib/db-retry";

const POOLER = "postgresql://user:secret@ep-floral-forest-abc-pooler.us-east-2.aws.neon.tech:5432/neondb?sslmode=require";

describe("Neon cold-start connection string", () => {
  it("adds connect_timeout and pooler settings when they are absent", () => {
    const url = augmentDatabaseUrl(POOLER, { serverless: true });
    expect(url.startsWith("postgresql://user:secret@ep-floral-forest-abc-pooler.us-east-2.aws.neon.tech:5432/neondb?")).toBe(true);
    expect(url).toContain("sslmode=require");
    expect(url).toContain("connect_timeout=20");
    expect(url).toContain("pool_timeout=20");
    expect(url).toContain("pgbouncer=true");
    expect(url).toContain("connection_limit=1");
    expect(url.split("pgbouncer=").length - 1).toBe(1);
  });

  it("leaves a direct host without pgbouncer and does not override an existing timeout", () => {
    const raw = "postgresql://user:secret@ep-floral-forest-abc.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=5";
    const url = augmentDatabaseUrl(raw, { serverless: true });
    expect(url).toContain("connect_timeout=5");
    expect(url).not.toContain("connect_timeout=20");
    expect(url).not.toContain("pgbouncer");
    expect(url).not.toContain("connection_limit");
    expect(url).toContain("pool_timeout=20");
  });

  it("keeps an explicit pgbouncer=false and skips connection_limit off Vercel", () => {
    const raw = `${POOLER}&pgbouncer=false`;
    const url = resolvePrismaDatasourceUrl(raw, {});
    expect(url).toContain("pgbouncer=false");
    expect(url).not.toContain("pgbouncer=true");
    expect(url).not.toContain("connection_limit");
    expect(url).toContain("connect_timeout=20");
  });

  it("keeps schema=public on a local Postgres URL", () => {
    const url = resolvePrismaDatasourceUrl("postgresql://headroom:headroom@localhost:5432/headroom?schema=public", {});
    expect(url).toContain("schema=public");
    expect(url).toContain("connect_timeout=20");
    expect(url).not.toContain("pgbouncer");
  });
});

describe("Neon cold-start retry", () => {
  it("retries a flaky client and returns rows after the connection error", async () => {
    const sleeps: number[] = [];
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientInitializationError(
          "Can't reach database server at `ep-floral-forest-abc-pooler.us-east-2.aws.neon.tech`:`5432`",
          "5.22.0",
          "P1001",
        ),
      )
      .mockResolvedValueOnce([{ id: "acme", name: "Acme" }]);
    const client = { company: { findMany } };

    const rows = await withDbRetry(() => client.company.findMany(), {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(rows).toEqual([{ id: "acme", name: "Acme" }]);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([DB_COLD_START_DELAYS_MS[0]]);
  });

  it("does not retry an authentication error", async () => {
    const sleep = vi.fn(async () => undefined);
    const auth = new Prisma.PrismaClientInitializationError(
      "Authentication failed against database server at `ep-floral-forest-abc-pooler.us-east-2.aws.neon.tech`, the provided database credentials for `user` are not valid.",
      "5.22.0",
      "P1000",
    );
    const findMany = vi.fn().mockRejectedValue(auth);
    const client = { company: { findMany } };

    await expect(withDbRetry(() => client.company.findMany(), { sleep })).rejects.toBe(auth);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry a non-connection request error", async () => {
    const sleep = vi.fn(async () => undefined);
    const unique = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    const findMany = vi.fn().mockRejectedValue(unique);
    await expect(withDbRetry(() => findMany(), { sleep })).rejects.toBe(unique);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("uses four tries and ten seconds of backoff", async () => {
    expect(DB_COLD_START_ATTEMPTS).toBe(4);
    expect([...DB_COLD_START_DELAYS_MS].reduce((sum, ms) => sum + ms, 0)).toBe(10_000);
    const sleep = vi.fn(async (_ms: number) => undefined);
    const err = new Prisma.PrismaClientInitializationError("Can't reach database server", "5.22.0", "P1001");
    const findMany = vi.fn().mockRejectedValue(err);
    await expect(withDbRetry(() => findMany(), { sleep })).rejects.toBe(err);
    expect(findMany).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([2_000, 3_000, 5_000]);
  });
});

describe("homepage database error boundary", () => {
  it("shows a database waking up message and does not render the Prisma error", () => {
    const html = renderToStaticMarkup(
      createElement(RootError, {
        error: Object.assign(new Error("Can't reach database server at ep-floral-forest-pooler.example:5432"), { digest: "2326671042" }),
        reset: () => undefined,
      }),
    );
    expect(html).toContain("Database waking up, please refresh");
    expect(html).not.toContain("ep-floral-forest");
    expect(html).not.toContain("2326671042");
    expect(html).toContain("Refresh");
  });
});
