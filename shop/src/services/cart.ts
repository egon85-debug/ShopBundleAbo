import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { cartItems, carts, inventory, productImages, productVariants, products } from "@/db/schema";
import { taxFromGross } from "@/lib/money";

const CART_COOKIE = "wl_cart";

export type CartLine = {
  itemId: string;
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  taxRate: number;
  weightGrams: number;
  available: number;
  allowBackorder: boolean;
};

export type CartSummary = {
  cartId: string;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  taxCents: number;
  weightGrams: number;
};

/** Bestehenden Warenkorb lesen – ohne einen neuen anzulegen (für Server Components). */
export async function getCart(): Promise<CartSummary | null> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  const [cart] = await db.select().from(carts).where(eq(carts.token, token)).limit(1);
  if (!cart) return null;
  return summarize(cart.id);
}

/** Warenkorb holen oder anlegen – nur in Server Actions/Route Handlers (setzt Cookie). */
export async function getOrCreateCart(): Promise<string> {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;

  if (token) {
    const [existing] = await db.select().from(carts).where(eq(carts.token, token)).limit(1);
    if (existing) return existing.id;
  }

  const newToken = randomBytes(24).toString("base64url");
  const [cart] = await db.insert(carts).values({ token: newToken }).returning();
  store.set(CART_COOKIE, newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return cart.id;
}

export async function addToCart(productId: string, variantId: string | null, quantity: number): Promise<void> {
  if (quantity < 1) throw new Error("Menge muss mindestens 1 sein");
  const cartId = await getOrCreateCart();

  const [existing] = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, productId),
        variantId ? eq(cartItems.variantId, variantId) : sql`${cartItems.variantId} is null`,
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(cartItems)
      .set({ quantity: existing.quantity + quantity })
      .where(eq(cartItems.id, existing.id));
  } else {
    await db.insert(cartItems).values({ cartId, productId, variantId, quantity });
  }
}

export async function updateCartItem(itemId: string, quantity: number): Promise<void> {
  const cartId = await getOrCreateCart();
  if (quantity <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
    return;
  }
  await db
    .update(cartItems)
    .set({ quantity })
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

export async function removeCartItem(itemId: string): Promise<void> {
  const cartId = await getOrCreateCart();
  await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

export async function clearCart(cartId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

/** Warenkorb mit aktuellen Preisen und Beständen berechnen (nie aus dem Client übernehmen). */
export async function summarize(cartId: string): Promise<CartSummary> {
  const rows = await db
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      productId: products.id,
      slug: products.slug,
      name: products.name,
      sku: products.sku,
      priceCents: products.priceCents,
      taxRate: products.taxRate,
      weightGrams: products.weightGrams,
      variantId: productVariants.id,
      variantName: productVariants.name,
      variantPriceCents: productVariants.priceCents,
      variantWeightGrams: productVariants.weightGrams,
      variantSku: productVariants.sku,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId));

  const productIds = rows.map((row) => row.productId);
  const [images, stock] = await Promise.all([
    productIds.length
      ? db.select().from(productImages).where(inArray(productImages.productId, productIds))
      : Promise.resolve([]),
    productIds.length
      ? db.select().from(inventory).where(inArray(inventory.productId, productIds))
      : Promise.resolve([]),
  ]);

  const lines: CartLine[] = rows.map((row) => {
    const unitPriceCents = row.variantPriceCents ?? row.priceCents;
    const stockRow =
      stock.find((s) => s.productId === row.productId && s.variantId === row.variantId) ??
      stock.find((s) => s.productId === row.productId && s.variantId === null);
    return {
      itemId: row.itemId,
      productId: row.productId,
      variantId: row.variantId,
      slug: row.slug,
      name: row.name,
      variantName: row.variantName,
      sku: row.variantSku ?? row.sku,
      imageUrl: images.find((image) => image.productId === row.productId)?.url ?? null,
      unitPriceCents,
      quantity: row.quantity,
      lineTotalCents: unitPriceCents * row.quantity,
      taxRate: row.taxRate,
      weightGrams: (row.variantWeightGrams ?? row.weightGrams) * row.quantity,
      available: Math.max((stockRow?.quantity ?? 0) - (stockRow?.reserved ?? 0), 0),
      allowBackorder: stockRow?.allowBackorder ?? false,
    };
  });

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const taxCents = lines.reduce((sum, line) => sum + taxFromGross(line.lineTotalCents, line.taxRate), 0);

  return {
    cartId,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    taxCents,
    weightGrams: lines.reduce((sum, line) => sum + line.weightGrams, 0),
  };
}

export { CART_COOKIE };
