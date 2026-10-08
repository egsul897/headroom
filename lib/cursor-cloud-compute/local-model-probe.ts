/**
 * CPU practicality probe for small local models — no GPU assumed, no paid
 * model downloads or API calls.
 *
 * Method: measure sustained dense matmul throughput with NumPy (already
 * present on the VM) and convert FLOPs to a rough tokens/sec estimate for
 * transformer decode at common parameter counts. This is an engineering
 * capacity probe, not a claim that a production LLM is installed.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { CPU_PRACTICAL_WORKLOADS, GPU_REQUIRED_WORKLOADS } from "./gpu-worker";
import type { LocalModelProbeResult } from "./types";

const PROBE_SCRIPT = `
import json, time
import numpy as np

def matmul_gflops(n=1024, repeats=8):
    a = np.random.randn(n, n).astype(np.float32)
    b = np.random.randn(n, n).astype(np.float32)
    # warmup
    _ = a @ b
    t0 = time.perf_counter()
    for _ in range(repeats):
        _ = a @ b
    elapsed = time.perf_counter() - t0
    flops = repeats * (2.0 * (n ** 3))
    gflops = (flops / elapsed) / 1e9
    return {"n": n, "repeats": repeats, "elapsed_s": elapsed, "gflops": gflops}

# ~2 * params FLOPs per token for decode (order-of-magnitude; ignores KV/cache/IO).
def tokens_per_sec(gflops, params_b):
    flops_per_token = 2.0 * params_b * 1e9
    return (gflops * 1e9) / flops_per_token

m = matmul_gflops()
out = {
  "numpy_version": np.__version__,
  "matmul": m,
  "estimates": {
    "120m": tokens_per_sec(m["gflops"], 0.12),
    "350m": tokens_per_sec(m["gflops"], 0.35),
    "1b": tokens_per_sec(m["gflops"], 1.0),
    "3b": tokens_per_sec(m["gflops"], 3.0),
    "7b": tokens_per_sec(m["gflops"], 7.0),
  }
}
print(json.dumps(out))
`;

function runNumpyProbe(): {
  ok: boolean;
  wallMs: number;
  payload: {
    numpy_version?: string;
    matmul?: { n: number; repeats: number; elapsed_s: number; gflops: number };
    estimates?: Record<string, number>;
    error?: string;
  };
} {
  const t0 = performance.now();
  try {
    const out = execFileSync("python3", ["-c", PROBE_SCRIPT], { encoding: "utf-8", maxBuffer: 2 * 1024 * 1024 });
    return { ok: true, wallMs: performance.now() - t0, payload: JSON.parse(out) };
  } catch (err) {
    return {
      ok: false,
      wallMs: performance.now() - t0,
      payload: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

function jsHashEmbedProbe(chars: number): { wallMs: number; vectorsPerSecond: number } {
  const text = "Section 6.01 Indebtedness. The Borrower shall not. ".repeat(Math.ceil(chars / 48));
  const slice = text.slice(0, chars);
  const t0 = performance.now();
  const dim = 384;
  let checksum = 0;
  // Cheap bag-of-hashed-ngrams stand-in for a tiny CPU embedding pass.
  for (let i = 0; i < slice.length - 2; i++) {
    let h = (slice.charCodeAt(i) * 73856093) ^ (slice.charCodeAt(i + 1) * 19349663) ^ (slice.charCodeAt(i + 2) * 83492791);
    h = (h >>> 0) % dim;
    checksum = (checksum + h) % 1000003;
  }
  const wallMs = performance.now() - t0;
  void checksum;
  return { wallMs, vectorsPerSecond: wallMs > 0 ? 1000 / wallMs : 0 };
}

export async function runLocalModelProbe(options?: { gpuPresent?: boolean }): Promise<LocalModelProbeResult> {
  const gpuAvailable = options?.gpuPresent ?? false;
  const rss0 = process.memoryUsage().rss;
  const numpy = runNumpyProbe();
  const embed = jsHashEmbedProbe(50_000);
  const peakRss = Math.max(rss0, process.memoryUsage().rss);

  const estimates = numpy.payload.estimates ?? {};
  const gflops = numpy.payload.matmul?.gflops ?? 0;

  const probes: LocalModelProbeResult["probes"] = [
    {
      name: "numpy_f32_matmul_1024",
      description: `Sustained float32 matmul throughput probe (${gflops.toFixed(2)} GFLOP/s)`,
      wallMs: numpy.wallMs,
      estimatedTokensPerSecond: null,
      peakRssBytes: peakRss,
      practicalOnThisVm: numpy.ok && gflops >= 5,
      notes: numpy.ok
        ? `NumPy ${numpy.payload.numpy_version}; ${numpy.payload.matmul?.elapsed_s?.toFixed(3)}s for ${numpy.payload.matmul?.repeats}× ${numpy.payload.matmul?.n}³`
        : `NumPy probe failed: ${numpy.payload.error}`,
    },
    {
      name: "estimate_120m_decode",
      description: "Order-of-magnitude decode tok/s for a ~120M-param transformer on measured CPU FLOPs",
      wallMs: 0,
      estimatedTokensPerSecond: estimates["120m"] ?? null,
      peakRssBytes: peakRss,
      practicalOnThisVm: (estimates["120m"] ?? 0) >= 5,
      notes: "Practical for light classification if weights fit in ~1–2GB RAM; not installed in this probe.",
    },
    {
      name: "estimate_1b_decode",
      description: "Order-of-magnitude decode tok/s for a ~1B-param transformer",
      wallMs: 0,
      estimatedTokensPerSecond: estimates["1b"] ?? null,
      peakRssBytes: peakRss,
      practicalOnThisVm: (estimates["1b"] ?? 0) >= 2,
      notes: "Borderline for interactive use; batch offline labeling may be acceptable.",
    },
    {
      name: "estimate_7b_decode",
      description: "Order-of-magnitude decode tok/s for a ~7B-param transformer",
      wallMs: 0,
      estimatedTokensPerSecond: estimates["7b"] ?? null,
      peakRssBytes: peakRss,
      practicalOnThisVm: false,
      notes: "Not practical for Headroom Pass B / extraction latency targets on this 4-vCPU host without GPU.",
    },
    {
      name: "js_hashed_ngram_embed_50k_chars",
      description: "Pure-JS hashed n-gram embedding stand-in over 50k chars (no model download)",
      wallMs: embed.wallMs,
      estimatedTokensPerSecond: null,
      peakRssBytes: peakRss,
      practicalOnThisVm: embed.wallMs < 250,
      notes: `${embed.vectorsPerSecond.toFixed(1)} docs/s equivalent for a 50k-char unit; demonstrates CPU feature extraction is cheap without a neural model.`,
    },
  ];

  return {
    status: numpy.ok ? "CPU_PROBE_ONLY" : "FAILED",
    gpuAvailable,
    numpyAvailable: numpy.ok,
    probes,
    gpuRequiredWorkloads: [...GPU_REQUIRED_WORKLOADS],
    cpuPracticalWorkloads: [...CPU_PRACTICAL_WORKLOADS],
  };
}
