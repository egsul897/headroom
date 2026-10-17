"use client";

import { useState } from "react";
import { DetailDrawer } from "@/components/motion/DetailDrawer";
import { bandSentence, currentBand, type BandReading } from "@/lib/ux/present";

export function BandMeter({ reading }: { reading: BandReading }) {
  const band = currentBand(reading);
  if (!reading.thresholds || !band) {
    return (
      <span className="band-wrap">
        <span className="band-meter is-unset" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="band-caption">Band thresholds not set</span>
      </span>
    );
  }
  return (
    <span className="band-wrap">
      <span className="band-meter" data-band={band} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="band-caption">{band}</span>
    </span>
  );
}

export function ThresholdAlerts({ readings }: { readings: readonly BandReading[] }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const sentences = readings.map((reading) => bandSentence(reading)).filter((line): line is string => line != null);
  const anyThresholds = readings.some((reading) => reading.thresholds != null);

  return (
    <section className="ux-block" aria-label="Threshold alerts">
      <div className="ux-block-head">
        <h2>Threshold alerts</h2>
        <button type="button" className="button button-quiet" onClick={() => setRulesOpen(true)}>
          Alert rules
        </button>
      </div>
      {readings.length === 0 || !anyThresholds ? <p className="ux-note">Band thresholds not set</p> : null}
      <ul className="band-list">
        {readings.map((reading) => (
          <li key={reading.name}>
            <span>{reading.name}</span>
            <BandMeter reading={reading} />
            <span className="band-actual">{reading.actualLabel ?? "Needs input"}</span>
          </li>
        ))}
      </ul>
      <ul className="band-feed">
        {sentences.length === 0 ? <li>No band movement is on file.</li> : sentences.map((line) => <li key={line}>{line}</li>)}
      </ul>
      <DetailDrawer open={rulesOpen} title="Alert rules" onClose={() => setRulesOpen(false)}>
        <p className="drawer-note">Cutoffs are shown as supplied. Editing needs the backend.</p>
        {readings.length === 0 ? <p className="proof-missing">Band thresholds not set</p> : null}
        <ul className="rules-list">
          {readings.map((reading) => (
            <li key={reading.name}>
              <strong>{reading.name}</strong>
              {reading.thresholds ? (
                <span>
                  Healthy through {reading.thresholds.healthyUntil}, moderate through {reading.thresholds.moderateUntil}, limit{" "}
                  {reading.thresholds.limitLabel}.
                </span>
              ) : (
                <span>Band thresholds not set</span>
              )}
              <label>
                Healthy until
                <input disabled value={reading.thresholds ? String(reading.thresholds.healthyUntil) : ""} placeholder="Not set" />
              </label>
            </li>
          ))}
        </ul>
      </DetailDrawer>
    </section>
  );
}
