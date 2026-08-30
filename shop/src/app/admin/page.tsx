import type { Metadata } from "next";
import Link from "next/link";

import { RevenueChart, StatTile, TopProductsChart } from "@/components/admin/Charts";
import { formatCents } from "@/lib/money";
import { shippingOptions } from "@/lib/shipping/registry";
import { stripeConfigured } from "@/lib/stripe";
import { dashboardMetrics, lowStockProducts, revenueSeries, topProducts } from "@/services/analytics";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [metrics, series, top, lowStock] = await Promise.all([
    dashboardMetrics(),
    revenueSeries(30),
    topProducts(6),
    lowStockProducts(8),
  ]);

  const missingConfig = [
    !stripeConfigured() && "Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)",
    ...shippingOptions()
      .filter((option) => !option.isConfigured)
      .map((option) => `${option.label} (Zugangsdaten fehlen)`),
    !process.env.SMTP_HOST && "E-Mail-Versand (SMTP_HOST)",
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1 className="mt-2 font-display text-display-md font-extrabold">Dashboard</h1>
        </div>
        <Link href="/admin/bestellungen?status=paid" className="btn-dark py-2.5">
          Zu versendende Bestellungen ({metrics.toShip})
        </Link>
      </div>

      {missingConfig.length > 0 && (
        <div className="mt-6 rounded-2xl border-l-4 border-amber-600 bg-amber-50 p-5">
          <p className="font-display font-bold text-carbon-900">Noch zu hinterlegende Zugangsdaten</p>
          <ul className="mt-2 list-inside list-disc text-[15px] text-mist-700">
            {missingConfig.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-mist-700">
            Eintragen in <code className="code-chip">shop/.env</code> (Vorlage:{" "}
            <code className="code-chip">shop/.env.example</code>).
          </p>
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Bestellungen heute" value={String(metrics.ordersToday)} tone="accent" />
        <StatTile label="Umsatz heute" value={formatCents(metrics.revenueTodayCents)} tone="good" />
        <StatTile label="Umsatz Monat" value={formatCents(metrics.revenueMonthCents)} tone="good" />
        <StatTile
          label="Offene Bestellungen"
          value={String(metrics.openOrders)}
          hint="Zahlung ausstehend"
          tone={metrics.openOrders > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Bezahlt" value={String(metrics.paidOrders)} tone="good" />
        <StatTile
          label="Zu versenden"
          value={String(metrics.toShip)}
          hint="Etikett noch nicht erstellt"
          tone={metrics.toShip > 0 ? "warning" : "neutral"}
        />
        <StatTile label="Versendet" value={String(metrics.shipped)} />
        <StatTile
          label="Storniert"
          value={String(metrics.cancelled)}
          tone={metrics.cancelled > 0 ? "critical" : "neutral"}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Umsatz der letzten 30 Tage</h2>
          <p className="mt-1 text-sm text-mist-700">Nur bezahlte Bestellungen, Bruttobeträge.</p>
          <div className="mt-6">
            <RevenueChart series={series} />
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Meistverkaufte Produkte</h2>
          <div className="mt-5">
            <TopProductsChart items={top} />
          </div>
        </section>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-xl font-bold">Niedriger Lagerbestand</h2>
        {lowStock.length === 0 ? (
          <p className="mt-3 text-sm text-mist-700">Alle Produkte sind ausreichend bevorratet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-mist-200 text-xs uppercase tracking-[.08em] text-mist-700">
                  <th className="pb-2 font-display">Produkt</th>
                  <th className="pb-2 font-display">SKU</th>
                  <th className="pb-2 text-right font-display">Verfügbar</th>
                  <th className="pb-2 text-right font-display">Schwelle</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mist-200">
                {lowStock.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 font-semibold">{item.name}</td>
                    <td className="py-2.5 font-mono text-sm">{item.sku}</td>
                    <td className="py-2.5 text-right font-mono tabular">{item.quantity - item.reserved}</td>
                    <td className="py-2.5 text-right font-mono tabular text-mist-700">{item.threshold}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/admin/produkte/${item.id}`} className="text-sm font-semibold text-signal-600 hover:underline">
                        Bestand ändern
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
