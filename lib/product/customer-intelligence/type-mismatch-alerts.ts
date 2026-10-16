/**
 * Pure declared-vs-classified type-mismatch alerts for the monitoring
 * feed. Kept free of prisma imports so it is unit-testable in isolation.
 */

export interface TypeMismatchAlert {
  kind: "TYPE_MISMATCH";
  severity: "attention";
  title: string;
  detail: string;
  sourceRefs: string[];
}

/**
 * The mismatch signal exists on the document pages, the documents
 * list, the review queue, the rulebook, and the covenants page
 * (rules 118–122) — but the monitoring feed, the surface a CFO
 * checks for "what needs attention", was silent about it. A
 * document the analysis treats as a different kind than declared
 * can misroute operative resolution (instrument-family matching),
 * so it must surface in the feed too.
 */
export function typeMismatchAlerts(
  docs: Array<{ filename: string; sourceId: string; declaredType: string | null; documentClass: string }>,
): TypeMismatchAlert[] {
  return docs
    .filter((d) => d.declaredType && d.documentClass && d.documentClass !== d.declaredType)
    .map((d) => ({
      kind: "TYPE_MISMATCH" as const,
      severity: "attention" as const,
      title: `Document type mismatch: ${d.filename}`,
      detail: `Declared as ${d.declaredType}, but analysis classifies this document as ${d.documentClass}. The analysis class governs operative resolution. If the declaration is correct, confirm the document type in the review queue.`,
      sourceRefs: [d.sourceId],
    }));
}
