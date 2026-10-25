import type { BrandSpec, WebsiteSection } from "./brand-spec";

export const SAAS_HERO_VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260309_042944_4a2205b7-b061-490a-852b-92d9e9955ce9.mp4";
export const SAAS_PROOF_BRANDS = ["Vortex", "Nimbus", "Prysma", "Cirrus", "Kynder", "Halcyn"] as const;

export type SaasHeroContent = {
  logo: string;
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
};
export const DEFAULT_SAAS_HERO: SaasHeroContent = {
  logo: "APEX",
  title: "Accelerate Your\nRevenue Growth Now",
  subtitle: "Drive your funnel forward with clever workflows, analytics, and seamless lead management.",
  primaryLabel: "Start Free Right Now",
  secondaryLabel: "Schedule a Consult",
};

/** Presentation adapter only. No writes, schema extensions or changes to AI contracts. */
export function resolveSaasHeroContent(spec?: BrandSpec | null, section?: WebsiteSection, overrides?: Partial<SaasHeroContent>): SaasHeroContent {
  const hero = section ?? spec?.website.sections.find((item) => item.type === "Hero");
  return {
    ...DEFAULT_SAAS_HERO,
    ...(spec ? {
      logo: spec.assets.logo,
      title: hero?.title || spec.website.title,
      subtitle: spec.website.subtitle || hero?.body || spec.brand.descriptor,
      primaryLabel: hero?.cta || DEFAULT_SAAS_HERO.primaryLabel,
    } : {}),
    ...overrides,
  };
}
