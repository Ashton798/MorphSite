import { notFound } from "next/navigation";
import { readPublishedSpec } from "@/lib/published-site";
import { BrandPreview } from "@/components/brand-preview";

export const dynamic = "force-dynamic";
export default async function PublishedSite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = await readPublishedSpec(id);
  if (!spec) notFound();
  return <main className="published-site" aria-label={`${spec.brand.name} 已发布网站`}><BrandPreview spec={spec} mode="website" device="desktop" published /></main>;
}
