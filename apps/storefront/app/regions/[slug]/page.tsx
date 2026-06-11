import { notFound } from "next/navigation";
import { RegionDetailShell } from "../../components/region-detail-shell.js";
import { getRegionBySlug, regions } from "../../lib/storefront-content.js";

export function generateStaticParams() {
  return regions.map((region) => ({ slug: region.slug }));
}

export default async function RegionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const region = getRegionBySlug(slug);

  if (!region) {
    notFound();
  }

  return <RegionDetailShell region={region} />;
}
