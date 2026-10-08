/**
 * Actionable defect tickets for production owning agents.
 * Minimal reproductions. No production fixes in this branch.
 */
import type { CriticalAdjudication, OwningAgent } from "./phase2-adjudication";

export interface DefectTicket {
  ticketId: string;
  defectId: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  owningAgent: OwningAgent;
  coordinatingAgents: OwningAgent[];
  classification: string;
  minimalReproduction: string[];
  acceptanceCriteriaForFix: string[];
  frozenOracleProtection: string;
  fixturePaths: string[];
  productionFixAllowedOnEvaluationBranch: false;
}

export function buildDefectTickets(adjudications: CriticalAdjudication[]): DefectTicket[] {
  return adjudications.map((a) => ({
    ticketId: `TICKET-${a.defectId}`,
    defectId: a.defectId,
    title: a.title,
    severity: a.priority,
    owningAgent: a.recommendedOwningAgent,
    coordinatingAgents: a.coordinatingAgents,
    classification: a.classification,
    minimalReproduction: [
      `Checkout evaluation branch; do not modify docs/live-corpus-quality-gate/phase1-freeze/`,
      `Inspect source: ${a.sourcePath} (sha256 ${a.sourceSha256})`,
      `Compiler stage: ${a.compilerStage}`,
      `Confirm actualOutput: ${JSON.stringify(a.actualOutput)}`,
      `Expected safe behavior: ${a.expectedSafeBehavior}`,
      ...a.independentEvidence.map((e) => `Evidence: ${e}`),
    ],
    acceptanceCriteriaForFix: [
      "Fix lands on a production branch owned by the recommended agent — not by silently editing this evaluation oracle.",
      "Independent replay of Phase-1 freeze still reproduces the historical finding until a NEW evaluation epoch is explicitly opened.",
      "New regression test on production side proves the generalized fix without package-specific hardcoding (Architecture Invariant #29).",
      a.expectedSafeBehavior,
    ],
    frozenOracleProtection:
      "docs/live-corpus-quality-gate/phase1-freeze/* is immutable. Agents implementing fixes MUST NOT edit frozen findings, expected statuses, or FREEZE-MANIFEST.json.",
    fixturePaths: [a.sourcePath, ...a.independentEvidence.filter((e) => e.includes("/"))],
    productionFixAllowedOnEvaluationBranch: false,
  }));
}

export function ticketsByOwner(tickets: DefectTicket[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of tickets) {
    out[t.owningAgent] = out[t.owningAgent] ?? [];
    out[t.owningAgent].push(t.ticketId);
    for (const c of t.coordinatingAgents) {
      out[c] = out[c] ?? [];
      if (!out[c].includes(t.ticketId)) out[c].push(`${t.ticketId} (coordinating)`);
    }
  }
  return out;
}
