import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/shop/ProductGrid";
import { getCategoryBySlug } from "@/services/catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Kategorie" };
  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description ?? undefined,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ category: slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category || !category.isActive) notFound();

  return <ProductGrid params={query} categorySlug={slug} />;
}
