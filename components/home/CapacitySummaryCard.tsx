import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, RegionCard } from "./RegionCard";

const SEGMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-1)"];

function parseCapacity(display: string): { total: string; segments: { name: string; amount: string; pct: number }[] } {
  const parts = display.split(" · ").map((p) => p.trim()).filter(Boolean);
  const totalPart = parts[0] ?? display;
  const totalMatch = totalPart.match(/(\$[\d,.]+[MBK]?)/i);
  const total = totalMatch?.[1] ?? totalPart.replace(/\s*total$/i, "").trim();

  const amounts: { name: string; amount: string; value: number }[] = [];
  for (const part of parts.slice(1)) {
    const m = part.match(/^(.+?):\s*(\$[\d,.]+[MBK]?)$/i);
    const name = m?.[1];
    const amount = m?.[2];
    if (!name || !amount) continue;
    const raw = amount.replace(/[$,]/g, "");
    const mult = /B$/i.test(amount) ? 1000 : /K$/i.test(amount) ? 0.001 : 1;
    const value = Number(raw) * mult;
    if (!Number.isFinite(value) || value <= 0) continue;
    amounts.push({ name, amount, value });
  }

  const sum = amounts.reduce((a, b) => a + b.value, 0);
  const segments = amounts.map((a) => ({
    name: a.name,
    amount: a.amount,
    pct: sum > 0 ? (a.value / sum) * 100 : 0,
  }));

  return { total, segments };
}

export function CapacitySummaryCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"capacitySummary"> }) {
  const presented = presentFigure(state, "capacitySummary");
  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="capacity-summary" eyebrow="Capacity summary">
        <EmptyCopy slot="capacitySummary" state={presented} />
        <ProofTrigger proof={unloadedProof("Capacity summary", null, FIGURE_INPUTS.capacitySummary)}>How we got this</ProofTrigger>
      </RegionCard>
    );
  }

  const { total, segments } = parseCapacity(presented.display);
  let cursor = 0;
  const stops = segments.map((s, i) => {
    const start = cursor;
    cursor += s.pct;
    return `${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${start}% ${cursor}%`;
  });

  return (
    <RegionCard region="capacity-summary" eyebrow="Capacity summary">
      <div className="home-capacity" data-load-kind="VERIFIED_POPULATED" data-slot="capacitySummary">
        <div
          className="home-capacity-donut"
          style={{
            background: stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--chart-track)",
          }}
          aria-hidden="true"
        >
          <ProofTrigger className="figure-hit home-capacity-donut-hole" proof={unloadedProof("Capacity summary", total, FIGURE_INPUTS.capacitySummary, { review: presented.display })}>
            <span className="home-capacity-total">{total}</span>
            <span className="home-capacity-total-label">Total capacity</span>
          </ProofTrigger>
        </div>
        <ul className="home-capacity-legend">
          {segments.map((s, i) => (
            <li key={`${s.name}-${i}`}>
              <span className="home-capacity-swatch" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
              <span className="home-capacity-name">{s.name}</span>
              <span className="home-capacity-amt">
                {s.amount} ({s.pct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </RegionCard>
  );
}
