#!/usr/bin/env node
/**
 * Design-conformance check (design system, docs/DESIGN_SYSTEM.md).
 *
 * PR/merge gate: new UI must use the design tokens and StatusBadge —
 * no ad-hoc colors, no retired font stacks.
 *
 * Rules:
 * 1. The token file (app/design-tokens.css) must define the Graphite
 *    Ledger palette (canvas/card/ink/muted/rail/oxblood + the three
 *    status pairs + info/unknown pairs).
 * 2. Added lines in the PR diff must not introduce hex color literals
 *    or retired font stacks in CONSUMER files (pages/components that
 *    use the system). Foundation files that DEFINE the system are
 *    exempt (token files, the shell, StatusBadge/presentation, the
 *    dev sample route, docs, tests).
 *
 * Usage: node scripts/design-conformance.mjs [base-ref]
 *   base-ref defaults to origin/cursor/clf-release-1. In CI the
 *   workflow passes the PR base ref.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const REQUIRED_TOKENS = [
  "#f3f0eb", // canvas
  "#fffcf8", // card
  "#1a1816", // ink
  "#5e5852", // muted
  "#2a2c2e", // rail
  "#54243c", // primary oxblood
  "#6b3050", // primary hover
  "#0e6b43", // status green
  "#e5f4ec", // green soft
  "#7c4a00", // status amber
  "#fbf3df", // amber soft
  "#9d2c24", // status red
  "#fdeceb", // red soft
  "#e6e1da", // info soft
  "#e8e3dc", // unknown soft
];

// Files that DEFINE the system (or are docs/tests/sample) — exempt.
const EXEMPT = [
  "app/design-tokens.css",
  "app/globals.css",
  "app/home-shell.css",
  "components/StatusBadge.tsx",
  "components/status-presentation.ts",
  "components/Select.tsx",
  "components/ActionMenu.tsx",
  "components/shell/",
  "app/dev/",
  "docs/",
  "tests/",
  "scripts/",
  ".github/",
];
const isExempt = (f) => EXEMPT.some((e) => (e.endsWith("/") ? f.startsWith(e) : f === e));

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RETIRED_FONT_RE = /Newsreader|Spline_Sans_Mono|Spline Sans|Public_Sans|Public Sans|Georgia|Times New Roman/;

const failures = [];

// Rule 1: token file defines the palette.
const tokenPath = "app/design-tokens.css";
if (!existsSync(tokenPath)) {
  failures.push(`${tokenPath} is missing — the Graphite Ledger token file must exist.`);
} else {
  const tokens = readFileSync(tokenPath, "utf8");
  for (const hex of REQUIRED_TOKENS) {
    if (!tokens.toLowerCase().includes(hex)) {
      failures.push(`${tokenPath} is missing required token ${hex}.`);
    }
  }
}

// Rule 2: no ad-hoc colors / retired fonts in added lines of consumer files.
const base = process.argv[2] || "origin/cursor/clf-release-1";
function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
let mergeBase;
try {
  mergeBase = sh(`git merge-base ${base} HEAD`).trim();
} catch {
  console.error(`design-conformance: could not resolve merge-base with ${base} (is it fetched?).`);
  process.exit(2);
}
const diff = sh(`git diff -U0 --no-color ${mergeBase}...HEAD`);
let currentFile = null;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice(6);
    continue;
  }
  if (!line.startsWith("+") || line.startsWith("+++") || currentFile == null) continue;
  if (isExempt(currentFile)) continue;
  if (!/\.(tsx?|css|jsx?)$/.test(currentFile)) continue;
  const added = line.slice(1);
  if (added.includes("http") || added.includes("https://")) continue; // URLs are not colors
  // Hex: ignore PR/issue references like "PR #392" (all digits, short)
  // — real palette hex always carries a-f letters or is 6 digits.
  const hexMatch = HEX_RE.exec(added);
  if (hexMatch && !(/^#\d{1,4}$/.test(hexMatch[0]) && /(PR|issue) #\d/.test(added))) {
    failures.push(`${currentFile}: ad-hoc hex color in added line — use a design token: ${added.trim().slice(0, 120)}`);
  }
  // Retired fonts: ignore lines that also mention Inter — those are
  // the migration itself (e.g. the layout import adding Inter).
  if (!added.includes("Inter") && RETIRED_FONT_RE.test(added)) {
    failures.push(`${currentFile}: retired font stack in added line — use Inter: ${added.trim().slice(0, 120)}`);
  }
}

if (failures.length > 0) {
  console.error("design-conformance: FAILED");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("design-conformance: OK");
