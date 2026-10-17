import type { ReactNode } from "react";
import { Newsreader, Public_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "Headroom",
  description: "Covenant capacity and financial analytics platform",
};

/**
 * The exact three typefaces the original prototype (reference/headroom-coherent.jsx)
 * used - Newsreader for section citations/serif headings, Spline Sans Mono
 * for every number, Public Sans for labels/body ("RESET ON OPEN, AND MAKE
 * THE UI MATCH THE PROTOTYPE EXACTLY" task, §"Same visual language"). Loaded
 * via next/font/google (self-hosted at build time, no runtime request to
 * Google Fonts, no FOUC) rather than a <link> tag, exposed as CSS variables
 * globals.css's --font-serif/--font-mono/--font-sans already reference.
 */
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif-src", display: "swap" });
const splineSansMono = Spline_Sans_Mono({ subsets: ["latin"], variable: "--font-mono-src", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-sans-src", display: "swap" });

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
    <html lang="en" className={`${newsreader.variable} ${splineSansMono.variable} ${publicSans.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
