import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { StatusBadge } from "@/components/admin/Charts";
import { db } from "@/db";
import { orders, shipments } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_STATUS, statusTone, type OrderStatus, type PaymentStatus } from "@/lib/order-status";

export const metadata: Metadata = { title: "Bestellungen", robots: { index: false } };
export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "Alle" },
  { value: "new", label: "Neu" },
  { value: "paid", label: "Bezahlt" },
  { value: "processing", label: "In Bearbeitung" },
  { value: "ready_to_ship", label: "Versandbereit" },
  { value: "shipped", label: "Versendet" },
  { value: "cancelled", label: "Storniert" },
  { value: "refunded", label: "Erstattet" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "", q = "" } = await searchParams;

  const conditions: SQL[] = [];
  if (status) conditions.push(eq(orders.status, status));
  if (q) {
    const term = `%${q}%`;
    const search = or(
      ilike(orders.orderNumber, term),
      ilike(orders.email, term),
      sql`${orders.shippingAddress}->>'lastName' ilike ${term}`,
      sql`exists (select 1 from ${shipments} s where s.order_id = ${orders.id} and s.tracking_number ilike ${term})`,
    );
    if (search) conditions.push(search);
  }

  const rows = await db
    .select({
      order: orders,
      trackingNumber: shipments.trackingNumber,
      carrier: shipments.carrier,
    })
    .from(orders)
    .leftJoin(shipments, eq(shipments.orderId, orders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(100);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Backoffice</p>
          <h1 className="mt-2 font-display text-display-md font-extrabold">Bestellungen</h1>
        </div>
        <form action="/admin/bestellungen" className="flex gap-2" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Bestellnr., Kunde, E-Mail, Tracking …"
            aria-label="Bestellungen durchsuchen"
            className="field w-72 py-2.5"
          />
          <button type="submit" className="btn-dark py-2.5">Suchen</button>
        </form>
      </div>

      <nav aria-label="Statusfilter" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const href = filter.value
            ? `/admin/bestellungen?status=${filter.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`
            : `/admin/bestellungen${q ? `?q=${encodeURIComponent(q)}` : ""}`;
          const active = status === filter.value;
          return (
            <Link
              key={filter.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-4 py-2 font-display text-sm font-bold transition-colors ${
                active ? "border-carbon-900 bg-carbon-900 text-white" : "border-mist-300 bg-white hover:border-carbon-900"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-mist-200 text-xs uppercase tracking-[.08em] text-mist-700">
              <th className="px-5 py-3 font-display">Bestellnummer</th>
              <th className="px-5 py-3 font-display">Datum</th>
              <th className="px-5 py-3 font-display">Kunde</th>
              <th className="px-5 py-3 text-right font-display">Betrag</th>
              <th className="px-5 py-3 font-display">Zahlung</th>
              <th className="px-5 py-3 font-display">Versand</th>
              <th className="px-5 py-3 font-display">Tracking</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist-200">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-mist-700">
                  Keine Bestellungen gefunden.
                </td>
              </tr>
            )}
            {rows.map(({ order, trackingNumber, carrier }) => (
              <tr key={order.id} className="hover:bg-mist-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/bestellungen/${order.id}`} className="font-mono font-bold hover:text-signal-600">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-5 py-3 text-sm text-mist-700">
                  {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(
                    order.placedAt ?? order.createdAt,
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className="block font-semibold">
                    {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                  </span>
                  <span className="block text-sm text-mist-700">{order.email}</span>
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular">{formatCents(order.totalCents)}</td>
                <td className="px-5 py-3">
                  <StatusBadge
                    label={PAYMENT_STATUS[order.paymentStatus as PaymentStatus]}
                    tone={statusTone(order.paymentStatus as PaymentStatus)}
                  />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge
                    label={ORDER_STATUS[order.status as OrderStatus]}
                    tone={statusTone(order.status as OrderStatus)}
                  />
                  <span className="mt-1 block font-mono text-xs text-mist-500">
                    {order.shippingMethod === "dhl_express" ? "DHL Express" : "DHL Paket"}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-sm">
                  {trackingNumber ? (
                    <span title={carrier ?? undefined}>{trackingNumber}</span>
                  ) : (
                    <span className="text-mist-500">–</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/admin/bestellungen/${order.id}`} className="text-sm font-semibold text-signal-600 hover:underline">
                    Öffnen
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
