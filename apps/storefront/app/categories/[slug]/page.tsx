import { notFound } from "next/navigation";
import { CategoryDetailShell } from "../../components/category-detail-shell.js";
import { getCategoryBySlug, productCategories } from "../../lib/storefront-content.js";

export function generateStaticParams() {
  return productCategories.map((category) => ({ slug: category.slug }));
}

export default async function CategoryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return <CategoryDetailShell category={category} />;
}
