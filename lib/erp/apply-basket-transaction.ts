/**
 * ERP application layer — basket usage (ERP-2).
 *
 * An ERP-reported transaction (debt incurrence, dividend / restricted
 * payment, investment, asset sale, debt repayment, equity issuance) is
 * recorded against the company's covenant state as a real LedgerEntry,
 * so remaining basket capacity reflects actual usage:
 * loadCompanyCovenantData (lib/covenant-engine.ts) reads ACTIVE ledger
 * rows, and the engine sums DIVIDEND + INVESTMENT DEBIT rows into the
 * restricted-payment pool already used. The row this layer writes is
 * indistinguishable in shape from a manual or Simulate-committed entry
 * — except its source/createdBy say `erp:<connectionId>`, because ERP
 * data is SYSTEM-sourced evidence, never counsel- or CFO-verified.
 *
 * Matching is deterministic and fail-closed:
 *  - With a basketHint, the hint must match a known provision or
 *    permission EXACTLY (per field, case/whitespace-normalized) and in
 *    the transaction's own family. Matches that land on more than one
 *    distinct basket (different document or different section) are
 *    ambiguous and are NOT force-matched.
 *  - Without a hint, the transaction's family must be known to the
 *    company's covenant state (a permission of that grant family, an
 *    RP waterfall / asset-sale / capacity configuration, or modeled
 *    provisions / documents of record, per family — see familyKnown).
 *  - Anything else is recorded UNMATCHED and surfaced. It is never
 *    silently dropped and never guessed into a basket.
 *
 * Server-side re-verification (the Rule 134 discipline): the caller
 * asserts nothing about capacity or matching — this function re-reads
 * the company's covenant targets and re-checks the connection's tenant
 * at application time, inside one transaction with the ledger write.
 */

import {
  ERP_TRANSACTION_GRANT_FAMILY,
  ERP_TRANSACTION_KINDS,
  ERP_TRANSACTION_LEDGER_MAP,
  type ErpApplicationDb,
  type ErpApplicationResult,
  type ErpNormalizedFact,
  type ErpTransactionKind,
} from "./types";
import {
  beginErpFactApplication,
  isBlank,
  parseFactDate,
  validateCommonFact,
  validateFactTenancy,
  withErpTx,
  writeErpApplicationRow,
} from "./shared";

interface CovenantTargets {
  provisions: Array<{ id: string; documentId: string; code: string; basketName: string; sectionRef: string }>;
  permissions: Array<{ id: string; documentId: string; code: string | null; grantType: string; sectionRef: string }>;
  documents: Array<{ id: string; capacityFormulas?: unknown; rpWaterfall?: unknown; assetSale?: unknown }>;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same effective-dating semantics as loadCompanyCovenantData's effectiveDateFilter: both null = always effective; effectiveTo is exclusive. */
function isEffective(row: { effectiveFrom?: Date | null; effectiveTo?: Date | null }, at: Date): boolean {
  if (row.effectiveFrom != null && row.effectiveFrom.getTime() > at.getTime()) return false;
  if (row.effectiveTo != null && row.effectiveTo.getTime() <= at.getTime()) return false;
  return true;
}

async function loadCovenantTargets(db: ErpApplicationDb, companyId: string, at: Date): Promise<CovenantTargets> {
  const [provisions, permissions, documents] = await Promise.all([
    db.covenantProvision.findMany({ where: { companyId } }),
    db.permission.findMany({ where: { companyId } }),
    db.document.findMany({ where: { companyId } }),
  ]);
  return {
    provisions: provisions.filter((p) => isEffective(p, at)),
    permissions: permissions.filter((p) => isEffective(p, at)),
    documents: documents.filter((d) => isEffective(d, at)),
  };
}

interface MatchOutcome {
  matched: boolean;
  provisionId: string | null;
  permissionId: string | null;
  documentId: string | null;
  /** How the match was established, for the audit detail. */
  via: string;
  reasons: string[];
}

function resolveHintMatch(kind: ErpTransactionKind, fact: ErpNormalizedFact, targets: CovenantTargets): MatchOutcome {
  const hint = fact.basketHint!;
  const family = ERP_TRANSACTION_GRANT_FAMILY[kind];

  const provMatches = targets.provisions.filter(
    (p) =>
      (!isBlank(hint.provisionCode) && normalizeKey(p.code) === normalizeKey(hint.provisionCode!)) ||
      (!isBlank(hint.basketName) && normalizeKey(p.basketName) === normalizeKey(hint.basketName!)) ||
      (!isBlank(hint.sectionRef) && normalizeKey(p.sectionRef) === normalizeKey(hint.sectionRef!)),
  );
  const permMatches = targets.permissions.filter(
    (pm) =>
      (!isBlank(hint.permissionCode) && pm.code != null && normalizeKey(pm.code) === normalizeKey(hint.permissionCode!)) ||
      (!isBlank(hint.sectionRef) && normalizeKey(pm.sectionRef) === normalizeKey(hint.sectionRef!)),
  );

  // A hint that points at a permission of a DIFFERENT family is a
  // conflicting instruction from the ERP, not a match: the transaction
  // says "dividend", the hint says "debt basket". Never force it.
  const wrongFamily = permMatches.filter((pm) => family != null && pm.grantType !== family);
  if (wrongFamily.length > 0) {
    return {
      matched: false,
      provisionId: null,
      permissionId: null,
      documentId: null,
      via: "hint",
      reasons: [
        `basketHint points at permission ${wrongFamily[0]!.id} (grantType ${wrongFamily[0]!.grantType}, section ${wrongFamily[0]!.sectionRef}), ` +
          `which is not the ${family} family of a ${kind} transaction. Recorded UNMATCHED — a human must reconcile the ERP's basket mapping.`,
      ],
    };
  }

  // A provision and a permission minted from the same section of the
  // same document are the SAME basket seen through two models — they
  // corroborate one match. Distinct (document, section) groups are
  // distinct baskets, and a hint that lands on several is ambiguous.
  const groups = new Map<string, { documentId: string; sectionRef: string; provisionIds: string[]; permissionIds: string[] }>();
  for (const p of provMatches) {
    const key = `${p.documentId}::${normalizeKey(p.sectionRef)}`;
    const g = groups.get(key) ?? { documentId: p.documentId, sectionRef: p.sectionRef, provisionIds: [], permissionIds: [] };
    g.provisionIds.push(p.id);
    groups.set(key, g);
  }
  for (const pm of permMatches) {
    const key = `${pm.documentId}::${normalizeKey(pm.sectionRef)}`;
    const g = groups.get(key) ?? { documentId: pm.documentId, sectionRef: pm.sectionRef, provisionIds: [], permissionIds: [] };
    g.permissionIds.push(pm.id);
    groups.set(key, g);
  }

  if (groups.size === 0) {
    return {
      matched: false,
      provisionId: null,
      permissionId: null,
      documentId: null,
      via: "hint",
      reasons: [
        `basketHint (${JSON.stringify(hint)}) matches no known provision or permission for this company. ` +
          `Recorded UNMATCHED — the ERP's basket reference is not reconciled to the modeled covenants.`,
      ],
    };
  }
  if (groups.size > 1) {
    return {
      matched: false,
      provisionId: null,
      permissionId: null,
      documentId: null,
      via: "hint",
      reasons: [
        `basketHint matches ${groups.size} distinct baskets (${[...groups.values()].map((g) => `${g.documentId} §${g.sectionRef}`).join("; ")}). ` +
          `Ambiguous hints are never force-matched. Recorded UNMATCHED.`,
      ],
    };
  }
  const [group] = [...groups.values()];
  return {
    matched: true,
    provisionId: group!.provisionIds.sort()[0] ?? null,
    permissionId: group!.permissionIds.sort()[0] ?? null,
    documentId: group!.documentId,
    via: `basketHint -> ${group!.documentId} §${group!.sectionRef}`,
    reasons: [],
  };
}

function resolveFamilyMatch(kind: ErpTransactionKind, targets: CovenantTargets): MatchOutcome {
  const family = ERP_TRANSACTION_GRANT_FAMILY[kind];
  const unmatched = (reason: string): MatchOutcome => ({
    matched: false,
    provisionId: null,
    permissionId: null,
    documentId: null,
    via: "family",
    reasons: [reason],
  });
  const matched = (documentId: string | null, via: string): MatchOutcome => ({
    matched: true,
    provisionId: null,
    permissionId: null,
    documentId,
    via,
    reasons: [],
  });

  if (family != null) {
    const perms = targets.permissions.filter((pm) => pm.grantType === family);
    if (perms.length > 0) {
      return matched(perms.length === 1 ? perms[0]!.documentId : null, `${family} permission family (${perms.length} permission(s))`);
    }
  }

  switch (kind) {
    case "DIVIDEND":
    case "INVESTMENT": {
      const docs = targets.documents.filter((d) => d.rpWaterfall != null);
      if (docs.length > 0) return matched(docs.length === 1 ? docs[0]!.id : null, "restricted-payment waterfall");
      return unmatched(
        `No ${family} permission and no document with a restricted-payment waterfall is modeled for this company, so a ${kind} cannot be attributed to a known basket. Recorded UNMATCHED.`,
      );
    }
    case "DEBT_INCURRENCE": {
      const docs = targets.documents.filter((d) => d.capacityFormulas != null);
      if (docs.length > 0) return matched(docs.length === 1 ? docs[0]!.id : null, "modeled debt capacity formulas");
      if (targets.provisions.length > 0) return matched(null, "modeled covenant provisions");
      return unmatched(
        "No DEBT_INCURRENCE permission, no document with capacity formulas, and no modeled covenant provisions exist for this company. Recorded UNMATCHED.",
      );
    }
    case "ASSET_SALE": {
      const docs = targets.documents.filter((d) => d.assetSale != null);
      if (docs.length > 0) return matched(docs.length === 1 ? docs[0]!.id : null, "asset-sale configuration");
      if (targets.provisions.length > 0) return matched(null, "modeled covenant provisions");
      return unmatched(
        "No document with an asset-sale configuration and no modeled covenant provisions exist for this company. Recorded UNMATCHED.",
      );
    }
    case "DEBT_REPAYMENT":
    case "EQUITY_ISSUANCE": {
      // No basket grants a repayment or an equity issuance; these are
      // capital-structure events recorded against the company's
      // documents of record. With no documents there is nothing to
      // record against.
      if (targets.documents.length > 0) {
        return matched(targets.documents.length === 1 ? targets.documents[0]!.id : null, "documents of record");
      }
      return unmatched(`No documents are modeled for this company, so a ${kind} has nothing to be recorded against. Recorded UNMATCHED.`);
    }
  }
}

export async function applyErpBasketTransaction(
  db: ErpApplicationDb,
  companyId: string,
  fact: ErpNormalizedFact,
): Promise<ErpApplicationResult> {
  return withErpTx(db, async (tx) => {
    const begin = await beginErpFactApplication(tx, companyId, "BASKET_TRANSACTION", fact);
    if (begin.action === "done") return begin.result;
    const existing = begin.existing;

    const problems = [
      ...validateCommonFact(fact),
      ...(await validateFactTenancy(tx, companyId, fact)),
    ];
    if (!fact.transactionKind || !ERP_TRANSACTION_KINDS.includes(fact.transactionKind)) {
      problems.push(`transactionKind must be one of ${ERP_TRANSACTION_KINDS.join(", ")}, got ${JSON.stringify(fact.transactionKind)}`);
    }
    if (problems.length > 0) {
      const row = await writeErpApplicationRow(tx, companyId, "BASKET_TRANSACTION", fact, existing, {
        disposition: "REJECTED",
        detail: `Refused: ${problems.join("; ")}`,
      });
      return { disposition: "REJECTED" as const, applicationId: row.id, ledgerEntryId: null, duplicate: false, reasons: problems };
    }

    const kind = fact.transactionKind!;
    const asOf = parseFactDate(fact.asOf)!;
    const targets = await loadCovenantTargets(tx, companyId, asOf);
    const hasHint =
      fact.basketHint != null &&
      (!isBlank(fact.basketHint.basketName) || !isBlank(fact.basketHint.sectionRef) || !isBlank(fact.basketHint.provisionCode) || !isBlank(fact.basketHint.permissionCode));
    const match = hasHint ? resolveHintMatch(kind, fact, targets) : resolveFamilyMatch(kind, targets);

    if (!match.matched) {
      const row = await writeErpApplicationRow(tx, companyId, "BASKET_TRANSACTION", fact, existing, {
        disposition: "UNMATCHED",
        detail: match.reasons.join(" "),
      });
      return { disposition: "UNMATCHED" as const, applicationId: row.id, ledgerEntryId: null, duplicate: false, reasons: match.reasons };
    }

    const { basket, direction } = ERP_TRANSACTION_LEDGER_MAP[kind];
    const description =
      !isBlank(fact.description) ? `ERP — ${fact.description!.trim()}` : `ERP-reported ${kind.toLowerCase().replace(/_/g, " ")} (${fact.externalId})`;
    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        companyId,
        documentId: match.documentId,
        date: asOf,
        description,
        basket,
        amount: fact.amount,
        direction,
        source: `erp:${fact.connectionId}`,
        createdBy: `erp:${fact.connectionId}`,
      },
    });
    const detail =
      `Applied as ledger entry ${ledgerEntry.id}: ${basket} ${direction} ${fact.amount} ${fact.currency} on ${fact.asOf}, ` +
      `matched via ${match.via}. Source: ERP connection ${fact.connectionId}, external id ${fact.externalId}. ERP-sourced usage — not CFO- or counsel-verified.`;
    const row = await writeErpApplicationRow(tx, companyId, "BASKET_TRANSACTION", fact, existing, {
      disposition: "APPLIED",
      detail,
      ledgerEntryId: ledgerEntry.id,
      matchedProvisionId: match.provisionId,
      matchedPermissionId: match.permissionId,
      matchedDocumentId: match.documentId,
    });
    return { disposition: "APPLIED" as const, applicationId: row.id, ledgerEntryId: ledgerEntry.id, duplicate: false, reasons: [detail] };
  });
}
