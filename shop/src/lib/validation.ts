/** Serverseitige Validierungsschemas (Zod). Jede Eingabe wird hier geprüft. */
import { z } from "zod";

export const addressSchema = z.object({
  company: z.string().max(160).optional().nullable(),
  firstName: z.string().min(1, "Vorname fehlt").max(120),
  lastName: z.string().min(1, "Nachname fehlt").max(120),
  street: z.string().min(1, "Straße fehlt").max(200),
  houseNumber: z.string().min(1, "Hausnummer fehlt").max(32),
  addressAddition: z.string().max(160).optional().nullable(),
  zip: z.string().min(3, "PLZ fehlt").max(16),
  city: z.string().min(1, "Ort fehlt").max(160),
  state: z.string().max(120).optional().nullable(),
  country: z.string().length(2, "Ländercode muss zweistellig sein").toUpperCase(),
  phone: z.string().max(64).optional().nullable(),
});

export const checkoutSchema = z.object({
  email: z.string().email("Bitte gültige E-Mail-Adresse angeben"),
  phone: z.string().max(64).optional().nullable(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  billingSameAsShipping: z.boolean().default(true),
  shippingMethod: z.enum(["dhl_paket", "dhl_express"]),
  customerNote: z.string().max(1000).optional().nullable(),
  createAccount: z.boolean().default(false),
  password: z.string().min(10, "Passwort braucht mindestens 10 Zeichen").optional(),
  acceptsTerms: z.literal(true, { errorMap: () => ({ message: "Bitte AGB und Widerrufsbelehrung akzeptieren" }) }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Passwort braucht mindestens 10 Zeichen"),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
});

export const productSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(320).regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche"),
  shortDescription: z.string().max(1000).optional().nullable(),
  description: z.string().optional().nullable(),
  priceCents: z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).optional().nullable(),
  taxRate: z.number().int().min(0).max(30),
  weightGrams: z.number().int().min(1),
  lengthMm: z.number().int().min(0).optional().nullable(),
  widthMm: z.number().int().min(0).optional().nullable(),
  heightMm: z.number().int().min(0).optional().nullable(),
  deliveryTime: z.string().max(120).optional().nullable(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(320).optional().nullable(),
  categoryIds: z.array(z.string().uuid()).default([]),
  relatedProductIds: z.array(z.string().uuid()).default([]),
  quantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(180).regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche"),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  seoTitle: z.string().max(200).optional().nullable(),
  seoDescription: z.string().max(320).optional().nullable(),
});

/** Aus einem Namen einen URL-Slug bauen (deutsche Umlaute korrekt). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}
