import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { shipmentLabels, shipments } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Liefert das gespeicherte Versandetikett als PDF aus – nur für angemeldete
 * Adminbenutzer. Das Label wird inline angezeigt und kann direkt gedruckt werden.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId fehlt" }, { status: 400 });
  }

  const [row] = await db
    .select({ label: shipmentLabels, shipment: shipments })
    .from(shipmentLabels)
    .innerJoin(shipments, eq(shipmentLabels.shipmentId, shipments.id))
    .where(eq(shipments.orderId, orderId))
    .orderBy(desc(shipmentLabels.createdAt))
    .limit(1);

  if (!row?.label.labelData) {
    if (row?.label.labelUrl) return NextResponse.redirect(row.label.labelUrl);
    return NextResponse.json({ error: "Kein Versandetikett vorhanden" }, { status: 404 });
  }

  const pdf = Buffer.from(row.label.labelData, "base64");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="versandetikett-${row.shipment.trackingNumber ?? orderId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
