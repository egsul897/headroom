import { notFound } from "next/navigation";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { getCompanySummary } from "@/lib/dashboard-service";
import { PROTECTED_COMPANY_IDS } from "@/lib/coherent";
import { deleteCompanyAction } from "./actions";

export const metadata = { title: "Headroom — Delete company" };
export const dynamic = "force-dynamic";

export default async function DeleteCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();

  if (PROTECTED_COMPANY_IDS.has(companyId)) {
    return (
      <>
        <GlobalBrand />
        <div className="stack">
          <Card>
            <div className="card-title">{company.name} is protected</div>
            <Banner tone="amber">This is a golden regression company used for testing and evaluation. It cannot be deleted from this instance.</Banner>
            <Link className="button" href="/">
              Back to companies
            </Link>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalBrand />
      <div className="stack">
        <Card>
          <div className="card-title">Delete {company.name}</div>
          <Banner tone="red">
            This permanently deletes {company.name} and everything under it - documents, extracted permissions, financial state, golden tests, legal review records, all of it. There is no undo.
          </Banner>
          <form action={deleteCompanyAction} className="stack" style={{ gap: 10, marginTop: 12 }}>
            <input type="hidden" name="companyId" value={companyId} />
            <div className="field">
              <div className="field-label">Type &quot;{company.name}&quot; to confirm</div>
              <div className="field-control">
                <input type="text" name="confirmName" required autoComplete="off" />
              </div>
            </div>
            <button type="submit" className="button button-danger">
              Permanently delete {company.name}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
