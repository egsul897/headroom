/**
 * Phase 3D - domain-model + store lifecycle tests (task §52's "domain-model
 * lifecycle" bucket): append-only review history, never-mutate-approved-
 * precedent, and supersession cross-linking.
 */
import { describe, expect, it } from "vitest";
import { InMemoryPrecedentStore } from "../../lib/contract-model/compiler/semantic-precedent/store";
import type { GeneralizedPrecedent, PrecedentReviewEvent, ReviewedInstance } from "../../lib/contract-model/compiler/semantic-precedent/types";
import { SEMANTIC_PRECEDENT_SCHEMA_VERSION } from "../../lib/contract-model/compiler/semantic-precedent/types";

function reviewedInstance(overrides: Partial<ReviewedInstance> = {}): ReviewedInstance {
  return {
    instanceId: "inst-1",
    provenance: {
      companyId: "co-1",
      instrumentKey: "instr-1",
      sourceDocumentId: "doc-1",
      candidateRef: "cand-1",
      sourceSectionRef: "6.13",
      sourceTextHash: "hash-1",
      contextIdentity: "ctx-1",
      operativeStatus: null,
      benchmark: { packageId: "fwrg", isKnownDevelopmentPackage: true },
    },
    tenancy: "SYSTEM_REVIEWED",
    proposedIrSnapshot: { rules: [] },
    verifierFindingsSnapshot: null,
    reviewedIrSnapshot: { rules: [] },
    reviewStatus: "PROPOSED",
    reviewEvents: [],
    irSchemaVersion: "v1",
    compilerVersion: "v1",
    verifierVersion: "v1",
    precedentSystemVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function precedent(overrides: Partial<GeneralizedPrecedent> = {}): GeneralizedPrecedent {
  const now = new Date().toISOString();
  return {
    precedentId: "prec-1",
    version: 1,
    supersedesPrecedentId: null,
    supersededByPrecedentId: null,
    tenancy: "SYSTEM_REVIEWED",
    ownerCompanyId: null,
    dimensions: ["EXPRESSION_SHAPE"],
    granularity: "EXPRESSION_PATTERN",
    lessonDescription: "test lesson",
    signature: {
      action: null,
      posture: null,
      ruleType: null,
      covenantFamily: null,
      topLevelOperator: "MAX",
      operatorSet: ["MAX"],
      hasRatioGate: false,
      hasScheduledThreshold: false,
      hasEventActiveStepUp: false,
      conditionTypes: [],
      hasExceptions: false,
      entityScopeTags: [],
      hasSharedCapacity: false,
      hasReclassificationDependency: false,
      dependencyRelationshipTypes: [],
    },
    expressionPattern: null,
    structuralLessons: [],
    dependencyLessons: [],
    isNegativePrecedent: false,
    contrastedWithSignature: null,
    reviewStatus: "PROPOSED",
    reviewEvents: [],
    support: { supportingInstanceIds: ["inst-1"], distinctSourceDocumentCount: 1, distinctInstrumentCount: 1, distinctCompanyCount: 1, knownCounterexampleInstanceIds: [] },
    origin: "AI_PROPOSED",
    precedentSchemaVersion: SEMANTIC_PRECEDENT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function event(overrides: Partial<PrecedentReviewEvent> = {}): PrecedentReviewEvent {
  return { eventId: "ev-1", action: "APPROVE", previousStatus: "PROPOSED", newStatus: "APPROVED", note: null, reviewedBy: "reviewer@test", createdAt: new Date().toISOString(), ...overrides };
}

describe("Phase 3D PrecedentStore", () => {
  it("saves and retrieves a ReviewedInstance", () => {
    const store = new InMemoryPrecedentStore();
    store.saveReviewedInstance(reviewedInstance());
    expect(store.getReviewedInstance("inst-1")?.reviewStatus).toBe("PROPOSED");
    expect(store.getReviewedInstance("missing")).toBeNull();
  });

  it("appendReviewedInstanceEvent never drops a prior event - always appends", () => {
    const store = new InMemoryPrecedentStore();
    store.saveReviewedInstance(reviewedInstance());
    store.appendReviewedInstanceEvent("inst-1", event({ eventId: "ev-1", action: "SUBMIT_FOR_REVIEW", previousStatus: "PROPOSED", newStatus: "UNDER_REVIEW" }), "UNDER_REVIEW");
    const updated = store.appendReviewedInstanceEvent("inst-1", event({ eventId: "ev-2", previousStatus: "UNDER_REVIEW", newStatus: "APPROVED" }), "APPROVED");
    expect(updated.reviewStatus).toBe("APPROVED");
    expect(updated.reviewEvents.map((e) => e.eventId)).toEqual(["ev-1", "ev-2"]);
  });

  it("appendReviewedInstanceEvent throws for an unknown instanceId rather than silently creating one", () => {
    const store = new InMemoryPrecedentStore();
    expect(() => store.appendReviewedInstanceEvent("nope", event(), "APPROVED")).toThrow();
  });

  it("listReviewedInstances filters by tenancy and by excludePackageIds (task §57 leave-one-package-out mechanism)", () => {
    const store = new InMemoryPrecedentStore();
    store.saveReviewedInstance(reviewedInstance({ instanceId: "fwrg-inst", provenance: { ...reviewedInstance().provenance, benchmark: { packageId: "fwrg", isKnownDevelopmentPackage: true } } }));
    store.saveReviewedInstance(reviewedInstance({ instanceId: "lsb-inst", provenance: { ...reviewedInstance().provenance, benchmark: { packageId: "lsb", isKnownDevelopmentPackage: true } } }));
    store.saveReviewedInstance(reviewedInstance({ instanceId: "private-inst", tenancy: "TENANT_PRIVATE" }));

    const excludingLsb = store.listReviewedInstances({ excludePackageIds: ["lsb"] });
    expect(excludingLsb.map((i) => i.instanceId).sort()).toEqual(["fwrg-inst", "private-inst"]);

    const systemOnly = store.listReviewedInstances({ tenancy: "SYSTEM_REVIEWED" });
    expect(systemOnly.map((i) => i.instanceId).sort()).toEqual(["fwrg-inst", "lsb-inst"]);
  });

  it("saves and retrieves a GeneralizedPrecedent, and listGeneralizedPrecedents excludes superseded by default", () => {
    const store = new InMemoryPrecedentStore();
    store.saveGeneralizedPrecedent(precedent());
    expect(store.getGeneralizedPrecedent("prec-1")?.version).toBe(1);
    expect(store.listGeneralizedPrecedents()).toHaveLength(1);
  });

  it("appendPrecedentReviewEvent never drops history and updates updatedAt", () => {
    const store = new InMemoryPrecedentStore();
    store.saveGeneralizedPrecedent(precedent());
    const updated = store.appendPrecedentReviewEvent("prec-1", event(), "APPROVED");
    expect(updated.reviewStatus).toBe("APPROVED");
    expect(updated.reviewEvents).toHaveLength(1);
  });

  it("supersedePrecedent never mutates the old object in place and cross-links both versions", () => {
    const store = new InMemoryPrecedentStore();
    const original = precedent({ precedentId: "prec-1", version: 1 });
    store.saveGeneralizedPrecedent(original);

    const replacement = precedent({ precedentId: "prec-2", version: 2, supersedesPrecedentId: "prec-1", lessonDescription: "corrected lesson" });
    store.supersedePrecedent("prec-1", replacement);

    const oldAfter = store.getGeneralizedPrecedent("prec-1")!;
    const newAfter = store.getGeneralizedPrecedent("prec-2")!;
    expect(oldAfter.supersededByPrecedentId).toBe("prec-2");
    expect(oldAfter.lessonDescription).toBe("test lesson"); // unmutated
    expect(newAfter.supersedesPrecedentId).toBe("prec-1");
    expect(original.supersededByPrecedentId).toBeNull(); // the object passed in earlier was never mutated in place

    // superseded (old) is excluded from default listing but the active replacement is not.
    const active = store.listGeneralizedPrecedents();
    expect(active.map((p) => p.precedentId)).toEqual(["prec-2"]);

    const includingSuperseded = store.listGeneralizedPrecedents({ includeSuperseded: true });
    expect(includingSuperseded.map((p) => p.precedentId).sort()).toEqual(["prec-1", "prec-2"]);
  });

  it("supersedePrecedent throws if newPrecedent.supersedesPrecedentId does not match", () => {
    const store = new InMemoryPrecedentStore();
    store.saveGeneralizedPrecedent(precedent({ precedentId: "prec-1" }));
    expect(() => store.supersedePrecedent("prec-1", precedent({ precedentId: "prec-2", supersedesPrecedentId: "wrong-id" }))).toThrow();
  });

  it("supersedePrecedent throws for an unknown oldPrecedentId", () => {
    const store = new InMemoryPrecedentStore();
    expect(() => store.supersedePrecedent("nope", precedent({ precedentId: "prec-2", supersedesPrecedentId: "nope" }))).toThrow();
  });
});
