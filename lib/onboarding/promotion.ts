/**
 * Transactional promotion (docs/company-onboarding-v1-implementation.md).
 *
 * The ONLY code in this codebase that writes to Permission/
 * PermissionRelationship/SharedCapacityConstraint/CollateralPool/
 * PermissionCollateralScope/RuleActivationCondition/ExternalInputRecord/
 * DefinedTerm FROM an ExtractionCandidate - and it only ever does so for
 * candidates a human has explicitly reviewed (reviewStatus IN (APPROVED,
 * EDITED)). PENDING/REVIEW_REQUIRED/REJECTED candidates are never touched -
 * there is no auto-approve path anywhere in this file.
 *
 * Fail-closed: a PERMISSION candidate whose EFFECTIVE value (reviewerEditedValue
 * ?? proposedValue) has modelingStatus === "KNOWN_NOT_MODELED" is NEVER
 * promoted to a real Permission row, even if a human marked it APPROVED/EDITED
 * (approving a gap-placeholder candidate means "yes, this really is an
 * unmodeled gap," not "model it"). It is excluded from promotion entirely, as
 * a documented gap - see computePromotionPlan's `skipped` output and the
 * post-promotion coverage-gate evaluation below, which is exactly how the
 * solver's existing NOT_TESTED/REVIEW_REQUIRED semantics already treat an
 * incomplete/absent SolverCoverageDeclaration (lib/solver/coverage.ts) -
 * no new gap logic is invented here.
 *
 * Two-phase design: `computePromotionPlan` is a PURE function (no DB writes)
 * that decides exactly what will be created/updated/skipped and why;
 * `promoteCompanyCandidates` executes that plan inside exactly one
 * `prisma.$transaction` call. This is what makes promotion genuinely
 * all-or-nothing - if the transaction throws partway through, Postgres rolls
 * back every write in it; a "skip" is a planning-time business decision
 * (documented, not a partial-transaction failure), never a half-applied write.
 */

import { Prisma, type ExtractionCandidate, type ExtractionCandidateKind, type GrantType, type OnboardingStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { VALUE_SCHEMA_BY_KIND } from "./review";
import { classifyCompanyCoverage } from "../solver/coverage";
import type { CoverageResult } from "../solver/types";
import { loadCompanySolverStaticData } from "../covenant-engine";
import { upsertFinancialFactsForDate } from "./financial";

const VALID_ENTITY_CLASS_TAGS = new Set(["BORROWER", "GUARANTOR_RS", "NON_GUARANTOR_RS", "FOREIGN_RS", "UNRESTRICTED_SUB", "SECURITIZATION_SUB", "IMMATERIAL_SUB"]);

export interface PromotionSkip {
  candidateId: string;
  kind: ExtractionCandidateKind;
  reason: string;
}

export interface PromotionResult {
  companyId: string;
  promotedCount: number;
  skipped: PromotionSkip[];
  coverageResults: CoverageResult[];
  onboardingStatus: OnboardingStatus;
}

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Resolves the value promotion actually reads: `reviewerEditedValue` when
 * present, `proposedValue` otherwise - independent of the candidate's
 * CURRENT reviewStatus (not just when it happens to equal "EDITED"), since a
 * candidate that was EDITED and later re-APPROVEd by a second reviewer must
 * still promote the edited figure, never silently revert to the AI's
 * original proposal. Re-validated against the kind's own schema (defense in
 * depth, same discipline as lib/extraction/run-stage.ts's own read-time
 * re-hydration).
 */
function resolveEffectiveValue(c: ExtractionCandidate): unknown | null {
  const raw = c.reviewerEditedValue ?? c.proposedValue;
  const schema = VALUE_SCHEMA_BY_KIND[c.kind];
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseDateOrNull(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Loads every promotable candidate for a company and executes the write plan
 * inside one transaction. Idempotent/incremental - only candidates with
 * `promotedAt IS NULL` are considered, so calling this again after further
 * review-and-approve activity only promotes what's newly ready, never
 * re-promotes or duplicates an already-promoted row.
 */
export async function promoteCompanyCandidates(companyId: string, asOfDate: Date = new Date()): Promise<PromotionResult> {
  const candidates = await prisma.extractionCandidate.findMany({
    where: { companyId, reviewStatus: { in: ["APPROVED", "EDITED"] }, promotedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const skipped: PromotionSkip[] = [];
  const promotions: { candidateId: string; promotedToId: string }[] = [];

  const result = await prisma.$transaction(async (tx) => {
    // Permission refs are resolved company-wide across this promotion batch
    // PLUS every Permission already promoted in a prior pass (matched by its
    // stored `code`, which is always set to the candidate's own permissionRef
    // at promotion time - see below) - this is how a RELATIONSHIP/
    // COLLATERAL_SCOPE candidate from a LATER extraction run can reference a
    // permission promoted from an EARLIER run/company-wide context, per
    // schemas.ts's own header comment on cross-run ref resolution.
    const refToPermissionId = new Map<string, string>();
    for (const p of await tx.permission.findMany({ where: { companyId, code: { not: null } }, select: { id: true, code: true } })) {
      if (p.code) refToPermissionId.set(p.code, p.id);
    }

    // -----------------------------------------------------------------------
    // 1. DOCUMENT_RELATIONSHIP - confirms Document.type/supersedesDocumentId.
    //    supersedesDocumentRef is a human-readable name (schemas.ts) resolved
    //    against this company's OTHER document names; unresolved is left null
    //    (never guessed) with a skip note attached to the candidate's own
    //    promotion outcome via documentUpdateNotes, but the type confirmation
    //    itself still proceeds (a missing supersession target should not
    //    block confirming the document's own type).
    // -----------------------------------------------------------------------
    const docRelCandidates = candidates.filter((c) => c.kind === "DOCUMENT_RELATIONSHIP");
    const companyDocuments = await tx.document.findMany({ where: { companyId } });
    for (const c of docRelCandidates) {
      const value = resolveEffectiveValue(c) as { documentType: string; supersedesDocumentRef?: string; effectiveFrom?: string; effectiveTo?: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      // Case-insensitive match: real document titles and an extraction
      // provider's own textual reference to them do not reliably share exact
      // casing (e.g. a document row named "Credit Agreement" vs. body text
      // reading "...amends the CREDIT AGREEMENT dated..."), and a supersession
      // link should not silently fail to resolve over a casing difference
      // alone. Still an exact (case-folded) name/id match, never a fuzzy one.
      const supersedesId = value.supersedesDocumentRef
        ? companyDocuments.find((d) => d.name.toLowerCase() === value.supersedesDocumentRef!.toLowerCase() || d.id === value.supersedesDocumentRef)?.id
        : undefined;
      const amendmentEffectiveFrom = parseDateOrNull(value.effectiveFrom);
      await tx.document.update({
        where: { id: c.sourceDocumentId },
        data: {
          type: value.documentType as never,
          supersedesDocumentId: supersedesId ?? null,
          effectiveFrom: amendmentEffectiveFrom,
          effectiveTo: parseDateOrNull(value.effectiveTo),
          typeConfirmedByUser: true,
          amendmentRelationshipConfirmedByUser: true,
        },
      });
      // Propagate the amendment's effectiveFrom onto the BASE (superseded)
      // document's own effectiveTo - this is what actually makes
      // loadCompanyCovenantData's date-range filter (lib/covenant-engine.ts)
      // treat the base document's provisions as no longer effective from
      // that date forward, per Document.effectiveTo's own schema comment
      // ("When an amendment supersedes this document, set THIS document's
      // effectiveTo to the amendment's effectiveFrom"). Without this, the
      // base document would remain "always effective" forever even after a
      // reviewer approves a clear supersession - a genuine gap this promotion
      // code did not previously close (docs/autonomous-information-retrieval-v1.md
      // "Amendment processing"). Only applied when the amendment candidate
      // actually proposed an effectiveFrom date - an approved supersession
      // link with no date is recorded (supersedesDocumentId) but does not
      // retroactively cut off the base document's effectiveness, since "no
      // date" is not the same as "effective immediately."
      if (supersedesId && amendmentEffectiveFrom) {
        await tx.document.update({ where: { id: supersedesId }, data: { effectiveTo: amendmentEffectiveFrom } });
      }
      promotions.push({ candidateId: c.id, promotedToId: c.sourceDocumentId });
    }

    // -----------------------------------------------------------------------
    // 2. DEFINED_TERM -> DefinedTerm (documentId, termName) upsert.
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "DEFINED_TERM")) {
      const value = resolveEffectiveValue(c) as { termName: string; sectionRef: string; fullText: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const row = await tx.definedTerm.upsert({
        where: { documentId_termName: { documentId: c.sourceDocumentId, termName: value.termName } },
        create: { documentId: c.sourceDocumentId, termName: value.termName, sectionRef: value.sectionRef, fullText: value.fullText },
        update: { sectionRef: value.sectionRef, fullText: value.fullText },
      });
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 3. PERMISSION - excludes KNOWN_NOT_MODELED (fail-closed, documented gap).
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "PERMISSION")) {
      const value = resolveEffectiveValue(c) as
        | { permissionRef: string; action: string; grantType: GrantType; amountKind: string; entityScope: string[]; formulaType: string; thresholdValue: number; params?: Record<string, unknown>; eligibilityConditions?: unknown; termConditions?: unknown; measurementBasis: string; sectionRef: string; definedTermRefs: string[]; modelingStatus: string }
        | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      if (value.modelingStatus === "KNOWN_NOT_MODELED") {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "modelingStatus=KNOWN_NOT_MODELED - excluded from promotion per fail-closed policy; remains an unmodeled, human-visible coverage gap (see post-promotion coverage-gate evaluation)." });
        continue;
      }
      if (refToPermissionId.has(value.permissionRef)) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `Duplicate permissionRef "${value.permissionRef}" already promoted in this batch - not re-promoted. Resolve the ambiguity by editing one candidate's permissionRef before re-running promotion.` });
        continue;
      }
      const entityScope = value.entityScope.filter((e) => VALID_ENTITY_CLASS_TAGS.has(e));
      const row = await tx.permission.create({
        data: {
          companyId,
          documentId: c.sourceDocumentId,
          code: value.permissionRef,
          grantType: value.grantType,
          amountKind: value.amountKind as never,
          action: value.action,
          entityScope: entityScope as never,
          formulaType: value.formulaType as never,
          thresholdValue: value.thresholdValue,
          params: (value.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          eligibilityConditions: (value.eligibilityConditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          termConditions: (value.termConditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          measurementBasis: value.measurementBasis as never,
          sectionRef: value.sectionRef,
          definedTermRefs: value.definedTermRefs,
          modelingStatus: "MODELED",
          // Never auto-VERIFIED - this is a data-fidelity flag (DefinedTermStatus),
          // independent of legal-review status, and starts UNVERIFIED even
          // though a human approved the extraction, matching this
          // codebase's existing "never auto-promote to VERIFIED" discipline.
          reviewStatus: "UNVERIFIED",
          notes: c.rationale,
        },
      });
      refToPermissionId.set(value.permissionRef, row.id);
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 4. COLLATERAL_SCOPE -> CollateralPool (find-or-create by name) + PermissionCollateralScope.
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "COLLATERAL_SCOPE")) {
      const value = resolveEffectiveValue(c) as { permissionRef: string; collateralPoolName: string; priorityTier: string; pariPassuWithGroupId?: string; intercreditorAgreementName?: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const permissionId = refToPermissionId.get(value.permissionRef);
      if (!permissionId) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `permissionRef "${value.permissionRef}" did not resolve to a promoted Permission - not promoted.` });
        continue;
      }
      let pool = await tx.collateralPool.findFirst({ where: { companyId, name: value.collateralPoolName } });
      if (!pool) pool = await tx.collateralPool.create({ data: { companyId, name: value.collateralPoolName } });
      const intercreditorAgreement = value.intercreditorAgreementName ? await tx.intercreditorAgreement.findFirst({ where: { companyId, name: value.intercreditorAgreementName } }) : null;
      const row = await tx.permissionCollateralScope.create({
        data: {
          permissionId,
          collateralPoolId: pool.id,
          priorityTier: value.priorityTier as never,
          pariPassuWithGroupId: value.pariPassuWithGroupId ?? null,
          intercreditorAgreementId: intercreditorAgreement?.id ?? null,
        },
      });
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 5. RELATIONSHIP -> PermissionRelationship (both ends resolved by ref).
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "RELATIONSHIP")) {
      const value = resolveEffectiveValue(c) as { relationshipType: string; fromPermissionRef: string; toPermissionRef: string; groupKey?: string; parameter?: Record<string, unknown>; sourceSectionRef: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const fromId = refToPermissionId.get(value.fromPermissionRef);
      const toId = refToPermissionId.get(value.toPermissionRef);
      if (!fromId || !toId) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `${!fromId ? `fromPermissionRef "${value.fromPermissionRef}"` : `toPermissionRef "${value.toPermissionRef}"`} did not resolve to a promoted Permission - not promoted.` });
        continue;
      }
      const row = await tx.permissionRelationship.create({
        data: {
          companyId,
          fromPermissionId: fromId,
          toPermissionId: toId,
          relationshipType: value.relationshipType as never,
          groupKey: value.groupKey ?? null,
          parameter: (value.parameter as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sourceSectionRef: value.sourceSectionRef,
          notes: c.rationale,
        },
      });
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 6. SHARED_CONSTRAINT -> SharedCapacityConstraint + members.
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "SHARED_CONSTRAINT")) {
      const value = resolveEffectiveValue(c) as { name: string; capAmount?: number; capFormulaType?: string; capParams?: Record<string, unknown>; aggregationRule: string; measurementBasis: string; followsRefinancing: boolean; sourceSectionRef: string; memberPermissionRefs: string[] } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const constraint = await tx.sharedCapacityConstraint.create({
        data: {
          companyId,
          name: value.name,
          capAmount: value.capAmount ?? null,
          capFormulaType: (value.capFormulaType as never) ?? null,
          capParams: (value.capParams as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          aggregationRule: value.aggregationRule as never,
          measurementBasis: value.measurementBasis as never,
          followsRefinancing: value.followsRefinancing,
          sourceSectionRef: value.sourceSectionRef,
        },
      });
      const resolvedMemberIds = value.memberPermissionRefs.map((ref) => refToPermissionId.get(ref)).filter((id): id is string => !!id);
      const unresolvedCount = value.memberPermissionRefs.length - resolvedMemberIds.length;
      for (const permissionId of resolvedMemberIds) {
        await tx.sharedCapacityConstraintMember.create({ data: { constraintId: constraint.id, permissionId } });
      }
      promotions.push({ candidateId: c.id, promotedToId: constraint.id });
      if (unresolvedCount > 0) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `SharedCapacityConstraint "${value.name}" was created, but ${unresolvedCount} of ${value.memberPermissionRefs.length} memberPermissionRefs did not resolve and were omitted as members.` });
      }
    }

    // -----------------------------------------------------------------------
    // 7. ACTIVATION_CONDITION -> RuleActivationCondition.
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "ACTIVATION_CONDITION")) {
      const value = resolveEffectiveValue(c) as { permissionRef?: string; covenantSectionRefs: string[]; companyWide: boolean; predicateKind: string; predicateConfig: Record<string, unknown>; effect: string; parameterName?: string; reversionPredicateConfig?: Record<string, unknown>; sourceSectionRef: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const permissionId = value.permissionRef ? refToPermissionId.get(value.permissionRef) : undefined;
      if (value.permissionRef && !permissionId) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `permissionRef "${value.permissionRef}" did not resolve to a promoted Permission - not promoted.` });
        continue;
      }
      const row = await tx.ruleActivationCondition.create({
        data: {
          companyId,
          permissionId: permissionId ?? null,
          covenantSectionIds: value.covenantSectionRefs,
          companyWide: value.companyWide,
          predicateKind: value.predicateKind as never,
          predicateConfig: value.predicateConfig as Prisma.InputJsonValue,
          effect: value.effect as never,
          parameterName: value.parameterName ?? null,
          reversionPredicateConfig: (value.reversionPredicateConfig as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          sourceSectionRef: value.sourceSectionRef,
        },
      });
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 8. EXTERNAL_INPUT_REQUIREMENT -> ExternalInputRecord PLACEHOLDER.
    //    Deliberately created with value=null, reviewStatus=UNVERIFIED
    //    regardless of the candidate's own review outcome - promoting the
    //    REQUIREMENT (an AI-identified need for this input) is not the same
    //    as CERTIFYING a value for it. A human must separately supply and
    //    certify the actual figure (lib/onboarding/financial.ts's
    //    certifyExternalInputRecord) before this record counts as certified -
    //    see the task's own "extraction alone must never count as certified"
    //    hard requirement.
    // -----------------------------------------------------------------------
    for (const c of candidates.filter((c) => c.kind === "EXTERNAL_INPUT_REQUIREMENT")) {
      const value = resolveEffectiveValue(c) as { kind: string; name: string; description: string; sourceRef?: string; maxAgeDays?: number } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const row = await tx.externalInputRecord.create({
        data: {
          companyId,
          kind: value.kind as never,
          name: value.name,
          value: null,
          asOfDate: null,
          sourceRef: value.sourceRef ?? null,
          reviewStatus: "UNVERIFIED",
          maxAgeDays: value.maxAgeDays ?? null,
        },
      });
      promotions.push({ candidateId: c.id, promotedToId: row.id });
    }

    // -----------------------------------------------------------------------
    // 9. FINANCIAL_FACT -> FinancialSnapshot/FinancialState upsert (Phase B,
    //    docs/autonomous-information-retrieval-v1.md "Source mapping").
    //    Closes the gap Phase A deliberately left open: a connector-
    //    discovered financial fact (EDGAR/CSV/upload), once a human approves
    //    or edits it, flows into the EXACT SAME rows lib/dashboard-service.ts
    //    already reads - no dashboard code changes, per the task's own
    //    explicit instruction.
    //
    //    Batched BY asOfDate (lib/onboarding/financial.ts's
    //    upsertFinancialFactsForDate): several sibling FINANCIAL_FACT
    //    candidates dated the same day (e.g. a CSV upload reporting cash,
    //    total_debt, covenant_ebitda, etc. all as of the same period-end) are
    //    merged into ONE snapshot/state write, so a brand-new company with NO
    //    prior FinancialSnapshot can still be fully promoted from its very
    //    first batch of facts, provided that batch collectively covers all 8
    //    required fields - not silently forced to fail closed one-fact-at-a-
    //    time just because promotion happened to process them in isolation.
    //    An unrecognized metricName, or a batch that still leaves some
    //    required field uncovered by any base row or sibling fact, is a
    //    documented per-fact skip (never an error that aborts the whole
    //    promotion batch, never a fabricated value).
    // -----------------------------------------------------------------------
    const financialFactCandidates = candidates.filter((c) => c.kind === "FINANCIAL_FACT");
    const byAsOfDate = new Map<string, { candidate: ExtractionCandidate; metricName: string; value: number }[]>();
    for (const c of financialFactCandidates) {
      const value = resolveEffectiveValue(c) as { metricName: string; value: number; asOfDate: string; unit?: string; sourceRecordRef?: string } | null;
      if (!value) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: "Effective value failed re-validation against its own schema - not promoted." });
        continue;
      }
      const asOfDate = parseDateOrNull(value.asOfDate);
      if (!asOfDate) {
        skipped.push({ candidateId: c.id, kind: c.kind, reason: `asOfDate "${value.asOfDate}" did not parse to a valid date - not promoted.` });
        continue;
      }
      const key = asOfDate.toISOString();
      const list = byAsOfDate.get(key) ?? [];
      list.push({ candidate: c, metricName: value.metricName, value: value.value });
      byAsOfDate.set(key, list);
    }
    for (const [isoDate, group] of byAsOfDate) {
      const asOfDate = new Date(isoDate);
      const notes = `Promoted from FINANCIAL_FACT candidate(s): ${group.map((g) => g.candidate.id).join(", ")}.`;
      const result = await upsertFinancialFactsForDate(companyId, asOfDate, group.map((g) => ({ key: g.candidate.id, metricName: g.metricName, value: g.value })), notes, tx);
      for (const outcome of result.perFact) {
        if (!outcome.applied) {
          skipped.push({ candidateId: outcome.key, kind: "FINANCIAL_FACT", reason: outcome.skipReason ?? "upsertFinancialFactsForDate declined to apply this fact - not promoted." });
          continue;
        }
        promotions.push({ candidateId: outcome.key, promotedToId: outcome.financialSnapshotId ?? outcome.financialStateId! });
      }
    }

    // -----------------------------------------------------------------------
    // 10. Mark every successfully-promoted candidate.
    // -----------------------------------------------------------------------
    for (const p of promotions) {
      await tx.extractionCandidate.update({ where: { id: p.candidateId }, data: { promotedAt: new Date(), promotedToId: p.promotedToId } });
    }

    // -----------------------------------------------------------------------
    // 11. Post-promotion coverage-gate evaluation - SolverCoverageDeclarations
    //     + Company.onboardingStatus, using lib/solver/coverage.ts's EXISTING
    //     classifyCompanyCoverage predicate (no new gap logic). A scope's
    //     declaration is marked isComplete=true only when zero un-promoted,
    //     non-rejected PERMISSION candidates remain for that document (i.e.
    //     no real, human-visible KNOWN_NOT_MODELED gap or still-pending
    //     candidate exists) - see computeDeclarationPlan below.
    // -----------------------------------------------------------------------
    const onboardingStatus = await evaluatePostPromotionCoverage(tx, companyId, asOfDate);

    return { skipped, promotedCount: promotions.length, onboardingStatus };
  });

  const staticData = await loadCompanySolverStaticData(prisma, companyId, asOfDate);
  const legacyFormulaPresence = new Map<string, boolean>();
  const documents = await prisma.document.findMany({ where: { companyId } });
  for (const d of documents) legacyFormulaPresence.set(`${d.id}:secured`, !!(d.capacityFormulas as { secured?: unknown } | null)?.secured);
  for (const d of documents) legacyFormulaPresence.set(`${d.id}:unsecured`, !!(d.capacityFormulas as { unsecured?: unknown } | null)?.unsecured);
  const coverageResults = classifyCompanyCoverage({
    declarations: staticData.coverageDeclarations,
    permissions: staticData.permissions,
    asOfDate,
    legacyFormulaPresence,
  });

  return { companyId, promotedCount: result.promotedCount, skipped: result.skipped, coverageResults, onboardingStatus: result.onboardingStatus };
}

/** Read-only coverage-gate snapshot (no writes) - what the Activate page shows both before and after promotion, using the SAME lib/solver/coverage.ts predicate promotion itself uses. */
export async function getCoverageSnapshot(companyId: string, asOfDate: Date = new Date()): Promise<CoverageResult[]> {
  const staticData = await loadCompanySolverStaticData(prisma, companyId, asOfDate);
  const documents = await prisma.document.findMany({ where: { companyId } });
  const legacyFormulaPresence = new Map<string, boolean>();
  for (const d of documents) {
    legacyFormulaPresence.set(`${d.id}:secured`, !!(d.capacityFormulas as { secured?: unknown } | null)?.secured);
    legacyFormulaPresence.set(`${d.id}:unsecured`, !!(d.capacityFormulas as { unsecured?: unknown } | null)?.unsecured);
  }
  return classifyCompanyCoverage({ declarations: staticData.coverageDeclarations, permissions: staticData.permissions, asOfDate, legacyFormulaPresence });
}

/**
 * Declares a SolverCoverageDeclaration for every (documentId, grantType) that
 * now has at least one promoted (MODELED) Permission, and sets
 * Company.onboardingStatus based on whether every such scope is complete.
 * DEBT_INCURRENCE scopes get both a "secured" and an "unsecured" declaration
 * (matching this codebase's own established convention - see
 * scripts/populate-coherent-solver-native.ts §10 - since
 * lib/solver/coverage.ts's determineCoverage scopes purely by
 * (documentId, grantType), never by side); LIEN scopes get only "secured"
 * (liens are inherently a secured-capacity question).
 */
async function evaluatePostPromotionCoverage(tx: Prisma.TransactionClient, companyId: string, asOfDate: Date): Promise<OnboardingStatus> {
  const promotedPermissions = await tx.permission.findMany({ where: { companyId }, select: { documentId: true, grantType: true } });
  const scopes = new Set<string>();
  for (const p of promotedPermissions) scopes.add(`${p.documentId}:${p.grantType}`);

  // A real, human-visible coverage gap: any PERMISSION candidate for this
  // document that is not REJECTED (a human explicitly deciding it doesn't
  // apply is not a gap) and not yet promoted (still pending review, or
  // permanently excluded as KNOWN_NOT_MODELED).
  const gapCandidates = await tx.extractionCandidate.findMany({
    where: { companyId, kind: "PERMISSION", promotedAt: null, reviewStatus: { not: "REJECTED" } },
    select: { sourceDocumentId: true },
  });
  const documentsWithGaps = new Set(gapCandidates.map((g) => g.sourceDocumentId));

  let anyGap = false;
  for (const scopeKey of scopes) {
    const [documentId, grantType] = scopeKey.split(":") as [string, GrantType];
    const isComplete = !documentsWithGaps.has(documentId);
    if (!isComplete) anyGap = true;
    const sides = grantType === "LIEN" ? ["secured"] : ["secured", "unsecured"];
    for (const side of sides) {
      await tx.solverCoverageDeclaration.upsert({
        where: { documentId_side_grantType: { documentId, side, grantType } },
        create: { companyId, documentId, side, grantType, isComplete, notes: isComplete ? "Declared complete by onboarding promotion - every extracted PERMISSION candidate for this document was either promoted or explicitly rejected." : "Declared INCOMPLETE by onboarding promotion - at least one PERMISSION candidate for this document remains unpromoted (pending review, or a documented KNOWN_NOT_MODELED gap)." },
        update: { isComplete, notes: isComplete ? "Declared complete by onboarding promotion (re-evaluated)." : "Declared INCOMPLETE by onboarding promotion (re-evaluated) - at least one PERMISSION candidate for this document remains unpromoted." },
      });
    }
  }

  const onboardingStatus: OnboardingStatus = anyGap || scopes.size === 0 ? "ACTIVE_WITH_LIMITATIONS" : "ACTIVE";
  await tx.company.update({ where: { id: companyId }, data: { onboardingStatus } });
  return onboardingStatus;
}
