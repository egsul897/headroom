/**
 * The condition vocabulary the red baseline and the Gate-2 tests probe with. Deliberately generic
 * drafting language - no issuer, section or benchmark-specific term appears here.
 */
export const CONDITION_MARKERS = [
  "so long as", "provided that", "provided, that", "provided, however", "unless", "subject to",
  "no default", "no event of default", "shall have occurred and be continuing", "if and only if",
  "on a pro forma basis", "after giving effect", "at the time of", "conditioned upon", "required to",
] as const satisfies readonly string[];
