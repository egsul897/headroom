/**
 * Explicit representation-level semantics.
 * Deterministic validation ≠ legal certification. Never invent reviewer approval.
 */

import type { KnowledgeRepresentationLevel } from "../types";

const ORDER: KnowledgeRepresentationLevel[] = [
  "SOURCE_ONLY",
  "STRUCTURALLY_INDEXED",
  "DISCOVERED_CANDIDATE",
  "SEMANTIC_HYPOTHESIS",
  "DETERMINISTICALLY_VALIDATED",
  "REVIEW_REQUIRED",
  "REVIEWER_VERIFIED",
  "CERTIFIED",
];

export function levelIndex(level: KnowledgeRepresentationLevel): number {
  return ORDER.indexOf(level);
}

/** Only allow monotonic non-decreasing transitions that do not skip certification inventively. */
export function canTransition(from: KnowledgeRepresentationLevel, to: KnowledgeRepresentationLevel): boolean {
  if (from === to) return true;
  // Never invent reviewer/certification states from automation alone.
  if ((to === "REVIEWER_VERIFIED" || to === "CERTIFIED") && from !== to) return false;
  // REVIEW_REQUIRED may be set from any pre-review automated state.
  if (to === "REVIEW_REQUIRED") {
    return levelIndex(from) <= levelIndex("DETERMINISTICALLY_VALIDATED");
  }
  return levelIndex(to) >= levelIndex(from) && levelIndex(to) <= levelIndex("DETERMINISTICALLY_VALIDATED");
}

export function assertNotSilentPromotion(level: KnowledgeRepresentationLevel): void {
  if (level === "CERTIFIED" || level === "REVIEWER_VERIFIED") {
    throw new Error(
      `legal-safety: automated pipeline must not invent ${level}; requires explicit human reviewer record`,
    );
  }
}

export function describeLevel(level: KnowledgeRepresentationLevel): string {
  switch (level) {
    case "SOURCE_ONLY":
      return "Raw acquired source preserved; no structural claim.";
    case "STRUCTURALLY_INDEXED":
      return "Articles/sections/definitions/cross-refs indexed; no operative rule claim.";
    case "DISCOVERED_CANDIDATE":
      return "Deterministic candidate discovery only; not a validated rule.";
    case "SEMANTIC_HYPOTHESIS":
      return "Suggested interpretation; not verified.";
    case "DETERMINISTICALLY_VALIDATED":
      return "Passed deterministic checks only — not legal certification.";
    case "REVIEW_REQUIRED":
      return "Flagged for human review; no approval implied.";
    case "REVIEWER_VERIFIED":
      return "Human reviewer verified; still not product certification.";
    case "CERTIFIED":
      return "Explicit certification gate — never automated.";
  }
}
