import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Spectral } from "next/font/google";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { parseTheme, THEME_COOKIE, themeVars } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display serif for creature names and stat block headings in the DM Screen.
const spectral = Spectral({ variable: "--font-spectral", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Portal", template: "%s · Portal" },
  description: "Control panel for the D&D recorder bot and related tools.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080912",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      style={themeVars(theme) as CSSProperties}
      className={`${geistSans.variable} ${geistMono.variable} ${spectral.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
