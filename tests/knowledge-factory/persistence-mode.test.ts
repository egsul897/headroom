import { describe, expect, it } from "vitest";
import {
  parsePersistenceMode,
  resolveAcquisitionPersistence,
} from "../../lib/knowledge-factory/acquisition/persistence-mode";

describe("acquisition persistence mode", () => {
  it("parses explicit modes and legacy --persist-neon", () => {
    expect(parsePersistenceMode("local", false)).toBe("LOCAL");
    expect(parsePersistenceMode("NEON", false)).toBe("NEON");
    expect(parsePersistenceMode("reprocess", false)).toBe("REPROCESS");
    expect(parsePersistenceMode(undefined, true)).toBe("NEON");
    expect(parsePersistenceMode(undefined, false)).toBe("LOCAL");
  });

  it("resolves LOCAL without Neon auth and unifies analysis root", () => {
    const resolved = resolveAcquisitionPersistence({
      mode: "LOCAL",
      env: {},
    });
    expect(resolved.persistNeon).toBe(false);
    expect(resolved.allowSecFetch).toBe(true);
    expect(resolved.analysis.paths.root).toBe(resolved.local.paths.root);
    expect(resolved.roots.analysisRoot).toContain(".local-knowledge-corpus");
  });

  it("REPROCESS disables SEC fetch", () => {
    const resolved = resolveAcquisitionPersistence({ mode: "REPROCESS", env: {} });
    expect(resolved.allowSecFetch).toBe(false);
    expect(resolved.persistNeon).toBe(false);
  });

  it("NEON requires live-write gate", () => {
    expect(() => resolveAcquisitionPersistence({ mode: "NEON", env: {} })).toThrow(/KF_MASS_PRECEDENT_LIVE_WRITE/);
    const ok = resolveAcquisitionPersistence({
      mode: "NEON",
      env: { KF_MASS_PRECEDENT_LIVE_WRITE: "I_AUTHORIZE_NEON_BULK_WRITE" },
    });
    expect(ok.persistNeon).toBe(true);
  });
});
