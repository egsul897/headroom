/**
 * Counsel-review coverage evaluation (Rule 171).
 *
 * The solver-native coverage gate (lib/solver/coverage.ts) requires an
 * explicit, human-attested SolverCoverageDeclaration before a
 * (documentId, side, grantType) scope is evaluated solver-natively.
 * Until now only the onboarding promotion path created those
 * declarations (lib/onboarding/promotion.ts) — the real customer
 * workflow (counsel accepts/edits/rejects summary items, which
 * compile to Permissions) never did, so counsel-compiled Permissions
 * always fell back to LEGACY and capacity labeled itself
 * NON_AUTHORITATIVE_DIAGNOSTIC even after counsel finished review.
 *
 * This module closes that gap with the SAME attestation semantics as
 * promotion: a scope is complete iff every summary item for the
 * document has a decision. Under exception-based review, routine
 * supported interpretations carry a SYSTEM decision (auto-accepted,
 * never labeled counsel-verified) and exception items carry a
 * COUNSEL decision (accepted / edited / rejected). A rejected item
 * counts as decided — counsel explicitly decided it grants
 * nothing. An item that compiles INCOMPLETE (fail-closed, no
 * Permission) still counts as decided: it was reviewed, and it
 * contributes no Permission to the scope. Completeness is about the
 * review, not about how many Permissions compiled.
 *
 * Prisma-free (dependency-injected db) so it is unit-testable. The
 * callers pass the real Prisma client. Called from:
 * - recordReviewerDecision (after compile) — the completion path:
 *   the last undecided item's decision flips the scope to complete.
 * - analyze-upload (after a re-analysis upsert) — the invalidation
 *   path: new undecided items flip a previously-complete scope back
 *   to incomplete. Never blocks either caller (try/catch at call site).
 */
export interface CounselCoverageDb {
  // `args: any` is deliberate: the generated Prisma client methods
  // carry generic SelectSubset/XOR arg types that TypeScript cannot
  // prove assignable to a narrow args shape (the real PrismaClient
  // then fails to satisfy this interface). Same pattern as
  // SolverNativePrismaClient in lib/covenant-engine.ts. Return
  // types stay narrow — the helper only reads these fields.
  knowledgeSource: {
    findUnique(args: any): Promise<{ documentId: string | null; metadata: unknown } | null>;
  };
  permission: {
    findMany(args: any): Promise<{ grantType: string }[]>;
  };
  solverCoverageDeclaration: {
    upsert(args: any): Promise<unknown>;
  };
}

export interface CounselCoverageResult {
  documentId: string | null;
  reviewComplete: boolean;
  /**
   * True when at least one COUNSEL decision attests this document.
   * SYSTEM auto-accepts alone never satisfy it: the declaration
   * gates solver-native evaluation (human-certified coverage), so
   * a document no human ever looked at stays LEGACY even when
   * every item is system-decided. Routine items still execute
   * (their Permissions compile) — only the solver-native
   * attestation requires a human. Absent reviewerKind (legacy
   * rows) counts as COUNSEL.
   */
  humanAttested: boolean;
  decidedCount: number;
  itemCount: number;
  scopes: { grantType: string; sides: string[]; isComplete: boolean }[];
}

const VALID_GRANT_TYPES = new Set(["DEBT_INCURRENCE", "LIEN", "RESTRICTED_PAYMENT", "INVESTMENT"]);

function sidesFor(grantType: string): string[] {
  // Same convention as promotion: LIEN scopes are secured-only
  // (liens are inherently a secured-capacity question); every other
  // grant type is evaluated on both sides.
  return grantType === "LIEN" ? ["secured"] : ["secured", "unsecured"];
}

export async function evaluateCounselCoverage(
  db: CounselCoverageDb,
  params: { companyId: string; sourceId: string },
): Promise<CounselCoverageResult> {
  const row = await db.knowledgeSource.findUnique({ where: { sourceId: params.sourceId } });
  const documentId = row?.documentId ?? null;
  if (!row || !documentId) {
    return { documentId, reviewComplete: false, humanAttested: false, decidedCount: 0, itemCount: 0, scopes: [] };
  }
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const summary = meta.covenantSummary as { items?: { sectionRef: string }[] } | undefined;
  const items = Array.isArray(summary?.items) ? summary.items : [];
  const approvals = Array.isArray(meta.reviewerApprovals)
    ? (meta.reviewerApprovals as { sectionRef?: unknown; category?: unknown }[])
    : [];
  // Fix 6: decidedness keys on (sectionRef, category) — a decision on
  // the EVENTS_OF_DEFAULT reading of a section must not mark the OTHER
  // reading decided. True duplicates (same ref + category) share a key,
  // so one decision covers both (they compile to the same unit).
  const decidedKeys = new Set(
    approvals
      .filter((a) => typeof a.sectionRef === "string")
      .map((a) => `${a.sectionRef as string}::${typeof a.category === "string" ? a.category : ""}`),
  );
  const decidedCount = items.filter((i) =>
    decidedKeys.has(`${i.sectionRef}::${(i as { category?: unknown }).category ?? ""}`),
  ).length;
  const reviewComplete = items.length > 0 && decidedCount === items.length;
  // Human attestation: at least one COUNSEL decision on this
  // document. SYSTEM auto-accepts alone must not silently satisfy
  // the coverage gate (see the CounselCoverageResult doc).
  // Exception-based review is preserved: when exceptions exist,
  // reviewComplete already implies every exception was
  // counsel-decided; this bar only bites for all-routine documents
  // no human ever looked at.
  const humanAttested = approvals.some(
    (a) => (a as { reviewerKind?: unknown }).reviewerKind !== "SYSTEM",
  );
  const coverageComplete = reviewComplete && humanAttested;

  // Scopes come from MODELED Permissions only: a scope with no
  // MODELED Permission has nothing solver-native to evaluate, so it
  // gets no declaration (LEGACY / NOT_TESTED stands, fail-closed).
  const modeled = await db.permission.findMany({
    where: { companyId: params.companyId, documentId, modelingStatus: "MODELED" },
  });
  const grantTypes = [...new Set(modeled.map((p) => p.grantType).filter((g) => VALID_GRANT_TYPES.has(g)))];

  const scopes: CounselCoverageResult["scopes"] = [];
  for (const grantType of grantTypes) {
    const sides = sidesFor(grantType);
    scopes.push({ grantType, sides, isComplete: coverageComplete });
    for (const side of sides) {
      await db.solverCoverageDeclaration.upsert({
        where: { documentId_side_grantType: { documentId, side, grantType } },
        create: {
          companyId: params.companyId,
          documentId,
          side,
          grantType,
          isComplete: coverageComplete,
          notes: coverageComplete
            ? "Declared complete by exception-based review — routine interpretations system-accepted (not counsel-verified); exception items counsel-decided (accepted/edited/rejected)."
            : reviewComplete
              ? "Declared INCOMPLETE — review is complete by system auto-accept alone; no counsel decision attests this document, so solver-native evaluation is withheld (LEGACY stands) until counsel decides at least one item."
            : `Declared INCOMPLETE by exception-based review — ${items.length - decidedCount} of ${items.length} summary items still await a decision (exception items need counsel; routine items auto-accept on analysis).`,
        },
        update: {
          isComplete: coverageComplete,
          notes: coverageComplete
            ? "Declared complete by exception-based review (re-evaluated) — routine interpretations system-accepted (not counsel-verified); exception items counsel-decided."
            : reviewComplete
              ? "Declared INCOMPLETE (re-evaluated) — review is complete by system auto-accept alone; no counsel decision attests this document, so solver-native evaluation is withheld (LEGACY stands) until counsel decides at least one item."
            : `Declared INCOMPLETE by exception-based review (re-evaluated) — ${items.length - decidedCount} of ${items.length} summary items still await a decision (exception items need counsel; routine items auto-accept on analysis).`,
        },
      });
    }
  }
  return { documentId, reviewComplete, humanAttested, decidedCount, itemCount: items.length, scopes };
}
