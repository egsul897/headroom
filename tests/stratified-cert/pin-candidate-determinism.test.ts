/**
 * Inv 21: two emits with identical args → byte-identical packet files.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinCandidate } from "../../scripts/stratified-cert/lib/emit-pin-packet";

const DISCOVERY_ID = "discovery-candidate:cf3d8d9492aeca04392b5172";
const FILES = [
  "00-pin-manifest.json",
  "00-preflight.json",
  "01-target-identity.json",
  "01b-operative-state.json",
  "01c-target-eligibility.json",
];

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmpOut(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pin-candidate-det-"));
  tmpDirs.push(d);
  return d;
}

describe("pinCandidate determinism", () => {
  it("re-run twice → byte-identical packets", () => {
    const args = {
      packageKey: "chwy-2026-credit-agreement" as const,
      discoveryId: DISCOVERY_ID,
      asOfDate: "2026-10-06",
      headSha: "determinism-head-sha",
      startedAt: "2026-10-06T12:00:00.000Z",
      expected: {
        chars: 842,
        sha256: "651afe4b14a01820c98be250741f968a1f0f20eec8a12bcd0c457ca92efb8f4f",
      },
    };
    const a = tmpOut();
    const b = tmpOut();
    pinCandidate({ ...args, outDir: a });
    pinCandidate({ ...args, outDir: b });
    for (const name of FILES) {
      const left = fs.readFileSync(path.join(a, name));
      const right = fs.readFileSync(path.join(b, name));
      expect(left.equals(right), `${name} differs across runs`).toBe(true);
    }
  });
});
