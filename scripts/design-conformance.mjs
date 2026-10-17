#!/usr/bin/env node
/**
 * Design-conformance check (design system, docs/DESIGN_SYSTEM.md).
 *
 * PR/merge gate: new UI must use the design tokens and StatusBadge —
 * no ad-hoc colors, no retired font stacks.
 *
 * Ownership boundary: Headroom Designer owns the visual layer on
 * draft PR #392 (branch cursor/cfo-visual-system-7768) — app/globals.css,
 * app/home-shell.css, components/shell/*, StatusBadge/Select/ActionMenu,
 * docs/DESIGN_SYSTEM.md. This script does NOT check token presence
 * (tokens live in #392, not in this branch) and does NOT edit those
 * files. It only checks that ADDED lines in consumer files (pages /
 * components that use the system) introduce no ad-hoc hex colors or
 * retired font stacks. Foundation files that DEFINE the system are
 * exempt.
 *
 * Usage: node scripts/design-conformance.mjs [base-ref]
 *   base-ref defaults to origin/cursor/clf-release-1. In CI the
 *   workflow passes the PR base ref.
 */
import { execSync } from "node:child_process";

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RETIRED_FONT_RE = /Newsreader|Spline_Sans_Mono|Spline Sans|Public_Sans|Public Sans|Georgia|Times New Roman/;

// Files that DEFINE the system (Designer-owned, PR #392) or are
// docs/tests/sample — exempt.
const EXEMPT = [
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

const failures = [];

// Added lines in consumer files must not introduce ad-hoc colors or
// retired font stacks.
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
