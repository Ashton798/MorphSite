import "server-only";
import { publishedWebsite, publishedWebsiteBySlug } from "./publishing/store";
export async function readPublishedSpec(id: string) {
  return (await publishedWebsite(id))?.spec ?? null;
}
export async function readPublishedSiteBySlug(slug: string) {
  return publishedWebsiteBySlug(slug);
}
