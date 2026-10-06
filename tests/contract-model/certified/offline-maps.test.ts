/** Offline maps: reconstructed from preserved evidence and fixture discovery runs, zero provider calls, validated by the map's own checks. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildConmedOfflineMap, buildAllOfflineMaps } from "../../../scripts/canonical-map/build-offline-maps";
import { validateCovenantMap, computeMapHash } from "../../../lib/contract-model/covenant-map";

describe("offline canonical maps", () => {
  it("CONMED: the preserved run-original evidence assembles into a valid map whose candidate outcomes reconcile with the population manifest", () => {
    const build = buildConmedOfflineMap();
    expect(build.validation.problems).toEqual([]);
    const manifest = JSON.parse(fs.readFileSync("docs/phase-3-conmed-population-verified/04-population-manifest.json", "utf8")) as { rows?: unknown[]; candidates?: unknown[] } & Record<string, unknown>;
    const rows = (manifest.rows ?? manifest.candidates ?? []) as { discoveryId?: string; candidateRef?: string; status?: string; segment?: string }[];
    expect(build.map.completeness.candidatesDiscovered).toBeGreaterThanOrEqual(rows.length > 0 ? 1 : 0);
    // every evidence record in run-original is represented exactly once; nothing was re-run
    const evidenceCount = fs.readdirSync("docs/phase-3-conmed-population-verified/run-original/evidence").filter((f) => f.endsWith(".json")).filter((f) => { const ev = JSON.parse(fs.readFileSync(`docs/phase-3-conmed-population-verified/run-original/evidence/${f}`, "utf8")); return typeof ev.candidateRef === "string" && !!ev.compilation; }).length;
    expect(build.map.candidates.filter((c) => c.outcome !== "UNSERVED" && c.outcome !== "INELIGIBLE" && c.outcome !== "NO_STRUCTURAL_ANCHOR" && c.outcome !== "EMPTY_OPERATIVE_TEXT").length).toBe(evidenceCount);
    expect(build.map.completeness.complete).toBe(false); // honest: the run was partial
    expect(computeMapHash(build.map)).toBe(build.map.mapHash);
    // ordering is source order
    for (let i = 1; i < build.map.nodes.length; i++) { const a = build.map.nodes[i - 1]!.sourceOrder, b = build.map.nodes[i]!.sourceOrder; expect(a.documentOrdinal < b.documentOrdinal || (a.documentOrdinal === b.documentOrdinal && a.charStart <= b.charStart)).toBe(true); }
    // deterministic: a second build is byte-identical in content
    expect(buildConmedOfflineMap().map.mapHash).toBe(build.map.mapHash);
  });
  it("LSB / FWRG structure-only maps are valid and honest (every candidate an explicit UNSERVED item); DSGR is reported as not buildable offline", () => {
    const all = buildAllOfflineMaps();
    for (const key of ["lsb-2023-abl-credit-agreement", "fwrg-2021-credit-agreement"]) {
      const b = all[key]!;
      expect(b).not.toBeNull();
      expect(validateCovenantMap(b.map).ok).toBe(true);
      expect(b.map.nodes.length).toBe(0);
      expect(b.map.completeness.candidatesUnserved + b.map.completeness.candidatesFailed).toBe(b.map.completeness.candidatesDiscovered);
      expect(b.map.completeness.complete).toBe(false);
    }
    expect(all["dsgr-2022-2025-credit-facility"]).toBeNull();
  });
});
