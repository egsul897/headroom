import Link from "next/link";

/**
 * The ONE global Headroom brand instance (task "UNIVERSAL HEADROOM PRODUCT
 * EXPERIENCE" §2/§107.B - "there must be exactly ONE global Headroom brand
 * instance"). Previously `app/layout.tsx` rendered this same markup
 * unconditionally in the root layout AND `app/[companyId]/layout.tsx`
 * rendered its own full "Headroom" header, so every company page showed
 * Headroom twice. Root cause: a Next.js layout can't know whether a nested
 * layout below it will render its own header. Fix: the root layout now
 * renders NO header of its own - only pages/layouts that are NOT already
 * wrapped by a company-scoped header (which supplies its own compact
 * "Headroom" + company name, see app/[companyId]/layout.tsx) render this
 * component explicitly: the root picker, the delete-confirmation page, the
 * new-company wizard, the internal /admin page, and the legacy
 * Coherent-only orphan pages.
 */
export function GlobalBrand() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-row">
          <div>
            <div className="site-title">
              <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                Headroom
              </Link>
            </div>
            <div className="site-subtitle">Covenant capacity and financial analytics platform</div>
          </div>
        </div>
      </div>
    </header>
  );
}
