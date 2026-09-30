import type { Metadata } from "next";

import { ProductGrid } from "@/components/shop/ProductGrid";
import { getPriceRange, listProducts, getCategoryTree } from "@/services/catalog";

export const metadata: Metadata = {
  title: "Shop",
  description: "Alle Produkte von Winterfeldt Logistik – gefiltert, sortiert und sofort lieferbar.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <ProductGrid params={params} />;
}
