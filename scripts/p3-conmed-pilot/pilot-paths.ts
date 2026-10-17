/**
 * Where the CONMED pilot scripts read and write, without a hard-coded container path.
 *
 * The pilot originally ran with everything under /tmp/claude-0/pilot, which was reclaimed; tests then
 * failed with ENOENT on any machine but that container. Now:
 *  - scratch (run outputs, logs, probe results): HEADROOM_PILOT_DIR, else <os.tmpdir()>/headroom-pilot;
 *  - gateway model catalogue: HEADROOM_GATEWAY_CATALOGUE, else the committed public-catalogue snapshot
 *    tests/fixtures/ai-gateway/models-catalogue.json (provenance inside the file);
 *  - prior Tier-1 records: the committed docs/phase-3-conmed-low-cost-pilot/05-tier1-records.json,
 *    which build-artifacts.ts wrote verbatim from the run's 03-tier1.json.
 * Historical paths quoted in committed docs are provenance and are not rewritten.
 */
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

export const PILOT_DIR = process.env.HEADROOM_PILOT_DIR?.trim() || path.join(os.tmpdir(), "headroom-pilot");

export function pilotPath(...parts: string[]): string {
  return path.join(PILOT_DIR, ...parts);
}

export const GATEWAY_CATALOGUE_FIXTURE = path.join(ROOT, "tests/fixtures/ai-gateway/models-catalogue.json");

export function gatewayCataloguePath(): string {
  return process.env.HEADROOM_GATEWAY_CATALOGUE?.trim() || GATEWAY_CATALOGUE_FIXTURE;
}

export const PRIOR_TIER1_RECORDS = path.join(ROOT, "docs/phase-3-conmed-low-cost-pilot/05-tier1-records.json");
