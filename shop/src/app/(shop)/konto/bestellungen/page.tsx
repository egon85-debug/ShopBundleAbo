import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

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
    <div className="section py-12">
      <h1 className="font-display text-display-lg font-extrabold">Meine Bestellungen</h1>

      {rows.length === 0 ? (
        <div className="card mt-8 p-12 text-center">
          <p className="text-mist-700">Sie haben noch keine Bestellungen aufgegeben.</p>
          <Link href="/shop" className="btn-primary mt-6">Shop entdecken</Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {rows.map(({ order, shipment }) => (
            <article key={order.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link href={`/bestellung/${order.orderNumber}`} className="font-mono text-lg font-bold hover:text-signal-600">
                    {order.orderNumber}
                  </Link>
                  <p className="text-sm text-mist-700">
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-extrabold tabular">{formatCents(order.totalCents)}</p>
                  <p className="text-sm text-mist-700">
                    {ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]} ·{" "}
                    {PAYMENT_STATUS[order.paymentStatus as keyof typeof PAYMENT_STATUS]}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/bestellung/${order.orderNumber}`} className="btn-ghost py-2.5 text-sm">
                  Details &amp; Rechnung
                </Link>
                {shipment?.trackingUrl && (
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2.5 text-sm">
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
