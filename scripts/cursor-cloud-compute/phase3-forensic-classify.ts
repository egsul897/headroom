/**
 * Phase 3 forensic classification of STRUCTURE_EMPTY and MISSING_DEFINITIONS.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED. No LLM / paid inference.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";

const corpus = process.argv[2] ?? "data/cursor-cloud-compute/phase2-corpus-pilot100";
const outPath =
  process.argv[3] ?? "docs/cursor-cloud-compute/results/phase3-forensic-classification.json";

type SECause =
  | "HTML_VS_TEXT_FORMAT"
  | "PDF_OR_IMAGE_ONLY"
  | "INCORRECT_EXHIBIT_BODY_SELECTION"
  | "ENCODING_OR_NORMALIZATION"
  | "STRUCTURAL_PARSER_LIMITATION"
  | "MISSING_SOURCE_BODY"
  | "WRONG_DOCUMENT_CLASSIFICATION"
  | "OTHER";

type MDCause =
  | "PRESENT_BUT_MISSED"
  | "LOCATED_IN_ANOTHER_DOCUMENT"
  | "INCORPORATED_BY_REFERENCE"
  | "ABSENT_FROM_SOURCE"
  | "HIDDEN_BY_TRUNCATION"
  | "FORMAT_LIMITATION"
  | "OTHER";

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._:-]/g, "_");
}

function guessCT(filename: string, uri: string): string {
  const ext = (filename.split(".").pop() ?? uri.split(".").pop() ?? "").toLowerCase();
  if (ext === "htm" || ext === "html") return "text/html";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  return "text/html";
}

function tally<T extends Record<string, unknown>>(arr: T[], key: keyof T): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of arr) {
    const k = String(x[key]);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function classifySE(opts: {
  filename: string;
  desc: string;
  fullText: string;
  nodes: number;
  contentType: string;
  byteLength: number;
}): {
  rootCause: SECause;
  recoverable: boolean;
  unsupported: boolean;
  evidence: string[];
  signals: Record<string, number | boolean | string>;
} {
  const t = opts.fullText;
  const evidence: string[] = [];
  const article = (t.match(/\bARTICLE\s+[IVXLC0-9]+/gi) || []).length;
  const section = (t.match(/\bSection\s+\d+/gi) || []).length;
  const SECTION = (t.match(/\bSECTION\s+\d+/g) || []).length;
  const form8k = /FORM\s*8-?K|CURRENT\s+REPORT|pursuant to Section\s*13\s*or\s*15\(d\)/i.test(
    t.slice(0, 6000),
  );
  const seeAttached =
    /see\s+(attached|exhibit)|attached\s+hereto|filed\s+herewith|incorporated\s+herein\s+by\s+reference/i.test(
      t.slice(0, 12000),
    );
  const promissory =
    /\b(promissory\s+note)\b/i.test(t.slice(0, 8000)) || /PROMISSORY NOTE/i.test(opts.desc);
  const noteOnly =
    promissory && !/\b(credit\s+agreement|loan\s+agreement|indenture)\b/i.test(t.slice(0, 12000));
  const alpha = t.length ? (t.match(/[A-Za-z]/g) || []).length / t.length : 0;
  const repl = (t.match(/\uFFFD/g) || []).length;
  const headingLike = article + section + SECTION;

  let rootCause: SECause = "OTHER";
  let recoverable = true;
  let unsupported = false;

  if (opts.contentType === "application/pdf" || opts.filename.toLowerCase().endsWith(".pdf")) {
    rootCause = "PDF_OR_IMAGE_ONLY";
    unsupported = true;
    recoverable = false;
    evidence.push("pdf contentType/filename");
  } else if (t.length < 400) {
    rootCause = "MISSING_SOURCE_BODY";
    unsupported = true;
    recoverable = false;
    evidence.push(`fullText.length=${t.length}`);
  } else if (alpha < 0.12 && t.length > 800) {
    rootCause = "PDF_OR_IMAGE_ONLY";
    unsupported = true;
    recoverable = false;
    evidence.push(`alphaRatio=${alpha.toFixed(3)}`);
  } else if (form8k && t.length < 20000 && headingLike < 2 && seeAttached) {
    rootCause = "INCORRECT_EXHIBIT_BODY_SELECTION";
    recoverable = false;
    evidence.push(
      "8-K wrapper with pointer language",
      `chars=${t.length}`,
      `headingLike=${headingLike}`,
    );
  } else if (form8k && t.length < 12000 && headingLike < 2) {
    rootCause = "WRONG_DOCUMENT_CLASSIFICATION";
    recoverable = false;
    evidence.push("short 8-K current report body", `chars=${t.length}`);
  } else if (noteOnly && headingLike < 3) {
    rootCause = "WRONG_DOCUMENT_CLASSIFICATION";
    recoverable = false;
    evidence.push("promissory note / non-article instrument", `headingLike=${headingLike}`);
  } else if (repl > 100 || (alpha < 0.35 && t.length > 5000)) {
    rootCause = "ENCODING_OR_NORMALIZATION";
    recoverable = true;
    evidence.push(`replacementChars=${repl}`, `alphaRatio=${alpha.toFixed(3)}`);
  } else if (headingLike >= 3 && opts.nodes === 0) {
    rootCause = "STRUCTURAL_PARSER_LIMITATION";
    recoverable = true;
    evidence.push(
      "heading markers present after HTML parse",
      `articles=${article}`,
      `sections=${section}`,
      `SECTION=${SECTION}`,
      "structure_nodes=0",
    );
  } else if (headingLike === 0 && opts.nodes === 0) {
    if (opts.contentType === "text/html" && opts.byteLength > t.length * 2.5) {
      rootCause = "HTML_VS_TEXT_FORMAT";
      evidence.push(
        "heavy HTML markup relative to extracted text",
        `bytes=${opts.byteLength}`,
        `chars=${t.length}`,
        "no heading markers in parsed text",
      );
      recoverable = true;
    } else {
      rootCause = "STRUCTURAL_PARSER_LIMITATION";
      evidence.push("no ARTICLE/Section heading shapes in parsed text", `chars=${t.length}`);
      recoverable = true;
    }
  } else if (headingLike > 0 && opts.nodes === 0) {
    rootCause = "STRUCTURAL_PARSER_LIMITATION";
    evidence.push(`weak heading signal headingLike=${headingLike}`, "structure_nodes=0");
    recoverable = true;
  } else {
    rootCause = "OTHER";
    evidence.push(`chars=${t.length}`, `headingLike=${headingLike}`, `nodes=${opts.nodes}`);
  }

  return {
    rootCause,
    recoverable,
    unsupported,
    evidence,
    signals: {
      article,
      section,
      SECTION,
      form8k,
      seeAttached,
      noteOnly,
      alpha: +alpha.toFixed(3),
      repl,
      headingLike,
    },
  };
}

function classifyMD(opts: { fullText: string; defs: number; nodes: number }): {
  rootCause: MDCause;
  presentButMissed: boolean;
  evidence: string[];
  signals: Record<string, number | boolean>;
} {
  const t = opts.fullText;
  const evidence: string[] = [];
  const meansQuoted = (
    t.match(
      /["“”]\s*[^"“”]{1,100}?\s*["“”]\s*(?:means|shall mean|shall have the meaning|has the meaning)/gi,
    ) || []
  ).length;
  const meansEntity = (t.match(/&#14[78];[^&]{1,80}&#14[78];\s*(?:means|shall mean)/gi) || [])
    .length;
  const ibr = /\bincorporated\s+by\s+reference\b/i.test(t.slice(0, 30000));
  const defArticle =
    /\bARTICLE\s+[IVXLC0-9]+\s*[.\-–—:]?\s*DEFINITIONS\b/i.test(t) ||
    /\bDEFINITIONS\s+AND\s+INTERPRETATION\b/i.test(t.slice(0, 80000));
  const defSection =
    /\b(?:Section|SECTION)\s+1\.0?1\b[\s\S]{0,80}\bDefined\s+Terms\b/i.test(t.slice(0, 100000)) ||
    /\bDefined\s+Terms\b/i.test(t.slice(0, 60000));
  const form8k = /FORM\s*8-?K|CURRENT\s+REPORT/i.test(t.slice(0, 6000));
  const alpha = t.length ? (t.match(/[A-Za-z]/g) || []).length / t.length : 0;

  let rootCause: MDCause = "ABSENT_FROM_SOURCE";
  let presentButMissed = false;

  if (opts.defs === 0 && (meansQuoted > 0 || meansEntity > 0)) {
    rootCause = "PRESENT_BUT_MISSED";
    presentButMissed = true;
    evidence.push(
      `meansQuoted=${meansQuoted}`,
      `meansEntity=${meansEntity}`,
      "detector returned 0",
    );
  } else if (defArticle || defSection) {
    rootCause = "PRESENT_BUT_MISSED";
    presentButMissed = true;
    evidence.push(
      `defArticle=${defArticle}`,
      `defSection=${defSection}`,
      meansQuoted === 0 && meansEntity === 0
        ? "definitions heading present; quoted-means grammar absent — alternate drafting pattern"
        : "heading+quotes present but detector miss",
    );
  } else if (ibr && !defArticle && !defSection) {
    rootCause = "INCORPORATED_BY_REFERENCE";
    evidence.push("IBR language; no local definitions article/section");
  } else if (form8k && t.length < 20000) {
    rootCause = "LOCATED_IN_ANOTHER_DOCUMENT";
    evidence.push("short 8-K; definitions expected in exhibit/parent");
  } else if (alpha < 0.15) {
    rootCause = "FORMAT_LIMITATION";
    evidence.push(`alpha=${alpha.toFixed(3)}`);
  } else {
    rootCause = "ABSENT_FROM_SOURCE";
    evidence.push(
      "no quoted-means",
      "no definitions heading",
      `chars=${t.length}`,
      `nodes=${opts.nodes}`,
    );
  }
  return {
    rootCause,
    presentButMissed,
    evidence,
    signals: {
      meansQuoted,
      meansEntity,
      ibr,
      defArticle,
      defSection,
      form8k,
      alpha: +alpha.toFixed(3),
    },
  };
}

async function main(): Promise<void> {
  const q = JSON.parse(fs.readFileSync(path.join(corpus, "processing-queue.json"), "utf8"));
  const items = (q.items ?? q) as Array<{
    source: {
      sourceDocumentId: string;
      documentKind: string;
      filename: string;
      description?: string;
      sourceUri: string;
      accessionNumber?: string;
      cik?: string;
    };
    result?: { errorClass?: string | null };
  }>;
  const se = items.filter((i) => i.result?.errorClass === "STRUCTURE_EMPTY");
  const md = items.filter((i) => i.result?.errorClass === "MISSING_DEFINITIONS");

  const structureCases: Array<Record<string, unknown>> = [];
  for (const i of se) {
    const rp = path.join(corpus, "raw", `${safe(i.source.sourceDocumentId)}.bin`);
    const buf = fs.readFileSync(rp);
    const ct = guessCT(i.source.filename, i.source.sourceUri);
    const parsed = await parseDocument(buf, ct);
    const nodes = parseDocumentStructure({
      documentId: i.source.sourceDocumentId,
      label: i.source.description || i.source.filename,
      text: parsed.fullText,
    });
    const cls = classifySE({
      filename: i.source.filename,
      desc: i.source.description || "",
      fullText: parsed.fullText,
      nodes: nodes.length,
      contentType: ct,
      byteLength: buf.length,
    });
    structureCases.push({
      sourceDocumentId: i.source.sourceDocumentId,
      documentKind: i.source.documentKind,
      filename: i.source.filename,
      description: i.source.description,
      sourceUri: i.source.sourceUri,
      accessionNumber: i.source.accessionNumber,
      cik: i.source.cik,
      contentType: ct,
      byteLength: buf.length,
      charCount: parsed.fullText.length,
      nodeCountReparse: nodes.length,
      failureStage: "structure",
      failureClass: "STRUCTURE_EMPTY",
      ...cls,
      textSnippet: parsed.fullText.slice(0, 280).replace(/\s+/g, " "),
    });
  }

  const defCases: Array<Record<string, unknown>> = [];
  for (const i of md) {
    const rp = path.join(corpus, "raw", `${safe(i.source.sourceDocumentId)}.bin`);
    const buf = fs.readFileSync(rp);
    const ct = guessCT(i.source.filename, i.source.sourceUri);
    const parsed = await parseDocument(buf, ct);
    const nodes = parseDocumentStructure({
      documentId: i.source.sourceDocumentId,
      label: i.source.description || i.source.filename,
      text: parsed.fullText,
    });
    const defs = detectStructuralDefinitions(
      i.source.sourceDocumentId,
      parsed.fullText,
      nodes,
    );
    const cls = classifyMD({
      fullText: parsed.fullText,
      defs: defs.length,
      nodes: nodes.length,
    });
    defCases.push({
      sourceDocumentId: i.source.sourceDocumentId,
      documentKind: i.source.documentKind,
      filename: i.source.filename,
      description: i.source.description,
      sourceUri: i.source.sourceUri,
      accessionNumber: i.source.accessionNumber,
      cik: i.source.cik,
      contentType: ct,
      byteLength: buf.length,
      charCount: parsed.fullText.length,
      nodeCount: nodes.length,
      definitionCountReparse: defs.length,
      failureStage: "definitions",
      failureClass: "MISSING_DEFINITIONS",
      ...cls,
      textSnippet: parsed.fullText.slice(0, 280).replace(/\s+/g, " "),
    });
  }

  const report = {
    status: "COMPUTE_ASSESSMENT_PHASE3_FORENSIC_NOT_CERTIFIED",
    generatedAt: new Date().toISOString(),
    processingVersion: "cca-phase3-forensic-v1",
    corpus,
    structureEmpty: {
      count: structureCases.length,
      byRootCause: tally(structureCases, "rootCause"),
      recoverableParserFailures: structureCases.filter((c) => c.recoverable === true).length,
      unsupportedFormats: structureCases.filter((c) => c.unsupported === true).length,
      nonRecoverableWrongSelectionOrClass: structureCases.filter(
        (c) => c.recoverable === false && c.unsupported !== true,
      ).length,
      cases: structureCases,
    },
    missingDefinitions: {
      count: defCases.length,
      byRootCause: tally(defCases, "rootCause"),
      presentButMissed: defCases.filter((c) => c.presentButMissed === true).length,
      recoveryRateIfParserFixed:
        defCases.filter((c) => c.presentButMissed === true).length /
        Math.max(1, defCases.length),
      cases: defCases,
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        structureEmpty: report.structureEmpty.byRootCause,
        recoverable: report.structureEmpty.recoverableParserFailures,
        unsupportedFormats: report.structureEmpty.unsupportedFormats,
        nonRecoverable: report.structureEmpty.nonRecoverableWrongSelectionOrClass,
        missingDefinitions: report.missingDefinitions.byRootCause,
        presentButMissed: report.missingDefinitions.presentButMissed,
        recoveryRate: report.missingDefinitions.recoveryRateIfParserFixed,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
