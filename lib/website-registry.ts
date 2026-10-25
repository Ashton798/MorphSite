import type { ComponentType } from "react";
import type { WebsiteSection } from "./brand-spec";
import type { BlockProps } from "@/components/website/shared";
import { Hero } from "@/components/website/hero";
import { ProductShowcase } from "@/components/website/product-showcase";
import { Story } from "@/components/website/story";
import { Promotion } from "@/components/website/promotion";
import { Gallery } from "@/components/website/gallery";
import { CTA } from "@/components/website/cta";

// Exhaustive registry: adding a schema type requires a corresponding renderer.
// AI supplies data, never component names outside this allowlist or executable HTML.
export const websiteRegistry = {
  Hero, ProductShowcase, Story, Promotion, Gallery, CTA,
} satisfies Record<WebsiteSection["type"], ComponentType<BlockProps>>;

export function getWebsiteBlock(type: WebsiteSection["type"]) {
  return websiteRegistry[type];
}
