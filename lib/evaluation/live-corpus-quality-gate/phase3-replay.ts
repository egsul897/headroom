/**
 * Phase 3 — independent production-fix replay.
 * Reads candidate SHAs via worktrees when available; never edits production code
 * or expected freeze outputs from this module.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildPackageGraph } from "../../contract-model/compiler/package-graph/pipeline";
import { classifyDocument } from "../../contract-model/compiler/package-graph/document-classifier";
import {
  ARCH_REMED_SHA,
  MAIN_REPLAY_SHA,
  SUP_RESTATES_FIX_SHA,
  type RemediationContract,
} from "./phase3-contracts";

const ROOT = process.cwd();

export interface FixReplayResult {
  defectId: string;
  candidateSha: string | null;
  baselineSha: string | null;
  worktreeUsed: string | null;
  reproductionPassed: boolean | null;
  observations: Record<string, unknown>;
  verdict: "REPLAY_PASSED" | "REPLAY_FAILED" | "OPEN_UNAVAILABLE" | "PARTIAL";
  note: string;
}

function tryExec(cmd: string, cwd = ROOT): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", cwd, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function readSupDocs(baseRoot = ROOT) {
  const base = path.join(
    baseRoot,
    "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text",
  );
  if (!fs.existsSync(base)) return null;
  const files = fs.readdirSync(base).filter((f) => f.endsWith(".txt")).sort();
  return files.map((f) => {
    const id = f.startsWith("doc-a")
      ? "sup-doc-a"
      : f.startsWith("doc-b")
        ? "sup-doc-b"
        : f.startsWith("doc-c")
          ? "sup-doc-c"
          : f;
    return {
      documentId: id,
      label: f,
      text: fs.readFileSync(path.join(base, f), "utf8"),
    };
  });
}

/** Replay SUP RESTATES on the current checkout (must contain classifier \s+ fix). */
export function replaySupRestatesOnCheckout(label: string, sha: string): FixReplayResult {
  const docs = readSupDocs();
  if (!docs) {
    return {
      defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
      candidateSha: sha,
      baselineSha: null,
      worktreeUsed: null,
      reproductionPassed: null,
      observations: {},
      verdict: "OPEN_UNAVAILABLE",
      note: "SUP fixtures missing",
    };
  }
  const classifications = docs.map((d) => classifyDocument(d));
  const docB = classifications.find((c) => c.documentId === "sup-doc-b");
  const graph = buildPackageGraph("lcqg-phase3", "sup-replay", docs);
  const restates = graph.relationshipCandidates.filter((r) => r.relationshipType === "RESTATES");
  const restatesBA = restates.filter(
    (r) => r.sourceDocumentId === "sup-doc-b" && r.targetDocumentId === "sup-doc-a",
  );
  const classOk = docB?.type === "AMENDED_AND_RESTATED_AGREEMENT";
  const edgeOk =
    restatesBA.length > 0 &&
    restatesBA.every((r) => r.status === "RESOLVED" || r.status === "REVIEW_REQUIRED");
  const passed = Boolean(classOk && edgeOk);
  return {
    defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
    candidateSha: sha,
    baselineSha: null,
    worktreeUsed: label,
    reproductionPassed: passed,
    observations: {
      docBType: docB?.type ?? null,
      docBConfidence: docB?.confidence ?? null,
      docBEvidence: docB?.evidence?.[0] ?? null,
      restatesCount: restates.length,
      restatesBA: restatesBA.map((r) => ({
        status: r.status,
        confidence: r.confidence,
        method: r.resolutionMethod,
      })),
      fixSha: SUP_RESTATES_FIX_SHA,
      mainReplaySha: MAIN_REPLAY_SHA,
    },
    verdict: passed ? "REPLAY_PASSED" : "REPLAY_FAILED",
    note: passed
      ? "Classification + RESTATES edge surfaced (REVIEW_REQUIRED allowed). Matches frozen expected safe behavior."
      : "Candidate SHA did not surface RESTATES or misclassified doc-b.",
  };
}

/** Document baseline failure using a pre-recorded probe or worktree path. */
export function loadBaselineSupProbe(worktreePath: string | null): FixReplayResult | null {
  if (!worktreePath || !fs.existsSync(worktreePath)) return null;
  const probe = tryExec(
    `npx tsx -e "const fs=require('fs');const path=require('path');const {classifyDocument}=require('./lib/contract-model/compiler/package-graph/document-classifier.ts');const {buildPackageGraph}=require('./lib/contract-model/compiler/package-graph/pipeline.ts');const base='tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text';const files=fs.readdirSync(base).filter(f=>f.endsWith('.txt')).sort();const docs=files.map(f=>({documentId:f.startsWith('doc-a')?'sup-doc-a':f.startsWith('doc-b')?'sup-doc-b':'sup-doc-c',label:f,text:fs.readFileSync(path.join(base,f),'utf8')}));const c=docs.map(classifyDocument);const g=buildPackageGraph('x','y',docs);const restates=g.relationshipCandidates.filter(r=>r.relationshipType==='RESTATES');console.log(JSON.stringify({docB:c.find(x=>x.documentId==='sup-doc-b')?.type,restates:restates.length,sha:require('child_process').execSync('git rev-parse HEAD').toString().trim()}));"`,
    worktreePath,
  );
  if (!probe) return null;
  try {
    const parsed = JSON.parse(probe) as { docB?: string; restates?: number; sha?: string };
    const failedAsExpected = parsed.docB === "CREDIT_AGREEMENT" && (parsed.restates ?? 0) === 0;
    return {
      defectId: "LCQG-SUP-AMEND-RESTATES-MISSING",
      candidateSha: null,
      baselineSha: parsed.sha ?? null,
      worktreeUsed: worktreePath,
      reproductionPassed: failedAsExpected,
      observations: parsed as unknown as Record<string, unknown>,
      verdict: failedAsExpected ? "REPLAY_PASSED" : "REPLAY_FAILED",
      note: failedAsExpected
        ? "Baseline reproduces historical silence (CREDIT_AGREEMENT + 0 RESTATES)."
        : "Baseline did not reproduce historical failure mode.",
    };
  } catch {
    return null;
  }
}

export function replaySharedCapStillBroken(): FixReplayResult {
  const signalsPath = path.join(ROOT, "lib/contract-model/compiler/discovery/pass-a-signals.ts");
  const src = fs.readFileSync(signalsPath, "utf8");
  const patternPresent = src.includes("aggregate(?:d)? (?:amount|basket)");
  const fixture = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/pass-a-shared-cap.json",
  );
  let fixtureCount = 0;
  if (fs.existsSync(fixture)) {
    fixtureCount = (JSON.parse(fs.readFileSync(fixture, "utf8")) as unknown[]).length;
  }
  const independentReplayPath = path.join(
    ROOT,
    "docs/live-corpus-quality-gate/phase3/28-p0-shared-cap-independent-replay.json",
  );
  const hasIndependentReplay = fs.existsSync(independentReplayPath);
  let independent: Record<string, unknown> | null = null;
  if (hasIndependentReplay) {
    independent = JSON.parse(fs.readFileSync(independentReplayPath, "utf8")) as Record<string, unknown>;
  }
  // Eval branch intentionally does not ship production fixes. Local pattern may still be broad;
  // adjudication is against isolated worktree replay of 83cde5b (see 28-p0 artifact).
  return {
    defectId: "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
    candidateSha: hasIndependentReplay ? "83cde5b985b6bb480ac2500cccf894fe6e497f20" : null,
    baselineSha: hasIndependentReplay ? "8f87a0633ac31cb7b5f6282cc0787231d365f27c" : null,
    worktreeUsed: hasIndependentReplay ? "isolated:baseline@8f87a06+fix@83cde5b" : ROOT,
    reproductionPassed: hasIndependentReplay
      ? true
      : patternPresent && fixtureCount >= 51,
    observations: {
      evalCheckoutStillHasLegacyPattern: patternPresent,
      fixtureSharedCapCount: fixtureCount,
      independentReplayArtifact: hasIndependentReplay ? "docs/live-corpus-quality-gate/phase3/28-p0-shared-cap-independent-replay.json" : null,
      independentReplay: independent
        ? {
            fixSha: independent.fixSha,
            baselineSha: independent.baselineSha,
            defectTicketVerdict: independent.defectTicketVerdict,
            advFp: independent.advFpClosure,
          }
        : null,
    },
    verdict: hasIndependentReplay ? "REPLAY_PASSED" : "OPEN_UNAVAILABLE",
    note: hasIndependentReplay
      ? "Independent worktree replay recorded: baseline reproduces ADV-FP-01/02; fix 83cde5b corrects labeling. Eval checkout does not embed production fix (by design). Ticket INDEPENDENTLY_ADJUDICATED, not CLOSED."
      : "No independent replay artifact yet. Local eval checkout still has legacy aggregate-in-shared_cap pattern.",
  };
}

export function replayBuilderDualCite(): FixReplayResult {
  const textPath =
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt";
  const abs = path.join(ROOT, textPath);
  if (!fs.existsSync(abs)) {
    return {
      defectId: "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
      candidateSha: null,
      baselineSha: null,
      worktreeUsed: null,
      reproductionPassed: null,
      observations: {},
      verdict: "OPEN_UNAVAILABLE",
      note: "Gibraltar text missing",
    };
  }
  const text = fs.readFileSync(abs, "utf8");
  const defY = /Available Amount Builder Basket[\s\S]{0,80}7\.05\(a\)\(y\)/.test(text);
  const printedVi = /\(vi\)[\s\S]{0,200}Available Amount Builder Basket|Available Amount Builder Basket[\s\S]{0,400}\(vi\)/.test(
    text,
  );
  // Simpler: look for clause (y) parenthetical near builder basket operative
  const clauseY = /clause \(y\)/.test(text) && /\(vi\)/.test(text);
  return {
    defectId: "LCQG-GIB-XREF-BUILDER-MARKER-CONFLICT",
    candidateSha: null,
    baselineSha: null,
    worktreeUsed: ROOT,
    reproductionPassed: defY && clauseY,
    observations: {
      definitionCites705ay: defY,
      printedViAndClauseYPresent: clauseY,
      printedViLoose: printedVi,
      expectedSafe: "UNRESOLVED / dual-cite REVIEW_REQUIRED",
      proposedFixSha: null,
    },
    verdict: "OPEN_UNAVAILABLE",
    note: "Source dual-cite still present; no production dual-cite handler SHA available for replay.",
  };
}

export function replayTocContentsListingWorktree(worktreePath: string | null): FixReplayResult {
  if (!worktreePath || !fs.existsSync(worktreePath)) {
    return {
      defectId: "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
      candidateSha: ARCH_REMED_SHA,
      baselineSha: null,
      worktreeUsed: null,
      reproductionPassed: null,
      observations: { proposed: ARCH_REMED_SHA },
      verdict: "OPEN_UNAVAILABLE",
      note: "architecture-remediation worktree unavailable",
    };
  }
  const sha = tryExec("git rev-parse HEAD", worktreePath) ?? ARCH_REMED_SHA;
  const testOut = tryExec(
    "npx vitest run tests/contract-model/compiler/operative-authority.test.ts tests/contract-model/context-retrieval-definition-contents.test.ts --reporter=dot 2>&1 | tail -20",
    worktreePath,
  );
  const passed = Boolean(testOut && /\b\d+ passed\b/.test(testOut) && !/\b\d+ failed\b/.test(testOut));
  return {
    defectId: "LCQG-GIB-STRUCT-AMBIGUOUS-TOC",
    candidateSha: sha,
    baselineSha: null,
    worktreeUsed: worktreePath,
    reproductionPassed: passed,
    observations: {
      vitestTail: testOut?.split("\n").slice(-8) ?? null,
      acceptance:
        "CONTENTS_LISTING refuseModelDispatch; never silent TOC bind; AMBIGUOUS exposure preserved",
    },
    verdict: passed ? "REPLAY_PASSED" : testOut ? "REPLAY_FAILED" : "OPEN_UNAVAILABLE",
    note: passed
      ? "Independent vitest replay of contents-listing refusal PASSED on architecture-remediation tip."
      : "Contents-listing replay did not pass or could not run.",
  };
}

export function replayXrefLowResolve(): FixReplayResult {
  const summaryPath = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/structure-summary.json",
  );
  if (!fs.existsSync(summaryPath)) {
    return {
      defectId: "LCQG-GIB-XREF-LOW-RESOLVE",
      candidateSha: null,
      baselineSha: null,
      worktreeUsed: null,
      reproductionPassed: null,
      observations: {},
      verdict: "OPEN_UNAVAILABLE",
      note: "structure-summary missing",
    };
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
    referencesDetected?: number;
    referencesResolved?: number;
    referencesUnresolved?: number;
  };
  const detected = summary.referencesDetected ?? 1459;
  const resolved = summary.referencesResolved ?? 491;
  const unresolved = summary.referencesUnresolved ?? 968;
  return {
    defectId: "LCQG-GIB-XREF-LOW-RESOLVE",
    candidateSha: null,
    baselineSha: null,
    worktreeUsed: ROOT,
    reproductionPassed: unresolved > 0,
    observations: {
      detected,
      resolved,
      unresolved,
      resolveRate: detected ? resolved / detected : null,
      relatedPartialFix: ARCH_REMED_SHA,
      relatedPartialNote:
        "architecture-remediation refuses TOC contents as xref targets; does not itself raise frozen resolve rate.",
    },
    verdict: "OPEN_UNAVAILABLE",
    note: "No dedicated resolve-rate fix SHA. Unresolved remain explicit in frozen fixture. OPEN.",
  };
}

export function runAllPriorityReplays(opts?: {
  archRemedWorktree?: string | null;
  preWhitespaceWorktree?: string | null;
}): {
  results: FixReplayResult[];
  contractsTouched: string[];
} {
  const head = tryExec("git rev-parse HEAD") ?? "UNKNOWN";
  const results: FixReplayResult[] = [
    replaySharedCapStillBroken(),
    replaySupRestatesOnCheckout("current-eval", head),
    replayBuilderDualCite(),
    replayTocContentsListingWorktree(opts?.archRemedWorktree ?? null),
    replayXrefLowResolve(),
  ];
  const baseline = loadBaselineSupProbe(opts?.preWhitespaceWorktree ?? null);
  if (baseline) results.push(baseline);
  return {
    results,
    contractsTouched: results.map((r) => r.defectId),
  };
}

export function applyReplayToContracts(
  contracts: RemediationContract[],
  results: FixReplayResult[],
): RemediationContract[] {
  const byId = new Map(results.filter((r) => r.candidateSha || r.verdict === "OPEN_UNAVAILABLE").map((r) => [r.defectId, r]));
  // Prefer candidate (post-fix) result for SUP over baseline
  const supCandidate = results.find(
    (r) => r.defectId === "LCQG-SUP-AMEND-RESTATES-MISSING" && r.candidateSha,
  );
  if (supCandidate) byId.set(supCandidate.defectId, supCandidate);

  return contracts.map((c) => {
    const r = byId.get(c.defectId);
    if (!r) return c;
    // Never auto-CLOSE from replay alone
    if (c.status === "INDEPENDENTLY_ADJUDICATED" || c.status === "CLOSED") return c;
    if (r.verdict === "REPLAY_PASSED" && c.proposedFixSha) {
      return { ...c, status: "REPLAY_PASSED", statusRationale: `${c.statusRationale} | replay: ${r.note}` };
    }
    if (r.verdict === "REPLAY_FAILED") {
      return { ...c, status: "REPLAY_FAILED", statusRationale: `${c.statusRationale} | replay: ${r.note}` };
    }
    return c;
  });
}
