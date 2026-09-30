import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

// Die eine Schrift des Shops, frei nutzbar (SIL Open Font License).
// Nur die drei Stärken der Gestaltung: 300 Überschriften, 400 Text, 500 Betonung.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Winterfeldt Logistik – Logistik. Einfach. Digital.",
    template: "%s | Winterfeldt Logistik",
  },
  description:
    "Produkte bestellen, sicher bezahlen und zuverlässig mit DHL geliefert bekommen. Der Onlineshop von Winterfeldt Logistik.",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Winterfeldt Logistik",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
