import Link from "next/link";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { suggestPermissionMatches } from "@/lib/onboarding/financial";
import { createFacilityAction } from "./actions";

export const metadata = { title: "Headroom — Debt instrument to facility mapping" };
export const dynamic = "force-dynamic";

export default async function OnboardingFacilitiesPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ name?: string }> }) {
  const { companyId } = await params;
  const { name } = await searchParams;
  const create = createFacilityAction.bind(null, companyId);

  const [facilities, suggestions] = await Promise.all([
    prisma.facility.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    name ? suggestPermissionMatches(companyId, name) : Promise.resolve([]),
  ]);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Debt-instrument-to-facility mapping</div>
        <div className="card-subtitle">
          Type the instrument&apos;s name (e.g. from a debt schedule) to see RANKED candidate permissions it might have been incurred under — a human confirms or corrects the match, this is never exact-name-matched automatically.
        </div>
        <form method="GET" style={{ display: "flex", gap: 8 }}>
          <input type="text" name="name" defaultValue={name ?? ""} placeholder="e.g. Term Loan A" style={{ flex: 1 }} />
          <button type="submit" className="button">
            Find matches
          </button>
        </form>
      </Card>

      {name && (
        <Card>
          <div className="card-title">Create facility: {name}</div>
          {suggestions.length === 0 && <div className="row-note">No promoted Permission rows yet for this company — promote candidates first, or leave the mapping empty and confirm later.</div>}
          <form action={create} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="name" value={name} />
            {suggestions.length > 0 && (
              <div className="field">
                <div className="field-label">Candidate permissions (ranked by textual similarity — check every one that authorized this instrument)</div>
                <div className="field-control stack" style={{ gap: 4 }}>
                  {suggestions.map((s) => (
                    <label key={s.permission.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
                      <input type="checkbox" name="originatingPermissionIds" value={s.permission.id} defaultChecked={s.score > 0.15} />
                      <span>
                        <b>{s.permission.code ?? s.permission.id}</b> — {s.permission.action} ({s.permission.document.name}) — match score {(s.score * 100).toFixed(0)}%
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <div className="field-label">Facility type</div>
              <div className="field-control">
                <select name="facilityType" defaultValue="TERM_LOAN">
                  <option value="TERM_LOAN">Term Loan</option>
                  <option value="REVOLVER">Revolver</option>
                  <option value="NOTES">Notes</option>
                  <option value="ABL">ABL</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
            <div className="field">
              <div className="field-label">Original principal ($M)</div>
              <div className="field-control">
                <input type="number" name="originalPrincipal" step="0.01" required />
              </div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" name="secured" /> Secured
            </label>
            <div className="field">
              <div className="field-label">Coupon type</div>
              <div className="field-control">
                <select name="couponType" defaultValue="FLOATING">
                  <option value="FLOATING">Floating</option>
                  <option value="FIXED">Fixed</option>
                </select>
              </div>
            </div>
            <div className="field">
              <div className="field-label">Coupon % (fixed) or margin bps + reference rate (floating)</div>
              <div className="field-control" style={{ display: "flex", gap: 8 }}>
                <input type="number" name="couponPct" step="0.01" placeholder="couponPct" />
                <input type="number" name="marginBps" placeholder="marginBps" />
                <input type="text" name="referenceRate" placeholder="SOFR" />
              </div>
            </div>
            <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
              Create facility with this mapping
            </button>
          </form>
        </Card>
      )}

      {facilities.length > 0 && (
        <Card>
          <div className="card-title">Mapped facilities</div>
          {facilities.map((f) => (
            <div className="row" key={f.id}>
              <div className="row-label">{f.name}</div>
              <div className="row-value">
                {f.facilityType} · {f.originatingPermissionIds.length} permission(s) mapped
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="button-row">
          <Link href={`/${companyId}/onboarding/activate`} className="button button-primary" style={{ textDecoration: "none" }}>
            Continue to Activate
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>
    </div>
  );
}
