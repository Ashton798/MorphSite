import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandPreview } from "@/components/brand-preview";
import { readPublishedSiteBySlug } from "@/lib/published-site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const site = await readPublishedSiteBySlug(slug);
  if (!site) return { title: "网站未找到 · MorphSite", robots: { index: false, follow: false } };
  return {
    title: site.spec.website.title,
    description: site.spec.website.subtitle,
    alternates: { canonical: site.url },
    openGraph: { title: site.spec.website.title, description: site.spec.website.subtitle, url: site.url, siteName: site.spec.brand.name, type: "website" },
  };
}

export default async function PublishedSite({ params }: Props) {
  const { slug } = await params;
  const site = await readPublishedSiteBySlug(slug);
  if (!site) notFound();
  return <main className="published-site" aria-label={`${site.spec.brand.name} 已发布网站`}><BrandPreview spec={site.spec} mode="website" device="desktop" published /></main>;
}
