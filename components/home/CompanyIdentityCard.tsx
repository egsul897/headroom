import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";
import { BuildingIcon } from "./icons";

/** Real company identity from the database. No fictional company name is supplied here. */
export function CompanyIdentityCard({ name, ticker }: { name: string; ticker: string | null }) {
  return (
    <Link href="/" className="app-company-card" data-company-card>
      <span className="app-company-icon">
        <BuildingIcon />
      </span>
      <span className="app-company-copy">
        <span className="app-company-name">{name}</span>
        {ticker ? <span className="app-company-ticker">{ticker}</span> : null}
      </span>
      <ChevronsUpDown className="app-company-switch" size={14} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}
