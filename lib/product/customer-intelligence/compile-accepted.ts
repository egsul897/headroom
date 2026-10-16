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
import { parseMoneyMillions, parsePctOf, parseRatio } from "./money";
import { buildCapacityFormulas, type SharedCapGroup } from "./capacity-formulas";
import { detectSharedCapGroup } from "./shared-cap";
import { buildRpWaterfall } from "./rp-waterfall";
import { grantTypesForItem } from "./grant-types";
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

interface ParsedFormula {
  formulaType:
    | "FLAT_AMOUNT"
    | "GREATER_OF_FLAT_OR_PCT_EBITDA"
    | "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"
    | "LEVERAGE_RATIO_ROOM"
    | "RATIO_GATE"
    | "BUILDER_BASKET";
  thresholdValue: number;
  params?: Record<string, unknown>;
  amountKind: "FIXED" | "INCURRENCE_BASED";
  measurementBasis: "CUMULATIVE_INCURRED" | "CURRENTLY_OUTSTANDING";
  notes: string[];
  modelingStatus: "MODELED" | "KNOWN_NOT_MODELED";
  missingFields: string[];
}

function parseFormulaFromItem(item: CovenantSummaryItem): ParsedFormula {
  const basketText = [
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
    item.plainEnglish,
    item.operativeLanguageExcerpt ?? "",
  ].join("\n");

  const notes: string[] = [];
  const missingFields: string[] = [];
  const money = parseMoneyMillions(basketText);
  // Grower %s are base-attached: the % modifying EBITDA / Total
  // Assets — never the first % anywhere in the text (an unrelated
  // "50% ownership" in the same section is not the grower).
  const pctEbitda = parsePctOf(basketText, "EBITDA");
  const pctAssets = parsePctOf(basketText, "TOTAL_ASSETS");
  const ratio = parseRatio(basketText);
  const greaterOf = /greater of/i.test(basketText);
  const ebitdaBase = /EBITDA/i.test(basketText);
  const assetsBase = /Total Assets|Consolidated Total Assets/i.test(basketText);
  const builder = /Available Amount|builder basket|Cumulative Credit/i.test(basketText);
  const outstanding = /outstanding amount at any time|currently outstanding/i.test(basketText);

  if (builder && money != null) {
    const cniMentioned = /net income|CNI/i.test(basketText);
    const cniShare = parsePctOf(basketText, "CNI");
    return {
      formulaType: "BUILDER_BASKET",
      thresholdValue: money,
      params: {
        // Rule 58: never invent percentages. An unparseable
        // grower % is undefined + missingFields, NOT 0 (which
        // silently zeroes the grower) and NOT 0.5 for CNI
        // (which ADDED 0.5 × max(0, CNI) of invented capacity).
        pctEbitda: ebitdaBase && pctEbitda != null ? pctEbitda : undefined,
        cniSharePct: cniShare ?? undefined,
        includeEquityProceeds: /equity/i.test(basketText),
      },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled builder/available-amount starter from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [
        ...(ebitdaBase && pctEbitda == null ? ["builder pct of EBITDA"] : []),
        ...(cniMentioned && cniShare == null ? ["builder cni share %"] : []),
      ],
    };
  }

  if (greaterOf && money != null && ebitdaBase && pctEbitda != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: money,
      params: { pctEbitda },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % EBITDA basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase && pctAssets != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: money,
      params: { pctTotalAssets: pctAssets },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: [
        "Compiled greater-of flat / % Consolidated Total Assets basket from counsel-accepted analysis",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase) {
    // Grower % present in structure but not parseable — model floor only; require counsel % completion.
    notes.push(
      "Grower component (% of Consolidated Total Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_total_assets"],
    };
  }

  if (ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(basketText)) {
    return {
      formulaType: /unlimited|so long as/i.test(basketText) ? "RATIO_GATE" : "LEVERAGE_RATIO_ROOM",
      thresholdValue: ratio,
      params: { debtBasis: /secured|first.?lien/i.test(basketText) ? "secured" : "total" },
      amountKind: "INCURRENCE_BASED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled ratio permission/gate from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (money != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  missingFields.push("thresholdValue", "formulaType");
  return {
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 0,
    amountKind: "FIXED",
    measurementBasis: "CUMULATIVE_INCURRED",
    notes: ["Could not parse a numeric basket/threshold — not minting MODELED Permission"],
    modelingStatus: "KNOWN_NOT_MODELED",
    missingFields,
  };
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
  approvalNote?: string;
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
    const prefix = permissionCodePrefix(params.sourceId, params.sectionRef);
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
    await prisma.permissionRelationship.deleteMany({
      where: {
        companyId: params.companyId,
        sourceSectionRef: params.sectionRef,
        relationshipType: "AUTOMATIC_LINKED_PERMISSION",
      },
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
  const item = summary?.items.find((i) => i.sectionRef === params.sectionRef);
  if (!item) {
    return [{ status: "FAILED", missingFields: ["summaryItem"], message: "Summary item not found for section" }];
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
    `${item.heading} — counsel-accepted permission`;
  const definedTermRefs = [
    ...(item.relatedDefinedTerms ?? []),
    ...(item.applicableDefinitions ?? []).map((d) => d.term),
  ].filter(Boolean).slice(0, 24);
  const entityScope = entityScopeTags(item);
  // Rule 178: eligibility conditions must carry the solver's shape
  // ({ id, description, kind }), not { text }. The old { text }
  // shape made the solver report 'Eligibility condition "undefined"
  // (kind undefined)' — counsel saw an UNKNOWN with no idea what
  // the condition actually was. The condition text is a
  // plain-language paraphrase with no mechanical evaluation, so it
  // maps to CUSTOM_STATE_PREDICATE without a
  // ruleActivationConditionId: the solver still fails it closed to
  // UNKNOWN, but now with the real condition text in the message.
  const conditions = (item.conditions ?? []).slice(0, 12).map((c, i) => ({
    id: `${params.sourceId}:${params.sectionRef}:cond:${i}`,
    description: String(c).slice(0, 500),
    kind: "CUSTOM_STATE_PREDICATE" as const,
  }));

  for (const grantType of grants) {
    const code = permissionCode(params.sourceId, params.sectionRef, grantType);
    const notes = [
      ...parsed.notes,
      `Counsel ${params.decision} ${new Date().toISOString()}`,
      params.approvalNote ? `Note: ${params.approvalNote}` : null,
      `Source ${params.sourceId}`,
      item.sourceCitation,
    ]
      .filter(Boolean)
      .join("\n");

    const existing = await prisma.permission.findFirst({
      where: { companyId: params.companyId, code },
    });

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
      params: (parsed.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
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
      if (memberCodes.length >= 2 && c.capAmount !== null && c.capAmount !== undefined) {
        sharedGroups.push({
          capMillions: Number(c.capAmount),
          memberCodes,
          label: `Shared aggregate cap (${c.sourceSectionRef})`,
        });
      }
    }
  } catch {
    // Shared-cap grouping must not break the legacy formula sync.
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

/** Pure helper for tests — parse without DB. */
export function parseCounselFormulaForTest(item: CovenantSummaryItem) {
  return parseFormulaFromItem(item);
}
