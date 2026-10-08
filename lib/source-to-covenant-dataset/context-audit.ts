/**
 * Controlling-context completeness audit.
 * SOURCE_WINDOW_PRESENT ≠ CONTROLLING_CONTEXT_COMPLETE.
 */
import type { SourceToCovenantRecord } from "./types";
import type { ControllingContextAudit, DependencyReference, DependencyKind } from "./types-v2";

const AUDIT_AT = "2026-10-08T22:30:00.000Z";

function dep(
  kind: DependencyKind,
  ref: string,
  presentInRecord: boolean,
  availableInFixtureCorpus: boolean | null,
  notes: string,
): DependencyReference {
  return { kind, ref, presentInRecord, availableInFixtureCorpus, notes };
}

export function auditControllingContext(record: SourceToCovenantRecord): ControllingContextAudit {
  const text = record.input.exactText;
  const defs = Object.keys(record.input.definitions);
  const xrefs = record.input.crossReferences;
  const deps: DependencyReference[] = [];

  // Governing prohibition
  const govPresent = Boolean(record.governingProhibition && record.governingProhibition.length > 10);
  deps.push(
    dep(
      "GOVERNING_PROHIBITION",
      record.governingProhibition?.slice(0, 120) ?? "(none recorded)",
      govPresent || /shall not|will not|create,\s*incur|limitation on/i.test(text),
      true,
      govPresent ? "Recorded on record" : "Inferred only from window language if present",
    ),
  );

  // Exceptions / provisos
  const excPresent = (record.input.exceptions?.length ?? 0) > 0 || /except|provided\s+that|provided,/i.test(text);
  deps.push(
    dep("EXCEPTION_OR_PROVISO", "exceptions[] / proviso language", excPresent, true, "Window or recorded exceptions"),
  );

  // Defined terms cited but not pulled
  const citedTerms = [...xrefs, ...defs];
  const missingDefPulls: string[] = [];
  for (const t of xrefs) {
    if (/^[A-Z][A-Za-z0-9 ]{2,80}$/.test(t) && !(t in record.input.definitions)) {
      // Heuristic: Title-Case xref may be a defined term
      if (!/Section|Article|Schedule|Exhibit/i.test(t)) missingDefPulls.push(t);
    }
  }
  deps.push(
    dep(
      "DEFINED_TERM",
      defs.length ? defs.join(", ") : "(none pulled)",
      defs.length > 0,
      defs.length > 0 ? true : null,
      missingDefPulls.length
        ? `Cited terms without pulled definitions: ${missingDefPulls.slice(0, 8).join(", ")}`
        : "Pulled definitions present or none clearly required",
    ),
  );

  // Remote conditions
  const remote =
    /Payment Conditions|Pro Forma|as defined|subject to Section|so long as/i.test(text) ||
    (record.input.conditions?.length ?? 0) > 0;
  const remotePresent =
    (record.input.conditions?.length ?? 0) > 0 ||
    Boolean(record.input.definitions["Payment Conditions"]) ||
    /Payment Conditions/.test(text);
  deps.push(
    dep(
      "REMOTE_CONDITION",
      "remote/compound conditions",
      remotePresent,
      remote ? null : true,
      remote && !remotePresent ? "Remote condition language detected; full mechanics may be outside window" : "ok or not applicable",
    ),
  );

  // Entity restrictions
  const entityPresent = (record.input.entityScopeNotes?.length ?? 0) > 0;
  deps.push(
    dep(
      "ENTITY_RESTRICTION",
      record.input.entityScopeNotes?.join("; ") || "entity scope",
      entityPresent || /Loan Party|Restricted Subsidiary|Borrower|Guarantor/i.test(text),
      true,
      entityPresent ? "Notes recorded" : "Entity language may exist in window without structured notes",
    ),
  );

  // Shared baskets / reclassification / amendments / cross-doc
  deps.push(
    dep(
      "SHARED_BASKET",
      "shared capacity",
      /shared|in aggregate|together with|Available Amount/i.test(text),
      null,
      "Presence of shared-capacity mechanics not fully resolved from window alone",
    ),
  );
  deps.push(
    dep(
      "RECLASSIFICATION_RULE",
      "reclassification",
      /reclassif/i.test(text),
      /reclassif/i.test(text) ? true : null,
      /reclassif/i.test(text) ? "Reclassification language in window" : "Not observed in window",
    ),
  );
  const amd = Boolean(record.operativeVersion.amendmentIdentity);
  deps.push(
    dep(
      "AMENDMENT_MODIFICATION",
      record.operativeVersion.amendmentIdentity ?? "none",
      amd ? Boolean(record.role === "AMENDMENT_EFFECT" || record.operativeVersion.isRestatedOperativeText) : true,
      amd ? null : true,
      amd ? "Amendment identity recorded; pre-amendment text may be missing" : "No amendment identity",
    ),
  );
  deps.push(
    dep(
      "CROSS_DOCUMENT_CONSTRAINT",
      "cross-document",
      record.role === "UNSUPPORTED_SEMANTICS" || /Intercreditor|Indenture|not filed/i.test(record.output.labelNotes),
      record.role === "UNSUPPORTED_SEMANTICS" ? false : null,
      "Cross-document constraints often unavailable in a single fixture",
    ),
  );

  // Financial inputs
  const needsFin = /\$|%|Ratio|EBITDA|Availability/i.test(text);
  deps.push(
    dep(
      "FINANCIAL_INPUT",
      "financial facts for capacity",
      false,
      needsFin ? false : true,
      needsFin ? "Live financial inputs not part of legal-text window" : "Not required for this record",
    ),
  );

  const missing = deps
    .filter((d) => {
      if (d.kind === "FINANCIAL_INPUT" && needsFin) return true;
      if (d.kind === "DEFINED_TERM" && missingDefPulls.length > 0) return true;
      if (d.kind === "REMOTE_CONDITION" && remote && !remotePresent) return true;
      if (d.kind === "AMENDMENT_MODIFICATION" && amd && d.availableInFixtureCorpus === null) return true;
      if (d.kind === "CROSS_DOCUMENT_CONSTRAINT" && d.availableInFixtureCorpus === false) return true;
      if (d.kind === "GOVERNING_PROHIBITION" && !d.presentInRecord && record.polarity === "POSITIVE" && record.role === "EXCEPTION_BASKET")
        return true;
      return false;
    })
    .map((d) => `${d.kind}:${d.ref}`.slice(0, 160));

  // Reserved / negative boilerplate can be complete with a tiny window.
  let status: ControllingContextAudit["status"] = "SOURCE_WINDOW_PRESENT";
  if (record.role === "BOILERPLATE_OR_RESERVED" || record.polarity === "NEGATIVE" && record.role === "BOILERPLATE_OR_RESERVED") {
    status = missing.length === 0 ? "CONTROLLING_CONTEXT_COMPLETE" : "CONTEXT_INCOMPLETE";
  } else if (missing.length === 0 && govPresent && (defs.length > 0 || xrefs.length === 0)) {
    // Strict: only mark COMPLETE when governing prohibition recorded and no missing deps.
    status = "CONTROLLING_CONTEXT_COMPLETE";
  } else if (missing.length > 0) {
    status = "CONTEXT_INCOMPLETE";
  } else {
    // Window present and no hard missing — still not certified complete without fuller dependency closure.
    status = "SOURCE_WINDOW_PRESENT";
  }

  // Definition-only records: complete if definition text present.
  if (record.role === "DEFINITION" && text.length > 40 && missing.filter((m) => !m.startsWith("FINANCIAL_INPUT")).length === 0) {
    status = "CONTROLLING_CONTEXT_COMPLETE";
  }

  return {
    sourceWindowPresent: true,
    status,
    dependencyReferences: deps,
    missingRequiredDependencies: missing,
    auditNotes:
      status === "CONTROLLING_CONTEXT_COMPLETE"
        ? "No required dependency gaps flagged under Phase-2 heuristics; not a certification of legal completeness."
        : status === "CONTEXT_INCOMPLETE"
          ? `CONTEXT_INCOMPLETE: ${missing.join("; ")}`
          : "SOURCE_WINDOW_PRESENT only — do not certify controlling-context completeness from extraction success alone.",
    auditedAt: AUDIT_AT,
    completenessNotInferredFromExtractionAlone: true,
  };
}
