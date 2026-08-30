/**
 * Phase 3F.1.6 Final Foundation Certification - Section 13: Tenant Isolation
 * Certification.
 *
 * INDEPENDENT AUDITOR test suite against real Postgres. Two synthetic
 * companies (Alpha/Beta) with DELIBERATELY COLLIDING document names, section
 * refs, stableKeys, defined-term text, and content hashes are created, then
 * every major foundation data path is checked for cross-tenant visibility or
 * dedup. Cleans up all rows it creates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeContentHash } from "../../lib/connectors/dedup";
import { validateTenantIsolation } from "../../lib/contract-model/validators";
import { computeCacheKey, InMemorySemanticCompilationCache } from "../../lib/contract-model/compiler/semantic/cache";
import { recordClaimReview, checkExplicitSafeFailure } from "../../lib/contract-model/compiler/safe-failure/service";
import { InMemoryPrecedentStore } from "../../lib/contract-model/compiler/semantic-precedent/store";
import type { GeneralizedPrecedent } from "../../lib/contract-model/compiler/semantic-precedent/types";
import type { ClaimReviewItemInput } from "../../lib/contract-model/compiler/safe-failure/types";

const CO_ALPHA = "audit-s13-tenant-alpha";
const CO_BETA = "audit-s13-tenant-beta";

// Deliberately IDENTICAL across both tenants - the whole point of this suite.
const COLLIDING_DOC_NAME = "Amended and Restated Credit Agreement";
const COLLIDING_SECTION_REF = "Section 6.01";
const COLLIDING_STABLE_KEY = "colliding-stable-key-both-tenants";
const COLLIDING_TERM_TEXT = "Payment Conditions";
const COLLIDING_CLAIM_KEY = "colliding-claim-key-both-tenants-adversarial";
const COLLIDING_BYTES = Buffer.from("COLLIDING CONTENT ACROSS TWO TENANTS. Section 6.01. Byte-identical on purpose.");

async function teardown() {
  for (const companyId of [CO_ALPHA, CO_BETA]) {
    await prisma.claimReviewObservation.deleteMany({ where: { reviewItem: { companyId } } }).catch(() => {});
    await prisma.claimReviewDecision.deleteMany({ where: { reviewItem: { companyId } } }).catch(() => {});
    await prisma.claimReviewItem.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.contractReferenceEdge.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.definedTermNode.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.contractRule.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.documentNode.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.sourceArtifact.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.companySourceConnection.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.document.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
  }
}

describe("Section 13: Tenant Isolation Certification (independent auditor evidence)", () => {
  let docAlpha: { id: string };
  let docBeta: { id: string };

  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: CO_ALPHA, name: "Audit S13 Tenant Alpha (certification, test-only)" } });
    await prisma.company.create({ data: { id: CO_BETA, name: "Audit S13 Tenant Beta (certification, test-only)" } });

    docAlpha = await prisma.document.create({ data: { companyId: CO_ALPHA, name: COLLIDING_DOC_NAME, type: "CREDIT_AGREEMENT" } });
    docBeta = await prisma.document.create({ data: { companyId: CO_BETA, name: COLLIDING_DOC_NAME, type: "CREDIT_AGREEMENT" } });
  });

  afterAll(async () => {
    await teardown();
  });

  describe("13.1 Documents / structural nodes: colliding names, section refs, and stableKeys must NOT merge or leak", () => {
    it("two tenants can both own a Document with the IDENTICAL name, as two genuinely separate rows", async () => {
      expect(docAlpha.id).not.toBe(docBeta.id);
      const rows = await prisma.document.findMany({ where: { name: COLLIDING_DOC_NAME } });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.companyId))).toEqual(new Set([CO_ALPHA, CO_BETA]));
    });

    it("two tenants can both persist a DocumentNode with the IDENTICAL (stableKey, sectionRef) pair - the @@unique([companyId, stableKey]) scoping must allow this, never merge them, and a companyId-scoped query must never return the other tenant's row", async () => {
      const nodeAlpha = await prisma.documentNode.create({
        data: { companyId: CO_ALPHA, documentId: docAlpha.id, stableKey: COLLIDING_STABLE_KEY, nodeType: "SECTION", sectionRef: COLLIDING_SECTION_REF, heading: "Indebtedness" },
      });
      const nodeBeta = await prisma.documentNode.create({
        data: { companyId: CO_BETA, documentId: docBeta.id, stableKey: COLLIDING_STABLE_KEY, nodeType: "SECTION", sectionRef: COLLIDING_SECTION_REF, heading: "Indebtedness" },
      });
      expect(nodeAlpha.id).not.toBe(nodeBeta.id);

      const alphaScoped = await prisma.documentNode.findMany({ where: { companyId: CO_ALPHA, stableKey: COLLIDING_STABLE_KEY } });
      const betaScoped = await prisma.documentNode.findMany({ where: { companyId: CO_BETA, stableKey: COLLIDING_STABLE_KEY } });
      expect(alphaScoped).toHaveLength(1);
      expect(betaScoped).toHaveLength(1);
      expect(alphaScoped[0]!.id).toBe(nodeAlpha.id);
      expect(betaScoped[0]!.id).toBe(nodeBeta.id);

      // The unique constraint is (companyId, stableKey), NOT stableKey alone -
      // proven by the fact both creates above succeeded without a P2002.
      const globalCount = await prisma.documentNode.count({ where: { stableKey: COLLIDING_STABLE_KEY } });
      expect(globalCount).toBe(2);
    });

    it("defined-term text collision ('Payment Conditions' in both tenants) produces two independent DefinedTermNode rows, never merged into one", async () => {
      const termAlpha = await prisma.definedTermNode.create({
        data: { companyId: CO_ALPHA, documentId: docAlpha.id, stableKey: "term-payment-conditions", termName: COLLIDING_TERM_TEXT, normalizedName: "payment conditions" },
      });
      const termBeta = await prisma.definedTermNode.create({
        data: { companyId: CO_BETA, documentId: docBeta.id, stableKey: "term-payment-conditions", termName: COLLIDING_TERM_TEXT, normalizedName: "payment conditions" },
      });
      expect(termAlpha.id).not.toBe(termBeta.id);

      const crossQuery = await prisma.definedTermNode.findMany({ where: { companyId: CO_ALPHA, normalizedName: "payment conditions" } });
      expect(crossQuery).toHaveLength(1);
      expect(crossQuery[0]!.id).toBe(termAlpha.id); // never Beta's row leaking into an Alpha-scoped query
    });
  });

  describe("13.2 ContractReferenceEdge tenant isolation: validateTenantIsolation covers TARGET-direction fields; SOURCE-direction fields remain a disclosed, confirmed-still-open gap (P1-2)", () => {
    it("validateTenantIsolation DETECTS a cross-tenant TARGET reference (targetTermId pointing at the other company's DefinedTermNode)", async () => {
      const termBeta = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: CO_BETA, normalizedName: "payment conditions" } });
      const ruleAlpha = await prisma.contractRule.create({
        data: { companyId: CO_ALPHA, sourceDocumentId: docAlpha.id, sourceSectionRef: COLLIDING_SECTION_REF, stableKey: "s13-rule-alpha-1", covenantFamily: "INDEBTEDNESS", ruleType: "PROHIBITION", evaluationClass: "EXECUTABLE", action: "incur" },
      });
      // Adversarially constructed: an Alpha-owned edge whose targetTermId
      // names Beta's own term row - a genuine cross-tenant leak vector if
      // unchecked.
      await prisma.contractReferenceEdge.create({
        data: { companyId: CO_ALPHA, sourceRuleId: ruleAlpha.id, referenceType: "DEFINED_IN", referenceText: COLLIDING_TERM_TEXT, targetType: "DEFINED_TERM", targetTermId: termBeta.id, resolved: true },
      });

      const report = await validateTenantIsolation(CO_ALPHA, CO_BETA);
      expect(report.ok).toBe(false);
      expect(report.issues.some((i) => i.message.includes("targeting Company") && i.message.includes(CO_BETA))).toBe(true);
    });

    it("AUDITOR FINDING (confirms disclosed gap still present, not silently regressed further nor silently claimed fixed): validateTenantIsolation does NOT detect a cross-tenant SOURCE reference (sourceRuleId pointing at the other company's ContractRule)", async () => {
      const ruleBeta = await prisma.contractRule.create({
        data: { companyId: CO_BETA, sourceDocumentId: docBeta.id, sourceSectionRef: COLLIDING_SECTION_REF, stableKey: "s13-rule-beta-1", covenantFamily: "INDEBTEDNESS", ruleType: "PROHIBITION", evaluationClass: "EXECUTABLE", action: "incur" },
      });
      const ruleAlpha = await prisma.contractRule.findFirstOrThrow({ where: { companyId: CO_ALPHA, stableKey: "s13-rule-alpha-1" } });

      // Adversarially construct an edge whose OWNING companyId is Alpha but
      // whose sourceRuleId points into Beta's own rule - the exact shape the
      // codebase's own comment (lib/contract-model/validators.ts, P1-2
      // remediation) says is NOT checked, on the stated theory that
      // persistence.ts can never actually produce this shape in practice.
      // This test constructs it directly at the DB layer (bypassing
      // persistence.ts) purely to test whether the SCHEMA/validator would
      // catch it if it ever did happen - the point of the phase's own
      // instruction to test this adversarially even though it "shouldn't"
      // occur through normal application code.
      const edge = await prisma.contractReferenceEdge.create({
        data: { companyId: CO_ALPHA, sourceRuleId: ruleBeta.id, referenceType: "DEFINED_IN", referenceText: "adversarial source-direction leak", targetType: "UNRESOLVED", unresolvedReason: "auditor fixture - source-direction leak only, no target needed", resolved: false },
      });

      const report = await validateTenantIsolation(CO_ALPHA, CO_BETA);
      // This assertion documents the CONFIRMED, DISCLOSED, STILL-OPEN gap:
      // the validator's own report does NOT flag this edge, because it only
      // checks target-direction fields. If this assertion ever starts
      // failing (report catches it), the gap has been silently closed
      // without updating the disclosure - or the report now contains
      // unrelated issues that happen to coincidentally match; either way
      // that would be a discrepancy worth re-auditing.
      const flagsThisEdge = report.issues.some((i) => i.message.includes("sourceRuleId") || i.message.toLowerCase().includes("source"));
      expect(flagsThisEdge).toBe(false);

      // Sanity-check the adversarial row genuinely persisted with the
      // mismatched companyId/sourceRuleId shape (Prisma's own FK constraint
      // on ContractReferenceEdge.sourceRuleId only requires the RULE to
      // exist somewhere, not that it share companyId - confirmed here).
      const stored = await prisma.contractReferenceEdge.findUniqueOrThrow({ where: { id: edge.id } });
      expect(stored.companyId).toBe(CO_ALPHA);
      const ruleOwner = await prisma.contractRule.findUniqueOrThrow({ where: { id: stored.sourceRuleId! } });
      expect(ruleOwner.companyId).toBe(CO_BETA); // genuinely cross-tenant at the raw-row level, unflagged by the validator
    });
  });

  describe("13.3 Ingestion dedup: byte-identical content across two tenants must NOT merge", () => {
    it("same contentHash, two different companies -> two separate SourceArtifact rows, no cross-tenant findUnique hit", async () => {
      const hash = computeContentHash(COLLIDING_BYTES);
      const connAlpha = await prisma.companySourceConnection.create({ data: { companyId: CO_ALPHA, connectorType: "DOCUMENT_UPLOAD", provider: "test", status: "CONNECTED", capabilities: ["DOCUMENTS"] } });
      const connBeta = await prisma.companySourceConnection.create({ data: { companyId: CO_BETA, connectorType: "DOCUMENT_UPLOAD", provider: "test", status: "CONNECTED", capabilities: ["DOCUMENTS"] } });

      const artifactAlpha = await prisma.sourceArtifact.create({ data: { companyId: CO_ALPHA, sourceConnectionId: connAlpha.id, artifactType: "DOCUMENT", contentHash: hash, retrievedAt: new Date(), documentId: docAlpha.id } });
      const artifactBeta = await prisma.sourceArtifact.create({ data: { companyId: CO_BETA, sourceConnectionId: connBeta.id, artifactType: "DOCUMENT", contentHash: hash, retrievedAt: new Date(), documentId: docBeta.id } });
      expect(artifactAlpha.id).not.toBe(artifactBeta.id);

      // The dedup lookup itself (findUnique on the compound key) must never
      // cross tenants - this IS the actual function ingestion code calls.
      const { findDuplicateArtifact } = await import("../../lib/connectors/dedup");
      const foundForAlpha = await findDuplicateArtifact(CO_ALPHA, hash);
      const foundForBeta = await findDuplicateArtifact(CO_BETA, hash);
      expect(foundForAlpha!.id).toBe(artifactAlpha.id);
      expect(foundForBeta!.id).toBe(artifactBeta.id);

      const globalCount = await prisma.sourceArtifact.count({ where: { contentHash: hash } });
      expect(globalCount).toBe(2); // same hash, but never fewer than one row per tenant
    });
  });

  describe("13.4 Semantic compiler cache: tenant-aware cache key (P1-1)", () => {
    function fakeCompilerInput(companyId: string, instrumentKey: string, sourceDocumentId: string): Parameters<typeof computeCacheKey>[0] {
      return {
        companyId,
        instrumentKey,
        sourceDocumentId,
        candidateRef: "collision-candidate-ref",
        operativeSourceText: "collision operative source text",
        contextBundle: { contentIdentity: "collision-content-identity" },
        operativeLineage: null,
        irSchemaVersion: "v1",
        compilerAlgorithmVersion: "v1",
        compilerPromptVersion: "v1",
        toolPolicyVersion: "v1",
      } as unknown as Parameters<typeof computeCacheKey>[0];
    }

    it("computeCacheKey produces DIFFERENT keys for two different companies given IDENTICAL instrumentKey/sourceDocumentId/provider inputs", () => {
      const baseInput = fakeCompilerInput(CO_ALPHA, "collision-instrument-key", "collision-source-doc-id");
      const keyAlpha = computeCacheKey(baseInput, "provider-x@v1");
      const keyBeta = computeCacheKey({ ...baseInput, companyId: CO_BETA }, "provider-x@v1");
      expect(keyAlpha).not.toBe(keyBeta);
    });

    it("a real InMemorySemanticCompilationCache instance never returns Company A's cached result for Company B's identical-looking key inputs", () => {
      const cache = new InMemorySemanticCompilationCache();
      const baseInput = fakeCompilerInput(CO_ALPHA, "collision-instrument-key-2", "collision-source-doc-id-2");
      const keyAlpha = computeCacheKey(baseInput, "provider-x@v1");
      const keyBeta = computeCacheKey({ ...baseInput, companyId: CO_BETA }, "provider-x@v1");

      const fakeResultAlpha = { marker: "ALPHA_ONLY_RESULT" } as unknown as Parameters<typeof cache.set>[1];
      cache.set(keyAlpha, fakeResultAlpha);

      expect(cache.get(keyBeta)).toBeNull(); // Beta's key never resolves to Alpha's cached entry
      expect(cache.get(keyAlpha)).toBe(fakeResultAlpha);
    });
  });

  describe("13.5 ClaimReviewItem family: schema-level per-tenant scoping of the NEW safe-failure model", () => {
    function claimInput(companyId: string, documentId: string, claimKey: string): ClaimReviewItemInput {
      return {
        companyId,
        packageKey: null,
        instrumentKey: null,
        documentId,
        claimKey,
        structuralNodeId: null,
        sectionRef: COLLIDING_SECTION_REF,
        charStart: null,
        charEnd: null,
        covenantFamily: null,
        materiality: "MATERIAL",
        reasonCode: "SEMANTIC_AMBIGUITY",
        unresolvedDimensions: ["threshold"],
        originStage: "SEMANTIC_COMPILER",
        sourceEvidence: "adversarial cross-tenant claimKey collision fixture",
        sourceCitation: null,
        relatedSemanticObjectId: null,
        operativeVersionRef: null,
        rationale: "Section 13.5 adversarial cross-tenant claimKey collision test.",
        algorithmVersion: "audit-v1",
      };
    }

    it("two tenants recording the SAME adversarially-constructed claimKey string produce TWO SEPARATE ClaimReviewItem rows (schema enforces @@unique([companyId, claimKey]), never a bare unique on claimKey)", async () => {
      const resultAlpha = await recordClaimReview(claimInput(CO_ALPHA, docAlpha.id, COLLIDING_CLAIM_KEY));
      const resultBeta = await recordClaimReview(claimInput(CO_BETA, docBeta.id, COLLIDING_CLAIM_KEY));
      expect(resultAlpha.outcome).toBe("CREATED");
      expect(resultBeta.outcome).toBe("CREATED"); // if the constraint were a bare unique on claimKey, this second CREATE would P2002 or silently merge
      expect(resultAlpha.reviewItemId).not.toBe(resultBeta.reviewItemId);

      const rows = await prisma.claimReviewItem.findMany({ where: { claimKey: COLLIDING_CLAIM_KEY } });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((r) => r.companyId))).toEqual(new Set([CO_ALPHA, CO_BETA]));

      // Confirm the DB-level constraint itself is compound: a THIRD create
      // attempt for the SAME (companyId, claimKey) as Alpha's existing row
      // must be rejected at the DB layer, not merely deduped by application
      // logic that could be bypassed.
      await expect(
        prisma.claimReviewItem.create({
          data: {
            companyId: CO_ALPHA,
            documentId: docAlpha.id,
            claimKey: COLLIDING_CLAIM_KEY,
            materiality: "MATERIAL",
            status: "OPEN_REVIEW",
            reasonCode: "SEMANTIC_AMBIGUITY",
            unresolvedDimensions: [],
            originStage: "SEMANTIC_COMPILER",
            sourceEvidence: "raw duplicate insert bypassing recordClaimReview",
            rationale: "DB-level uniqueness bypass attempt",
            algorithmVersion: "audit-v1",
          },
        })
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("checkExplicitSafeFailure(companyId, claimKey) NEVER cross-matches the wrong tenant's row for the identical claimKey string", async () => {
      const checkAlpha = await checkExplicitSafeFailure(CO_ALPHA, COLLIDING_CLAIM_KEY, true);
      const checkBeta = await checkExplicitSafeFailure(CO_BETA, COLLIDING_CLAIM_KEY, true);

      expect(checkAlpha.claimSpecificReviewEventExists).toBe(true);
      expect(checkBeta.claimSpecificReviewEventExists).toBe(true);
      expect(checkAlpha.matchedReviewItemId).not.toBe(checkBeta.matchedReviewItemId);

      const rowAlpha = await prisma.claimReviewItem.findUniqueOrThrow({ where: { companyId_claimKey: { companyId: CO_ALPHA, claimKey: COLLIDING_CLAIM_KEY } } });
      const rowBeta = await prisma.claimReviewItem.findUniqueOrThrow({ where: { companyId_claimKey: { companyId: CO_BETA, claimKey: COLLIDING_CLAIM_KEY } } });
      expect(checkAlpha.matchedReviewItemId).toBe(rowAlpha.id);
      expect(checkBeta.matchedReviewItemId).toBe(rowBeta.id);

      // A completely unrelated third companyId (never created) must report
      // no match at all for this claimKey - never a false positive.
      const checkGhost = await checkExplicitSafeFailure("audit-s13-nonexistent-ghost-company", COLLIDING_CLAIM_KEY, true);
      expect(checkGhost.claimSpecificReviewEventExists).toBe(false);
      expect(checkGhost.matchedReviewItemId).toBeNull();
    });
  });

  describe("13.6 Precedent access (Phase 3D GeneralizedPrecedent/ReviewedInstance): TENANT_PRIVATE isolation in the in-memory store's filter logic", () => {
    // NOTE (disclosed, matches docs/phase-3f1-5-r-residual-foundation/22-
    // remaining-foundation-risks.json's own "not yet wired into any live
    // app/route" disclosure): this store is in-memory only, not Postgres-
    // backed, and no production caller currently supplies viewerCompanyId
    // (confirmed by grep - zero references outside store.ts itself and its
    // own tests). This test certifies the ISOLATION LOGIC ITSELF is sound,
    // not that it is currently exercised in a live request path.
    it("a TENANT_PRIVATE precedent owned by Alpha is invisible to a Beta-scoped query, even with an identical signature/lesson collision", () => {
      const store = new InMemoryPrecedentStore();
      const base = {
        version: 1,
        supersedesPrecedentId: null,
        supersededByPrecedentId: null,
        dimensions: ["EXPRESSION_PATTERN"],
        granularity: "EXPRESSION_PATTERN",
        lessonDescription: "COLLIDING LESSON TEXT: a trailing proviso applies to every preceding sub-clause.",
        signature: { kind: "collision-signature" },
        expressionPattern: null,
        structuralLessons: [],
        dependencyLessons: [],
        isNegativePrecedent: false,
        contrastedWithSignature: null,
        reviewStatus: "APPROVED",
        reviewEvents: [],
        support: { instanceCount: 1, knownCounterexampleInstanceIds: [] },
        origin: "HUMAN_AUTHORED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as Omit<GeneralizedPrecedent, "precedentId" | "tenancy" | "ownerCompanyId">;

      const precedentAlpha: GeneralizedPrecedent = { ...base, precedentId: "precedent-alpha-private", tenancy: "TENANT_PRIVATE", ownerCompanyId: CO_ALPHA };
      const precedentBeta: GeneralizedPrecedent = { ...base, precedentId: "precedent-beta-private", tenancy: "TENANT_PRIVATE", ownerCompanyId: CO_BETA };
      store.saveGeneralizedPrecedent(precedentAlpha);
      store.saveGeneralizedPrecedent(precedentBeta);

      const visibleToBeta = store.listGeneralizedPrecedents({ viewerCompanyId: CO_BETA });
      expect(visibleToBeta.map((p) => p.precedentId)).toEqual(["precedent-beta-private"]);
      expect(visibleToBeta.some((p) => p.precedentId === "precedent-alpha-private")).toBe(false);

      // Omitting viewerCompanyId entirely is the SAFE default - excludes
      // every TENANT_PRIVATE precedent from both tenants, never "return all."
      const visibleToNoOne = store.listGeneralizedPrecedents({});
      expect(visibleToNoOne).toHaveLength(0);
    });
  });
});
