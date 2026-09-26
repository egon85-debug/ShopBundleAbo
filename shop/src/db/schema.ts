/**
 * Winterfeld Logistik – Shop-Datenmodell (PostgreSQL via Drizzle ORM).
 *
 * Grundsätze:
 *  - Geldbeträge IMMER als Integer in Cent (`integer`), nie als Float.
 *  - Bestellpositionen speichern einen Snapshot der Produktdaten (Name, SKU,
 *    Preis), damit spätere Produktänderungen alte Bestellungen nicht verändern.
 *  - Jede sicherheitsrelevante Adminaktion landet im Audit-Log.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ─────────────────────────── Benutzer & Kunden ─────────────────────────── */

/** Adminbenutzer (Backoffice). Getrennt von Shop-Kunden. */
export const adminUsers = pgTable("admin_users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  /** owner = darf alles inkl. Benutzerverwaltung; staff = Tagesgeschäft */
  role: varchar("role", { length: 32 }).notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Shop-Kunden. Gastbestellungen laufen ohne Datensatz hier (customerId = null). */
export const customers = pgTable("customers", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  phone: varchar("phone", { length: 64 }),
  acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const addresses = pgTable(
  "addresses",
  {
    id: id(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 16 }).notNull().default("shipping"), // shipping | billing
    company: varchar("company", { length: 160 }),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    street: varchar("street", { length: 200 }).notNull(),
    houseNumber: varchar("house_number", { length: 32 }).notNull(),
    addressAddition: varchar("address_addition", { length: 160 }),
    zip: varchar("zip", { length: 16 }).notNull(),
    city: varchar("city", { length: 160 }).notNull(),
    state: varchar("state", { length: 120 }),
    country: varchar("country", { length: 2 }).notNull().default("DE"),
    phone: varchar("phone", { length: 64 }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);

/** Token für "Passwort zurücksetzen" (nur Hash wird gespeichert). */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_customer_idx").on(t.customerId)],
);

/* ─────────────────────────── Katalog ─────────────────────────── */

/** Kategorien mit Selbstreferenz für Unterkategorien. Vollständig im Admin pflegbar. */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    description: text("description"),
    imageUrl: text("image_url"),
    /** Reihenfolge im Shop – per Drag & Drop im Admin änderbar. */
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("categories_parent_idx").on(t.parentId), index("categories_position_idx").on(t.position)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 300 }).notNull(),
    slug: varchar("slug", { length: 320 }).notNull().unique(),
    shortDescription: text("short_description"),
    description: text("description"),
    /** Bruttopreis in Cent. */
    priceCents: integer("price_cents").notNull(),
    /** UVP / Streichpreis in Cent (optional). */
    compareAtPriceCents: integer("compare_at_price_cents"),
    taxRate: integer("tax_rate").notNull().default(19), // Prozent
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    /** Gewicht in Gramm – wird für DHL-Labels gebraucht. */
    weightGrams: integer("weight_grams").notNull().default(500),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    deliveryTime: varchar("delivery_time", { length: 120 }).default("2–4 Werktage"),
    technicalData: jsonb("technical_data").$type<Record<string, string>>().notNull().default({}),
    downloads: jsonb("downloads").$type<{ label: string; url: string }[]>().notNull().default([]),
    videoUrl: text("video_url"),
    /** Optionales 3D-Modell (glTF/GLB-URL) für die räumliche Produktansicht. */
    model3dUrl: text("model_3d_url"),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    seoTitle: varchar("seo_title", { length: 200 }),
    seoDescription: varchar("seo_description", { length: 320 }),
    // Lebensmittel & Getränke – für Grundpreis, Pfand und Kennzeichnung.
    /** Füllmenge je Einheit in ganzen Millilitern bzw. Gramm (siehe netContentUnit). */
    netContentAmount: integer("net_content_amount"),
    netContentUnit: varchar("net_content_unit", { length: 4 }), // "ml" | "g"
    /** Einheiten je Verkaufseinheit, z. B. 6 im Träger. */
    unitsPerPack: integer("units_per_pack"),
    /** Pfand je Verkaufseinheit in Cent (brutto); kommt zum Preis hinzu. */
    depositCents: integer("deposit_cents").notNull().default(0),
    depositType: varchar("deposit_type", { length: 16 }), // "einweg" | "mehrweg"
    ingredients: text("ingredients"),
    allergens: text("allergens"),
    foodNotes: text("food_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_active_idx").on(t.isActive),
    index("products_featured_idx").on(t.isFeatured),
    index("products_price_idx").on(t.priceCents),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: varchar("alt", { length: 300 }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.position)],
);

/** Varianten (Größe, Farbe …). Preis-/Bestandsabweichungen sind optional. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceCents: integer("price_cents"),
    weightGrams: integer("weight_grams"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("product_variants_product_idx").on(t.productId)],
);

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })],
);

/** Cross-Selling / passende Produkte. */
export const productRelations_ = pgTable(
  "product_related",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: uuid("related_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.relatedProductId] })],
);

/**
 * Lagerbestand – eine Zeile je Produkt oder Variante.
 * `reserved` hält Mengen offener Checkouts, `available` = quantity − reserved.
 */
export const inventory = pgTable(
  "inventory",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    /** Verkauf über Bestand hinaus erlauben (Backorder). */
    allowBackorder: boolean("allow_backorder").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("inventory_product_variant_idx").on(t.productId, t.variantId)],
);

/* ─────────────────────────── Warenkorb ─────────────────────────── */

export const carts = pgTable(
  "carts",
  {
    id: id(),
    /** Anonymes Cookie-Token – auch Gäste haben einen Warenkorb. */
    token: varchar("token", { length: 64 }).notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("carts_customer_idx").on(t.customerId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId)],
);

/* ─────────────────────────── Bestellungen ─────────────────────────── */

export const orders = pgTable(
  "orders",
  {
    id: id(),
    /** Menschenlesbare Bestellnummer, z. B. WL-2026-000123. */
    orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 64 }),

    /** Adress-Snapshots (Bestellung bleibt unverändert, wenn Kunde Adresse ändert). */
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>().notNull(),
    billingAddress: jsonb("billing_address").$type<AddressSnapshot>().notNull(),

    /** new | paid | processing | ready_to_ship | shipped | delivered | cancelled | refunded */
    status: varchar("status", { length: 32 }).notNull().default("new"),
    /** pending | paid | failed | cancelled | refunded | partially_refunded */
    paymentStatus: varchar("payment_status", { length: 32 }).notNull().default("pending"),
    /** pending | ready_to_ship | shipped | delivered */
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }).notNull().default("pending"),

    /** dhl_paket | dhl_express */
    shippingMethod: varchar("shipping_method", { length: 32 }).notNull().default("dhl_paket"),

    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    /** Summe des Pfands aller Positionen (brutto); in totalCents enthalten. */
    depositCents: integer("deposit_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),

    customerNote: text("customer_note"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_email_idx").on(t.email),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export type AddressSnapshot = {
  company?: string | null;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  addressAddition?: string | null;
  zip: string;
  city: string;
  state?: string | null;
  country: string;
  phone?: string | null;
};

/** Bestellpositionen mit historischem Snapshot der Produktdaten. */
export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Referenz bleibt für Statistiken; Anzeige nutzt immer den Snapshot. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    /* Snapshot: */
    name: varchar("name", { length: 300 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    variantName: varchar("variant_name", { length: 200 }),
    imageUrl: text("image_url"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    taxRate: integer("tax_rate").notNull().default(19),
    weightGrams: integer("weight_grams").notNull().default(0),
    quantity: integer("quantity").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Pfand je Einheit zum Bestellzeitpunkt (Snapshot). */
    depositCents: integer("deposit_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/* ─────────────────────────── Zahlungen ─────────────────────────── */

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull().default("stripe"),
    /** Stripe PaymentIntent-ID (pi_…) – eindeutig, verhindert Doppelbuchungen. */
    providerPaymentId: varchar("provider_payment_id", { length: 128 }).unique(),
    providerSessionId: varchar("provider_session_id", { length: 128 }),
    /** pending | paid | failed | cancelled | refunded | partially_refunded */
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    /** z. B. card, paypal, klarna – kommt aus Stripe, wird nur protokolliert. */
    method: varchar("method", { length: 64 }),
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    providerRefundId: varchar("provider_refund_id", { length: 128 }).unique(),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdByAdminId: uuid("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

/** Idempotenz für Stripe-Webhooks: jedes Event wird genau einmal verarbeitet. */
export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  provider: varchar("provider", { length: 32 }).notNull(),
  eventId: varchar("event_id", { length: 128 }).notNull().unique(),
  type: varchar("type", { length: 128 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

/* ─────────────────────────── Versand ─────────────────────────── */

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** dhl_paket | dhl_express – aufgelöst über das Shipping-Provider-Interface. */
    carrier: varchar("carrier", { length: 32 }).notNull(),
    trackingNumber: varchar("tracking_number", { length: 64 }),
    trackingUrl: text("tracking_url"),
    /** created | in_transit | delivered | failed | cancelled */
    status: varchar("status", { length: 32 }).notNull().default("created"),
    weightGrams: integer("weight_grams").notNull().default(0),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipments_order_idx").on(t.orderId), index("shipments_tracking_idx").on(t.trackingNumber)],
);

/** Das erzeugte Versandetikett – PDF wird als Base64 bzw. URL gehalten. */
export const shipmentLabels = pgTable(
  "shipment_labels",
  {
    id: id(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    format: varchar("format", { length: 16 }).notNull().default("PDF"),
    /** Bei DHL kommt das Label als Base64-PDF zurück; alternativ externe URL. */
    labelData: text("label_data"),
    labelUrl: text("label_url"),
    /** Rohantwort der Carrier-API für Support/Nachvollziehbarkeit. */
    carrierResponse: jsonb("carrier_response").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("shipment_labels_shipment_idx").on(t.shipmentId)],
);

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: id(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 64 }).notNull(),
    description: text("description"),
    location: varchar("location", { length: 160 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("tracking_events_shipment_idx").on(t.shipmentId, t.occurredAt)],
);

/* ─────────────────────────── Admin-Betrieb ─────────────────────────── */

export const adminNotes = pgTable(
  "admin_notes",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    authorName: varchar("author_name", { length: 120 }),
    note: text("note").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_notes_order_idx").on(t.orderId)],
);

/** Append-only Protokoll wichtiger Adminaktionen. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    adminUserId: uuid("admin_user_id"),
    adminName: varchar("admin_name", { length: 120 }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    action: varchar("action", { length: 64 }).notNull(),
    field: varchar("field", { length: 64 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_created_idx").on(t.createdAt)],
);

/** Server-Sessions für Admin und Kundenkonto (Cookie hält nur den Token-Hash). */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    /** admin | customer */
    subjectType: varchar("subject_type", { length: 16 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_subject_idx").on(t.subjectType, t.subjectId)],
);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ─────────────────────────── Relations ─────────────────────────── */

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "parent" }),
  children: many(categories, { relationName: "parent" }),
  products: many(productCategories),
}));

export const productsRelations = relations(products, ({ many }) => ({
  images: many(productImages),
  variants: many(productVariants),
  categories: many(productCategories),
  inventory: many(inventory),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
  product: one(products, { fields: [productCategories.productId], references: [products.id] }),
  category: one(categories, { fields: [productCategories.categoryId], references: [categories.id] }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, { fields: [inventory.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [inventory.variantId], references: [productVariants.id] }),
}));

export const cartsRelations = relations(carts, ({ many, one }) => ({
  items: many(cartItems),
  customer: one(customers, { fields: [carts.customerId], references: [customers.id] }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [cartItems.variantId], references: [productVariants.id] }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  payments: many(payments),
  shipments: many(shipments),
  refunds: many(refunds),
  notes: many(adminNotes),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  labels: many(shipmentLabels),
  events: many(trackingEvents),
}));

export const shipmentLabelsRelations = relations(shipmentLabels, ({ one }) => ({
  shipment: one(shipments, { fields: [shipmentLabels.shipmentId], references: [shipments.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
}));

export const sqlNow = sql`now()`;
