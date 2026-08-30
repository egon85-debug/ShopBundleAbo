import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { inventory, orderItems, orders, products } from "@/db/schema";

/** Kennzahlen für das Admin-Dashboard. */
export async function dashboardMetrics() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const countBy = async (...where: Parameters<typeof and>) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(...where));
    return row?.count ?? 0;
  };

  const revenueSince = async (since: Date) => {
    const [row] = await db
      .select({ sum: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
      .from(orders)
      .where(and(gte(orders.paidAt, since), eq(orders.paymentStatus, "paid")));
    return row?.sum ?? 0;
  };

  const [ordersToday, openOrders, paidOrders, toShip, shipped, cancelled, revenueToday, revenueMonth] =
    await Promise.all([
      countBy(gte(orders.createdAt, startOfToday)),
      countBy(eq(orders.status, "new")),
      countBy(eq(orders.paymentStatus, "paid")),
      countBy(eq(orders.paymentStatus, "paid"), eq(orders.fulfillmentStatus, "pending")),
      countBy(eq(orders.fulfillmentStatus, "shipped")),
      countBy(eq(orders.status, "cancelled")),
      revenueSince(startOfToday),
      revenueSince(startOfMonth),
    ]);

  return {
    ordersToday,
    openOrders,
    paidOrders,
    toShip,
    shipped,
    cancelled,
    revenueTodayCents: revenueToday,
    revenueMonthCents: revenueMonth,
  };
}

/** Umsatz der letzten N Tage – Grundlage der Verlaufskurve. */
export async function revenueSeries(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.paidAt}, 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(gte(orders.paidAt, since), eq(orders.paymentStatus, "paid")))
    .groupBy(sql`to_char(${orders.paidAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${orders.paidAt}, 'YYYY-MM-DD')`);

  // Lückenlose Reihe – fehlende Tage sind 0, nicht "nicht vorhanden".
  const series: { day: string; revenueCents: number; orderCount: number }[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const match = rows.find((row) => row.day === key);
    series.push({ day: key, revenueCents: match?.revenue ?? 0, orderCount: match?.count ?? 0 });
  }
  return series;
}

/** Meistverkaufte Produkte (nach bezahlten Bestellungen). */
export async function topProducts(limit = 6) {
  return db
    .select({
      name: orderItems.name,
      sku: orderItems.sku,
      quantity: sql<number>`sum(${orderItems.quantity})::int`,
      revenueCents: sql<number>`sum(${orderItems.totalCents})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.paymentStatus, "paid"))
    .groupBy(orderItems.name, orderItems.sku)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);
}

/** Produkte mit niedrigem Lagerbestand. */
export async function lowStockProducts(limit = 8) {
  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      threshold: inventory.lowStockThreshold,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(
      and(
        eq(products.isActive, true),
        sql`${inventory.variantId} is null`,
        sql`${inventory.quantity} - ${inventory.reserved} <= ${inventory.lowStockThreshold}`,
      ),
    )
    .orderBy(sql`${inventory.quantity} - ${inventory.reserved}`)
    .limit(limit);
}
