/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §6 - PASS-A SEMANTIC EQUIVALENCE, PROVEN BEHAVIOURALLY.
 *
 * A textual diff cannot answer "did the remediation change what Pass A means?": the remediation touched
 * reference-resolver.ts (an optional `fromNodeId` parameter, a fourth resolution rule gated on it, and a `note`
 * clause that renders only when a referrer is supplied) and the structural index/definition detector. So this module
 * proves the only thing that matters: that the CURRENT tree hands Pass A byte-for-byte the SAME INPUT the tree at
 * 51fda65 did.
 *
 * Method: a detached git worktree at 51fda65 (no repo dirt) is imported side by side with the current tree, and both
 * derive the Section 6.01 Pass-A input through their OWN modules end to end:
 *   structural index -> source context (state, regions, reasons, unresolvedReferences) -> slot partition -> batches
 *   -> the exact system prompt and the exact per-batch user content Pass A would send.
 * Every one of those objects is compared by canonical JSON. Identical inputs + identical prompt versions = no Pass-A
 * semantic change, whatever the diff looks like. Zero model calls.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const canonical = (v: unknown): string => JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : val));

export interface ComparedObject { name: string; oldSha256: string; newSha256: string; identical: boolean; oldSize: number; newSize: number; firstDifference: string | null }
export interface PassAEquivalence {
  proven: boolean;
  worktree: string | null;
  reason: string;
  compared: ComparedObject[];
  batches: { count: { old: number; new: number }; identicalUserContents: number; differingBatchIndexes: number[] };
  promptVersions: { old: string; new: string; match: boolean };
  accountabilityVersions: { old: string; new: string; match: boolean };
  hashes: { sourceContext: { old: string; new: string; match: boolean }; partition: { old: string; new: string; match: boolean } };
}

function firstDiff(a: string, b: string): string | null {
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at offset ${i}: old "${a.slice(Math.max(0, i - 40), i + 60)}" | new "${b.slice(Math.max(0, i - 40), i + 60)}"`;
}

/**
 * Derives the complete Pass-A input from ONE tree, using only that tree's own modules.
 * `root` is the tree's absolute path; `batchChars` is the exact batching the frozen inventory recorded.
 */
async function derivePassAInput(root: string, batchChars: number) {
  const pre = (await import(`${root}/scripts/phase-3-601-preflight.ts`)) as { buildSection601: () => { sourceContext: unknown; chewy: { index: unknown } } };
  const slots = (await import(`${root}/lib/contract-model/compiler/semantic-accountability/slots.ts`)) as { partitionSourceSlots: (i: unknown) => unknown; batchSlots: (p: unknown, c: unknown, m: number) => unknown[] };
  const prompt = (await import(`${root}/lib/contract-model/compiler/semantic-accountability/prompt.ts`)) as { buildInventorySystemPrompt: () => string; buildInventoryUserContent: (c: unknown, b: unknown) => string };
  const identity = (await import(`${root}/lib/contract-model/compiler/semantic-accountability/source-identity.ts`)) as { computeSourceContextHash: (c: unknown) => string; computePartitionHash: (p: unknown) => string };
  const types = (await import(`${root}/lib/contract-model/compiler/semantic-accountability/types.ts`)) as { SEMANTIC_INVENTORY_PROMPT_VERSION: string; SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION: string };
  const built = pre.buildSection601();
  const sourceContext = built.sourceContext;
  const partition = slots.partitionSourceSlots({ sourceContext, structuralIndex: built.chewy.index });
  const batches = slots.batchSlots(partition, sourceContext, batchChars);
  return {
    sourceContext, partition, batches,
    systemPrompt: prompt.buildInventorySystemPrompt(),
    userContents: batches.map((b) => prompt.buildInventoryUserContent(sourceContext, b)),
    sourceContextHash: identity.computeSourceContextHash(sourceContext),
    partitionHash: identity.computePartitionHash(partition as Parameters<typeof identity.computePartitionHash>[0]),
    promptVersion: types.SEMANTIC_INVENTORY_PROMPT_VERSION,
    accountabilityVersion: types.SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION,
  };
}

/**
 * Fails CLOSED: without a usable pre-remediation worktree nothing is proven and the caller must treat Pass A as
 * possibly changed (mission §6 -> PHASE3_601_REMEDIATION_REQUIRES_FRESH_PASS_A).
 */
export async function provePassAInputEquivalence(worktree: string | undefined, batchChars: number): Promise<PassAEquivalence> {
  const empty: PassAEquivalence = { proven: false, worktree: worktree ?? null, reason: "", compared: [], batches: { count: { old: 0, new: 0 }, identicalUserContents: 0, differingBatchIndexes: [] }, promptVersions: { old: "", new: "", match: false }, accountabilityVersions: { old: "", new: "", match: false }, hashes: { sourceContext: { old: "", new: "", match: false }, partition: { old: "", new: "", match: false } } };
  if (!worktree || !existsSync(`${worktree}/scripts/phase-3-601-preflight.ts`)) return { ...empty, reason: "no pre-remediation worktree supplied (PRE_REMEDIATION_WORKTREE): Pass-A behavioural equivalence is NOT proven - failing closed" };
  const [oldIn, newIn] = [await derivePassAInput(worktree, batchChars), await derivePassAInput(process.cwd(), batchChars)];
  const cmp = (name: string, a: unknown, b: unknown): ComparedObject => { const x = typeof a === "string" ? a : canonical(a), y = typeof b === "string" ? b : canonical(b); return { name, oldSha256: sha256(x), newSha256: sha256(y), identical: x === y, oldSize: x.length, newSize: y.length, firstDifference: firstDiff(x, y) }; };
  const sc = oldIn.sourceContext as { regions: unknown[]; state: string; reasons: unknown[]; unresolvedReferences: unknown[] };
  const nc = newIn.sourceContext as typeof sc;
  const compared: ComparedObject[] = [
    cmp("sourceContext (whole object: state, reasons, regions with text, unresolvedReferences)", oldIn.sourceContext, newIn.sourceContext),
    cmp("sourceContext.regions", sc.regions, nc.regions),
    cmp("sourceContext.unresolvedReferences (reaches the Pass-A prompt; NOT covered by the source-context hash)", sc.unresolvedReferences, nc.unresolvedReferences),
    cmp("sourceContext.state+reasons", { state: sc.state, reasons: sc.reasons }, { state: nc.state, reasons: nc.reasons }),
    cmp("slot partition (slots, offsets, methods)", oldIn.partition, newIn.partition),
    cmp("slot batches", oldIn.batches, newIn.batches),
    cmp("Pass-A system prompt (verbatim)", oldIn.systemPrompt, newIn.systemPrompt),
    cmp("Pass-A user content, all batches concatenated (verbatim)", oldIn.userContents.join("\n\u0000\n"), newIn.userContents.join("\n\u0000\n")),
  ];
  const differing = newIn.userContents.map((u, i) => (u === oldIn.userContents[i] ? -1 : i)).filter((i) => i >= 0);
  const promptVersions = { old: oldIn.promptVersion, new: newIn.promptVersion, match: oldIn.promptVersion === newIn.promptVersion };
  const accountabilityVersions = { old: oldIn.accountabilityVersion, new: newIn.accountabilityVersion, match: oldIn.accountabilityVersion === newIn.accountabilityVersion };
  const hashes = { sourceContext: { old: oldIn.sourceContextHash, new: newIn.sourceContextHash, match: oldIn.sourceContextHash === newIn.sourceContextHash }, partition: { old: oldIn.partitionHash, new: newIn.partitionHash, match: oldIn.partitionHash === newIn.partitionHash } };
  const proven = compared.every((c) => c.identical) && differing.length === 0 && oldIn.batches.length === newIn.batches.length && promptVersions.match && accountabilityVersions.match && hashes.sourceContext.match && hashes.partition.match;
  return {
    proven, worktree,
    reason: proven
      ? "the current tree derives byte-identical Pass-A input from its own modules: same source context (including the unresolvedReferences that reach the prompt), same slot partition, same batching, same system prompt and same per-batch user content as the tree the inventory was produced on"
      : `Pass-A input differs: ${[...compared.filter((c) => !c.identical).map((c) => c.name), ...(differing.length ? [`batch user contents ${differing.join(",")}`] : []), ...(promptVersions.match ? [] : ["prompt version"]), ...(accountabilityVersions.match ? [] : ["accountability version"])].join("; ")}`,
    compared, batches: { count: { old: oldIn.batches.length, new: newIn.batches.length }, identicalUserContents: newIn.userContents.length - differing.length, differingBatchIndexes: differing },
    promptVersions, accountabilityVersions, hashes,
  };
}

if (process.argv[1] && /phase-3-601-revalidation-passa-equivalence\.ts$/.test(process.argv[1])) {
  void (async () => {
    const r = await provePassAInputEquivalence(process.env.PRE_REMEDIATION_WORKTREE, Number(process.env.PASS_A_BATCH_CHARS ?? 6000));
    console.log(JSON.stringify({ proven: r.proven, reason: r.reason, batches: r.batches, compared: r.compared.map((c) => ({ name: c.name, identical: c.identical, firstDifference: c.firstDifference })) }, null, 1));
  })();
}
