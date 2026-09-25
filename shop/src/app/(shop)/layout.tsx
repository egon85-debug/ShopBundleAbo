import { SiteFooter, SiteHeader } from "@/components/ui/SiteChrome";

/** Rahmen aller Kundenseiten: Shop-Stil (Klasse "shop"), Inter, weißer Grund. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop flex min-h-screen flex-col bg-white font-inter text-body text-tinte">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
