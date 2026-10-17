/**
 * Headroom-proposed review decisions — the Rulebook proposes a
 * decision for EVERY item, so counsel's job is confirm-or-edit,
 * not decide-from-scratch.
 *
 * Prisma-free (same reason as routine-review.ts / grant-types.ts)
 * so the proposer is unit-testable without the Prisma client.
 *
 * Proposal kinds:
 * - ACCEPT: Headroom is confident — the item compiles cleanly to a
 *   MODELED Permission or a testable ratio provision. `terms`
 *   carries the exact terms the decision would mint. Counsel
 *   confirms with one click.
 * - REJECT: Headroom is confident the item has no capacity effect
 *   (no grant evidence, no basket/condition/ratio signal). The
 *   provision is real text, but it neither grants nor restricts
 *   borrowing capacity, so rejecting its interpretation keeps it
 *   out of capacity without deleting anything.
 * - NEEDS_INPUT: the item looks capacity-relevant (grant evidence
 *   or a basket/condition/ratio signal) but cannot compile without
 *   counsel resolving something specific — a missing amount, an
 *   UNKNOWN condition, an undetermined posture. Also NEEDS_INPUT,
 *   regardless of capacity signal: a structurally unresolved item
 *   (Phase E / D10) whose placement in the agreement hierarchy is
 *   not certified — counsel must confirm the governing
 *   article/section. `reason` names the exact blocker. These are
 *   the flagged items: the only ones that genuinely need counsel's
 *   attention. Counsel resolves them by editing (supplying the
 *   missing piece) or rejecting.
 *
 * The proposal never decides anything by itself — it is displayed
 * next to the Accept / Edit / Reject form, and only a recorded
 * decision (counsel or SYSTEM auto-accept) changes state.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { parseFormulaFromItem, remainingConditionsForItem } from "./formula-parse";
import { grantTypesForItem } from "./grant-types";
import { parseMaintenanceRatio } from "./maintenance-ratio";
import { isRoutineItem } from "./routine-review";

export type ReviewProposalDecision = "ACCEPTED" | "REJECTED" | "NEEDS_INPUT";

export interface ReviewProposal {
  decision: ReviewProposalDecision;
  /** Why Headroom proposes this — the specific evidence or blocker. */
  reason: string;
  /** The exact terms an ACCEPT would mint (Permission or ratio test), else null. */
  terms: string | null;
  /** True only for NEEDS_INPUT: the item genuinely needs counsel's attention. */
  needsAttention: boolean;
}

/**
 * Remaining conditions — UNKNOWN predicates counsel must
 * resolve. This is the SHARED computation (remainingConditionsForItem):
 * the proposer and the isRoutineItem gate must always agree on
 * what remains, so neither re-implements the cap-restatement /
 * mechanical-proviso filters locally.
 */
function remainingConditions(item: CovenantSummaryItem): string[] {
  return remainingConditionsForItem(item);
}

/** The exact terms an ACCEPT would mint, or null when nothing compiles. */
function compiledTerms(item: CovenantSummaryItem): string | null {
  const grants = grantTypesForItem(item);
  if (grants.length > 0) {
    const parsed = parseFormulaFromItem(item);
    if (parsed.modelingStatus !== "MODELED") return null;
    const threshold =
      parsed.formulaType.startsWith("GREATER_OF")
        ? `greater of $${parsed.thresholdValue}M or ${parsed.formulaType.replace("GREATER_OF_FLAT_OR_PCT_", "")}`
        : `$${parsed.thresholdValue}M`;
    return `${grants.join(" / ")} — ${threshold} (${parsed.formulaType})`;
  }
  const ratio = parseMaintenanceRatio(item);
  if (ratio == null) return null;
  const basis = ratio.debtBasis ? ` on ${ratio.debtBasis} debt` : "";
  return `Maintenance ratio test — ${ratio.thresholdValue} to 1${basis} (${ratio.formulaType})`;
}

export function proposeReviewDecision(item: CovenantSummaryItem): ReviewProposal {
  // Confident accept: routine supported interpretation — compiles
  // cleanly, no remaining conditions, posture determined.
  if (isRoutineItem(item)) {
    const grants = grantTypesForItem(item);
    const terms = compiledTerms(item);
    // A parsed basket threshold below $1,000 is not a real basket
    // in any financing document — it is a parsing artifact (e.g.
    // a day-count or section number read as money, like "$30").
    // Never propose ACCEPT for one; flag it for counsel instead.
    // The $1,000 floor is a sanity bound, not a business rule:
    // no operative basket in leveraged finance is under $1,000.
    if (grants.length > 0) {
      const parsed = parseFormulaFromItem(item);
      if (parsed.modelingStatus === "MODELED" && parsed.thresholdValue > 0 && parsed.thresholdValue < 0.001) {
        return {
          decision: "NEEDS_INPUT",
          reason: `Parsed basket threshold ($${parsed.thresholdValue}M) is implausibly small — likely a parsing artifact, not a real basket. Counsel to confirm the true terms or reject it.`,
          terms: null,
          needsAttention: true,
        };
      }
    }
    if (terms != null) {
      return {
        decision: "ACCEPTED",
        reason:
          grants.length > 0
            ? "Compiles cleanly to a MODELED Permission with no unresolved conditions."
            : "Clean single-test maintenance ratio with no unresolved conditions.",
        terms,
        needsAttention: false,
      };
    }
    // Routine with no compiled terms: pure boilerplate — no
    // capacity signal at all. Rejecting its interpretation keeps
    // it out of capacity without deleting the text.
    return {
      decision: "REJECTED",
      reason: "No capacity effect — the provision neither grants nor restricts borrowing capacity.",
      terms: null,
      needsAttention: false,
    };
  }

  // Phase E (D10) disclosure: a structurally unresolved item is a
  // counsel exception — isRoutineItem above already refuses it —
  // but the generic blocker chain below would name only its
  // conditions / posture / parse state, and the no-signal branch
  // would even propose a routine REJECT ("no capacity effect").
  // Neither names the actual blocker: the item's placement in the
  // agreement hierarchy is not certified. Name it first, in plain
  // words, and keep any further blocker visible after it. This
  // changes only the proposal text — never the gate, never a
  // recorded decision.
  if (item.structuralUnresolved === true) {
    const remaining = remainingConditions(item);
    return {
      decision: "NEEDS_INPUT",
      reason:
        "Structural relationship unresolved: this provision's parent/article could not be established deterministically, so its placement in the agreement hierarchy is not certified. Counsel to confirm the governing article/section before relying on it." +
        (remaining.length > 0
          ? ` It also carries a condition Headroom cannot resolve: ${String(remaining[0])}.`
          : ""),
      terms: null,
      needsAttention: true,
    };
  }

  // Not routine. Does it carry any capacity signal?
  const grants = grantTypesForItem(item);
  const ratio = parseMaintenanceRatio(item);
  const basketShaped =
    (item.materialBasketsThresholds?.length ?? 0) > 0 || (item.conditions?.length ?? 0) > 0;
  const hasSignal = grants.length > 0 || ratio != null || basketShaped;
  if (!hasSignal) {
    return {
      decision: "REJECTED",
      reason: "No capacity effect — no grant evidence and no basket, condition, or ratio signal.",
      terms: null,
      needsAttention: false,
    };
  }

  // Capacity-relevant but cannot compile without counsel. Name the
  // exact blocker — the flagged items are the only ones that
  // genuinely need counsel's attention.
  const remaining = remainingConditions(item);
  if (remaining.length > 0) {
    return {
      decision: "NEEDS_INPUT",
      reason: `Carries a condition Headroom cannot resolve: ${String(remaining[0])}. Counsel to confirm, restate, or reject it.`,
      terms: null,
      needsAttention: true,
    };
  }
  if (item.posture === "UNRESOLVED") {
    return {
      decision: "NEEDS_INPUT",
      reason: "The provision's posture is undetermined — counsel to confirm what it does before it can compile.",
      terms: null,
      needsAttention: true,
    };
  }
  if (grants.length > 0) {
    const parsed = parseFormulaFromItem(item);
    const missing = parsed.missingFields.length > 0 ? parsed.missingFields.join(", ") : "threshold / formula";
    return {
      decision: "NEEDS_INPUT",
      reason: `Looks like a real ${grants.join(" / ")} basket, but Headroom could not parse it (missing: ${missing}). Counsel to supply the terms or reject it.`,
      terms: null,
      needsAttention: true,
    };
  }
  if (ratio == null && basketShaped) {
    return {
      decision: "NEEDS_INPUT",
      reason:
        "Basket-shaped but Headroom could not parse a clean amount or single ratio test from it. Counsel to supply the terms or reject it.",
      terms: null,
      needsAttention: true,
    };
  }
  return {
    decision: "NEEDS_INPUT",
    reason: "Needs counsel input before it can compile.",
    terms: null,
    needsAttention: true,
  };
}
