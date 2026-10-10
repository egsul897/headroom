import { describe, expect, it } from "vitest";
import {
  GRAPH_RESUME_ENV,
  GRAPH_RESUME_TOKEN,
  assertCorpusGraphWriteAuthorized,
  graphRemediationResumeAuthorized,
  massLiveWriteAuthorized,
} from "../../lib/knowledge-factory/continuous/graph-write-gate";
import { MASS_LIVE_ENV, MASS_LIVE_TOKEN } from "../../lib/knowledge-factory/acquisition/persistence-mode";

describe("corpus graph write gate (remediation pause enforcement)", () => {
  it("refuses when neither operator token is set", () => {
    expect(() => assertCorpusGraphWriteAuthorized("neon-massive-expand", {})).toThrow(
      /Corpus graph write refused/,
    );
    expect(() => assertCorpusGraphWriteAuthorized("neon-massive-expand", {})).toThrow(
      /KF_MASS_PRECEDENT_LIVE_WRITE/,
    );
    expect(() => assertCorpusGraphWriteAuthorized("neon-massive-expand", {})).toThrow(
      /KF_GRAPH_REMEDIATION_RESUME/,
    );
  });

  it("refuses when only the mass live-write token is set", () => {
    const env = { [MASS_LIVE_ENV]: MASS_LIVE_TOKEN };
    expect(massLiveWriteAuthorized(env)).toBe(true);
    expect(graphRemediationResumeAuthorized(env)).toBe(false);
    expect(() => assertCorpusGraphWriteAuthorized("global-provision-graph-persist", env)).toThrow(
      /KF_GRAPH_REMEDIATION_RESUME/,
    );
  });

  it("refuses when only the remediation resume token is set", () => {
    const env = { [GRAPH_RESUME_ENV]: GRAPH_RESUME_TOKEN };
    expect(() => assertCorpusGraphWriteAuthorized("relationship-graph-backfill", env)).toThrow(
      /KF_MASS_PRECEDENT_LIVE_WRITE/,
    );
  });

  it("allows only when both operator tokens are set", () => {
    const env = {
      [MASS_LIVE_ENV]: MASS_LIVE_TOKEN,
      [GRAPH_RESUME_ENV]: GRAPH_RESUME_TOKEN,
    };
    expect(() => assertCorpusGraphWriteAuthorized("neon-massive-expand", env)).not.toThrow();
  });

  it("error text preserves open blockers and denies concurrency-safety claims", () => {
    try {
      assertCorpusGraphWriteAuthorized("global-amendment-graph-persist", {});
      expect.unreachable();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/18984/);
      expect(msg).toMatch(/93/);
      expect(msg).toMatch(/TOCTOU|UNIQUE/);
      expect(msg).toMatch(/untested migration rollback/i);
      expect(msg).toMatch(/does not provide database concurrency safety/i);
    }
  });
});
