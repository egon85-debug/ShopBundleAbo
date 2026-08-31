import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteFooter, SiteHeader } from "@/components/ui/SiteChrome";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Weiches Scrollen ist die Grundlage aller Kamerafahrten und Reveals. */}
      <SmoothScroll />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
