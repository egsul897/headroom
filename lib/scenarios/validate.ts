/**
 * Saved Simulate scenarios — PR 414 `SavedScenario {id, name, savedAt, lines: {label, value}[]}`.
 * Lines are saved DISPLAY values (strings) exactly as the CFO saw them; the server never
 * parses them into figures or recomputes them. Bounded input; anything else is rejected.
 */
export type ScenarioLine = { label: string; value: string };
export type SavedScenario = { id: string; name: string; savedAt: string; lines: readonly ScenarioLine[] };

export const LIMITS = { name: 120, lines: 50, label: 120, value: 64, perWorkspace: 100 } as const;

const clean = (s: unknown, max: number): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return t && t.length <= max ? t : null;
};

export function validateScenarioInput(body: unknown): { ok: true; name: string; lines: ScenarioLine[] } | { ok: false; error: string } {
  const b = (body ?? {}) as { name?: unknown; lines?: unknown };
  const name = clean(b.name, LIMITS.name);
  if (!name) return { ok: false, error: `name required (1–${LIMITS.name} chars)` };
  if (!Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > LIMITS.lines) return { ok: false, error: `lines must be 1–${LIMITS.lines} {label, value} items` };
  const lines: ScenarioLine[] = [];
  for (const l of b.lines as Array<{ label?: unknown; value?: unknown }>) {
    const label = clean(l?.label, LIMITS.label);
    const value = clean(l?.value, LIMITS.value);
    if (!label || !value) return { ok: false, error: `each line needs label (≤${LIMITS.label}) and value (≤${LIMITS.value}) strings` };
    lines.push({ label, value });
  }
  return { ok: true, name, lines };
}

/** DB row ⇒ SavedScenario; malformed stored lines are dropped, never invented. */
export function toSavedScenario(row: { id: string; name: string; savedAt: Date; lines: unknown }): SavedScenario {
  const lines = Array.isArray(row.lines)
    ? (row.lines as Array<{ label?: unknown; value?: unknown }>).filter((l) => typeof l?.label === "string" && typeof l?.value === "string").map((l) => ({ label: l.label as string, value: l.value as string }))
    : [];
  return { id: row.id, name: row.name, savedAt: row.savedAt.toISOString(), lines };
}
