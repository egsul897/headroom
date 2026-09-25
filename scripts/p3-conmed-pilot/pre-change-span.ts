/**
 * The PRE-CHANGE candidate-span expression, kept verbatim so these measurement scripts can still
 * report a genuine before/after now that production derives the anchor-only span. This is the only
 * place the superseded rule survives, and it exists solely to be measured against.
 */
export function preChangeOperativeText(candidate: { structuralNodeIds: string[] }, index: { getNodeText: (id: string, mode: "DESCENDANTS") => string }): string {
  return candidate.structuralNodeIds.map((id) => index.getNodeText(id, "DESCENDANTS")).join("\n\n");
}
