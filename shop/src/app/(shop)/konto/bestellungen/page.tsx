import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { Ueberschrift } from "@/components/ui/Gestaltung";
import { db } from "@/db";
import { orders, shipments } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/order-status";

export const metadata: Metadata = { title: "Meine Bestellungen", robots: { index: false } };

export default async function OrderHistoryPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/konto");

  const rows = await db
    .select({ order: orders, shipment: shipments })
    .from(orders)
    .leftJoin(shipments, eq(shipments.orderId, orders.id))
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt));

  return (
    <div className="seite py-12 lg:py-16">
      <Ueberschrift als="h1" groesse="gross">Meine Bestellungen</Ueberschrift>

      {rows.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-kohle">Sie haben noch keine Bestellungen aufgegeben.</p>
          <Link href="/shop" className="knopf-aktion mt-8">Zum Shop</Link>
        </div>
      ) : (
        <div className="mt-12 space-y-4">
          {rows.map(({ order, shipment }) => (
            <article key={order.id} className="karte p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link href={`/bestellung/${order.orderNumber}`} className="text-subheading font-medium hover:underline hover:underline-offset-4">
                    {order.orderNumber}
                  </Link>
                  <p className="text-body-sm text-kohle">
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-heading-sm tabular">{formatCents(order.totalCents)}</p>
                  <p className="text-body-sm text-kohle">
                    {ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]} ·{" "}
                    {PAYMENT_STATUS[order.paymentStatus as keyof typeof PAYMENT_STATUS]}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/bestellung/${order.orderNumber}`} className="knopf-zweit py-2.5 text-body-sm">
                  Details &amp; Rechnung
                </Link>
                {shipment?.trackingUrl && (
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="knopf-zweit py-2.5 text-body-sm">
                    Sendung verfolgen
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
