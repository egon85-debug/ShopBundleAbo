"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { addToCart, removeCartItem, updateCartItem } from "@/services/cart";

export type ActionState = { ok: boolean; message?: string };

/** Warenkorb: Menge und Produkt-ID werden serverseitig validiert. */
export async function addToCartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      quantity: z.coerce.number().int().min(1).max(99),
    })
    .safeParse({
      productId: formData.get("productId"),
      variantId: formData.get("variantId") || null,
      quantity: formData.get("quantity") ?? 1,
    });

  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };

  try {
    await addToCart(parsed.data.productId, parsed.data.variantId ?? null, parsed.data.quantity);
    revalidatePath("/warenkorb");
    return { ok: true, message: "Zum Warenkorb hinzugefügt." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Fehler beim Hinzufügen." };
  }
}

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!itemId) return;
  await updateCartItem(itemId, Number.isFinite(quantity) ? quantity : 0);
  revalidatePath("/warenkorb");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;
  await removeCartItem(itemId);
  revalidatePath("/warenkorb");
}

export async function subscribeNewsletterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`newsletter:${ip}`, 5)) {
    return { ok: false, message: "Zu viele Versuche. Bitte kurz warten." };
  }

  const parsed = z.string().email().safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, message: "Bitte gültige E-Mail-Adresse angeben." };

  await db
    .insert(newsletterSubscribers)
    .values({ email: parsed.data.toLowerCase() })
    .onConflictDoNothing();

  return { ok: true, message: "Danke! Ihre Anmeldung ist gespeichert." };
}
