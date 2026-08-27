/**
 * Phase 2E - materiality classification (task §10). A deterministic,
 * signal-combination heuristic - never suppresses UNCERTAIN to improve
 * precision (task §10's own explicit instruction).
 *
 * MATERIAL: a prohibitory/permissive or covenant-mechanic signal combined
 * with a real economic signal (a dollar/percentage/ratio/EBITDA-style
 * threshold, an aggregate cap, a builder/grower concept) - a competent
 * reviewer's capacity/permission/threshold conclusion could plausibly
 * change after seeing this language.
 * UNCERTAIN: a prohibitory/permissive or covenant-mechanic signal fires
 * WITHOUT an accompanying economic signal - a real qualitative
 * restriction/condition that could still be material (e.g. an entity-scope
 * or consent condition with no quantified number) but cannot be
 * confidently auto-classified either way.
 * NON_MATERIAL: neither category of signal fires (headline-only family
 * words, or no signal at all) - administrative/boilerplate.
 */
import type { SignalHit } from "./signals";
import type { Materiality } from "./types";

export function classifyMateriality(signals: SignalHit[]): Materiality {
  const hasProhibitoryOrPermissive = signals.some((s) => s.category === "PROHIBITORY_PERMISSIVE");
  const hasMechanic = signals.some((s) => s.category === "MECHANIC");
  const hasEconomic = signals.some((s) => s.category === "ECONOMIC");

  if ((hasProhibitoryOrPermissive || hasMechanic) && hasEconomic) return "MATERIAL";
  if (hasProhibitoryOrPermissive || hasMechanic) return "UNCERTAIN";
  if (hasEconomic) return "UNCERTAIN"; // a real number with no prohibitory/mechanic framing - could be a stray cross-reference to a threshold defined elsewhere; do not silently drop, do not fabricate certainty either.
  return "NON_MATERIAL";
}
