/**
 * Explicit dependency closure for negative-covenant exception candidates.
 * RESEARCH ONLY — never promotes to production capacity.
 */

export type DependencyStatus =
  | "RESOLVED"
  | "PARTIAL"
  | "UNRESOLVED"
  | "AMBIGUOUS"
  | "EXTERNAL"
  | "SUPERSEDED"
  | "NOT_APPLICABLE";

export type DependencyKind =
  | "GOVERNING_PROHIBITION"
  | "OPENING_LANGUAGE"
  | "LOCAL_PROVISO"
  | "REMOTE_SECTION_PROVISO"
  | "DEFINED_TERM"
  | "NESTED_DEFINITION"
  | "ENTITY_RESTRICTION"
  | "GUARANTOR_RESTRICTION"
  | "RATIO_FINANCIAL_CONDITION"
  | "SHARED_CAPACITY"
  | "CROSS_DOCUMENT"
  | "AMENDMENT_VERSION_AUTHORITY"
  | "CROSS_REFERENCE";

export interface DependencyAtom {
  kind: DependencyKind;
  label: string;
  status: DependencyStatus;
  evidenceText?: string;
  targetRef?: string;
  notes?: string;
}

export interface DependencyClosure {
  exceptionRef: string;
  atoms: DependencyAtom[];
  unresolved: DependencyAtom[];
  /** True when any controlling dependency is missing/ambiguous/external-unresolved. */
  blockingForUnconditional: boolean;
  summary: string;
}

export function buildDependencyClosure(input: {
  exceptionRef: string;
  governingProhibition?: { text: string; status?: DependencyStatus };
  openingLanguage?: { text: string; status?: DependencyStatus };
  localProvisos: Array<{ text: string; status?: DependencyStatus }>;
  remoteSectionProvisos: Array<{ text: string; status?: DependencyStatus }>;
  definedTerms: Array<{ term: string; status: DependencyStatus; evidenceText?: string }>;
  entityRestrictions: Array<{ text: string; status?: DependencyStatus }>;
  guarantorRestrictions?: Array<{ text: string; status?: DependencyStatus }>;
  ratioFinancial?: Array<{ text: string; status?: DependencyStatus }>;
  sharedCapacity?: Array<{ text: string; status?: DependencyStatus }>;
  crossDocument?: Array<{ text: string; status?: DependencyStatus }>;
  amendmentAuthority?: Array<{ text: string; status?: DependencyStatus }>;
  crossReferences?: Array<{ text: string; status: DependencyStatus; targetRef?: string }>;
}): DependencyClosure {
  const atoms: DependencyAtom[] = [];

  if (input.governingProhibition) {
    atoms.push({
      kind: "GOVERNING_PROHIBITION",
      label: "governing prohibition",
      status: input.governingProhibition.status ?? "RESOLVED",
      evidenceText: input.governingProhibition.text,
    });
  } else {
    atoms.push({
      kind: "GOVERNING_PROHIBITION",
      label: "governing prohibition",
      status: "UNRESOLVED",
      notes: "No governing prohibition located for candidate",
    });
  }

  if (input.openingLanguage) {
    atoms.push({
      kind: "OPENING_LANGUAGE",
      label: "applicable opening language",
      status: input.openingLanguage.status ?? "RESOLVED",
      evidenceText: input.openingLanguage.text,
    });
  }

  for (const p of input.localProvisos) {
    atoms.push({
      kind: "LOCAL_PROVISO",
      label: "local proviso",
      status: p.status ?? "RESOLVED",
      evidenceText: p.text,
    });
  }
  for (const p of input.remoteSectionProvisos) {
    atoms.push({
      kind: "REMOTE_SECTION_PROVISO",
      label: "remote section proviso",
      status: p.status ?? "PARTIAL",
      evidenceText: p.text,
    });
  }
  for (const d of input.definedTerms) {
    atoms.push({
      kind: "DEFINED_TERM",
      label: d.term,
      status: d.status,
      evidenceText: d.evidenceText,
      targetRef: d.term,
    });
  }
  for (const e of input.entityRestrictions) {
    atoms.push({
      kind: "ENTITY_RESTRICTION",
      label: "entity restriction",
      status: e.status ?? "RESOLVED",
      evidenceText: e.text,
    });
  }
  for (const g of input.guarantorRestrictions ?? []) {
    atoms.push({
      kind: "GUARANTOR_RESTRICTION",
      label: "guarantor restriction",
      status: g.status ?? "PARTIAL",
      evidenceText: g.text,
    });
  }
  for (const r of input.ratioFinancial ?? []) {
    atoms.push({
      kind: "RATIO_FINANCIAL_CONDITION",
      label: "ratio/financial condition",
      status: r.status ?? "RESOLVED",
      evidenceText: r.text,
    });
  }
  for (const s of input.sharedCapacity ?? []) {
    atoms.push({
      kind: "SHARED_CAPACITY",
      label: "shared-capacity restriction",
      status: s.status ?? "PARTIAL",
      evidenceText: s.text,
    });
  }
  for (const c of input.crossDocument ?? []) {
    atoms.push({
      kind: "CROSS_DOCUMENT",
      label: "cross-document limitation",
      status: c.status ?? "EXTERNAL",
      evidenceText: c.text,
    });
  }
  for (const a of input.amendmentAuthority ?? []) {
    atoms.push({
      kind: "AMENDMENT_VERSION_AUTHORITY",
      label: "amendment/version authority",
      status: a.status ?? "UNRESOLVED",
      evidenceText: a.text,
    });
  }
  for (const x of input.crossReferences ?? []) {
    atoms.push({
      kind: "CROSS_REFERENCE",
      label: x.text,
      status: x.status,
      targetRef: x.targetRef,
      evidenceText: x.text,
    });
  }

  const unresolved = atoms.filter((a) =>
    ["UNRESOLVED", "AMBIGUOUS", "EXTERNAL", "SUPERSEDED", "PARTIAL"].includes(a.status),
  );
  const blockingForUnconditional =
    unresolved.length > 0 ||
    atoms.some((a) => a.kind === "REMOTE_SECTION_PROVISO" || a.kind === "CROSS_DOCUMENT");

  return {
    exceptionRef: input.exceptionRef,
    atoms,
    unresolved,
    blockingForUnconditional,
    summary: blockingForUnconditional
      ? `Dependency closure incomplete/blocking (${unresolved.length} non-resolved controlling atoms)`
      : "No blocking unresolved controlling dependencies detected in local pass",
  };
}

/** Never treat as legally unconditional when closure is blocking. */
export function mayClassifyUnconditional(closure: DependencyClosure): boolean {
  return !closure.blockingForUnconditional;
}
