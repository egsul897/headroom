/**
 * Product-acceptance corpus loader (independent validation workstream).
 *
 * Loads the synthetic debt-document packages under tests/fixtures/product-acceptance/packages/<packageId>/
 * (documents/*.txt + expectations.json), validates each expectations manifest against the
 * product-acceptance-expectations.v1 schema, and reports fixture identity (sha256 per document, sha256 of the
 * manifest) so every acceptance report can be tied to the exact fixture bytes it ran against.
 *
 * Everything here is synthetic: no proprietary documents, no real issuer names. The manifests are authored by reading
 * the fixture text, never generated from compiler output (see "authorship" in each manifest).
 *
 * Read-only with respect to production code: this module imports nothing from lib/.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

export const CORPUS_ROOT = path.resolve(__dirname, "../../tests/fixtures/product-acceptance/packages");
export const MANIFEST_VERSION = "product-acceptance-expectations.v1";

export const SEVERITIES = [
  "CRITICAL_FALSE_PERMISSION",
  "MATERIAL_CONDITION_OMISSION",
  "WRONG_OPERATIVE_SOURCE",
  "UNSUPPORTED_AS_COMPLETE",
  "MISSING_REQUIRED_COVENANT",
  "SOURCE_PROVENANCE_FAILURE",
  "AMBIGUITY_NOT_PRESERVED",
  "NONMATERIAL_OMISSION",
  "EVIDENCE_INCOMPLETE",
  // directive queue 4 additions: a dependency the operative text relies on that cannot be located, and an amendment
  // chain applied in the wrong order / from the wrong document
  "MISSING_DEPENDENCY",
  "INCORRECT_AMENDMENT_PRECEDENCE",
] as const;
export type Severity = (typeof SEVERITIES)[number];

const DocumentRole = z.enum(["BASE_AGREEMENT", "AMENDMENT", "INDENTURE", "INTERCREDITOR", "NON_OPERATIVE_EXHIBIT", "STALE_AMENDMENT"]);
const NodeType = z.enum(["ARTICLE", "SECTION", "SUBSECTION", "CLAUSE", "SUBCLAUSE"]);
const OperativeStatus = z.enum(["CURRENT", "SUPERSEDED", "DELETED"]);

const ManifestDocument = z.object({
  documentId: z.string().min(1),
  label: z.string().min(1),
  file: z.string().regex(/^documents\/[a-z0-9-]+\.txt$/),
  role: DocumentRole,
  operative: z.boolean(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amends: z.string().nullable().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const OperativeExpectation = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentId: z.string(),
  sectionRef: z.string(),
  definitionTerm: z.string().optional(),
  status: OperativeStatus,
  mustContain: z.array(z.string()),
  mustNotContain: z.array(z.string()),
  supersededBy: z.string().optional(),
});

const StructureExpectation = z.object({
  documentId: z.string(),
  sectionRef: z.string(),
  nodeType: NodeType,
  parentSectionRef: z.string().nullable(),
  unique: z.boolean(),
  occurrences: z.number().int().positive().optional(),
  ownTextContains: z.array(z.string()).optional(),
  fullTextContains: z.array(z.string()).optional(),
  uniquenessNote: z.string().optional(),
  note: z.string().optional(),
});

const DefinitionExpectation = z.object({
  documentId: z.string(),
  term: z.string(),
  unique: z.boolean(),
  excerptContains: z.string().optional(),
  expectedSourceSectionRef: z.string().optional(),
});

const ForbiddenResolution = z.object({
  documentId: z.string(),
  term: z.string(),
  forbiddenSourceDocumentId: z.string(),
  reason: z.string(),
});

const Condition = z.object({
  kind: z.string(),
  textContains: z.string().optional(),
  independent: z.boolean().optional(),
  material: z.boolean().optional(),
  source: z.string().optional(),
  exceptions: z.array(z.string()).optional(),
  crossReference: z.object({ documentId: z.string(), sectionRef: z.string() }).optional(),
  expands: z.array(z.object({ kind: z.string(), threshold: z.string().optional() })).optional(),
  threshold: z.string().optional(),
});

const CrossReference = z.object({
  documentId: z.string(),
  sectionRef: z.string().nullable(),
  mustResolve: z.boolean(),
  note: z.string().optional(),
});

const Covenant = z.object({
  id: z.string(),
  documentId: z.string(),
  sectionRef: z.string(),
  occurrence: z.number().int().positive().optional(),
  targetSectionRef: z.string().optional(),
  family: z.string(),
  familyNote: z.string().optional(),
  role: z.string(),
  posture: z.enum(["PERMISSION", "PROHIBITION"]),
  operative: z.boolean(),
  operativeFrom: z.string().optional(),
  operativeUntil: z.string().optional(),
  operativeNote: z.string().optional(),
  /** When the CURRENT operative text of this provision lives in another package document (an amendment), literal checks run against that document. */
  operativeTextDocumentId: z.string().optional(),
  material: z.boolean(),
  mustContain: z.array(z.string()),
  value: z.record(z.string(), z.unknown()).optional(),
  entityScope: z.array(z.string()).optional(),
  entityScopeNote: z.string().optional(),
  conditions: z.array(Condition),
  dependsOnTerms: z.array(z.string()),
  unresolvedTerms: z.array(z.string()).optional(),
  crossReferences: z.array(CrossReference),
  sourceNote: z.string().optional(),
  truncated: z.boolean().optional(),
  /** sha256 of the whitespace-normalised DESCENDANTS text of the covenant's node, pinned by pin-corpus.ts; any textual change to the clause (a new proviso, a changed figure, a re-scoped entity) is then a deterministic STRUCTURE failure. Absent when the node is not uniquely resolvable. */
  textSha256: z.string().optional(),
});

const SharedCap = z.object({
  id: z.string(),
  documentId: z.string(),
  where: z.string(),
  participants: z.array(z.string()).min(2),
  cap: z.record(z.string(), z.unknown()),
  textContains: z.string(),
});

const Ambiguity = z.object({
  id: z.string(),
  where: z.string(),
  description: z.string(),
  mustBePreservedAs: z.array(z.string()).min(1),
  unacceptable: z.array(z.string()),
});

const Unsupported = z.object({
  id: z.string(),
  where: z.string(),
  construct: z.string(),
  acceptableOutcomes: z.array(z.string()).min(1),
  unacceptableOutcomes: z.array(z.string()),
});

const ProhibitedClaim = z.object({
  id: z.string(),
  claim: z.string(),
  severityIfAsserted: z.enum(SEVERITIES),
  reason: z.string(),
});

const NonOperative = z.object({ documentId: z.string(), textContains: z.string(), why: z.string() });

const RuntimeCase = z.object({
  id: z.string(),
  rule: z.string(),
  inputs: z.string(),
  expected: z.record(z.string(), z.unknown()),
  invariant: z.string(),
});

const Runtime = z.object({
  note: z.string(),
  ledger: z.array(z.object({ ruleRef: z.string(), usages: z.array(z.object({ usageId: z.string(), amount: z.number(), currency: z.string(), asOf: z.string() })) })),
  snapshots: z.array(z.object({ snapshotId: z.string(), status: z.enum(["DRAFT", "REVIEW_REQUIRED", "APPROVED", "SUPERSEDED"]), asOf: z.string(), metrics: z.record(z.string(), z.number()) })),
  cases: z.array(RuntimeCase),
});

export const ExpectationsManifestSchema = z.object({
  manifestVersion: z.literal(MANIFEST_VERSION),
  packageId: z.string().regex(/^pkg-[a-z]-[a-z0-9-]+$/),
  title: z.string(),
  issuer: z.string().regex(/\(synthetic\)$/),
  scenario: z.string(),
  authorship: z.string(),
  companyId: z.string(),
  instrumentKey: z.string(),
  documents: z.array(ManifestDocument).min(1),
  operativeState: z.object({ asOfDates: z.array(z.string()).min(1), exact: z.array(OperativeExpectation) }),
  structure: z.object({ exact: z.array(StructureExpectation), invariants: z.array(z.string()) }),
  definitions: z.object({ exact: z.array(DefinitionExpectation), mustNotResolveFrom: z.array(ForbiddenResolution) }),
  covenants: z.array(Covenant).min(1),
  sharedCaps: z.array(SharedCap),
  ambiguities: z.array(Ambiguity),
  unsupported: z.array(Unsupported),
  prohibitedClaims: z.array(ProhibitedClaim),
  nonOperative: z.array(NonOperative),
  runtime: Runtime.optional(),
  invariants: z.array(z.string()),
});
export type ExpectationsManifest = z.infer<typeof ExpectationsManifestSchema>;

export interface CorpusDocument {
  documentId: string;
  label: string;
  file: string;
  role: z.infer<typeof DocumentRole>;
  operative: boolean;
  text: string;
  sha256: string;
}

export interface CorpusPackage {
  packageId: string;
  dir: string;
  manifest: ExpectationsManifest;
  manifestSha256: string;
  documents: CorpusDocument[];
}

export function sha256(text: string | Buffer): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function listPackageIds(root: string = CORPUS_ROOT): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("pkg-"))
    .map((d) => d.name)
    .sort();
}

/** Raw (unvalidated) manifest JSON - used by the pin script before hashes exist. */
export function readRawManifest(packageId: string, root: string = CORPUS_ROOT): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, packageId, "expectations.json"), "utf8")) as Record<string, unknown>;
}

export function loadPackage(packageId: string, root: string = CORPUS_ROOT): CorpusPackage {
  const dir = path.join(root, packageId);
  const manifestBytes = fs.readFileSync(path.join(dir, "expectations.json"));
  const manifest = ExpectationsManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.packageId !== packageId) {
    throw new Error(`manifest packageId ${manifest.packageId} does not match directory ${packageId}`);
  }
  const documents: CorpusDocument[] = manifest.documents.map((d) => {
    const bytes = fs.readFileSync(path.join(dir, d.file));
    const text = bytes.toString("utf8");
    return { documentId: d.documentId, label: d.label, file: d.file, role: d.role, operative: d.operative, text, sha256: sha256(bytes) };
  });
  return { packageId, dir, manifest, manifestSha256: sha256(manifestBytes), documents };
}

export function loadCorpus(root: string = CORPUS_ROOT): CorpusPackage[] {
  return listPackageIds(root).map((id) => loadPackage(id, root));
}

/** Fixture identity for a report: a single digest over every document hash and manifest hash, in package order. */
export function corpusIdentity(packages: CorpusPackage[]): { packages: Array<{ packageId: string; manifestSha256: string; documents: Array<{ documentId: string; sha256: string }> }>; corpusSha256: string } {
  const entries = packages.map((p) => ({ packageId: p.packageId, manifestSha256: p.manifestSha256, documents: p.documents.map((d) => ({ documentId: d.documentId, sha256: d.sha256 })) }));
  return { packages: entries, corpusSha256: sha256(JSON.stringify(entries)) };
}

/**
 * Hash drift between the manifest's pinned document hashes and the bytes on disk. Empty when the corpus is intact.
 */
export function hashDrift(pkg: CorpusPackage): Array<{ documentId: string; pinned: string; actual: string }> {
  const drift: Array<{ documentId: string; pinned: string; actual: string }> = [];
  for (const d of pkg.manifest.documents) {
    const actual = pkg.documents.find((x) => x.documentId === d.documentId)?.sha256 ?? "";
    if (actual !== d.sha256) drift.push({ documentId: d.documentId, pinned: d.sha256, actual });
  }
  return drift;
}
