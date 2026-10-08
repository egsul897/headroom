import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { sha256Text } from "./hash";

export interface ExtractedWindow {
  exactText: string;
  charStartInFixture: number;
  charEndInFixture: number;
  sourceTextSha256: string;
  windowSha256: string;
  fixturePath: string;
}

export function readFixture(repoRoot: string, relativePath: string): string {
  const abs = resolve(repoRoot, relativePath);
  if (!existsSync(abs)) throw new Error(`Missing source fixture: ${relativePath}`);
  return readFileSync(abs, "utf8");
}

/** Extract a window by absolute character offsets into the fixture. */
export function extractByOffsets(
  repoRoot: string,
  relativePath: string,
  charStart: number,
  charEnd: number,
): ExtractedWindow {
  const full = readFixture(repoRoot, relativePath);
  if (charStart < 0 || charEnd > full.length || charStart >= charEnd) {
    throw new Error(`Bad offsets for ${relativePath}: [${charStart}, ${charEnd}) len=${full.length}`);
  }
  const exactText = full.slice(charStart, charEnd);
  return {
    exactText,
    charStartInFixture: charStart,
    charEndInFixture: charEnd,
    sourceTextSha256: sha256Text(full),
    windowSha256: sha256Text(exactText),
    fixturePath: relativePath,
  };
}

/**
 * Extract the span from the first match of `startRe` to the first subsequent
 * match of `endRe` (or `maxLen` chars). `occurrence` selects which start match
 * (0-based; use -1 for last), which matters when a TOC precedes the body.
 */
export function extractByRegex(
  repoRoot: string,
  relativePath: string,
  startRe: RegExp,
  endRe: RegExp | null,
  opts: { occurrence?: number; maxLen?: number } = {},
): ExtractedWindow {
  const full = readFixture(repoRoot, relativePath);
  const flags = startRe.flags.includes("g") ? startRe.flags : startRe.flags + "g";
  const re = new RegExp(startRe.source, flags);
  const matches = [...full.matchAll(re)];
  if (matches.length === 0) throw new Error(`Start pattern not found in ${relativePath}: ${startRe}`);
  const occurrence = opts.occurrence ?? 0;
  const idx = occurrence < 0 ? matches.length + occurrence : occurrence;
  const m = matches[idx];
  if (!m || m.index === undefined) throw new Error(`Start occurrence ${occurrence} missing in ${relativePath}`);
  const start = m.index;
  let end: number;
  if (endRe) {
    const flags2 = endRe.flags.includes("g") ? endRe.flags : endRe.flags + "g";
    const ere = new RegExp(endRe.source, flags2);
    ere.lastIndex = start + m[0].length;
    const m2 = ere.exec(full);
    end = m2 && m2.index !== undefined ? m2.index : Math.min(full.length, start + (opts.maxLen ?? 12_000));
  } else {
    end = Math.min(full.length, start + (opts.maxLen ?? 8_000));
  }
  return extractByOffsets(repoRoot, relativePath, start, end);
}

/** Slice around an anchor string with back/forward context. */
export function extractAroundAnchor(
  repoRoot: string,
  relativePath: string,
  anchor: string,
  back: number,
  forward: number,
  opts: { occurrence?: number } = {},
): ExtractedWindow {
  const full = readFixture(repoRoot, relativePath);
  const occurrence = opts.occurrence ?? 0;
  let from = 0;
  let idx = -1;
  for (let i = 0; i <= occurrence; i++) {
    idx = full.indexOf(anchor, from);
    if (idx < 0) throw new Error(`Anchor not found (occ ${i}) in ${relativePath}: ${anchor.slice(0, 60)}`);
    from = idx + anchor.length;
  }
  const start = Math.max(0, idx - back);
  const end = Math.min(full.length, idx + anchor.length + forward);
  return extractByOffsets(repoRoot, relativePath, start, end);
}

export function extractDefinition(
  repoRoot: string,
  relativePath: string,
  termStart: string,
  maxLen = 2_000,
): { term: string; text: string; sha256: string } {
  const full = readFixture(repoRoot, relativePath);
  const idx = full.indexOf(termStart);
  if (idx < 0) throw new Error(`Definition start not found in ${relativePath}: ${termStart}`);
  const text = full.slice(idx, Math.min(full.length, idx + maxLen));
  return { term: termStart, text, sha256: sha256Text(full) };
}
