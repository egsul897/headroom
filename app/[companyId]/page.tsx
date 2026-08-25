import { redirect } from "next/navigation";

export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  redirect(`/${companyId}/overview`);
}
