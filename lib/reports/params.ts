/** Parse an optional ?asOf=YYYY-MM-DD. null = not given; "INVALID" = reject with 400. */
export function parseAsOf(raw: string | null): Date | null | "INVALID" {
  if (raw === null || raw === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "INVALID";
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return "INVALID";
  return d;
}
