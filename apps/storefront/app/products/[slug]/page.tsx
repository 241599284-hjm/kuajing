import { notFound } from "next/navigation";
import { ProductDetailShell } from "../../components/product-detail-shell.js";
import { getProductBySlug, products } from "../../lib/storefront-content.js";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return <ProductDetailShell product={product} />;
}
