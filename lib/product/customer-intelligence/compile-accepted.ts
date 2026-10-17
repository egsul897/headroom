/**
 * Compile counsel-accepted / edited AI interpretations into executable Permission rows.
 * Fail-closed: only MODELED when formula + threshold can be parsed without inventing values.
 * Idempotent on (companyId, code) where code = counsel:{sourceId}:{sectionRef}:{grantType}.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  summarizeFromStoredMetadata,
  type CovenantSummaryItem,
} from "../covenant-intelligence/summarize";
import { isCapRestatementCondition, parseFormulaFromItem } from "./formula-parse";
import { parseMoneyMillions } from "./money";
 export { isCapRestatementCondition, parseCounselFormulaForTest } from "./formula-parse";
import { buildCapacityFormulas, type SharedCapGroup } from "./capacity-formulas";
import { detectSharedCapGroup } from "./shared-cap";
import { parseMaintenanceRatio } from "./maintenance-ratio";
import { buildRpWaterfall } from "./rp-waterfall";
import { grantTypesForItem, isResidualLienBasket, resolveDefinedTermCap } from "./grant-types";
import { permissionCode, permissionCodePrefix } from "./permission-code";

export type CompileStatus =
  | "COMPILED"
  | "UPDATED"
  | "SUPERSEDED"
  | "INCOMPLETE"
  | "SKIPPED"
  | "FAILED";

import type { CounselGrantType } from "./grant-types";
export type { CounselGrantType };

export interface CompileAcceptedResult {
  status: CompileStatus;
  permissionId?: string;
  code?: string;
  grantType?: CounselGrantType;
  formulaType?: string;
  thresholdValue?: number;
  modelingStatus?: "MODELED" | "KNOWN_NOT_MODELED";
  missingFields: string[];
  message: string;
}

function entityScopeTags(item: CovenantSummaryItem): string[] {
  const tags: string[] = [];
  if (item.entityScope?.borrower) tags.push("BORROWER");
  if (item.entityScope?.guarantor) tags.push("GUARANTOR_RS");
  if (item.entityScope?.restrictedSubsidiary) tags.push("NON_GUARANTOR_RS");
  if (item.entityScope?.unrestrictedSubsidiary) tags.push("UNRESTRICTED_SUB");
  return tags;
}

/**
 * After counsel ACCEPT/EDIT, attempt to compile executable Permission(s).
 * REJECT supersedes prior counsel-compiled permissions for that section.
 */
/**
 * Rule 179 — persist the shared-cap group as a
 * SharedCapacityConstraint + member rows so the solver-native
 * elections enforce it exactly (a member's allocation is capped
 * by the group's remaining cap). The constraint is keyed by a
 * stable name (document + sorted member refs + cap), so the
 * second clause's compile finds the first clause's constraint
 * and joins it instead of creating a duplicate. Members
 * accumulate as each clause compiles.
 */
async function syncSharedCapConstraint(params: {
  companyId: string;
  sourceId: string;
  sectionRef: string;
  documentId: string;
  debtPermissionId: string;
  group: NonNullable<ReturnType<typeof detectSharedCapGroup>>;
}): Promise<void> {
  const sorted = [...params.group.memberSectionRefs].sort();
  const name = `shared-cap:${params.documentId}:${sorted.join("+")}:${params.group.capMillions}`;
  let constraint = await prisma.sharedCapacityConstraint.findFirst({
    where: { companyId: params.companyId, name },
  });
  if (!constraint) {
    constraint = await prisma.sharedCapacityConstraint.create({
      data: {
        companyId: params.companyId,
        name,
        capAmount: new Prisma.Decimal(params.group.capMillions),
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        followsRefinancing: false,
        sourceSectionRef: params.sectionRef,
      },
    });
  }
  // Resolve EVERY member clause to its operative DEBT Permission, not
  // just the compiling item's: a twin clause's own text may have
  // lost the proviso (summary truncation / 700-char excerpt cap —
  // a real 6.01(e) excerpt cuts off mid-proviso), so only the twin
  // detects the group. The group names all its members; the twin's
  // compile pulls the silent clause in. Order-independent: whether
  // (e) or (j) compiles first, both end up members. Clauses that
  // never compile (e.g. a refinancing clause with no $ cap) simply
  // have no Permission and no member row.
  const memberPerms = await prisma.permission.findMany({
    where: {
      companyId: params.companyId,
      documentId: params.documentId,
      sectionRef: { in: params.group.memberSectionRefs },
      grantType: "DEBT_INCURRENCE",
      modelingStatus: "MODELED",
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  for (const perm of memberPerms) {
    const member = await prisma.sharedCapacityConstraintMember.findFirst({
      where: { constraintId: constraint.id, permissionId: perm.id },
    });
    if (!member) {
      await prisma.sharedCapacityConstraintMember.create({
        data: { constraintId: constraint.id, permissionId: perm.id },
      });
    }
  }
}

export async function compileAcceptedInterpretation(params: {
  companyId: string;
  sourceId: string;
  sectionRef: string;
  category: string;
  decision: "ACCEPTED" | "EDITED" | "REJECTED";
  /**
   * Phase C (D11): the structural nodeId (occurrence identity)
   * of the item the decision refers to. Compile matches the
   * exact item; without it, an ambiguous (ref, category) match
   * fails closed.
   */
  nodeId?: string;
  approvalNote?: string;
  /**
   * Who made the decision. SYSTEM = exception-based auto-accept
   * of a routine supported interpretation — the Permission notes
   * must say so (never label a system acceptance
   * counsel-verified). Default COUNSEL preserves every existing
   * caller (recordReviewerDecision).
   */
  reviewerKind?: "SYSTEM" | "COUNSEL";
}): Promise<CompileAcceptedResult[]> {
  const row = await prisma.knowledgeSource.findFirst({
    where: { companyId: params.companyId, sourceId: params.sourceId },
  });
  if (!row) {
    return [{ status: "FAILED", missingFields: ["source"], message: "KnowledgeSource not found in workspace" }];
  }

  const documentId = row.documentId;
  if (!documentId) {
    return [
      {
        status: "INCOMPLETE",
        missingFields: ["documentId"],
        message: "KnowledgeSource has no linked Document — cannot bind Permission.documentId",
      },
    ];
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, companyId: params.companyId },
    select: { id: true },
  });
  if (!doc) {
    return [
      {
        status: "INCOMPLETE",
        missingFields: ["documentId"],
        message: "Linked Document missing or not in this company workspace",
      },
    ];
  }

  if (params.decision === "REJECTED") {
    // Rule 59: the prefix MUST use the same sanitization as
    // permissionCode — a raw prefix never matches codes minted
    // from section refs with parens (e.g. "6.01(a)").
    const prefix = permissionCodePrefix(params.sourceId, params.sectionRef, params.category);
    const existing = await prisma.permission.findMany({
      where: { companyId: params.companyId, code: { startsWith: prefix } },
    });
    const results: CompileAcceptedResult[] = [];
    const now = new Date();
    const docIds = new Set<string>();
    for (const p of existing) {
      docIds.add(p.documentId);
      await prisma.permission.update({
        where: { id: p.id },
        data: {
          modelingStatus: "KNOWN_NOT_MODELED",
          effectiveTo: now,
          notes: `${p.notes ?? ""}\n[Superseded — counsel REJECTED ${now.toISOString()}]`.trim(),
        },
      });
      if (p.code) {
        await prisma.covenantProvision.updateMany({
          where: { companyId: params.companyId, code: p.code, effectiveTo: null },
          data: { effectiveTo: now },
        });
      }
      results.push({
        status: "SUPERSEDED",
        permissionId: p.id,
        code: p.code ?? undefined,
        message: "Prior counsel-compiled Permission superseded on rejection",
        missingFields: [],
      });
    }
    // Rule 177: a rejected section's dual-grant link dies with its
    // Permissions (both endpoints are superseded above; the link
    // would never be traversed, but leaving it is stale state).
    // Delete by the superseded Permissions' ids, NOT by bare
    // sectionRef: two items can share a ref (different categories)
    // with their own dual-grant links, and a ref-wide delete would
    // kill the other item's link (counsel-review isolation).
    if (existing.length) {
      const supersededIds = existing.map((p) => p.id);
      await prisma.permissionRelationship.deleteMany({
        where: {
          companyId: params.companyId,
          relationshipType: "AUTOMATIC_LINKED_PERMISSION",
          OR: [{ fromPermissionId: { in: supersededIds } }, { toPermissionId: { in: supersededIds } }],
        },
      });
    }
    // Rule 180: a rejected section's maintenance ratio provision
    // is superseded too (it has no Permission, so the loop above
    // never touches it — without this a rejected ratio test would
    // keep gating transactions).
    await prisma.covenantProvision.updateMany({
      where: {
        companyId: params.companyId,
        code: permissionCode(params.sourceId, params.sectionRef, "RATIO", params.category),
        effectiveTo: null,
      },
      data: { effectiveTo: now },
    });
    // Rule 179: a rejected section leaves its shared-cap group
    // (other members may remain) but drops its own membership —
    // a superseded Permission must not bind the group's elections.
    await prisma.sharedCapacityConstraintMember.deleteMany({
      where: { permissionId: { in: existing.map((p) => p.id) } },
    });
    for (const id of docIds) {
      await syncDocumentCapacityFormulas(params.companyId, id);
      await syncDocumentRpWaterfall(params.companyId, id);
    }
    if (!results.length) {
      results.push({ status: "SKIPPED", missingFields: [], message: "No prior counsel Permissions to supersede" });
    }
    return results;
  }

  const summary = summarizeFromStoredMetadata(row.metadata);
  // Phase C (D11): match the EXACT item the decision refers to.
  // Decisions carry the structural nodeId (occurrence identity)
  // since the hardening initiative. First-match by (ref,
  // category) merged distinct occurrences sharing a label (CA
  // §5.01 vs Guaranty §5.01) and compiled the wrong item's
  // formula. Legacy decisions without a nodeId fall back to
  // (ref, category) ONLY when exactly one item matches — an
  // ambiguous legacy match fails closed instead of compiling
  // the first item.
  const matches = summary?.items.filter((i) => i.sectionRef === params.sectionRef && i.category === params.category) ?? [];
  const item = params.nodeId
    ? matches.find((i) => i.nodeId === params.nodeId)
    : matches.length === 1
      ? matches[0]
      : undefined;
  if (!item) {
    return [{ status: "FAILED", missingFields: ["summaryItem"], message: params.nodeId ? "Summary item not found for section + nodeId" : matches.length > 1 ? "Ambiguous summary item for section + category (multiple occurrences share the label); decision must carry nodeId" : "Summary item not found for section" }];
  }

  const parsed = parseFormulaFromItem(item);
  if (parsed.modelingStatus === "KNOWN_NOT_MODELED") {
    return [
      {
        status: "INCOMPLETE",
        missingFields: parsed.missingFields,
        formulaType: parsed.formulaType,
        thresholdValue: parsed.thresholdValue,
        modelingStatus: "KNOWN_NOT_MODELED",
        message: parsed.notes.join(" ") || "Insufficient structured fields for MODELED Permission",
      },
    ];
  }

  const grants = grantTypesForItem(item);
  if (!grants.length) {
    // Rule 180: a financial-maintenance covenant is a TEST, not a
    // grant — it never mints a Permission. When it carries exactly
    // one unambiguous ratio test it mints a CovenantProvision that
    // buildDebtRatioTests evaluates pro forma. Stepped schedules
    // and conflated tests return null (fail-closed, no provision).
    if (params.category === "FINANCIAL_MAINTENANCE") {
      const ratio = parseMaintenanceRatio(item);
      if (!ratio) {
        return [
          {
            status: "INCOMPLETE",
            missingFields: ["single unambiguous ratio test"],
            message:
              "Maintenance item has no single unambiguous ratio test (stepped schedule, conflated tests, or ambiguous direction) — no ratio provision minted; counsel must split or clarify it.",
          },
        ];
      }
      const ratioCode = permissionCode(params.sourceId, params.sectionRef, "RATIO", params.category);
      const existingRatio = await prisma.covenantProvision.findFirst({
        where: { companyId: params.companyId, documentId, code: ratioCode, effectiveTo: null },
      });
      await upsertCounselProvision({
        companyId: params.companyId,
        documentId,
        code: ratioCode,
        basketName: `${item.heading} (maintenance ratio test)`.slice(0, 200),
        sectionRef: params.sectionRef,
        formulaType: ratio.formulaType,
        thresholdValue: ratio.thresholdValue,
        params: ratio.formulaType === "LEVERAGE_RATIO_ROOM" ? { debtBasis: ratio.debtBasis ?? "total" } : {},
        notes: `${params.reviewerKind === "SYSTEM" ? "System auto-accepted — routine supported interpretation, not counsel-verified" : `Counsel ${params.decision}`} ${new Date().toISOString()}. Maintenance ratio test — not a grant of capacity; evaluated by buildDebtRatioTests. Source ${params.sourceId}. ${item.sourceCitation ?? ""}`.trim(),
      });
      return [
        {
          status: existingRatio ? "UPDATED" : "COMPILED",
          code: ratioCode,
          formulaType: ratio.formulaType,
          thresholdValue: ratio.thresholdValue,
          modelingStatus: "MODELED",
          missingFields: [],
          message: `Compiled maintenance ratio provision ${ratioCode}`,
        },
      ];
    }
    // No grant-type signal (e.g. asset-sale / merger covenant) — do
    // not mint a wrong-typed Permission. Previously this defaulted
    // to DEBT_INCURRENCE and inflated debt capacity.
    return [
      {
        status: "INCOMPLETE",
        missingFields: ["grantType"],
        message: "No counsel grant type matches this item (not a debt/lien/RP/investment permission) — not compiled.",
      },
    ];
  }
  const results: CompileAcceptedResult[] = [];
  const action =
    item.plainEnglish?.slice(0, 500) ||
    item.permissions?.[0] ||
    `${item.heading} — ${params.reviewerKind === "SYSTEM" ? "system-accepted permission" : "counsel-accepted permission"}`;
  const definedTermRefs = [
    ...(item.relatedDefinedTerms ?? []),
    ...(item.applicableDefinitions ?? []).map((d) => d.term),
  ].filter(Boolean).slice(0, 24);
  const entityScope = entityScopeTags(item);
  // Rule 206: a "provided that" clause that merely RESTATES the
  // Permission's own modeled cap is not an additional eligibility
  // requirement — the threshold already enforces it. Minting it as a
  // CUSTOM_STATE_PREDICATE (UNKNOWN, fail-closed) double-counts the cap
  // and makes the basket never clear (Asure 7.02(c): the proviso "the
  // aggregate amount ... shall not exceed $5,000,000" is the $5M cap
  // itself). Drop the condition only when the text names a dollar
  // amount equal to the modeled threshold AND a cap verb; a proviso
  // with a different amount, a floor ("at least"), or no amount at all
  // (Asure 7.02(f)'s refinancing proviso, 7.01(t)'s no-Collateral
  // proviso) is a genuine condition and stays UNKNOWN.
  const conditions = (item.conditions ?? [])
    .slice(0, 12)
    .filter((c) => !isCapRestatementCondition(String(c), parsed.thresholdValue))
    .map((c, i) => ({
      id: `${params.sourceId}:${params.sectionRef}:cond:${i}`,
      description: String(c).slice(0, 500),
      kind: "CUSTOM_STATE_PREDICATE" as const,
    }));

  // Rule 178: eligibility conditions must carry the solver's shape
  // ({ id, description, kind }), not { text }. The old { text }
  // shape made the solver report 'Eligibility condition "undefined"
  // (kind undefined)' — counsel saw an UNKNOWN with no idea what
  // the condition actually was. The condition text is a
  // plain-language paraphrase with no mechanical evaluation, so it
  // maps to CUSTOM_STATE_PREDICATE without a
  // ruleActivationConditionId: the solver still fails it closed to
  // UNKNOWN, but now with the real condition text in the message.
  for (const grantType of grants) {
    const code = permissionCode(params.sourceId, params.sectionRef, grantType, params.category);
    const notes = [
      ...parsed.notes,
      `${params.reviewerKind === "SYSTEM" ? "System auto-accepted — routine supported interpretation, not counsel-verified" : `Counsel ${params.decision}`} ${new Date().toISOString()}` ,
      params.approvalNote ? `Note: ${params.approvalNote}` : null,
      `Source ${params.sourceId}`,
      item.sourceCitation,
    ]
      .filter(Boolean)
      .join("\n");

    const existing = await prisma.permission.findFirst({
      where: { companyId: params.companyId, code },
    });

    // Rule 196: a residual ("other Liens") LIEN basket carries
    // pairableWithDebt in its params so the solver may pair it with
    // an independent DEBT Permission for a secured election.
    // Per-grant params (never mutate parsed.params — it is shared
    // across this item's grants).
    const grantParams =
      grantType === "LIEN" && isResidualLienBasket(item)
        ? { ...(parsed.params ?? {}), pairableWithDebt: true }
        : parsed.params;
    const data = {
      companyId: params.companyId,
      documentId,
      code,
      grantType,
      amountKind: parsed.amountKind,
      action,
      entityScope: entityScope as never[],
      formulaType: parsed.formulaType,
      thresholdValue: new Prisma.Decimal(parsed.thresholdValue),
      params: (grantParams as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      eligibilityConditions: (conditions.length ? conditions : null) as Prisma.InputJsonValue,
      termConditions: Prisma.JsonNull,
      measurementBasis: parsed.measurementBasis,
      sectionRef: params.sectionRef,
      definedTermRefs,
      modelingStatus: "MODELED" as const,
      reviewStatus: "UNVERIFIED" as const,
      notes,
      effectiveTo: null as Date | null,
    };

    if (existing) {
      const updated = await prisma.permission.update({
        where: { id: existing.id },
        data,
      });
      results.push({
        status: "UPDATED",
        permissionId: updated.id,
        code,
        grantType,
        formulaType: parsed.formulaType,
        thresholdValue: parsed.thresholdValue,
        modelingStatus: "MODELED",
        missingFields: parsed.missingFields,
        message: `Updated executable Permission ${code}`,
      });
    } else {
      const created = await prisma.permission.create({ data });
      results.push({
        status: "COMPILED",
        permissionId: created.id,
        code,
        grantType,
        formulaType: parsed.formulaType,
        thresholdValue: parsed.thresholdValue,
        modelingStatus: "MODELED",
        missingFields: parsed.missingFields,
        message: `Compiled executable Permission ${code}`,
      });
    }

    // Mirror into CovenantProvision so legacy capacityFormulas REF codes resolve.
    await upsertCounselProvision({
      companyId: params.companyId,
      documentId,
      code,
      basketName: `${item.heading} (${grantType})`.slice(0, 200),
      sectionRef: params.sectionRef,
      formulaType: parsed.formulaType,
      thresholdValue: parsed.thresholdValue,
      params: parsed.params ?? null,
      notes,
    });
  }

  // Rule 177: a single provision that compiles to BOTH a DEBT_INCURRENCE
  // Permission and a LIEN Permission (one cap covering secured debt,
  // e.g. a real 6.02(l): Indebtedness and Liens both capped at
  // $250,000) must link them with AUTOMATIC_LINKED_PERMISSION from
  // the debt leg to the lien leg. The solver pulls linked liens into
  // a debt election ONLY through this edge (lib/solver/graph.ts);
  // without it the lien never joins the election and every secured
  // transaction fails the lien check — even a $0.25M secured deal
  // that fits the provision exactly. The link is sound by
  // construction: both Permissions share this item's single parsed
  // threshold (one cap). Stale links for this section are deleted
  // first, so a re-compile that stops producing one grant removes
  // the link instead of leaving a dead-lien edge. Both endpoints
  // live or die together (same document, same compile), so a
  // superseded document's links are never traversed from an
  // operative leg.
  await prisma.permissionRelationship.deleteMany({
    where: {
      companyId: params.companyId,
      sourceSectionRef: params.sectionRef,
      relationshipType: "AUTOMATIC_LINKED_PERMISSION",
    },
  });
  const debtPerm = results.find((r) => r.grantType === "DEBT_INCURRENCE" && r.permissionId);
  const lienPerm = results.find((r) => r.grantType === "LIEN" && r.permissionId);
  if (debtPerm?.permissionId && lienPerm?.permissionId) {
    await prisma.permissionRelationship.create({
      data: {
        companyId: params.companyId,
        fromPermissionId: debtPerm.permissionId,
        toPermissionId: lienPerm.permissionId,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
        sourceSectionRef: params.sectionRef,
        notes: `Same provision ${params.sectionRef} compiles both a debt and a lien Permission on one cap (${parsed.thresholdValue}); the lien automatically covers the debt leg.`,
      },
    });
  }

  // Rule 179: a shared aggregate cap joins (or creates) the group's
  // SharedCapacityConstraint so solver elections enforce one basket.
  const debtResult = results.find((r) => r.grantType === "DEBT_INCURRENCE" && r.permissionId);
  const sharedGroup = debtResult?.permissionId ? detectSharedCapGroup(item) : null;
  if (sharedGroup && debtResult?.permissionId) {
    await syncSharedCapConstraint({
      companyId: params.companyId,
      sourceId: params.sourceId,
      sectionRef: params.sectionRef,
      documentId,
      debtPermissionId: debtResult.permissionId,
      group: sharedGroup,
    });
  }

  await syncDocumentCapacityFormulas(params.companyId, documentId);
  await syncDocumentRpWaterfall(params.companyId, documentId);
  await supersedeCounselPermissionsOnAmendedDocs(params.companyId, documentId, params.sectionRef);

  return results;
}

async function upsertCounselProvision(params: {
  companyId: string;
  documentId: string;
  code: string;
  basketName: string;
  sectionRef: string;
  formulaType: string;
  thresholdValue: number;
  params: Record<string, unknown> | null;
  notes: string;
}): Promise<void> {
  const existing = await prisma.covenantProvision.findFirst({
    where: {
      companyId: params.companyId,
      documentId: params.documentId,
      code: params.code,
      effectiveTo: null,
    },
  });
  const data = {
    companyId: params.companyId,
    documentId: params.documentId,
    code: params.code,
    basketName: params.basketName,
    sectionRef: params.sectionRef,
    formulaType: params.formulaType as never,
    thresholdValue: new Prisma.Decimal(params.thresholdValue),
    params: (params.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    notes: params.notes,
    effectiveTo: null as Date | null,
  };
  if (existing) {
    await prisma.covenantProvision.update({ where: { id: existing.id }, data });
  } else {
    await prisma.covenantProvision.create({ data });
  }
}

/**
 * Rebuild Document.capacityFormulas from counsel-compiled MODELED permissions.
 * Secured = MIN(debt baskets, lien baskets); unsecured = SUM(debt baskets).
 * Does not invent CoverageDeclaration completeness.
 */
export async function syncDocumentCapacityFormulas(companyId: string, documentId: string): Promise<void> {
  const perms = await prisma.permission.findMany({
    where: {
      companyId,
      documentId,
      modelingStatus: "MODELED",
      code: { startsWith: "counsel:" },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  const debtCodes = perms.filter((p) => p.grantType === "DEBT_INCURRENCE" && p.code).map((p) => p.code!);
  const lienCodes = perms.filter((p) => p.grantType === "LIEN" && p.code).map((p) => p.code!);

  // Rule 179: load the document's shared-cap groups so the legacy
  // formula counts each shared basket once (MIN(cap, SUM(members)))
  // instead of once per member clause. Members are resolved to
  // codes through the currently-operative Permissions; a member
  // whose Permission is superseded simply drops out of the group.
  const sharedGroups: SharedCapGroup[] = [];
  try {
    const constraints = await prisma.sharedCapacityConstraint.findMany({ where: { companyId } });
    const codeByPermissionId = new Map(perms.filter((p) => p.code).map((p) => [p.id, p.code!]));
    for (const c of constraints) {
      const members = await prisma.sharedCapacityConstraintMember.findMany({ where: { constraintId: c.id } });
      const memberCodes = members
        .map((m) => codeByPermissionId.get(m.permissionId ?? ""))
        .filter((code): code is string => Boolean(code));
      // A group forms with ONE compiled member: the aggregate cap
      // binds that member even when its twins have not compiled yet
      // (or never do). Requiring >= 2 members silently dropped the
      // aggregate cap for the single compiled member — its own
      // (higher) threshold then stood alone and overstated capacity.
      if (memberCodes.length >= 1 && c.capAmount !== null && c.capAmount !== undefined) {
        sharedGroups.push({
          capMillions: Number(c.capAmount),
          memberCodes,
          label: `Shared aggregate cap (${c.sourceSectionRef})`,
        });
      }
    }
  } catch (err) {
    // A shared-cap retrieval failure must NOT silently remove an
    // operative aggregate cap: falling through with sharedGroups
    // [] would rebuild the legacy formulas with each member
    // counted independently (stacking), overstating capacity.
    // Fail the sync loudly — the previous formulas stay in place
    // (no write happens) and the caller treats the item as
    // unresolved instead of publishing uncapped formulas.
    throw new Error(
      `Shared-capacity grouping failed while rebuilding legacy formulas for document ${documentId} — refusing to publish formulas without the aggregate cap: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Secured requires BOTH legs (buildCapacityFormulas mints no secured
  // formula when one leg is missing — the missing leg is unknown,
  // not unconstrained).
  const capacityFormulas = buildCapacityFormulas(debtCodes, lienCodes, sharedGroups);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      capacityFormulas: Object.keys(capacityFormulas).length
        ? (capacityFormulas as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/**
 * Rebuild Document.rpWaterfall from counsel-compiled RESTRICTED_PAYMENT / INVESTMENT
 * Permissions. Steps are ordered builder → flat → other; ratio gates attached when present.
 * Does not invent ratio-gate codes when none were compiled. An empty
 * build clears rpWaterfall (a stale waterfall must not survive its
 * permissions — e.g. after counsel REJECTED them all).
 */
export async function syncDocumentRpWaterfall(companyId: string, documentId: string): Promise<void> {
  const perms = await prisma.permission.findMany({
    where: {
      companyId,
      documentId,
      modelingStatus: "MODELED",
      code: { startsWith: "counsel:" },
      grantType: { in: ["RESTRICTED_PAYMENT", "INVESTMENT"] },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  const rpWaterfall = buildRpWaterfall(
    perms.map((p) => ({ code: p.code, grantType: p.grantType, formulaType: p.formulaType, sectionRef: p.sectionRef })),
  );

  await prisma.document.update({
    where: { id: documentId },
    data: { rpWaterfall: rpWaterfall ? (rpWaterfall as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
  });
}

/** When the operative document is an amendment (or supersedes another), end prior counsel permissions on superseded docs for the same section. */
async function supersedeCounselPermissionsOnAmendedDocs(
  companyId: string,
  documentId: string,
  sectionRef: string,
): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, companyId },
    select: { id: true, supersedesDocumentId: true, type: true },
  });
  if (!doc?.supersedesDocumentId) return;
  const prior = await prisma.permission.findMany({
    where: {
      companyId,
      documentId: doc.supersedesDocumentId,
      sectionRef,
      code: { startsWith: "counsel:" },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });
  const now = new Date();
  for (const p of prior) {
    await prisma.permission.update({
      where: { id: p.id },
      data: {
        effectiveTo: now,
        notes: `${p.notes ?? ""}\n[Superseded by counsel compile on amendment document ${documentId} at ${now.toISOString()}]`.trim(),
      },
    });
    await prisma.covenantProvision.updateMany({
      where: { companyId, documentId: doc.supersedesDocumentId, code: p.code ?? undefined, effectiveTo: null },
      data: { effectiveTo: now },
    });
  }
  if (prior.length) {
    await syncDocumentCapacityFormulas(companyId, doc.supersedesDocumentId);
    // Symmetric: the superseded doc's RP waterfall must also rebuild
    // from remaining operative permissions (or clear) — otherwise it
    // keeps gating RP transactions with ended baskets.
    await syncDocumentRpWaterfall(companyId, doc.supersedesDocumentId);
  }
}

