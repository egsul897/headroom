/**
 * UCD-1a — contractual financial definition representation + input readiness.
 * Pure lib tests; no provider calls; no dashboard authority claims.
 */
import { describe, expect, it } from "vitest";
import {
  buildDefinitionDependencyClosure,
  buildDefinitionInputManifest,
  contractualDefinitionFromIr,
  indexDefinitionsByTerm,
  inferMetricKindFromTermName,
} from "@/lib/contract-model/financial-definitions";
import { ADD, MONEY, TERM, UNSUP, definition } from "../runtime/helpers";

describe("UCD-1a financial definitions", () => {
  it("does not treat identically named metrics as the same kind across vague labels without match", () => {
    expect(inferMetricKindFromTermName("Consolidated EBITDA")).toBe("CONSOLIDATED_EBITDA");
    expect(inferMetricKindFromTermName("First Lien Debt")).toBe("FIRST_LIEN_DEBT");
    expect(inferMetricKindFromTermName("Bespoke Issuer Builder Credit")).toBe("OTHER_DEFINED_TERM");
  });

  it("preserves UNSUPPORTED adjustments from IR without inventing support", () => {
    const ir = definition(
      "ir-def:ebitda",
      "Consolidated EBITDA",
      ADD(MONEY(100), UNSUP("synergy addback not formalized")),
      "PARTIAL",
      ["synergy addback unsupported"],
    );
    ir.dependsOnTerms = ["Consolidated Net Income"];
    const def = contractualDefinitionFromIr(ir);
    expect(def.metricKind).toBe("CONSOLIDATED_EBITDA");
    expect(def.adjustments.some((a) => a.kind === "UNSUPPORTED")).toBe(true);
    expect(def.proFormaTreatment).toBe("UNSUPPORTED");
  });

  it("builds recursive dependency closure and refuses executability when deps missing", () => {
    const ebitda = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:ebitda", "Consolidated EBITDA", ADD(TERM("Consolidated Net Income"), MONEY(1)), "COMPLETE"), {
        dependsOnTerms: ["Consolidated Net Income"],
      }),
    );
    const closure = buildDefinitionDependencyClosure(ebitda, indexDefinitionsByTerm([ebitda]));
    expect(closure.unresolvedTerms).toContain("Consolidated Net Income");
    expect(closure.executable).toBe(false);
  });

  it("detects cycles fail-closed", () => {
    const a = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:a", "Term A", TERM("Term B"), "COMPLETE"), { dependsOnTerms: ["Term B"] }),
    );
    const b = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:b", "Term B", TERM("Term A"), "COMPLETE"), { dependsOnTerms: ["Term A"] }),
    );
    const closure = buildDefinitionDependencyClosure(a, indexDefinitionsByTerm([a, b]));
    expect(closure.cycles.length).toBeGreaterThan(0);
    expect(closure.executable).toBe(false);
  });

  it("classifies inputs and never authorizes evaluation when verified inputs missing", () => {
    const cni = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:cni", "Consolidated Net Income", MONEY(50), "COMPLETE"), { dependsOnTerms: [] }),
    );
    const ebitda = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:ebitda", "Consolidated EBITDA", ADD(TERM("Consolidated Net Income"), MONEY(1)), "COMPLETE"), {
        dependsOnTerms: ["Consolidated Net Income"],
      }),
    );
    const closure = buildDefinitionDependencyClosure(ebitda, indexDefinitionsByTerm([ebitda, cni]));
    expect(closure.executable).toBe(true);

    const missing = buildDefinitionInputManifest({ definition: ebitda, closure });
    expect(missing.mayEvaluateAuthoritatively).toBe(false);
    expect(missing.blockingReadiness).toContain("MISSING");

    const verified = buildDefinitionInputManifest({
      definition: ebitda,
      closure,
      known: [{ key: "Consolidated Net Income", readiness: "AVAILABLE_VERIFIED" }],
    });
    expect(verified.mayEvaluateAuthoritatively).toBe(true);
    expect(verified.requirements.every((r) => r.readiness === "AVAILABLE_VERIFIED")).toBe(true);
  });

  it("never treats AVAILABLE_UNVERIFIED as authoritative", () => {
    const cni = contractualDefinitionFromIr(definition("ir-def:cni", "Consolidated Net Income", MONEY(50), "COMPLETE"));
    const ebitda = contractualDefinitionFromIr(
      Object.assign(definition("ir-def:ebitda", "Consolidated EBITDA", TERM("Consolidated Net Income"), "COMPLETE"), {
        dependsOnTerms: ["Consolidated Net Income"],
      }),
    );
    const closure = buildDefinitionDependencyClosure(ebitda, indexDefinitionsByTerm([ebitda, cni]));
    const manifest = buildDefinitionInputManifest({
      definition: ebitda,
      closure,
      known: [{ key: "Consolidated Net Income", readiness: "AVAILABLE_UNVERIFIED" }],
    });
    expect(manifest.mayEvaluateAuthoritatively).toBe(false);
    expect(manifest.blockingReadiness).toContain("AVAILABLE_UNVERIFIED");
  });
});
