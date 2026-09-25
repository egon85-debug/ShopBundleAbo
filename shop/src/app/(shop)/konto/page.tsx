import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { AuthForms } from "@/components/shop/AuthForms";
import { Ueberschrift } from "@/components/ui/Gestaltung";
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
      <div className="seite py-12 lg:py-16">
        <Ueberschrift als="h1" groesse="gross">Kundenkonto</Ueberschrift>
        <p className="mt-6 max-w-xl text-kohle">
          Melden Sie sich an, um Bestellungen, Rechnungen und Sendungsverfolgung einzusehen. Für eine
          Bestellung ist ein Konto nicht erforderlich.
        </p>
        <div className="mt-12">
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
    <div className="seite py-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Ueberschrift als="h1" groesse="gross" augenbraue="Willkommen zurück">
            {customer.firstName} {customer.lastName}
          </Ueberschrift>
          <p className="mt-6 text-kohle">{customer.email}</p>
        </div>
        <form action={customerLogoutAction}>
          <button type="submit" className="knopf-zweit">Abmelden</button>
        </form>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <Link href="/konto/bestellungen" className="karte p-6 transition-colors hover:bg-leinen">
          <p className="augenbraue">Bestellungen</p>
          <p className="mt-3 text-heading-sm font-light">{recentOrders.length > 0 ? "Übersicht" : "Noch keine"}</p>
          <p className="mt-1 text-body-sm text-kohle">Bestellhistorie, Rechnungen und Tracking</p>
        </Link>
        <div className="karte p-6">
          <p className="augenbraue">Kontaktdaten</p>
          <p className="mt-3">{customer.email}</p>
          {customer.phone && <p className="text-kohle">{customer.phone}</p>}
        </div>
        <div className="karte p-6">
          <p className="augenbraue">Newsletter</p>
          <p className="mt-3">{customer.acceptsMarketing ? "Abonniert" : "Nicht abonniert"}</p>
        </div>
      </div>

      {recentOrders.length > 0 && (
        <section className="mt-20">
          <Ueberschrift groesse="mittel">Letzte Bestellungen</Ueberschrift>
          <div className="mt-8 divide-y divide-haarlinie border-y border-haarlinie">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/bestellung/${order.orderNumber}`}
                className="flex flex-wrap items-center justify-between gap-4 px-2 py-5 transition-colors hover:bg-leinen"
              >
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-body-sm text-kohle">
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(order.placedAt ?? order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <span className="plakette-leise">
                    {ORDER_STATUS[order.status as keyof typeof ORDER_STATUS]}
                  </span>
                  <span className="text-subheading tabular">{formatCents(order.totalCents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
