/**
 * CLI: committed seed provenance is accepted only when byte-identical to the re-derivation. A tampered or corrupt
 * file must not crash the scoreboard: it fails closed (learned rules earn no credit), prints the reason and the
 * no-rules score, and exits 4. Synthetic snapshot and rule only.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveSeedProvenance,
  rulesetIdentity,
  serializeSeedProvenance,
  snapshotIdentitySha256,
  sourceInputSha256,
  writeSnapshotBuffer,
  type ScoreboardSourceInput,
} from "@/lib/covenant-learning-factory/scoreboard";
import { normalizeLearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";

const CLAUSE = "Holdings may make Restricted Payments to its equity holders in an aggregate amount not to exceed $7,500,000 in any fiscal year.";
// The other issuer drafts the same clause as an enumerated item, so only the seed issuer's item starts with the seed text.
const src = (id: string, cik: string, label = ""): ScoreboardSourceInput =>
  ({
    source: { sourceId: id, contentSha256: `sha-${id}`, issuerCik: cik, ticker: null, title: "synthetic" },
    documentText: `ARTICLE IX MISCELLANEOUS\n\nSection 9.17 Tax Distributions. ${label}${CLAUSE}\n\nSection 9.18 Counterparts. This Agreement may be executed in counterparts.`,
    candidates: [{ candidateId: `${id}#c1`, sourceId: id, family: "RESTRICTED_PAYMENTS", sectionRef: null, excerpt: `${label}${CLAUSE}` }],
    definitions: [],
    conditions: [],
  }) as unknown as ScoreboardSourceInput;
const rules = normalizeLearnedRuleSet({
  schemaVersion: "clf-learned-rules/v1",
  rulesetVersion: 9,
  authorityStatus: "MECHANICALLY_REPLAYED_NOT_COUNSEL_VERIFIED",
  updatedAt: "1970-01-01T00:00:00.000Z",
  rules: [
    {
      ruleId: "lr:cli-seed",
      kind: "PHRASE_PATTERN",
      state: "MECHANICALLY_REPLAYED",
      flags: "i",
      version: 1,
      pattern: "Holdings\\s+may\\s+make\\s+Restricted\\s+Payments\\s+to\\s+its\\s+equity",
      effect: { family: "RESTRICTED_PAYMENTS" },
      provenance: { note: 'cluster size 1; seed="Holdings may make Restricted Payments to its equity holders in a"', epoch: 1 },
    },
  ],
} as never);

describe("scoreboard CLI seed provenance verification", () => {
  const dir = mkdtempSync(join(tmpdir(), "sb-prov-"));
  const sources = [src("fixture:zz-seed", "0000555"), src("edgar:other", "0000777", "(c) ")];
  const snapPath = join(dir, "snap.json.gz");
  writeFileSync(snapPath, writeSnapshotBuffer({ schema: "clf-scoreboard-snapshot/v1", capturedFrom: "synthetic", sources } as never));
  const rulesPath = join(dir, "rules.json");
  writeFileSync(rulesPath, JSON.stringify(rules));
  const derived = deriveSeedProvenance(rules, sources, {
    rulesetSha256: rulesetIdentity(rules).rulesetSha256,
    snapshotSha256: snapshotIdentitySha256(sources.map((s) => [s.source.sourceId, sourceInputSha256(s)] as const)),
  });
  const run = (provText: string) => {
    const provPath = join(dir, `prov-${provText.length}.json`);
    writeFileSync(provPath, provText);
    return spawnSync("npx", ["tsx", "scripts/covenant-learning-factory/scoreboard.ts", `--snapshot=${snapPath}`, `--rules-file=${rulesPath}`, `--seed-provenance=${provPath}`], { encoding: "utf8", timeout: 120_000 });
  };

  it("accepts the byte-identical file: the seed document is refused, the other issuer is credited", () => {
    const r = run(serializeSeedProvenance(derived));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SELF-CREDIT refused DEV=\{"SELF_SEEDED":1\} HELDOUT=\{\}/);
    expect(r.stdout).toMatch(/LEARNED_CROSS_ISSUER":1/);
  }, 120_000);

  it("tampered (seeds pointed elsewhere) or corrupt JSON: fails closed, prints the reason and NO-RULES, exits 4", () => {
    const tampered = serializeSeedProvenance(derived).split('"fixture:zz-seed"').join('"edgar:nowhere"');
    for (const text of [tampered, "{ this is not json"]) {
      const r = run(text);
      expect(r.status).toBe(4);
      expect(r.stderr).toMatch(/seed provenance unusable/);
      expect(r.stdout).toMatch(/NO-RULES HELDOUT/);
      expect(r.stdout).toMatch(/NO_PROVENANCE/);
      expect(r.stdout).not.toMatch(/LEARNED_CROSS_ISSUER/);
    }
  }, 240_000);
});
