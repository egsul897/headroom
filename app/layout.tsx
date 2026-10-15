import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "Headroom",
  description: "Covenant capacity and financial analytics platform",
};

/**
 * Inter is the product face: one family for labels and figures, with
 * tabular numerals applied in CSS. A CFO compares capacity down a column;
 * proportional digits shift. See docs/DESIGN_SYSTEM.md.
 * next/font self-hosts the files at build time.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-src",
  display: "swap",
});

// Every page reads live from Postgres - always render fresh rather than
// serving a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Deliberately minimal and company-agnostic (task hard requirement §2 - no
 * company-specific branching/data anywhere in app/**). Renders NO header of
 * its own - exactly one global "Headroom" brand instance must exist per
 * page (task "UNIVERSAL HEADROOM PRODUCT EXPERIENCE" §2/§107.B), and a
 * layout can't know whether a nested layout below it will supply one. The
 * company-scoped shell (app/[companyId]/layout.tsx) renders its own compact
 * header (name/ticker/leverage); every other route renders
 * `components/GlobalBrand.tsx` explicitly instead.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
