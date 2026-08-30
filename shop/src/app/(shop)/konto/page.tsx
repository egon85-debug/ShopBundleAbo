import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { AuthForms } from "@/components/shop/AuthForms";
import { customerLogoutAction } from "@/app/actions/account";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { ORDER_STATUS } from "@/lib/order-status";

export const metadata: Metadata = { title: "Kundenkonto", robots: { index: false } };

export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="section py-12">
        <h1 className="font-display text-display-lg font-extrabold">Kundenkonto</h1>
        <p className="mt-3 max-w-xl text-mist-700">
          Melden Sie sich an, um Bestellungen, Rechnungen und Sendungsverfolgung einzusehen. Für eine
          Bestellung ist ein Konto nicht erforderlich.
        </p>
        <div className="mt-10">
          <AuthForms />
        </div>
      </div>
    );
  }

  const recentOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt))
    .limit(5);

  return (
    <div className="section py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Willkommen zurück</p>
          <h1 className="mt-3 font-display text-display-lg font-extrabold">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="mt-2 text-mist-700">{customer.email}</p>
        </div>
        <form action={customerLogoutAction}>
          <button type="submit" className="btn-ghost">Abmelden</button>
        </form>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Link href="/konto/bestellungen" className="card p-6 transition-shadow hover:shadow-lift">
          <p className="eyebrow">Bestellungen</p>
          <p className="mt-2 font-display text-2xl font-extrabold">{recentOrders.length > 0 ? "Übersicht" : "Noch keine"}</p>
          <p className="mt-1 text-sm text-mist-700">Bestellhistorie, Rechnungen und Tracking</p>
        </Link>
        <div className="card p-6">
          <p className="eyebrow">Kontaktdaten</p>
          <p className="mt-2 text-[15px]">{customer.email}</p>
          {customer.phone && <p className="text-[15px] text-mist-700">{customer.phone}</p>}
        </div>
        <div className="card p-6">
          <p className="eyebrow">Newsletter</p>
          <p className="mt-2 text-[15px]">{customer.acceptsMarketing ? "Abonniert" : "Nicht abonniert"}</p>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-display-md font-extrabold">Letzte Bestellungen</h2>
          <div className="mt-6 space-y-3">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/bestellung/${order.orderNumber}`}
                className="card flex flex-wrap items-center justify-between gap-4 p-5 transition-shadow hover:shadow-lift"
              >
                <div>
                  <p className="font-mono font-bold">{order.orderNumber}</p>
                  <p className="text-sm text-mist-700">
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <span className="rounded-full bg-mist-100 px-3 py-1 font-display text-xs font-bold">
                    {ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]}
                  </span>
                  <span className="font-display font-extrabold tabular">{formatCents(order.totalCents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
