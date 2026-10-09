/**
 * Storage + operational cost assessment for mass precedent scaling.
 * Estimates only — not invoices. Neon BYTEA footprint ≈ raw bytes + ~15% index/overhead.
 */

export interface MassPrecedentCostAssessment {
  schemaVersion: "knowledge-factory.mass-precedent-cost.v1";
  generatedAt: string;
  assumptions: string[];
  milestones: Array<{
    name: string;
    documents: number;
    avgBytesPerDoc: number;
    estimatedRawBytes: number;
    estimatedNeonFootprintBytes: number;
    estimatedNeonFootprintGiB: number;
    estimatedSecRequests: number;
    estimatedWallClockMinutesAt10Rps: number;
    notes: string;
  }>;
  rateLimits: {
    secMaxRequestsPerSecond: number;
    recommendedConcurrency: number;
    batchCheckpointEvery: number;
  };
}

export function buildMassPrecedentCostAssessment(params: {
  committedBytesTotal: number;
  committedDocCount: number;
}): MassPrecedentCostAssessment {
  const avg =
    params.committedDocCount > 0
      ? Math.round(params.committedBytesTotal / params.committedDocCount)
      : 1_200_000;

  const mk = (name: string, documents: number, networkFraction: number) => {
    const estimatedRawBytes = documents * avg;
    const estimatedNeonFootprintBytes = Math.round(estimatedRawBytes * 1.15);
    const estimatedSecRequests = Math.round(documents * networkFraction);
    return {
      name,
      documents,
      avgBytesPerDoc: avg,
      estimatedRawBytes,
      estimatedNeonFootprintBytes,
      estimatedNeonFootprintGiB: Number((estimatedNeonFootprintBytes / (1024 ** 3)).toFixed(3)),
      estimatedSecRequests,
      estimatedWallClockMinutesAt10Rps: Number((estimatedSecRequests / 10 / 60).toFixed(2)),
      notes:
        networkFraction === 0
          ? "Committed-bytes-only path — no SEC traffic"
          : "Assumes networkFraction of docs need SEC fetch; remainder already on disk or cached",
    };
  };

  return {
    schemaVersion: "knowledge-factory.mass-precedent-cost.v1",
    generatedAt: new Date().toISOString(),
    assumptions: [
      `Average document size extrapolated from ${params.committedDocCount} committed authentic files (${avg} bytes)`,
      "Neon BYTEA footprint modeled as raw bytes × 1.15 (indexes + row overhead)",
      "KnowledgeSource / analysis JSON rows are small relative to BYTEA and omitted from GiB estimate",
      "SEC fair-access ≤10 req/s; no paid AI API costs in this path",
      "Does not include Neon compute/egress beyond storage footprint",
    ],
    milestones: [
      mk("batch-100 (committed-first)", Math.min(100, Math.max(params.committedDocCount, 100)), 0.7),
      mk("batch-500", 500, 0.85),
      mk("batch-1000", 1000, 0.9),
      mk("scale-10000", 10_000, 0.95),
    ],
    rateLimits: {
      secMaxRequestsPerSecond: 10,
      recommendedConcurrency: 2,
      batchCheckpointEvery: 25,
    },
  };
}
