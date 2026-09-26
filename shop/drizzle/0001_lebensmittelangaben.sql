-- Lebensmittel & Getränke: Füllmenge (Grundpreis), Pfand, Kennzeichnung.
-- IF NOT EXISTS: dieselben Befehle führt auch src/db/schema-ergaenzen.ts beim Build aus.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "net_content_amount" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "net_content_unit" varchar(4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "units_per_pack" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deposit_type" varchar(16);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ingredients" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allergens" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "food_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "deposit_cents" integer DEFAULT 0 NOT NULL;
