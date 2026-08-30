/**
 * Stripe – ausschließlich serverseitig. Der Secret Key verlässt niemals den Server,
 * Zahlungsdaten werden nie selbst gespeichert (nur PaymentIntent-IDs und Status).
 */
import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY fehlt. Bitte in shop/.env hinterlegen (Vorlage: shop/.env.example).",
    );
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "Winterfeld Logistik Shop", version: "1.0.0" },
    });
  }
  return client;
}

/** Verifiziert die Signatur eines Stripe-Webhooks (Pflicht, Punkt 14). */
export function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET fehlt – Webhooks können nicht verifiziert werden. Bitte in shop/.env hinterlegen.",
    );
  }
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}
