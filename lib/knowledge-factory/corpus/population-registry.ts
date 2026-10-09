/**
 * Development / regression / untouched-holdout population registry.
 *
 * Maintains separation so held-out packages are not used for prompt/rule
 * development. Aligns with CKG package roles without modifying Claude gates.
 */

export type CorpusPopulation =
  | "DEVELOPMENT"
  | "REGRESSION"
  | "HOLDOUT_DEVELOPMENT"
  | "HOLDOUT_BLIND"
  | "INELIGIBLE_AS_HOLDOUT";

export interface PopulationPackage {
  packageId: string;
  population: CorpusPopulation;
  role: string;
  fixturePath?: string;
  notes: string;
}

export const CORPUS_POPULATION_REGISTRY: PopulationPackage[] = [
  {
    packageId: "fwrg-2021-credit-agreement",
    population: "DEVELOPMENT",
    role: "Primary human GT / IR shapes",
    fixturePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "lsb-2023-abl-credit-agreement",
    population: "DEVELOPMENT",
    role: "Primary human GT / IR shapes",
    fixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "conmed-2025-credit-facility",
    population: "DEVELOPMENT",
    role: "Pilot verified population + product demos",
    fixturePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "dsgr-2022-2025-credit-facility",
    population: "REGRESSION",
    role: "Amendment-chain / multi-doc regression",
    fixturePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "chwy-2026-credit-agreement",
    population: "REGRESSION",
    role: "Chewy semantic / marker regression",
    fixturePath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "riot-2025-2026-credit-facility",
    population: "REGRESSION",
    role: "Riot unseen-run regression",
    fixturePath: "tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run",
    notes: "Ineligible as held-out generalization evidence.",
  },
  {
    packageId: "final-lightweight-unseen-sup",
    population: "REGRESSION",
    role: "Formerly unseen Superior — permanent regression (invariant 28)",
    fixturePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup",
    notes: "FORMERLY_UNSEEN_NOW_REGRESSION — cannot again support blind generalization.",
  },
  {
    packageId: "gibraltar-2026-credit-agreement",
    population: "HOLDOUT_DEVELOPMENT",
    role: "CKG held-out DEVELOPMENT public EDGAR package",
    fixturePath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement",
    notes: "HELD_OUT_DEVELOPMENT_PACKAGE — do not use for prompt/extraction-rule development.",
  },
  {
    packageId: "knife-river-blind",
    population: "HOLDOUT_BLIND",
    role: "Reserved blind body (unread)",
    notes: "Body unread; reserved UNLABELED synthetic slot only.",
  },
];

export function packagesForPopulation(population: CorpusPopulation): PopulationPackage[] {
  return CORPUS_POPULATION_REGISTRY.filter((p) => p.population === population);
}

export function assertHoldoutUntouched(usedPackageIds: string[]): {
  ok: boolean;
  violations: string[];
} {
  const holdout = new Set(
    CORPUS_POPULATION_REGISTRY.filter(
      (p) => p.population === "HOLDOUT_DEVELOPMENT" || p.population === "HOLDOUT_BLIND",
    ).map((p) => p.packageId),
  );
  const violations = usedPackageIds.filter((id) => holdout.has(id));
  return { ok: violations.length === 0, violations };
}
