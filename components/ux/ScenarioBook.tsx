"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/motion/Toast";
import { scenarioDelta, type SavedScenario, type ScenarioLine } from "@/lib/ux/present";

const STORAGE_NOTE = "Saved in this browser. Server persistence is not connected.";

function storageKey(companyId: string) {
  return `headroom.scenarios.${companyId}`;
}

function readStored(companyId: string): SavedScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.lines));
  } catch {
    return [];
  }
}

function writeStored(companyId: string, scenarios: readonly SavedScenario[]) {
  window.localStorage.setItem(storageKey(companyId), JSON.stringify(scenarios));
}

export function ScenarioBook({
  companyId,
  draftLines,
  seed = [],
}: {
  companyId: string;
  draftLines: readonly ScenarioLine[];
  /** Sample illustrations only. Ignored once this browser has saved scenarios. */
  seed?: readonly SavedScenario[];
}) {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const pushToast = useToast();

  useEffect(() => {
    const stored = readStored(companyId);
    const next = stored.length > 0 ? stored : [...seed];
    setScenarios(next);
    const params = new URLSearchParams(window.location.search);
    const compare = params.get("compare");
    if (compare) {
      const ids = compare
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 3);
      setPicked(ids.filter((id) => next.some((item) => item.id === id)));
    }
    setReady(true);
    // Seed is an illustration constant. Stored scenarios win after the first read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const scenario: SavedScenario = {
      id: `scn-${Date.now().toString(36)}`,
      name: trimmed,
      savedAt: new Date().toISOString(),
      lines: draftLines.map((line) => ({ label: line.label, value: line.value })),
    };
    const next = [scenario, ...scenarios];
    setScenarios(next);
    writeStored(companyId, next);
    setName("");
    pushToast(`Saved ${trimmed}`);
  }

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  const columns = useMemo(
    () => picked.map((id) => scenarios.find((item) => item.id === id)).filter((item): item is SavedScenario => item != null),
    [picked, scenarios],
  );
  const labels = columns[0]?.lines.map((line) => line.label) ?? [];

  async function copyLink() {
    const params = new URLSearchParams(window.location.search);
    if (picked.length === 0) params.delete("compare");
    else params.set("compare", picked.join(","));
    const url = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast("Link copied");
    } catch {
      pushToast(url);
    }
  }

  return (
    <section className="ux-block" aria-label="Saved scenarios">
      <div className="ux-block-head">
        <h2>Saved scenarios</h2>
        <p>{STORAGE_NOTE}</p>
      </div>
      <div className="scenario-save">
        <label>
          Scenario name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this case" />
        </label>
        <button type="button" className="button button-primary" onClick={save} disabled={!name.trim() || !ready}>
          Save scenario
        </button>
      </div>
      {scenarios.length === 0 ? <p className="ux-note">No saved scenarios.</p> : null}
      <ul className="scenario-list">
        {scenarios.map((scenario) => (
          <li key={scenario.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(scenario.id)}
                onChange={() => toggle(scenario.id)}
                disabled={!picked.includes(scenario.id) && picked.length >= 3}
              />
              {scenario.name}
            </label>
            <span>{scenario.lines.map((line) => `${line.label} ${line.value}`).join(" · ")}</span>
          </li>
        ))}
      </ul>
      {columns.length > 0 ? (
        <div className="scenario-compare-wrap">
          <table className="scenario-compare">
            <thead>
              <tr>
                <th scope="col">Field</th>
                {columns.map((column) => (
                  <th scope="col" key={column.id}>
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {columns.map((column, index) => {
                    const value = column.lines.find((line) => line.label === label)?.value ?? "Needs input";
                    const base = columns[0]?.lines.find((line) => line.label === label)?.value ?? "";
                    const delta = index === 0 ? null : scenarioDelta(base, value);
                    const changed = delta != null && delta !== "0";
                    return (
                      <td key={column.id} className={changed ? "is-delta" : undefined}>
                        {value}
                        {changed ? <span> {delta}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <button type="button" className="button button-quiet" onClick={() => void copyLink()}>
        Copy link
      </button>
    </section>
  );
}
