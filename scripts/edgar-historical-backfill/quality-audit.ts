#!/usr/bin/env npx tsx
/**
 * Independent discovery-quality sample over a completed run's manifests.
 * Metadata-only; does not treat discovered exhibits as acquired documents.
 *
 *   npx tsx scripts/edgar-historical-backfill/quality-audit.ts data/edgar-historical-backfill/smoke-ibr
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IssuerManifest, ExhibitRef } from "../../lib/edgar-historical-backfill/types";
import { classifyExhibit } from "../../lib/edgar-historical-backfill/exhibit-classifier";
import { summarizeIbrResiduals } from "../../lib/edgar-historical-backfill/ibr-residuals";

const POSITIVE_KINDS = new Set([
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "RESTATEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "WAIVER",
  "CONSENT",
  "INTERCREDITOR",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
]);

function loadManifests(runDir: string): IssuerManifest[] {
  const dir = join(runDir, "manifests");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json") && !n.includes("dup"))
    .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as IssuerManifest);
}

function looksLikeDebtTitle(desc: string): boolean {
  return /(credit agreement|loan agreement|indenture|intercreditor|supplemental indenture|waiver|consent to|guarantee and (collateral|security)|security agreement|facility agreement)/i.test(
    desc,
  );
}

function looksLikeFalsePositive(desc: string): boolean {
  return /(by-?laws|underwriting|restricted stock|equity|compensation|note hedge|warrant transaction|bonus plan|employment)/i.test(
    desc,
  );
}

function main() {
  const runDir = process.argv[2] ?? "data/edgar-historical-backfill/smoke-ibr";
  const manifests = loadManifests(runDir);
  const exhibits: ExhibitRef[] = manifests.flatMap((m) => m.exhibits);
  const high = exhibits.filter((e) => e.relevanceScore >= 55);

  // Precision among high-relevance classifications (title heuristic as weak ground truth).
  const tp = high.filter((e) => looksLikeDebtTitle(e.description) && !looksLikeFalsePositive(e.description));
  const fp = high.filter((e) => looksLikeFalsePositive(e.description) || !looksLikeDebtTitle(e.description));
  const precision = high.length ? tp.length / high.length : null;

  // Amendment-vs-original: reclassify and compare.
  let amendmentAgree = 0;
  let amendmentDenom = 0;
  for (const e of high) {
    const again = classifyExhibit({ filename: e.filename, description: e.description, exhibitType: e.exhibitType });
    if (e.documentKind === "AMENDMENT" || again.documentKind === "AMENDMENT") {
      amendmentDenom++;
      if (e.documentKind === again.documentKind) amendmentAgree++;
    }
  }

  // Duplicate collapse: agreementIdentityKey uniqueness among kept exhibits.
  const keys = high.map((e) => e.agreementIdentityKey);
  const uniqueKeys = new Set(keys);

  // URL correctness for inline exhibits.
  const withUri = high.filter((e) => e.sourceUri);
  const goodUri = withUri.filter((e) => /^https:\/\/www\.sec\.gov\//i.test(e.sourceUri!) && !/index\.htm/i.test(e.sourceUri!));

  const ibr = summarizeIbrResiduals(exhibits);

  const report = {
    generatedAt: new Date().toISOString(),
    runDir,
    denominators: {
      manifests: manifests.length,
      exhibitsTotal: exhibits.length,
      highRelevance: high.length,
      withUri: withUri.length,
      ibrTotal: ibr.totalIbr,
    },
    relevantExhibitPrecision: {
      value: precision,
      numerator: tp.length,
      denominator: high.length,
      method: "Weak title heuristic (debt keywords ∩ ¬false-positive keywords). Not human-labeled gold.",
      confidence: "LOW_TO_MEDIUM",
    },
    missedFinancingRecall: {
      value: null,
      note: "Recall not measurable without an independent ground-truth index of every financing exhibit per issuer. Not fabricated.",
      confidence: "NONE",
    },
    duplicateCollapseAccuracy: {
      uniqueAgreementKeys: uniqueKeys.size,
      highRelevanceExhibits: high.length,
      note: "Kept exhibits should already be deduped; ratio near 1.0 is expected.",
    },
    amendmentVersusOriginal: {
      agreementRate: amendmentDenom ? amendmentAgree / amendmentDenom : null,
      numerator: amendmentAgree,
      denominator: amendmentDenom,
    },
    ibrResolution: ibr.byResidual,
    queueUrlCorrectness: {
      goodUriRate: withUri.length ? goodUri.length / withUri.length : null,
      numerator: goodUri.length,
      denominator: withUri.length,
    },
    caveats: [
      "Discovered ≠ acquired. This audit scores discovery metadata only.",
      "Precision uses a heuristic labeler, not adjudicated legal gold.",
      "Recall is explicitly unmeasured.",
    ],
  };

  writeFileSync(join(runDir, "quality-audit.json"), JSON.stringify(report, null, 2));
  writeFileSync("docs/edgar-historical-backfill/04-quality-audit.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
