/**
 * Compares three compilation scopes. This does not compile, call a model,
 * or certify.
 *
 * A compiles every package unit.
 * B compiles the asked section and its own children only.
 * C compiles the asked section, explicit cross-reference targets, and their
 * parent prohibitions, and it lists every package unit that was not compiled.
 *
 * Counts are population sizes. They are not measured dollars.
 */
export interface CompilationUnit {
  id: string;
  sectionRef: string;
  text: string;
}

export interface ScopeReference {
  sourceSectionRef: string;
  normalizedTarget: string;
  targetKind: "ARTICLE" | "SECTION" | "CLAUSE" | "SCHEDULE" | "EXHIBIT";
  resolved: boolean;
  targetAmbiguous: boolean;
}

export interface KnownDefinition {
  term: string;
  /** Deterministic definition text, when the structural index already has it. Used only to walk term-to-term dependencies. */
  text?: string;
}

export interface UnresolvedEdge {
  sourceSectionRef: string;
  normalizedTarget: string;
  reason: "UNRESOLVED" | "AMBIGUOUS" | "ARTICLE_NOT_EXPANDED" | "NON_SECTION_TARGET";
}

export interface ScopePopulation {
  compiledUnitIds: string[];
  /** Population size. Not a measured cost and not a measured model-call count from a paid run. */
  compilationUnits: number;
}

export interface ScopeComparison {
  approachA: ScopePopulation;
  approachB: ScopePopulation & { notExaminedUnitIds: string[] };
  approachC: ScopePopulation & {
    closureRefs: string[];
    definitionContext: string[];
    missingDefinitions: string[];
    unresolvedEdges: UnresolvedEdge[];
    notExaminedUnitIds: string[];
    omissionAudit: "DISCLOSED";
    advancesCertification: false;
  };
}

export function compareCompilationScopes(args: {
  units: readonly CompilationUnit[];
  seedSectionRefs: readonly string[];
  references: readonly ScopeReference[];
  definitions: readonly KnownDefinition[];
  /** Terms the question must be able to resolve. Absence is disclosed. Other capitalized words are not guessed to be defined terms. */
  requiredTerms?: readonly string[];
  maxHops?: number;
}): ScopeComparison {
  const maxHops = args.maxHops ?? 3;
  const approachA = population(args.units.map((unit) => unit.id));
  const seedRefs = new Set(args.seedSectionRefs);
  const localRefs = new Set<string>();
  for (const ref of seedRefs) for (const ancestor of withAncestors(ref)) localRefs.add(ancestor);
  const approachBIds = args.units.filter((unit) => refCoveredBy(unit.sectionRef, localRefs)).map((unit) => unit.id);
  const closure = new Set<string>(localRefs);
  const unresolved: UnresolvedEdge[] = [];
  let frontier = [...closure];
  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = [];
    for (const sourceRef of frontier) {
      for (const reference of args.references) {
        if (!refCoveredBy(reference.sourceSectionRef, new Set([sourceRef]))) continue;
        const edge = admitReference(reference);
        if (edge.kind === "blocked") {
          unresolved.push({ sourceSectionRef: reference.sourceSectionRef, normalizedTarget: reference.normalizedTarget, reason: edge.reason });
          continue;
        }
        for (const target of withAncestors(edge.ref)) {
          if (closure.has(target)) continue;
          closure.add(target);
          next.push(target);
        }
      }
    }
    frontier = next;
    if (next.length === 0) break;
  }
  const approachCIds = args.units.filter((unit) => refCoveredBy(unit.sectionRef, closure)).map((unit) => unit.id);
  const closedText = args.units.filter((unit) => approachCIds.includes(unit.id)).map((unit) => unit.text).join("\n");
  const known = args.definitions.map((definition) => definition.term);
  const definitionContext = new Set(known.filter((term) => textHasTerm(closedText, term)));
  for (let hop = 0; hop < (args.maxHops ?? 3); hop++) {
    let grew = false;
    for (const definition of args.definitions) {
      if (!definition.text || !definitionContext.has(definition.term)) continue;
      for (const other of known) {
        if (definitionContext.has(other) || other === definition.term) continue;
        if (!textHasTerm(definition.text, other)) continue;
        definitionContext.add(other);
        grew = true;
      }
    }
    if (!grew) break;
  }
  const missingDefinitions = (args.requiredTerms ?? []).filter((term) => {
    const knownTerm = known.some((item) => item.toLowerCase() === term.toLowerCase());
    return !knownTerm || !textHasTerm(closedText, term);
  }).sort();
  const notExamined = (ids: string[]) => args.units.filter((unit) => !ids.includes(unit.id)).map((unit) => unit.id);
  return {
    approachA,
    approachB: { ...population(approachBIds), notExaminedUnitIds: notExamined(approachBIds) },
    approachC: {
      ...population(approachCIds),
      closureRefs: [...closure].sort(),
      definitionContext: [...definitionContext].sort(),
      missingDefinitions,
      unresolvedEdges: dedupeEdges(unresolved),
      notExaminedUnitIds: notExamined(approachCIds),
      omissionAudit: "DISCLOSED",
      advancesCertification: false,
    },
  };
}

function population(ids: string[]): ScopePopulation {
  return { compiledUnitIds: ids, compilationUnits: ids.length };
}

function admitReference(reference: ScopeReference): { kind: "admit"; ref: string } | { kind: "blocked"; reason: UnresolvedEdge["reason"] } {
  if (reference.targetAmbiguous) return { kind: "blocked", reason: "AMBIGUOUS" };
  if (!reference.resolved) return { kind: "blocked", reason: "UNRESOLVED" };
  if (reference.targetKind === "ARTICLE") return { kind: "blocked", reason: "ARTICLE_NOT_EXPANDED" };
  if (reference.targetKind !== "SECTION" && reference.targetKind !== "CLAUSE") return { kind: "blocked", reason: "NON_SECTION_TARGET" };
  return { kind: "admit", ref: reference.normalizedTarget };
}

function withAncestors(ref: string): string[] {
  const refs = [ref];
  let current = ref;
  while (/\([^)]+\)$/.test(current)) {
    current = current.replace(/\([^()]+\)$/, "");
    refs.push(current);
  }
  return refs;
}

function refCoveredBy(sectionRef: string, closed: ReadonlySet<string>): boolean {
  for (const ref of closed) {
    if (sectionRef === ref || sectionRef.startsWith(`${ref}(`)) return true;
  }
  return false;
}

function textHasTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function dedupeEdges(edges: readonly UnresolvedEdge[]): UnresolvedEdge[] {
  const seen = new Set<string>();
  const out: UnresolvedEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.sourceSectionRef}|${edge.normalizedTarget}|${edge.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}
