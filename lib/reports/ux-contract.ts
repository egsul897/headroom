/**
 * Payload shapes matching Designer PR #414 `lib/ux/present.ts` exactly
 * (ProofInput, FigureProof, CertificateLine, CertificateModel, KeyRatioModel, BandCutoffs).
 * Declared structurally here so this lane does not depend on #414 landing first;
 * when #414 merges these can be replaced by `import type … from "@/lib/ux/present"`.
 */
export type ProofInput = { label: string; value: string | null; source: string | null };

export type FigureProof = {
  figure: string;
  value: string | null;
  inputs: readonly ProofInput[];
  clause: string | null;
  page: string | null;
  review: string | null;
};

export type CertificateLine = {
  name: string;
  required: string | null;
  actual: string | null;
  headroom: string | null;
  /** PASS or FAIL only when the engine already evaluated the line. */
  evaluated: "PASS" | "FAIL" | null;
  citation: string | null;
};

export type CertificateModel = { company: string; period: string | null; lines: readonly CertificateLine[] };

export type BandCutoffs = {
  direction: "lower-is-safer" | "higher-is-safer";
  healthyUntil: number;
  moderateUntil: number;
  limit: number;
  limitLabel: string;
};

export type KeyRatioId = "gross" | "net" | "secured" | "interest" | "fccr";

export type KeyRatioModel = {
  id: KeyRatioId;
  label: string;
  value: number | null;
  limitLabel: string | null;
  thresholds: BandCutoffs | null;
  clause: string | null;
  source: string | null;
};
