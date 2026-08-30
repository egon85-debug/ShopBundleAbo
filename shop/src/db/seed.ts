/**
 * Seed: legt einen Adminbenutzer sowie eine Beispiel-Kategorie- und
 * Produktstruktur an, damit der Shop nach der Installation sofort bedienbar ist.
 *
 *   npm run db:seed -- --admin-email admin@example.de --admin-password "…"
 *
 * Die Beispielprodukte sind als Startpunkt gedacht und im Adminbereich
 * jederzeit änder- oder löschbar.
 */
import { eq } from "drizzle-orm";

import { db } from "./index";
import { adminUsers, categories, inventory, productCategories, products } from "./schema";
import { hashPassword } from "../lib/auth";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = (arg("admin-email") ?? "admin@winterfeld.local").toLowerCase();
  const password = arg("admin-password") ?? "winterfeld-admin-2026";

  const [existingAdmin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  if (existingAdmin) {
    console.log(`Adminbenutzer ${email} existiert bereits.`);
  } else {
    await db.insert(adminUsers).values({
      email,
      passwordHash: await hashPassword(password),
      name: "Administrator",
      role: "owner",
    });
    console.log(`Adminbenutzer angelegt: ${email}`);
    if (!arg("admin-password")) {
      console.warn("!! Startpasswort verwendet – bitte umgehend im Backoffice ändern.");
    }
  }

  const existingCategories = await db.select().from(categories).limit(1);
  if (existingCategories.length > 0) {
    console.log("Kategorien vorhanden – Beispieldaten werden übersprungen.");
    return;
  }

  const categoryData = [
    { name: "Verpackung", slug: "verpackung", description: "Kartonagen, Polstermaterial und Klebebänder für den sicheren Versand.", position: 0 },
    { name: "Lagertechnik", slug: "lagertechnik", description: "Regale, Behälter und Transporthilfen für effiziente Lagerprozesse.", position: 1 },
    { name: "Versandzubehör", slug: "versandzubehoer", description: "Etiketten, Dokumententaschen und Sicherungsmaterial.", position: 2 },
  ];
  const insertedCategories = await db.insert(categories).values(categoryData).returning();
  const categoryBySlug = new Map(insertedCategories.map((category) => [category.slug, category]));

  const subCategories = await db
    .insert(categories)
    .values([
      { name: "Faltkartons", slug: "faltkartons", parentId: categoryBySlug.get("verpackung")!.id, position: 0 },
      { name: "Polstermaterial", slug: "polstermaterial", parentId: categoryBySlug.get("verpackung")!.id, position: 1 },
      { name: "Transportboxen", slug: "transportboxen", parentId: categoryBySlug.get("lagertechnik")!.id, position: 0 },
    ])
    .returning();
  subCategories.forEach((category) => categoryBySlug.set(category.slug, category));

  const productData = [
    {
      sku: "WL-KAR-300", name: "Faltkarton 300 × 200 × 150 mm (20 Stück)",
      slug: "faltkarton-300x200x150-20er",
      shortDescription: "Zweiwellige Faltkartons für den sicheren Paketversand.",
      description: "Stabile Faltkartons aus zweiwelliger Wellpappe. Vorgestanzte Falzlinien für schnellen Aufbau, geeignet für DHL-Paketversand.",
      priceCents: 2490, compareAtPriceCents: 2990, weightGrams: 3200,
      lengthMm: 300, widthMm: 200, heightMm: 150, isFeatured: true,
      categories: ["verpackung", "faltkartons"], quantity: 120,
    },
    {
      sku: "WL-POL-500", name: "Luftpolsterfolie 500 mm × 100 m",
      slug: "luftpolsterfolie-500mm-100m",
      shortDescription: "Transparente Polsterfolie für empfindliche Ware.",
      description: "Luftpolsterfolie mit 10 mm Noppen, reißfest und leicht zuschneidbar.",
      priceCents: 3450, weightGrams: 4100, isFeatured: true,
      categories: ["verpackung", "polstermaterial"], quantity: 45,
    },
    {
      sku: "WL-BOX-600", name: "Stapelbehälter 600 × 400 × 320 mm",
      slug: "stapelbehaelter-600x400x320",
      shortDescription: "Robuster Eurobehälter für Lager und Transport.",
      description: "Eurobehälter aus Polypropylen, stapelbar, mit Durchfassgriffen. Spülmaschinengeeignet und temperaturbeständig.",
      priceCents: 1890, weightGrams: 1800,
      lengthMm: 600, widthMm: 400, heightMm: 320,
      categories: ["lagertechnik", "transportboxen"], quantity: 60,
    },
    {
      sku: "WL-ETI-A6", name: "Versandetiketten A6 selbstklebend (500 Blatt)",
      slug: "versandetiketten-a6-500",
      shortDescription: "Passend für DHL- und DHL-Express-Labels.",
      description: "Selbstklebende Etiketten im Format A6, laser- und thermodruckertauglich.",
      priceCents: 2290, weightGrams: 2500, isFeatured: true,
      categories: ["versandzubehoer"], quantity: 200,
    },
    {
      sku: "WL-TAP-48", name: "Packband 48 mm × 66 m (6 Rollen)",
      slug: "packband-48mm-66m-6er",
      shortDescription: "Leises Packband mit hoher Klebkraft.",
      description: "PP-Klebeband mit Acrylatkleber, geräuscharm abrollend, für Temperaturen von −5 bis +50 °C.",
      priceCents: 1290, compareAtPriceCents: 1590, weightGrams: 1100,
      categories: ["verpackung"], quantity: 8,
    },
  ];

  for (const item of productData) {
    const { categories: categorySlugs, quantity, ...values } = item;
    const [product] = await db.insert(products).values(values).returning();
    await db.insert(productCategories).values(
      categorySlugs
        .map((slug) => categoryBySlug.get(slug))
        .filter(Boolean)
        .map((category) => ({ productId: product.id, categoryId: category!.id })),
    );
    await db.insert(inventory).values({ productId: product.id, quantity, lowStockThreshold: 10 });
  }

  console.log(`${productData.length} Beispielprodukte und ${insertedCategories.length + subCategories.length} Kategorien angelegt.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed fehlgeschlagen:", error);
    process.exit(1);
  });
