import { BandMeter } from "@/components/ux/ThresholdAlerts";
import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { formatRatio, keyRatioProof, type KeyRatioModel } from "@/lib/ux/present";

/** Compact ratio strip. Values, limits, and bands come only from the model. */
export function KeyRatios({ ratios }: { ratios: readonly KeyRatioModel[] }) {
  return (
    <section className="key-ratios" aria-label="Key ratios">
      <h2 className="home-eyebrow">Key ratios</h2>
      <div className="key-ratios-grid">
        {ratios.map((ratio) => {
          const shown = formatRatio(ratio.value);
          return (
            <ProofTrigger key={ratio.id} className="key-ratio" proof={keyRatioProof(ratio)}>
              <span className="key-ratio-label">{ratio.label}</span>
              <span className={shown === "Missing input" ? "key-ratio-value is-missing" : "key-ratio-value"}>{shown}</span>
              <span className="key-ratio-limit">{ratio.limitLabel ? `of ${ratio.limitLabel}` : ""}</span>
              <BandMeter
                reading={{
                  name: ratio.label,
                  actual: ratio.value,
                  actualLabel: shown === "Missing input" ? null : shown,
                  thresholds: ratio.thresholds,
                  previousBand: null,
                  trendingToward: null,
                }}
              />
            </ProofTrigger>
          );
        })}
      </div>
    </section>
  );
}
