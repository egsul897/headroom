/**
 * Offline loaders for the Negative Covenant Exception Database.
 * RESEARCH ONLY — never imported by lib/contract-model/** or app/**.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AdversarialSuite, ExceptionCatalog } from "./schema";

const DOCS_ROOT = resolve(
  process.cwd(),
  "docs/negative-covenant-exception-database",
);

export function catalogPath(...parts: string[]): string {
  return resolve(DOCS_ROOT, ...parts);
}

export function loadExceptionCatalog(): ExceptionCatalog {
  const raw = readFileSync(catalogPath("catalogs/exceptions.json"), "utf8");
  return JSON.parse(raw) as ExceptionCatalog;
}

export function loadAdversarialSuite(): AdversarialSuite {
  const raw = readFileSync(catalogPath("adversarial/cases.json"), "utf8");
  return JSON.parse(raw) as AdversarialSuite;
}

export function loadJsonArtifact<T = unknown>(relativePath: string): T {
  const raw = readFileSync(catalogPath(relativePath), "utf8");
  return JSON.parse(raw) as T;
}
