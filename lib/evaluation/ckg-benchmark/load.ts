/**
 * Load CKG dataset + offline system candidates from fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import type { CkgCase, SystemCandidate } from "./types";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "tests/fixtures/covenant-knowledge-generalization",
);

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, rel), "utf8")) as T;
}

export function loadCases(): CkgCase[] {
  const files = [
    "cases/gibraltar-cases.json",
    "cases/superior-cases.json",
    "cases/synthetic-cases.json",
  ];
  const cases: CkgCase[] = [];
  for (const f of files) {
    const raw = readJson<{ cases: CkgCase[] }>(f);
    cases.push(...raw.cases);
  }
  return cases;
}

export function loadCandidates(): SystemCandidate[] {
  const files = [
    "system-outputs/gibraltar-offline.json",
    "system-outputs/superior-offline.json",
    "system-outputs/synthetic-offline.json",
  ];
  const out: SystemCandidate[] = [];
  for (const f of files) {
    const raw = readJson<{ candidates: SystemCandidate[] }>(f);
    out.push(...raw.candidates);
  }
  return out;
}

export function loadProtocol(): Record<string, unknown> {
  return readJson("protocol.json");
}

export function loadPackages(): Record<string, unknown> {
  return readJson("packages.json");
}

export function fixtureRoot(): string {
  return FIXTURE_ROOT;
}

/** Paths that this benchmark must never modify. */
export const CLAUDE_OWNED_ACCEPTANCE_GLOBS = [
  "tests/onboarding/synthetic-acceptance.test.ts",
  "tests/onboarding/phase-b-synthetic-acceptance.test.ts",
  "tests/synthetic-company.test.ts",
  "tests/versioning.test.ts",
  "tests/evaluation-v2/",
  "tests/contract-model/certified/",
  "scripts/golden-test.ts",
  "golden_tests_v1_export.csv",
  "golden_tests_v1_export.md",
] as const;
