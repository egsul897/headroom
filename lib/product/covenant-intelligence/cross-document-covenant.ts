/**
 * Cross-document covenant reasoning — Agent 5.
 *
 * Evaluates a proposed transaction against every independently applicable
 * operative agreement. Composes (does not duplicate):
 *   - Phase 2C package graph (document roles / relationships)
 *   - Operative amendment precedence (section bindings)
 *   - Phase 3 trusted rulebook presence (read-only signal)
 *   - Phase 4E path enumeration (neutral pathways; no stacking)
 *   - Cross-covenant family analysis (within-doc conjunction + shared caps)
 *
 * Invariants:
 *   - Affirmative permission under one agreement never overrides another
 *     applicable prohibition (conjunction across applicable documents).
 *   - Irrelevant documents need not affirmatively authorize the transaction.
 *   - Missing restrictions / absent operative documents are unknowns — never
 *     inferred satisfied.
 */

import { analyzeCrossCovenant, type CrossCovenantAnalysis } from "./cross-covenant";
import type { CovenantSummaryItem } from "./summarize";
import {
  enumerateCertifiedPaths,
  type CertifiedPathEnumeration,
  type ContemplatedTxnKind,
} from "../north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import type { PackageGraphResult } from "@/lib/contract-model/compiler/package-graph/types";
import {
  extractAmendedSectionRefs,
  extractEffectiveDateHint,
  type OperativeResolutionView,
} from "../customer-intelligence/operative-resolution";

export const CROSS_DOCUMENT_COVENANT_VERSION = "product.cross-document-covenant.v1";

export type CrossDocumentOverallResult =
  | "PERMITTED"
  | "PROHIBITED"
  | "CONDITIONALLY_PERMITTED"
  | "UNDETERMINED"
  | "MULTIPLE_PATHWAYS";

export type DocumentApplicability =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "REQUIRED_BUT_ABSENT"
  | "AMENDMENT_ONLY";

export type RestrictionFamily =
  | "DEBT_INCURRENCE"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "SUBSIDIARY_GUARANTOR"
  | "INTERCREDITOR"
  | "SHARED_CAPACITY"
  | "DEFINITION"
  | "AMENDMENT_EFFECT";

export type Stance = "PERMITS" | "PROHIBITS" | "CONDITIONAL" | "UNKNOWN" | "INAPPLICABLE";

/**
 * How condition satisfaction was established.
 * Caller-supplied knownFacts are never verified production financial evidence.
 */
export type ConditionEvidenceAuthority =
  | "NONE"
  | "CALLER_STIPULATED_HYPOTHETICAL"
  /** Reserved — never assigned from caller knownFacts. See Product Proof 002. */
  | "AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE"
  | "UNKNOWN_OR_UNSUPPORTED";

/**
 * Authority of the legal overallResult for production capacity decisions.
 * A PERMITTED legal outcome under stipulated facts is hypothetical — never
 * verified production capacity solely because the caller supplied favorable facts.
 */
export type LegalOutcomeAuthority =
  | "UNVERIFIED_LEGAL_EVALUATION"
  | "HYPOTHETICAL_UNDER_STIPULATED_FACTS"
  | "VERIFIED_PRODUCTION_CAPACITY";

export interface SourceCitation {
  documentId: string;
  documentLabel: string;
  sectionRef: string;
  excerpt: string;
}

export interface OperativeProvisionFact {
  documentId: string;
  documentLabel: string;
  documentRole:
    | "CREDIT_AGREEMENT"
    | "INDENTURE"
    | "SUPPLEMENTAL_INDENTURE"
    | "AMENDMENT"
    | "INTERCREDITOR"
    | "SECURITY"
    | "OTHER";
  sectionRef: string;
  family: RestrictionFamily;
  posture: "PROHIBITION" | "PERMISSION" | "CONDITION" | "DEFINITION" | "PRIORITY";
  /** Plain statement of the operative rule (sourced from authentic text). */
  statement: string;
  excerpt: string;
  /** Cap in USD when quantitative; null when qualitative / ratio / unknown. */
  capacityUsd: number | null;
  /** Conditions that must hold for a permission to support the transaction. */
  conditions: string[];
  /** Defined terms this provision depends on (same or other section). */
  definitionRefs: Array<{ term: string; sectionRef: string }>;
  /** Cross-document instrument names this provision constrains or permits. */
  crossDocumentTargets: string[];
  /** When set, this fact is operative only on/after (inclusive) this ISO date. */
  effectiveOnOrAfter?: string | null;
  /** When set, this fact is superseded on/after this ISO date. */
  supersededOnOrAfter?: string | null;
  /** Shared-capacity / anti-stacking peers (section refs). */
  sharedCapacityPeers?: string[];
}

export interface ContemplatedTransaction {
  description: string;
  kind: ContemplatedTxnKind;
  amountUsd: number | null;
  secured: boolean | null;
  asOfDate: string;
  /** Instrument classification claimed by the proposer (may differ by agreement). */
  instrumentClassification?: string | null;
  /** Named instruments currently outstanding (for cross-doc caps). */
  outstandingByInstrument?: Record<string, number>;
  /**
   * Caller-stipulated facts for hypothetical condition evaluation.
   * Never authenticated financial evidence. Satisfaction under these facts
   * yields HYPOTHETICAL_UNDER_STIPULATED_FACTS — not verified production capacity.
   *
   * For senior secured leverage gates, also set
   * `seniorSecuredLeverageIsProFormaForContemplatedTransaction: true` to attest
   * the figure is pro forma for this transaction (not an unrelated historical ratio).
   */
  knownFacts?: Record<string, string | number | boolean | null>;
}

export interface EvaluatedRestriction {
  family: RestrictionFamily;
  documentId: string;
  sectionRef: string;
  stance: Stance;
  statement: string;
  citation: SourceCitation;
}

export interface DocumentVerdict {
  documentId: string;
  documentLabel: string;
  documentRole: OperativeProvisionFact["documentRole"];
  applicability: DocumentApplicability;
  applicabilityReason: string;
  governingSections: SourceCitation[];
  evaluatedRestrictions: EvaluatedRestriction[];
  conditions: string[];
  supportedPermissions: string[];
  prohibitions: string[];
  unknowns: string[];
  documentResult: CrossDocumentOverallResult;
}

export interface SystemsConsumed {
  packageGraph: boolean;
  operativeResolution: boolean;
  verifiedRulebookSignal: boolean;
  pathEnumeration4E: boolean;
  crossCovenantAnalysis: boolean;
}

export interface CrossDocumentCovenantVerdict {
  version: typeof CROSS_DOCUMENT_COVENANT_VERSION;
  transaction: ContemplatedTransaction;
  applicableDocuments: Array<{ documentId: string; documentLabel: string; reason: string }>;
  governingSections: SourceCitation[];
  evaluatedRestrictions: EvaluatedRestriction[];
  conditions: string[];
  supportedPermissions: string[];
  prohibitions: string[];
  unknowns: string[];
  overallResult: CrossDocumentOverallResult;
  exactSourceCitations: SourceCitation[];
  documentVerdicts: DocumentVerdict[];
  pathEnumeration: CertifiedPathEnumeration | null;
  crossCovenant: CrossCovenantAnalysis | null;
  systemsConsumed: SystemsConsumed;
  conjunctionRule: "ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT";
  /** Paths enumerated without stacking; never auto-selected as a grant. */
  contractualPathways: Array<{
    pathId: string;
    label: string;
    documentId: string;
    sectionRef: string;
    status: "CANDIDATE" | "CONDITIONAL" | "BLOCKED" | "UNKNOWN";
    note: string;
  }>;
  antiStackingNotes: string[];
  falsePermissionRisks: string[];
  /** How financial/default conditions were (or were not) evidenced. */
  conditionEvidenceAuthority: ConditionEvidenceAuthority;
  /** Whether overallResult may be treated as verified production capacity. */
  legalOutcomeAuthority: LegalOutcomeAuthority;
  /** Always false unless verified approved financial evidence cleared conditions. */
  isVerifiedProductionCapacity: boolean;
  note: string;
}

function iso(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.slice(0, 10);
}

function factOperativeOn(fact: OperativeProvisionFact, asOf: string): boolean {
  const asOfDay = iso(asOf)!;
  const start = iso(fact.effectiveOnOrAfter ?? null);
  const end = iso(fact.supersededOnOrAfter ?? null);
  if (start && asOfDay < start) return false;
  if (end && asOfDay >= end) return false;
  return true;
}

function familiesForKind(kind: ContemplatedTxnKind, secured: boolean | null): Set<RestrictionFamily> {
  const out = new Set<RestrictionFamily>(["DEFINITION", "AMENDMENT_EFFECT"]);
  switch (kind) {
    case "SECURED_DEBT":
      out.add("DEBT_INCURRENCE");
      out.add("LIENS");
      out.add("SUBSIDIARY_GUARANTOR");
      out.add("INTERCREDITOR");
      out.add("SHARED_CAPACITY");
      break;
    case "UNSECURED_DEBT":
      out.add("DEBT_INCURRENCE");
      out.add("SUBSIDIARY_GUARANTOR");
      out.add("SHARED_CAPACITY");
      if (secured === true) {
        out.add("LIENS");
        out.add("INTERCREDITOR");
      }
      break;
    case "RESTRICTED_PAYMENT":
      out.add("RESTRICTED_PAYMENTS");
      out.add("INVESTMENTS");
      out.add("INTERCREDITOR");
      out.add("SHARED_CAPACITY");
      break;
    case "INVESTMENT":
    case "ACQUISITION":
      out.add("INVESTMENTS");
      out.add("RESTRICTED_PAYMENTS");
      out.add("DEBT_INCURRENCE");
      out.add("SUBSIDIARY_GUARANTOR");
      out.add("SHARED_CAPACITY");
      if (secured === true) out.add("LIENS");
      break;
    default:
      out.add("DEBT_INCURRENCE");
      out.add("LIENS");
      out.add("RESTRICTED_PAYMENTS");
      out.add("INVESTMENTS");
  }
  return out;
}

/**
 * When the contemplated instrument is classified differently across agreements
 * (e.g. Capital Lease Obligation ∈ Indenture Indebtedness, ∉ CA borrowed-money
 * Indebtedness), debt facts on a document whose definition excludes the
 * instrument do not apply — and the document need not affirmatively authorize.
 */
function definitionCoversInstrument(
  facts: OperativeProvisionFact[],
  instrumentClassification: string | null | undefined,
): { covers: boolean | null; reason: string } {
  if (!instrumentClassification) return { covers: null, reason: "" };
  const cls = instrumentClassification.toLowerCase();
  const indef = facts.find((f) => f.family === "DEFINITION" && /"Indebtedness"/i.test(f.excerpt + f.statement));
  if (!indef) return { covers: null, reason: "" };
  const text = `${indef.statement} ${indef.excerpt}`.toLowerCase();
  if (/capital lease/.test(cls)) {
    const covers = /capital lease/.test(text);
    return {
      covers,
      reason: covers
        ? `Definition of Indebtedness includes Capital Lease Obligations — instrument is in-scope.`
        : `Definition of Indebtedness is limited to borrowed money (no Capital Lease) — instrument outside this document's Indebtedness covenant.`,
    };
  }
  return { covers: null, reason: "" };
}

function documentRelevantToTxn(
  role: OperativeProvisionFact["documentRole"],
  kind: ContemplatedTxnKind,
  facts: OperativeProvisionFact[],
  wanted: Set<RestrictionFamily>,
  instrumentClassification?: string | null,
): { applicability: DocumentApplicability; reason: string } {
  if (role === "AMENDMENT" || role === "SUPPLEMENTAL_INDENTURE") {
    return {
      applicability: "AMENDMENT_ONLY",
      reason: "Amendment/supplemental document supplies operative supersession bindings, not a standalone affirmative grant.",
    };
  }
  const coverage = definitionCoversInstrument(facts, instrumentClassification);
  if (coverage.covers === false && (kind === "UNSECURED_DEBT" || kind === "SECURED_DEBT")) {
    return {
      applicability: "NOT_APPLICABLE",
      reason: coverage.reason,
    };
  }
  const operativeFamilies = new Set(facts.map((f) => f.family));
  const overlap = [...wanted].some((f) => f !== "DEFINITION" && f !== "AMENDMENT_EFFECT" && operativeFamilies.has(f));
  if (!overlap) {
    return {
      applicability: "NOT_APPLICABLE",
      reason: `No operative restrictions in families required for ${kind}; document need not affirmatively authorize the transaction.`,
    };
  }
  if (role === "INTERCREDITOR" && (kind === "RESTRICTED_PAYMENT" || kind === "SECURED_DEBT")) {
    return {
      applicability: "APPLICABLE",
      reason: "Intercreditor payment/priority restrictions independently constrain the contemplated transaction.",
    };
  }
  return {
    applicability: "APPLICABLE",
    reason: coverage.covers === true
      ? `${coverage.reason} Document contains independently applicable restrictions.`
      : "Document contains independently applicable negative-covenant or priority restrictions for this transaction kind.",
  };
}

/**
 * Evaluate operative conditions against caller-stipulated knownFacts.
 * Never upgrades to verified production financial evidence.
 */
function evaluateConditionsAgainstKnownFacts(
  conditions: string[],
  txn: ContemplatedTransaction,
  sectionRef: string,
  documentLabel: string,
  unknownVerb: "condition not evidenced as satisfied" | "condition not evidenced",
): { unresolved: string[]; usedCallerStipulation: boolean } {
  const known = txn.knownFacts ?? {};
  const unresolved: string[] = [];
  let usedCallerStipulation = false;
  const asOf = iso(txn.asOfDate);
  const snapRaw = known.financialSnapshotAsOf;
  const snap = typeof snapRaw === "string" ? iso(snapRaw) : null;
  const staleUnattested =
    snap != null && asOf != null && snap < asOf && known.seniorSecuredLeverageIsProFormaForContemplatedTransaction !== true;

  for (const c of conditions) {
    let satisfied = false;

    // Affirmative Event of Default blocks "no Event of Default" gates.
    if (/no Event of Default/i.test(c) && (known.eventOfDefault === true || known.noEventOfDefault === false)) {
      unresolved.push(
        `${documentLabel} §${sectionRef}: ${unknownVerb} — affirmative Event of Default under stipulated facts — ${c}`,
      );
      usedCallerStipulation = true;
      continue;
    }

    if (
      /no Default/i.test(c) &&
      known.noDefault === true &&
      !/Payment Conditions|Availability|Borrowing Base|Available Amount/i.test(c) &&
      !/no Event of Default/i.test(c)
    ) {
      satisfied = true;
      usedCallerStipulation = true;
    }
    // Event of Default requires an explicit noEventOfDefault stipulation — bare
    // noDefault must not silently clear an EOD gate (Default ≠ Event of Default).
    // Affirmative EOD / noEventOfDefault===false already continued above.
    if (
      /no Event of Default/i.test(c) &&
      known.noEventOfDefault === true &&
      known.eventOfDefault !== true
    ) {
      satisfied = true;
      usedCallerStipulation = true;
    }
    if (/made in cash|in cash/i.test(c) && /cash/i.test(txn.description)) satisfied = true;
    if (typeof known.fccr === "number" && /Fixed Charge Coverage Ratio|FCCR/i.test(c)) {
      const m = c.match(/(\d+(?:\.\d+)?)/);
      if (m && known.fccr >= Number(m[1])) {
        satisfied = true;
        usedCallerStipulation = true;
      }
    }
    // Senior secured leverage: require explicit pro forma attestation for the contemplated txn.
    // A bare historical ratio is UNKNOWN_OR_UNSUPPORTED — not sufficient.
    if (
      typeof known.seniorSecuredLeverage === "number" &&
      /Senior Secured Leverage|Consolidated Senior Secured Leverage/i.test(c)
    ) {
      const m = c.match(/(\d+(?:\.\d+)?)\s*to\s*1|(\d+(?:\.\d+)?)\s*x/i);
      const ceiling = m ? Number(m[1] ?? m[2]) : null;
      if (staleUnattested) {
        unresolved.push(
          `${documentLabel} §${sectionRef}: ${unknownVerb} — financial snapshot ${snap} is stale vs asOf ${asOf} without pro forma attestation — ${c}`,
        );
        usedCallerStipulation = true;
        continue;
      }
      if (known.seniorSecuredLeverageIsProFormaForContemplatedTransaction !== true) {
        unresolved.push(
          `${documentLabel} §${sectionRef}: ${unknownVerb} — senior secured leverage lacks pro forma attestation for contemplated transaction — ${c}`,
        );
        usedCallerStipulation = true;
        continue;
      }
      if (ceiling != null && known.seniorSecuredLeverage <= ceiling) {
        satisfied = true;
        usedCallerStipulation = true;
      } else if (ceiling != null) {
        unresolved.push(
          `${documentLabel} §${sectionRef}: ${unknownVerb} — pro forma CSSLR ${known.seniorSecuredLeverage} exceeds ${ceiling} — ${c}`,
        );
        usedCallerStipulation = true;
        continue;
      }
    }
    for (const [k, v] of Object.entries(known)) {
      if (
        v === true &&
        k !== "noDefault" &&
        k !== "noEventOfDefault" &&
        k !== "seniorSecuredLeverageIsProFormaForContemplatedTransaction" &&
        k !== "eventOfDefault" &&
        new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, " "), "i").test(c)
      ) {
        satisfied = true;
        usedCallerStipulation = true;
      }
    }
    if (!satisfied) {
      unresolved.push(`${documentLabel} §${sectionRef}: ${unknownVerb} — ${c}`);
    }
  }
  return { unresolved, usedCallerStipulation };
}

function evaluateFactAgainstTxn(
  fact: OperativeProvisionFact,
  txn: ContemplatedTransaction,
): {
  stance: Stance;
  permissions: string[];
  prohibitions: string[];
  conditions: string[];
  unknowns: string[];
  usedCallerStipulation: boolean;
} {
  const permissions: string[] = [];
  const prohibitions: string[] = [];
  const conditions: string[] = [...fact.conditions];
  const unknowns: string[] = [];
  let usedCallerStipulation = false;

  if (fact.posture === "DEFINITION") {
    return {
      stance: "INAPPLICABLE",
      permissions,
      prohibitions,
      conditions,
      unknowns: fact.definitionRefs.length
        ? []
        : [`Definition "${fact.statement.slice(0, 80)}" must be applied wherever referenced — not an independent grant.`],
      usedCallerStipulation: false,
    };
  }

  // Cross-family: a declared Restricted Payment (dividend / Capital Stock distribution)
  // is not authorized by Investment-basket permissions. §7.8 remains enumerated for
  // reclass awareness but must not OR-clear an RP pathway.
  if (
    txn.kind === "RESTRICTED_PAYMENT" &&
    fact.family === "INVESTMENTS" &&
    fact.posture === "PERMISSION"
  ) {
    return {
      stance: "INAPPLICABLE",
      permissions,
      prohibitions,
      conditions,
      unknowns: [
        `${fact.documentLabel} §${fact.sectionRef}: Investment permission is not an applicable Restricted Payment pathway (cross-family OR blocked).`,
      ],
      usedCallerStipulation: false,
    };
  }

  if (fact.posture === "PROHIBITION" && fact.capacityUsd == null && fact.conditions.length === 0) {
    // Absolute prohibition (e.g. RP unless no Default) — condition-gated prohibition.
    if (fact.conditions.length === 0 && /shall not|will not|may not/i.test(fact.statement)) {
      const gate = fact.statement.match(/unless (.+)$/i);
      if (gate) {
        conditions.push(gate[1]!.replace(/\.$/, ""));
        return { stance: "CONDITIONAL", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
      }
      prohibitions.push(`${fact.documentLabel} §${fact.sectionRef}: ${fact.statement}`);
      return { stance: "PROHIBITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
    }
  }

  const amount = txn.amountUsd;
  const outstanding = txn.outstandingByInstrument ?? {};

  // Cross-document instrument caps (e.g. indenture cap on Credit Agreement debt).
  // Only apply when the contemplated transaction is about that target instrument.
  if (fact.crossDocumentTargets.length > 0 && amount != null) {
    const desc = txn.description.toLowerCase();
    const targetsHit = fact.crossDocumentTargets.filter((target) => {
      const t = target.toLowerCase();
      if (outstanding[target] != null || Object.keys(outstanding).some((k) => k.toLowerCase() === t)) {
        // Outstanding map names this instrument — treat as in-scope when txn also references it
        // or when txn is clearly an increase of that instrument.
        return (
          desc.includes(t) ||
          (t.includes("credit agreement") && /credit agreement|loan documents|facility/i.test(desc)) ||
          (t.includes("senior notes") && /senior notes|indenture notes/i.test(desc))
        );
      }
      return desc.includes(t);
    });
    if (targetsHit.length === 0) {
      // Cap concerns a different instrument than the contemplated transaction.
      return { stance: "INAPPLICABLE", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
    }
    for (const target of targetsHit) {
      const key = Object.keys(outstanding).find((k) => k.toLowerCase() === target.toLowerCase());
      const current = key ? Number(outstanding[key] ?? 0) : null;
      if (fact.capacityUsd != null && current != null) {
        const proForma = current + amount;
        if (proForma > fact.capacityUsd) {
          prohibitions.push(
            `${fact.documentLabel} §${fact.sectionRef}: pro forma ${target} outstanding $${proForma.toLocaleString("en-US")} exceeds cap $${fact.capacityUsd.toLocaleString("en-US")}.`,
          );
          return { stance: "PROHIBITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
        }
        permissions.push(
          `${fact.documentLabel} §${fact.sectionRef}: ${target} within cap $${fact.capacityUsd.toLocaleString("en-US")} (pro forma $${proForma.toLocaleString("en-US")}).`,
        );
        return {
          stance: conditions.length ? "CONDITIONAL" : "PERMITS",
          permissions,
          prohibitions,
          conditions,
          unknowns,
          usedCallerStipulation: false,
        };
      }
      if (fact.capacityUsd != null && current == null) {
        unknowns.push(
          `${fact.documentLabel} §${fact.sectionRef}: outstanding balance under "${target}" not supplied — cannot confirm cross-document cap.`,
        );
        return { stance: "UNKNOWN", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
      }
    }
  }

  if (fact.posture === "PERMISSION" && fact.capacityUsd != null && amount != null) {
    if (amount > fact.capacityUsd) {
      prohibitions.push(
        `${fact.documentLabel} §${fact.sectionRef}: amount $${amount.toLocaleString("en-US")} exceeds basket $${fact.capacityUsd.toLocaleString("en-US")}.`,
      );
      return { stance: "PROHIBITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
    }
    permissions.push(
      `${fact.documentLabel} §${fact.sectionRef}: amount within basket $${fact.capacityUsd.toLocaleString("en-US")}.`,
    );
    if (conditions.length > 0) {
      const ev = evaluateConditionsAgainstKnownFacts(
        conditions,
        txn,
        fact.sectionRef,
        fact.documentLabel,
        "condition not evidenced as satisfied",
      );
      unknowns.push(...ev.unresolved);
      usedCallerStipulation = ev.usedCallerStipulation;
      return {
        stance: ev.unresolved.length ? "CONDITIONAL" : "PERMITS",
        permissions,
        prohibitions,
        conditions,
        unknowns,
        usedCallerStipulation,
      };
    }
    return { stance: "PERMITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
  }

  if (fact.posture === "PERMISSION" && fact.capacityUsd == null) {
    // Ratio / qualitative permission — never treat as free grant without evidence.
    const desc = txn.description;
    const loanDocCarveOut = /Loan Documents/i.test(fact.statement);
    const matchesLoanDocTxn =
      loanDocCarveOut &&
      /Loan Documents|Credit Agreement loans|under the (?:Credit Agreement|facility|Loan Documents)/i.test(desc);
    if (matchesLoanDocTxn) {
      permissions.push(`${fact.documentLabel} §${fact.sectionRef}: Loan Documents carve-out matches contemplated facility debt.`);
      return { stance: "PERMITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
    }
    if (loanDocCarveOut) {
      // Alternative basket that does not match this transaction — not a prohibition.
      return { stance: "INAPPLICABLE", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
    }
    permissions.push(`${fact.documentLabel} §${fact.sectionRef}: qualitative/ratio permission exists.`);
    if (fact.conditions.length > 0) {
      const ev = evaluateConditionsAgainstKnownFacts(
        fact.conditions,
        txn,
        fact.sectionRef,
        fact.documentLabel,
        "condition not evidenced",
      );
      unknowns.push(...ev.unresolved);
      usedCallerStipulation = ev.usedCallerStipulation;
      return {
        stance: ev.unresolved.length ? "CONDITIONAL" : "PERMITS",
        permissions,
        prohibitions,
        conditions,
        unknowns,
        usedCallerStipulation,
      };
    }
    return {
      stance: "UNKNOWN",
      permissions,
      prohibitions,
      conditions,
      unknowns: [
        `${fact.documentLabel} §${fact.sectionRef}: permission lacks quantified capacity or evidenced condition satisfaction.`,
      ],
      usedCallerStipulation: false,
    };
  }

  if (fact.posture === "PRIORITY" || fact.posture === "CONDITION" || fact.family === "INTERCREDITOR") {
    for (const c of fact.conditions.length ? fact.conditions : [fact.statement]) {
      unknowns.push(
        `${fact.documentLabel} §${fact.sectionRef}: ${
          fact.family === "INTERCREDITOR" ? "intercreditor/priority" : "operative"
        } condition requires evidence — ${c}`,
      );
    }
    return {
      stance: "CONDITIONAL",
      permissions,
      prohibitions,
      conditions: fact.conditions,
      unknowns,
      usedCallerStipulation: false,
    };
  }

  if (fact.posture === "PROHIBITION") {
    if (fact.capacityUsd != null && amount != null) {
      if (amount > fact.capacityUsd) {
        prohibitions.push(
          `${fact.documentLabel} §${fact.sectionRef}: exceeds stated ceiling $${fact.capacityUsd.toLocaleString("en-US")}.`,
        );
        return { stance: "PROHIBITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
      }
    }
    prohibitions.push(`${fact.documentLabel} §${fact.sectionRef}: ${fact.statement}`);
    return { stance: "PROHIBITS", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
  }

  unknowns.push(`${fact.documentLabel} §${fact.sectionRef}: unable to classify stance from operative fact.`);
  return { stance: "UNKNOWN", permissions, prohibitions, conditions, unknowns, usedCallerStipulation: false };
}

/**
 * Within one document, basket exceptions are alternatives (OR). Absolute
 * prohibitions, lien/secured ceilings, guarantor limits, and cross-document
 * caps are conjunction constraints (AND). Across documents, conjunction always
 * applies — that is handled in aggregateOverall.
 */
function aggregateDocumentResult(args: {
  applicability: DocumentApplicability;
  /** AND-constraint stances (shared caps, guarantor, cross-doc caps, liens ceilings). */
  andStances: Stance[];
  andProhibitions: string[];
  /** OR-pathway stances (debt/RP/investment baskets). */
  orStances: Stance[];
  orPermissions: string[];
  unknowns: string[];
}): CrossDocumentOverallResult {
  if (args.applicability === "NOT_APPLICABLE" || args.applicability === "AMENDMENT_ONLY") {
    return "PERMITTED"; // irrelevant — does not constrain; not a grant
  }
  if (args.applicability === "REQUIRED_BUT_ABSENT") return "UNDETERMINED";
  if (args.andProhibitions.length > 0 || args.andStances.includes("PROHIBITS")) return "PROHIBITED";
  if (args.andStances.includes("UNKNOWN") || args.andStances.includes("CONDITIONAL")) {
    if (args.andStances.includes("UNKNOWN")) return "UNDETERMINED";
    return "CONDITIONALLY_PERMITTED";
  }
  const orActive = args.orStances.filter((s) => s !== "INAPPLICABLE");
  if (orActive.includes("PERMITS") && args.orPermissions.length > 0) {
    // A pathway clears; residual unknowns on unused alternative baskets do not block.
    const blockingUnknowns = args.unknowns.filter((u) => !/alternative basket|does not match/i.test(u));
    // Unknowns attached to the clearing path's conditions are already reflected in orStances.
    if (orActive.includes("CONDITIONAL") && !orActive.includes("PERMITS")) return "CONDITIONALLY_PERMITTED";
    if (blockingUnknowns.length && !orActive.includes("PERMITS")) return "UNDETERMINED";
    return "PERMITTED";
  }
  if (orActive.includes("CONDITIONAL")) return "CONDITIONALLY_PERMITTED";
  if (orActive.includes("UNKNOWN")) return "UNDETERMINED";
  if (orActive.length > 0 && orActive.every((s) => s === "PROHIBITS")) return "PROHIBITED";
  if (args.orPermissions.length > 0) return "PERMITTED";
  // Applicable document with no matching permission and no prohibition → unknown (fail closed)
  return "UNDETERMINED";
}

function isAndConstraint(fact: OperativeProvisionFact): boolean {
  if (
    fact.family === "SHARED_CAPACITY" ||
    fact.family === "SUBSIDIARY_GUARANTOR" ||
    fact.family === "INTERCREDITOR" ||
    fact.family === "AMENDMENT_EFFECT"
  ) {
    return true;
  }
  if (fact.family === "LIENS") return true;
  if (fact.crossDocumentTargets.length > 0 && fact.posture === "PERMISSION") {
    // Cross-document instrument caps (e.g. Indenture cap on Credit Agreement debt) bind as AND.
    return true;
  }
  if (fact.posture === "PROHIBITION") return true;
  return false;
}

function aggregateOverall(docVerdicts: DocumentVerdict[], pathways: CrossDocumentCovenantVerdict["contractualPathways"]): CrossDocumentOverallResult {
  const applicable = docVerdicts.filter((d) => d.applicability === "APPLICABLE" || d.applicability === "REQUIRED_BUT_ABSENT");
  if (applicable.some((d) => d.applicability === "REQUIRED_BUT_ABSENT")) return "UNDETERMINED";
  if (applicable.some((d) => d.documentResult === "PROHIBITED")) return "PROHIBITED";
  if (applicable.some((d) => d.documentResult === "UNDETERMINED")) return "UNDETERMINED";
  // Multiple conditional pathways, none fully cleared — surface path plurality without inventing a grant.
  const candidatePaths = pathways.filter((p) => p.status === "CANDIDATE" || p.status === "CONDITIONAL");
  if (
    applicable.some((d) => d.documentResult === "CONDITIONALLY_PERMITTED") &&
    candidatePaths.length > 1 &&
    applicable.every((d) => d.documentResult === "CONDITIONALLY_PERMITTED" || d.documentResult === "PERMITTED")
  ) {
    // Prefer CONDITIONALLY_PERMITTED as the controlling honesty signal; MULTIPLE_PATHWAYS
    // is reserved when the caller inspects contractualPathways (listed, not selected).
    return "CONDITIONALLY_PERMITTED";
  }
  if (applicable.some((d) => d.documentResult === "CONDITIONALLY_PERMITTED")) return "CONDITIONALLY_PERMITTED";
  if (applicable.length === 0) return "UNDETERMINED";
  if (applicable.every((d) => d.documentResult === "PERMITTED")) {
    // Still list pathways; overall remains PERMITTED when every applicable doc clears.
    // Callers read contractualPathways for plurality (anti-stacking still applies).
    return candidatePaths.length > 1 ? "PERMITTED" : "PERMITTED";
  }
  return "UNDETERMINED";
}

/**
 * Evaluate a contemplated transaction against a multi-document operative fact set.
 * Optional wires reuse existing systems without re-implementing them.
 */
export function evaluateCrossDocumentTransaction(params: {
  transaction: ContemplatedTransaction;
  provisions: OperativeProvisionFact[];
  /** Document ids expected in the package; used to detect absences. */
  packageDocumentIds?: string[];
  /** When a family requires an intercreditor/security doc that is missing. */
  requiredAbsentDocumentIds?: Array<{ documentId: string; label: string; reason: string }>;
  packageGraph?: PackageGraphResult | null;
  operativeResolution?: OperativeResolutionView | null;
  verifiedRulebookHasTrustedUnits?: boolean;
  verifiedPackage?: VerifiedExecutionPackage | null;
  summaryItemsForCrossCovenant?: Array<CovenantSummaryItem & { sourceId: string }>;
}): CrossDocumentCovenantVerdict {
  const txn = params.transaction;
  const wanted = familiesForKind(txn.kind, txn.secured);
  const asOf = txn.asOfDate;

  const byDoc = new Map<string, OperativeProvisionFact[]>();
  for (const f of params.provisions) {
    const list = byDoc.get(f.documentId) ?? [];
    list.push(f);
    byDoc.set(f.documentId, list);
  }

  const documentVerdicts: DocumentVerdict[] = [];
  const allRestrictions: EvaluatedRestriction[] = [];
  const allCitations: SourceCitation[] = [];
  const allConditions: string[] = [];
  const allPermissions: string[] = [];
  const allProhibitions: string[] = [];
  const allUnknowns: string[] = [];
  const antiStackingNotes: string[] = [];
  const falsePermissionRisks: string[] = [];
  let usedCallerStipulation = false;
  const pathways: CrossDocumentCovenantVerdict["contractualPathways"] = [];

  for (const [documentId, facts] of byDoc) {
    const label = facts[0]!.documentLabel;
    const role = facts[0]!.documentRole;
    const operativeFacts = facts.filter((f) => factOperativeOn(f, asOf));
    const { applicability, reason } = documentRelevantToTxn(
      role,
      txn.kind,
      operativeFacts,
      wanted,
      txn.instrumentClassification,
    );

    const governingSections: SourceCitation[] = [];
    const evaluatedRestrictions: EvaluatedRestriction[] = [];
    const conditions: string[] = [];
    const supportedPermissions: string[] = [];
    const prohibitions: string[] = [];
    const unknowns: string[] = [];
    const andStances: Stance[] = [];
    const orStances: Stance[] = [];
    const andProhibitions: string[] = [];

    if (applicability === "APPLICABLE") {
      for (const fact of operativeFacts) {
        if (fact.family === "DEFINITION") {
          // Surface definition dependencies when referenced by other operative facts.
          continue;
        }
        if (!wanted.has(fact.family) && fact.family !== "SHARED_CAPACITY") continue;

        const citation: SourceCitation = {
          documentId: fact.documentId,
          documentLabel: fact.documentLabel,
          sectionRef: fact.sectionRef,
          excerpt: fact.excerpt,
        };
        governingSections.push(citation);
        allCitations.push(citation);

        const ev = evaluateFactAgainstTxn(fact, txn);
        // Only stamp hypothetical authority when stipulation actually cleared a permission path.
        if (ev.usedCallerStipulation && ev.stance === "PERMITS") usedCallerStipulation = true;
        const andConstraint = isAndConstraint(fact);
        if (andConstraint) {
          andStances.push(ev.stance);
          andProhibitions.push(...ev.prohibitions);
        } else {
          orStances.push(ev.stance);
        }
        conditions.push(...ev.conditions);
        supportedPermissions.push(...ev.permissions);
        // Surface all prohibition strings for citations; documentResult uses AND vs OR split.
        prohibitions.push(...ev.prohibitions);
        unknowns.push(...ev.unknowns);

        // Definition forwarding: if permission references definitions, require them present.
        for (const def of fact.definitionRefs) {
          const defFact = params.provisions.find(
            (p) =>
              p.documentId === fact.documentId &&
              p.family === "DEFINITION" &&
              (p.sectionRef === def.sectionRef || p.statement.includes(`"${def.term}"`)),
          );
          if (!defFact || !factOperativeOn(defFact, asOf)) {
            unknowns.push(
              `${fact.documentLabel} §${fact.sectionRef}: definition "${def.term}" (§${def.sectionRef}) not resolved in operative package.`,
            );
          } else {
            allCitations.push({
              documentId: defFact.documentId,
              documentLabel: defFact.documentLabel,
              sectionRef: defFact.sectionRef,
              excerpt: defFact.excerpt,
            });
          }
        }

        if (fact.sharedCapacityPeers?.length) {
          for (const peer of fact.sharedCapacityPeers) {
            antiStackingNotes.push(
              `${fact.documentLabel} §${fact.sectionRef} shares capacity with §${peer} — do not stack independently.`,
            );
          }
        }

        evaluatedRestrictions.push({
          family: fact.family,
          documentId: fact.documentId,
          sectionRef: fact.sectionRef,
          stance: ev.stance,
          statement: fact.statement,
          citation,
        });

        if (!andConstraint && fact.posture === "PERMISSION" && (ev.stance === "PERMITS" || ev.stance === "CONDITIONAL")) {
          pathways.push({
            pathId: `path:${fact.documentId}:${fact.sectionRef}`,
            label: `${fact.documentLabel} §${fact.sectionRef}`,
            documentId: fact.documentId,
            sectionRef: fact.sectionRef,
            status: ev.stance === "CONDITIONAL" ? "CONDITIONAL" : "CANDIDATE",
            note: "Neutral pathway from operative fact — not auto-selected; stacking not assumed.",
          });
        }
      }

      // Fail closed: applicable debt/lien doc with zero matching permissions and zero prohibitions.
      if (
        evaluatedRestrictions.length === 0 &&
        (wanted.has("DEBT_INCURRENCE") || wanted.has("LIENS") || wanted.has("RESTRICTED_PAYMENTS") || wanted.has("INVESTMENTS"))
      ) {
        unknowns.push(
          `${label}: applicable document has no matching operative permission/restriction facts for this transaction — permissibility unresolved (missing restriction not inferred satisfied).`,
        );
      }
    }

    const documentResult = aggregateDocumentResult({
      applicability,
      andStances,
      andProhibitions,
      orStances,
      orPermissions: supportedPermissions,
      unknowns,
    });

    // For reporting: if an OR pathway cleared the document, demote unused-basket
    // overflow strings so they do not look like controlling prohibitions.
    const reportedProhibitions =
      documentResult === "PERMITTED" || documentResult === "CONDITIONALLY_PERMITTED"
        ? andProhibitions
        : [...new Set([...andProhibitions, ...prohibitions])];

    documentVerdicts.push({
      documentId,
      documentLabel: label,
      documentRole: role,
      applicability,
      applicabilityReason: reason,
      governingSections,
      evaluatedRestrictions,
      conditions: [...new Set(conditions)],
      supportedPermissions: [...new Set(supportedPermissions)],
      prohibitions: [...new Set(reportedProhibitions)],
      unknowns: [...new Set(unknowns)],
      documentResult,
    });

    allRestrictions.push(...evaluatedRestrictions);
    allConditions.push(...conditions);
    allPermissions.push(...supportedPermissions);
    if (documentResult === "PROHIBITED") {
      allProhibitions.push(...reportedProhibitions);
    }
    allUnknowns.push(...unknowns);
  }

  // Required-but-absent documents (e.g. missing intercreditor).
  for (const absent of params.requiredAbsentDocumentIds ?? []) {
    documentVerdicts.push({
      documentId: absent.documentId,
      documentLabel: absent.label,
      documentRole: "OTHER",
      applicability: "REQUIRED_BUT_ABSENT",
      applicabilityReason: absent.reason,
      governingSections: [],
      evaluatedRestrictions: [],
      conditions: [],
      supportedPermissions: [],
      prohibitions: [],
      unknowns: [`Required document absent: ${absent.label} — ${absent.reason}`],
      documentResult: "UNDETERMINED",
    });
    allUnknowns.push(`Required document absent: ${absent.label} — ${absent.reason}`);
  }

  // Operative resolution unknowns.
  if (params.operativeResolution?.status === "UNRESOLVED_PRECEDENCE") {
    allUnknowns.push(
      `Operative amendment precedence unresolved: ${params.operativeResolution.unresolvedReasons.join("; ") || params.operativeResolution.note}`,
    );
  } else if (params.operativeResolution?.status === "RESOLVED" || params.operativeResolution?.status === "RESOLVED_PARTIAL") {
    for (const b of params.operativeResolution.bindings) {
      allCitations.push({
        documentId: b.operativeSourceId,
        documentLabel: "Operative amendment binding",
        sectionRef: b.sectionRef,
        excerpt: b.rationale,
      });
    }
  }

  // Cross-covenant (existing module) — within-family coordination signal.
  let crossCovenant: CrossCovenantAnalysis | null = null;
  if (params.summaryItemsForCrossCovenant?.length) {
    crossCovenant = analyzeCrossCovenant({
      transactionDescription: txn.description,
      items: params.summaryItemsForCrossCovenant,
    });
    antiStackingNotes.push(...crossCovenant.antiStackingNotes);
    allUnknowns.push(...crossCovenant.unsupportedAssumptions);
  }

  // Phase 4E path enumeration — reuse, never reimplement.
  let pathEnumeration: CertifiedPathEnumeration | null = null;
  if (params.verifiedPackage !== undefined) {
    pathEnumeration = enumerateCertifiedPaths({
      verifiedPackage: params.verifiedPackage,
      transactionKind: txn.kind,
      secured: txn.secured,
    });
    if (pathEnumeration.authority !== "CERTIFIED_4E") {
      allUnknowns.push(
        `Phase 4E authority=${pathEnumeration.authority}: ${pathEnumeration.incompleteReasons.join("; ") || pathEnumeration.note}`,
      );
    }
  }

  // Package graph: surface unresolved relationships as unknowns when present.
  if (params.packageGraph) {
    const unresolved = params.packageGraph.relationshipCandidates.filter((r) => r.status === "UNRESOLVED");
    for (const r of unresolved.slice(0, 5)) {
      allUnknowns.push(
        `Package graph unresolved relationship: ${r.sourceDocumentId} → ${r.relationshipType} (${r.status})`,
      );
    }
  }

  // False-permission risks: any document-level PERMITTED while another applicable PROHIBITS
  // would be a false permission if OR'd — conjunction prevents that, but record the tension.
  const applicableDocs = documentVerdicts.filter((d) => d.applicability === "APPLICABLE");
  const permitting = applicableDocs.filter((d) => d.supportedPermissions.length > 0);
  const prohibiting = applicableDocs.filter((d) => d.prohibitions.length > 0);
  if (permitting.length && prohibiting.length) {
    falsePermissionRisks.push(
      "Cross-document tension: at least one applicable document supports a permission while another prohibits. Conjunction applies — permission does not override prohibition.",
    );
  }

  const overallResult = aggregateOverall(documentVerdicts, pathways);

  // Harden: never emit PERMITTED if any applicable prohibition exists (belt-and-suspenders).
  let finalResult = overallResult;
  if (allProhibitions.length > 0 && finalResult === "PERMITTED") {
    falsePermissionRisks.push("INTERNAL: overallResult collapsed to PROHIBITED to avoid false permission.");
    finalResult = "PROHIBITED";
  }
  if (allProhibitions.length > 0 && finalResult === "MULTIPLE_PATHWAYS") {
    finalResult = "PROHIBITED";
  }

  const applicableDocuments = applicableDocs.map((d) => ({
    documentId: d.documentId,
    documentLabel: d.documentLabel,
    reason: d.applicabilityReason,
  }));

  // Authority boundary: caller knownFacts never establish verified production capacity.
  // This evaluator does not consume authenticated approved financial snapshots.
  const conditionEvidenceAuthority: ConditionEvidenceAuthority = usedCallerStipulation
    ? "CALLER_STIPULATED_HYPOTHETICAL"
    : allConditions.length > 0 && allUnknowns.some((u) => /condition not evidenced/i.test(u))
      ? "UNKNOWN_OR_UNSUPPORTED"
      : "NONE";
  const legalOutcomeAuthority: LegalOutcomeAuthority = usedCallerStipulation
    ? "HYPOTHETICAL_UNDER_STIPULATED_FACTS"
    : "UNVERIFIED_LEGAL_EVALUATION";
  const isVerifiedProductionCapacity = false;
  if (usedCallerStipulation && (finalResult === "PERMITTED" || finalResult === "MULTIPLE_PATHWAYS")) {
    falsePermissionRisks.push(
      "AUTHORITY: overallResult under caller-stipulated knownFacts is HYPOTHETICAL_UNDER_STIPULATED_FACTS — not verified production capacity.",
    );
  }

  return {
    version: CROSS_DOCUMENT_COVENANT_VERSION,
    transaction: txn,
    applicableDocuments,
    governingSections: dedupeCitations(allCitations),
    evaluatedRestrictions: allRestrictions,
    conditions: [...new Set(allConditions)],
    supportedPermissions: [...new Set(allPermissions)],
    prohibitions: [...new Set(allProhibitions)],
    unknowns: [...new Set(allUnknowns)],
    overallResult: finalResult,
    exactSourceCitations: dedupeCitations(allCitations),
    documentVerdicts,
    pathEnumeration,
    crossCovenant,
    systemsConsumed: {
      packageGraph: !!params.packageGraph,
      operativeResolution: !!params.operativeResolution,
      verifiedRulebookSignal: params.verifiedRulebookHasTrustedUnits === true,
      pathEnumeration4E: params.verifiedPackage !== undefined,
      crossCovenantAnalysis: !!crossCovenant,
    },
    conjunctionRule: "ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT",
    contractualPathways: pathways,
    antiStackingNotes: [...new Set(antiStackingNotes)],
    falsePermissionRisks,
    conditionEvidenceAuthority,
    legalOutcomeAuthority,
    isVerifiedProductionCapacity,
    note:
      "Cross-document evaluation uses conjunction across independently applicable agreements. Irrelevant documents are not required to authorize. Missing restrictions and absent documents remain unknowns. Caller-stipulated knownFacts yield hypothetical satisfaction only — never verified production capacity.",
  };
}

function dedupeCitations(cites: SourceCitation[]): SourceCitation[] {
  const m = new Map<string, SourceCitation>();
  for (const c of cites) {
    const k = `${c.documentId}::${c.sectionRef}::${c.excerpt.slice(0, 40)}`;
    if (!m.has(k)) m.set(k, c);
  }
  return [...m.values()];
}

/**
 * Independent verifier — reconstructs whether a verdict falsely permits.
 * Counts a false permission when overallResult is PERMITTED/MULTIPLE_PATHWAYS/
 * CONDITIONALLY_PERMITTED while any applicable document carries a prohibition,
 * or when PERMITTED despite REQUIRED_BUT_ABSENT / material unknowns that should
 * block determination.
 */
export function verifyCrossDocumentVerdictIndependently(verdict: CrossDocumentCovenantVerdict): {
  confirmed: boolean;
  falsePermissionCount: number;
  findings: string[];
} {
  const findings: string[] = [];
  let falsePermissionCount = 0;

  const applicable = verdict.documentVerdicts.filter(
    (d) => d.applicability === "APPLICABLE" || d.applicability === "REQUIRED_BUT_ABSENT",
  );
  const hasProhibition = applicable.some((d) => d.prohibitions.length > 0 || d.documentResult === "PROHIBITED");
  const hasAbsent = applicable.some((d) => d.applicability === "REQUIRED_BUT_ABSENT");

  if (
    (verdict.overallResult === "PERMITTED" || verdict.overallResult === "MULTIPLE_PATHWAYS") &&
    hasProhibition
  ) {
    falsePermissionCount += 1;
    findings.push("FALSE_PERMISSION: overall permits while an applicable document prohibits.");
  }
  if (verdict.overallResult === "PERMITTED" && hasAbsent) {
    falsePermissionCount += 1;
    findings.push("FALSE_PERMISSION: overall permits while a required document is absent.");
  }
  if (verdict.overallResult === "PERMITTED" && verdict.prohibitions.length > 0) {
    falsePermissionCount += 1;
    findings.push("FALSE_PERMISSION: overall PERMITTED with non-empty prohibitions list.");
  }
  // Permission in one doc must not erase prohibition in another (already counted above).
  if (verdict.conjunctionRule !== "ALL_APPLICABLE_DOCUMENTS_MUST_PERMIT") {
    falsePermissionCount += 1;
    findings.push("FALSE_PERMISSION: conjunction rule missing.");
  }

  // Irrelevant docs must not be required to authorize.
  for (const d of verdict.documentVerdicts) {
    if (d.applicability === "NOT_APPLICABLE" && d.documentResult === "UNDETERMINED" && d.unknowns.some((u) => /must authorize/i.test(u))) {
      falsePermissionCount += 1;
      findings.push(`OVER_REQUIREMENT: irrelevant document ${d.documentId} forced authorization.`);
    }
  }

  return {
    confirmed: falsePermissionCount === 0,
    falsePermissionCount,
    findings,
  };
}

/** Helpers re-exported for scenario/amendment wiring. */
export const amendmentHelpers = {
  extractAmendedSectionRefs,
  extractEffectiveDateHint,
};
