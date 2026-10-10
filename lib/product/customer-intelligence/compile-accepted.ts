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

export type CompileStatus =
  | "COMPILED"
  | "UPDATED"
  | "SUPERSEDED"
  | "INCOMPLETE"
  | "SKIPPED"
  | "FAILED";

export type CounselGrantType = "DEBT_INCURRENCE" | "LIEN" | "RESTRICTED_PAYMENT" | "INVESTMENT";

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

function parseMoneyMillions(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?/i);
  if (!m) return null;
  let n = Number(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/billion/i.test(m[2] ?? "")) n *= 1000;
  else if (!m[2] && n >= 1_000_000) n = n / 1_000_000; // raw dollars → $M
  else if (!m[2] && n > 10_000) n = n / 1_000_000;
  return n;
}

function parsePct(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]) / 100;
  return Number.isFinite(n) ? n : null;
}

function parseRatio(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:to|:)\s*1(?:\.0+)?/i) || text.match(/(\d+(?:\.\d+)?)\s*x\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function grantTypesForItem(item: CovenantSummaryItem, category: string): CounselGrantType[] {
  const hay = `${category} ${item.category} ${item.heading} ${item.families.join(" ")} ${item.plainEnglish}`.toUpperCase();

  // Restricted payments / investments — do not default these into DEBT_INCURRENCE.
  const isRpFamily = /RESTRICTED.?PAYMENT|DIVIDEND|SHARE.?REPURCHASE|\bRP\b|AVAILABLE AMOUNT/.test(hay);
  const isInvestmentFamily = /INVESTMENT|ACQUISITION|PERMITTED INVESTMENT/.test(hay);
  if (isRpFamily && isInvestmentFamily) {
    // Shared RP/Investment article — mint both grant types when baskets mention both.
    const out: CounselGrantType[] = [];
    if (/DIVIDEND|RESTRICTED PAYMENT|SHARE.?REPURCHASE|\bRP\b/.test(hay)) out.push("RESTRICTED_PAYMENT");
    if (/INVESTMENT|ACQUISITION/.test(hay)) out.push("INVESTMENT");
    if (out.length) return [...new Set(out)];
  }
  if (isRpFamily && !/INDEBTEDNESS|DEBT INCURRENCE|INCREMENTAL/.test(hay)) {
    return ["RESTRICTED_PAYMENT"];
  }
  if (isInvestmentFamily && !/INDEBTEDNESS|DEBT INCURRENCE|LIEN|INCREMENTAL/.test(hay)) {
    return ["INVESTMENT"];
  }

  const out: CounselGrantType[] = [];
  if (/LIEN|SECURED|COLLATERAL/.test(hay)) out.push("LIEN");
  if (/DEBT|INDEBTEDNESS|INCURRENCE|INCREMENTAL|BORROW/.test(hay)) out.push("DEBT_INCURRENCE");
  // Secured debt scenarios need both regimes when both families are present.
  if (/LIEN|SECURED/.test(hay) && /DEBT|INDEBTEDNESS/.test(hay)) {
    return ["DEBT_INCURRENCE", "LIEN"];
  }
  if (!out.length) out.push("DEBT_INCURRENCE");
  return [...new Set(out)];
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
  const pct = parsePct(basketText);
  const ratio = parseRatio(basketText);
  const greaterOf = /greater of/i.test(basketText);
  const ebitdaBase = /EBITDA/i.test(basketText);
  const assetsBase =
    /Total Assets|Consolidated Total Assets|total consolidated assets/i.test(basketText);
  // Strong builder signal: Available Amount / Cumulative Credit as the capacity mechanism.
  // A mere mention of "Available Amount" next to a greater-of grower must NOT win (Cycle 5).
  const builderStrong =
    /\bAvailable Amount\b[\s\S]{0,80}\b(?:means|equal to|shall be|is equal to)\b|\bbuilder basket\b|\bCumulative Credit\b[\s\S]{0,60}\b(?:means|equal to)\b/i.test(
      basketText,
    );
  const builderMention = /Available Amount|builder basket|Cumulative Credit/i.test(basketText);
  const outstanding = /outstanding amount at any time|currently outstanding/i.test(basketText);

  // Prefer greater-of / assets growers over builder — co-occurrence of Available Amount
  // language with grower baskets caused BUILDER false-executables in Cycle 4 audit.
  if (greaterOf && money != null && ebitdaBase && pct != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: money,
      params: { pctEbitda: pct },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % EBITDA basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase && pct != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: money,
      params: { pctTotalAssets: pct },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: [
        "Compiled greater-of flat / % Consolidated Total Assets basket from counsel-accepted analysis",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (builderStrong && money != null && !greaterOf) {
    return {
      formulaType: "BUILDER_BASKET",
      thresholdValue: money,
      params: {
        pctEbitda: ebitdaBase && pct != null ? pct : 0,
        cniSharePct: /net income|CNI/i.test(basketText) ? 0.5 : undefined,
        includeEquityProceeds: /equity/i.test(basketText),
      },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled builder/available-amount starter from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: ebitdaBase && pct == null ? ["builder pct of EBITDA"] : [],
    };
  }

  // Weak builder mention without strong definitional capacity → do not force BUILDER_BASKET.
  if (builderMention && money != null && !greaterOf && !builderStrong) {
    notes.push(
      "Available Amount / builder language mentioned but not definitional capacity — not auto-classified as BUILDER_BASKET",
    );
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

function permissionCode(sourceId: string, sectionRef: string, grantType: string): string {
  const safe = `${sourceId}:${sectionRef}:${grantType}`.replace(/[^a-zA-Z0-9:_.-]/g, "_").slice(0, 180);
  return `counsel:${safe}`;
}

/**
 * After counsel ACCEPT/EDIT, attempt to compile executable Permission(s).
 * REJECT supersedes prior counsel-compiled permissions for that section.
 */
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
    const prefix = `counsel:${params.sourceId}:${params.sectionRef}:`;
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

  const grants = grantTypesForItem(item, params.category);
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
  const conditions = (item.conditions ?? []).slice(0, 12).map((c) => ({ text: c }));

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

  const ref = (code: string) => ({ op: "REF" as const, code });
  const capacityFormulas: Record<string, unknown> = {};

  if (debtCodes.length && lienCodes.length) {
    capacityFormulas.secured = {
      op: "MIN",
      label: "Secured capacity (counsel-compiled debt ∩ lien)",
      items: [
        { op: "SUM", items: debtCodes.map(ref), label: "Debt baskets" },
        { op: "SUM", items: lienCodes.map(ref), label: "Lien baskets" },
      ],
    };
  } else if (debtCodes.length) {
    capacityFormulas.secured = {
      op: "SUM",
      label: "Secured capacity (debt baskets — lien regime not yet counsel-compiled)",
      items: debtCodes.map(ref),
    };
  } else if (lienCodes.length) {
    capacityFormulas.secured = {
      op: "SUM",
      label: "Secured capacity (lien baskets — debt regime not yet counsel-compiled)",
      items: lienCodes.map(ref),
    };
  }

  if (debtCodes.length) {
    capacityFormulas.unsecured = {
      op: "SUM",
      label: "Unsecured debt baskets (counsel-compiled)",
      items: debtCodes.map(ref),
    };
  }

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
 * Does not invent ratio-gate codes when none were compiled.
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
  if (!perms.length) return;

  const rank = (p: (typeof perms)[number]): number => {
    if (p.formulaType === "BUILDER_BASKET") return 0;
    if (p.formulaType === "FLAT_AMOUNT" || String(p.formulaType).includes("GREATER_OF")) return 1;
    if (p.formulaType === "RATIO_GATE" || p.formulaType === "LEVERAGE_RATIO_ROOM") return 9;
    return 5;
  };

  const stepPerms = perms
    .filter((p) => p.formulaType !== "RATIO_GATE" && p.code)
    .sort((a, b) => rank(a) - rank(b) || a.sectionRef.localeCompare(b.sectionRef));
  const steps = stepPerms.map((p) => ({ code: p.code! }));
  if (!steps.length) return;

  const ratioGates = perms.filter((p) => p.formulaType === "RATIO_GATE" && p.code);
  const dividendGate =
    ratioGates.find((p) => p.grantType === "RESTRICTED_PAYMENT")?.code ??
    ratioGates[0]?.code ??
    steps[steps.length - 1]!.code;
  const investmentGate =
    ratioGates.find((p) => p.grantType === "INVESTMENT")?.code ??
    ratioGates[0]?.code ??
    steps[steps.length - 1]!.code;

  const rpWaterfall = {
    steps,
    ratioGateCodeByKind: {
      dividend: dividendGate,
      investment: investmentGate,
    },
  };

  await prisma.document.update({
    where: { id: documentId },
    data: { rpWaterfall: rpWaterfall as Prisma.InputJsonValue },
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
  }
}

/** Pure helper for tests — parse without DB. */
export function parseCounselFormulaForTest(item: CovenantSummaryItem) {
  return parseFormulaFromItem(item);
}
