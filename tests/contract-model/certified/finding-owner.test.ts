/** Verifier owner normalization - the two real P-1 shapes from the CONMED population and the negative controls. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { normalizeFindingOwner, resolveIrPathOwners } from "../../../lib/contract-model/compiler/semantic-verification/finding-owner";

const units = { rules: [{ ruleId: "ir-rule:a405f15ff65be5cd92c63260" }], definitions: [] };
const two = { rules: [{ ruleId: "ir-rule:73c5929d27f194e844bc93bb" }, { ruleId: "ir-rule:7850f7d8bc730ce6ebf96623" }], definitions: [{ definitionId: "ir-definition:0123456789ab" }] };

describe("normalizeFindingOwner", () => {
  it("7.16(a): 'rule[r1].condition[1]' with irPath rules[0].conditions[1].expression is REPAIRED to the one real unit", () => {
    const n = normalizeFindingOwner({ ruleOrDefinitionId: "rule[r1].condition[1]", irPath: "rules[0].conditions[1].expression" }, units);
    expect(n).toMatchObject({ ownerId: "ir-rule:a405f15ff65be5cd92c63260", scope: "UNIT", repair: "VERIFIER_OWNER_REPAIRED_FROM_IR_PATH", resolvedUnitIds: ["ir-rule:a405f15ff65be5cd92c63260"] });
  });
  it("7.6(b): two comma-joined real ids with a two-path irPath -> null owner, UNIT scope, AMBIGUOUS_MULTI_UNIT (never fabricated)", () => {
    const n = normalizeFindingOwner({ ruleOrDefinitionId: "ir-rule:73c5929d27f194e844bc93bb, ir-rule:7850f7d8bc730ce6ebf96623", irPath: "rules[0].capacityExpression; rules[1].capacityExpression" }, two);
    expect(n).toMatchObject({ ownerId: null, scope: "UNIT", repair: "VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT" });
    expect(n.resolvedUnitIds.sort()).toEqual(["ir-rule:73c5929d27f194e844bc93bb", "ir-rule:7850f7d8bc730ce6ebf96623"]);
  });
  it("exact ids are kept; null is candidate-level; an invalid id with an unresolvable path is UNRESOLVED; a path to a definition repairs to the definition", () => {
    expect(normalizeFindingOwner({ ruleOrDefinitionId: "ir-rule:a405f15ff65be5cd92c63260", irPath: "rules[0]" }, units)).toMatchObject({ repair: "OWNER_EXACT", ownerId: "ir-rule:a405f15ff65be5cd92c63260" });
    expect(normalizeFindingOwner({ ruleOrDefinitionId: null, irPath: null }, units)).toMatchObject({ repair: "OWNER_NONE_CANDIDATE_LEVEL", scope: "CANDIDATE", ownerId: null });
    expect(normalizeFindingOwner({ ruleOrDefinitionId: "rule[r7]", irPath: "rules[9].capacityExpression" }, units)).toMatchObject({ repair: "VERIFIER_OWNER_UNRESOLVED", ownerId: null, scope: "CANDIDATE" });
    expect(normalizeFindingOwner({ ruleOrDefinitionId: "the-definition", irPath: "definitions[0].calculationExpression" }, two)).toMatchObject({ repair: "VERIFIER_OWNER_REPAIRED_FROM_IR_PATH", ownerId: "ir-definition:0123456789ab" });
    // a foreign real-looking id never resolves: nothing of this compilation is named
    expect(normalizeFindingOwner({ ruleOrDefinitionId: "ir-rule:ffffffffffffffffffffffff", irPath: null }, units)).toMatchObject({ repair: "VERIFIER_OWNER_UNRESOLVED", ownerId: null });
    expect(resolveIrPathOwners("rules[1].x; definitions[0].y; rules[7]", two).sort()).toEqual(["ir-definition:0123456789ab", "ir-rule:7850f7d8bc730ce6ebf96623"]);
  });
  it("the reviewer no longer passes the wire id through; the finding id is computed from the normalized owner", () => {
    const src = fs.readFileSync("lib/contract-model/compiler/semantic-verification/reviewer.ts", "utf8");
    expect(src).toMatch(/const owner = normalizeFindingOwner\(/);
    expect(src).toMatch(/ruleOrDefinitionId: owner\.ownerId,/);
    expect(src).not.toMatch(/^\s+ruleOrDefinitionId: wire\.ruleOrDefinitionId,$/m);
  });
  it("regression against the preserved 7.16(a) and 7.6(b) evidence files", () => {
    const run = "docs/phase-3-conmed-population-verified/run-original";
    const manifest = JSON.parse(fs.readFileSync(`${run}/03-run-manifest.reconstructed.json`, "utf8"));
    for (const [ref, expected] of [["7.16(a)", "VERIFIER_OWNER_REPAIRED_FROM_IR_PATH"], ["7.6(b)", "VERIFIER_OWNER_AMBIGUOUS_MULTI_UNIT"]] as const) {
      const row = manifest.candidateStatuses.find((c: { ref: string }) => c.ref === ref);
      const ev = JSON.parse(fs.readFileSync(`${run}/evidence/${row.discoveryId}.json`, "utf8"));
      const bad = ev.verification.findings.find((f: { ruleOrDefinitionId: string | null }) => f.ruleOrDefinitionId && !ev.compilation.rules.some((r: { ruleId: string }) => r.ruleId === f.ruleOrDefinitionId));
      expect(bad).toBeDefined();
      expect(normalizeFindingOwner(bad, { rules: ev.compilation.rules, definitions: ev.compilation.definitions }).repair).toBe(expected);
    }
  });
});
