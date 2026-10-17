/**
 * Rule 2 — durable stall records (precedent evidence: 34% of the public
 * corpus sat at SOURCE_ONLY + ACQUIRED with no reason). When the SEC
 * batch import persists a row and processing/update then fails, the
 * failure must be recorded ON THE ROW, not only in an in-memory error
 * list and a local checkpoint file that can vanish.
 */
import { describe, expect, it, vi } from "vitest";
import { recordImportStall, type StallRecorderClient } from "../../lib/knowledge-factory/mass-precedent/stall-record";

function fakeClient(overrides: Partial<StallRecorderClient["knowledgeSource"]> = {}): {
  client: StallRecorderClient;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn(async () => ({ metadata: { keepMe: 1 } }));
  const update = vi.fn(async () => ({}));
  const client: StallRecorderClient = {
    knowledgeSource: { findUnique, update, ...overrides },
  };
  return { client, findUnique, update };
}

describe("recordImportStall", () => {
  it("marks FAILED, preserves existing metadata, stamps stall fields", async () => {
    const { client, update } = fakeClient();
    const ok = await recordImportStall(client, "src-1", "process-or-update", new Error("boom"));
    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.extractionStatus).toBe("FAILED");
    const meta = data.metadata as Record<string, unknown>;
    expect(meta.keepMe).toBe(1);
    expect(meta.stallReason).toBe("boom");
    expect(meta.stallStage).toBe("process-or-update");
    expect(typeof meta.stallAt).toBe("string");
  });

  it("truncates long stall reasons", async () => {
    const { client, update } = fakeClient();
    await recordImportStall(client, "src-1", "process-or-update", "x".repeat(2000));
    const meta = (update.mock.calls[0]![0].data as Record<string, unknown>).metadata as Record<string, unknown>;
    expect((meta.stallReason as string).length).toBe(500);
  });

  it("returns false and does not update when the row does not exist", async () => {
    const { client, update } = fakeClient({ findUnique: vi.fn(async () => null) });
    const ok = await recordImportStall(client, "missing", "process-or-update", new Error("boom"));
    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns false and never throws when the write fails", async () => {
    const { client } = fakeClient({ update: vi.fn(async () => { throw new Error("db down"); }) });
    const ok = await recordImportStall(client, "src-1", "process-or-update", new Error("boom"));
    expect(ok).toBe(false);
  });
});
