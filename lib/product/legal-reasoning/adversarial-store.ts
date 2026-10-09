/**
 * Persist adversarial challenge findings vs initial analysis.
 * Second model is never automatically treated as correct — disagreements are routed.
 */
import type { ChallengeFinding } from "../legal-intelligence/types";
import { readWorkspaceMetaSource, upsertWorkspaceMetaSource } from "./workspace-meta-source";

export type DisagreementStatus = "OPEN" | "COUNSEL_RESOLVED" | "DISMISSED";

export interface AdversarialDisagreement {
  id: string;
  companyId: string;
  analysisId: string;
  finding: ChallengeFinding;
  initialClaim: string;
  status: DisagreementStatus;
  createdAt: string;
  resolutionNote?: string;
}

const META_KEY = "adversarialDisagreements";

function asList(meta: Record<string, unknown> | null): AdversarialDisagreement[] {
  const list = meta?.[META_KEY];
  return Array.isArray(list) ? (list as AdversarialDisagreement[]) : [];
}

/** Append disagreements onto a workspace-scoped meta KnowledgeSource. */
export async function persistAdversarialDisagreements(params: {
  companyId: string;
  analysisId: string;
  findings: ChallengeFinding[];
  initialClaimsByConclusionId: Record<string, string>;
}): Promise<AdversarialDisagreement[]> {
  const sourceId = `adversarial:${params.companyId}`;
  const meta = (await readWorkspaceMetaSource(sourceId)) ?? {};
  const prior = asList(meta);

  const createdAt = new Date().toISOString();
  const created: AdversarialDisagreement[] = params.findings.map((f, i) => ({
    id: `${params.analysisId}-${f.id}-${i}`,
    companyId: params.companyId,
    analysisId: params.analysisId,
    finding: f,
    initialClaim: params.initialClaimsByConclusionId[f.targetConclusionId ?? ""] ?? "(no claim text)",
    status: "OPEN",
    createdAt,
  }));

  const next = [...prior, ...created].slice(-200);
  await upsertWorkspaceMetaSource({
    sourceId,
    companyId: params.companyId,
    title: `Adversarial disagreements — ${params.companyId}`,
    metadata: {
      ...meta,
      [META_KEY]: next,
      note: "Second-pass challenges; never auto-authoritative",
    },
  });
  return created;
}

export async function listOpenAdversarialDisagreements(companyId: string): Promise<AdversarialDisagreement[]> {
  const meta = await readWorkspaceMetaSource(`adversarial:${companyId}`);
  return asList(meta).filter((d) => d.status === "OPEN" && d.companyId === companyId);
}

export async function resolveAdversarialDisagreement(params: {
  companyId: string;
  disagreementId: string;
  status: Exclude<DisagreementStatus, "OPEN">;
  resolutionNote: string;
}): Promise<boolean> {
  const sourceId = `adversarial:${params.companyId}`;
  const meta = await readWorkspaceMetaSource(sourceId);
  if (!meta) return false;
  const list = asList(meta);
  let found = false;
  const next = list.map((d) => {
    if (d.id !== params.disagreementId || d.companyId !== params.companyId) return d;
    found = true;
    return { ...d, status: params.status, resolutionNote: params.resolutionNote };
  });
  if (!found) return false;
  await upsertWorkspaceMetaSource({
    sourceId,
    companyId: params.companyId,
    title: `Adversarial disagreements — ${params.companyId}`,
    metadata: { ...meta, [META_KEY]: next, note: "Second-pass challenges; never auto-authoritative" },
  });
  return true;
}
