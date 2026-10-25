import { BrandSpecSchema, ImageSourceSchema, themePresets, type BrandSpec, type ThemeId, type WebsiteSection } from "@/lib/brand-spec";
import type { AiDraft } from "./prompts";

const SECTION_ORDER: WebsiteSection["type"][] = ["Hero", "ProductShowcase", "Story", "Promotion", "Gallery", "CTA"];
const SECTION_IDS: Record<WebsiteSection["type"], string> = {
  Hero: "hero",
  ProductShowcase: "showcase",
  Story: "story",
  Promotion: "promotion",
  Gallery: "gallery",
  CTA: "cta",
};
// Button targets are derived, never trusted from the model: every link lands on a real block.
const SECTION_TARGETS: Partial<Record<WebsiteSection["type"], WebsiteSection["target"]>> = {
  Hero: "showcase",
  ProductShowcase: "story",
  Promotion: "cta",
};

const FALLBACK_BODIES: Record<WebsiteSection["type"], string> = {
  Hero: "把一件日常的事，做成值得专程来一趟的理由。",
  ProductShowcase: "我们从最基础的细节开始，只留下真正有用的部分。",
  Story: "这件事起初很小：一个念头，一张桌子，一次认真的尝试。",
  Promotion: "限时开放，欢迎带着朋友一起过来坐坐。",
  Gallery: "光线、手、材料，和那些来不及命名的瞬间。",
  CTA: "留下联系方式，下一次我们第一个告诉你。",
};

function clamp(text: string | undefined, max: number, fallback: string): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return fallback;
  return value.length > max ? value.slice(0, max).trim() : value;
}

function sectionTypeOf(raw: { type?: string; id?: string }): WebsiteSection["type"] | undefined {
  const candidate = `${raw.type ?? ""} ${raw.id ?? ""}`.toLowerCase();
  if (candidate.includes("hero")) return "Hero";
  if (candidate.includes("showcase") || candidate.includes("product")) return "ProductShowcase";
  if (candidate.includes("story") || candidate.includes("about")) return "Story";
  if (candidate.includes("promotion") || candidate.includes("offer")) return "Promotion";
  if (candidate.includes("gallery") || candidate.includes("work")) return "Gallery";
  if (candidate.includes("cta") || candidate.includes("contact")) return "CTA";
  return undefined;
}

/** Normalizes a model draft into a validated BrandSpec: fixed sections, preset themes, safe assets. */
export function draftToBrandSpec(draft: AiDraft, options: { prompt: string; image?: string | null }): BrandSpec {
  const themeId: ThemeId = draft.themeId;
  const title = clamp(draft.website.title, 120, "一个新的开始。");
  const byType = new Map<WebsiteSection["type"], (typeof draft.website.sections)[number]>();
  for (const section of draft.website.sections) {
    const type = sectionTypeOf(section);
    if (type && !byType.has(type)) byType.set(type, section);
  }
  const sections: WebsiteSection[] = SECTION_ORDER.map((type) => {
    const raw = byType.get(type);
    const isHero = type === "Hero";
    const section: WebsiteSection = {
      id: SECTION_IDS[type],
      type,
      eyebrow: clamp(raw?.eyebrow, 60, type === "Hero" ? draft.brand.name : draft.brand.category.toUpperCase()).toUpperCase(),
      title: isHero ? title : clamp(raw?.title, 120, FALLBACK_BODIES[type]),
      body: clamp(raw?.body, 400, FALLBACK_BODIES[type]),
      detail: clamp(raw?.detail, 80, ""),
    };
    const cta = clamp(raw?.cta, 24, "");
    if (cta) {
      section.cta = cta;
      const target = SECTION_TARGETS[type];
      if (target) section.target = target;
    }
    if (!section.detail) delete section.detail;
    return section;
  });
  const scenes = draft.video.scenes.slice(0, 4).map((scene, index) => ({
    number: String(index + 1).padStart(2, "0"),
    title: clamp(scene.title, 60, `Scene ${index + 1}`),
    description: clamp(scene.description, 300, ""),
  }));
  const image = options.image ? ImageSourceSchema.parse(options.image) : undefined;
  return BrandSpecSchema.parse({
    brand: {
      name: clamp(draft.brand.name, 60, "NEW BRAND").toUpperCase(),
      shortName: clamp(draft.brand.shortName, 12, "BRAND").toUpperCase(),
      category: clamp(draft.brand.category, 80, "Independent business"),
      voice: clamp(draft.brand.voice, 160, "Clear, warm, specific."),
      descriptor: clamp(draft.brand.descriptor, 160, "Made for the people nearby."),
    },
    campaign: {
      name: clamp(draft.campaign.name, 60, "Campaign / 01"),
      prompt: clamp(options.prompt, 2000, "AI brand generation"),
      status: image ? "ready" : "draft",
    },
    theme: { ...structuredClone(themePresets[themeId]), ...(draft.palette ? { palette: draft.palette } : {}) },
    assets: {
      logo: clamp(draft.brand.shortName, 12, "BRAND").toUpperCase(),
      ...(image ? { heroImage: image } : {}),
      gallery: [],
    },
    website: {
      layout: /产品优先|product-first/i.test(options.prompt) ? "product-first"
        : /沉浸式|cinematic/i.test(options.prompt) ? "cinematic"
        : /品牌图文|editorial/i.test(options.prompt) ? "editorial"
        : draft.website.layout ?? (/saas|software|platform/i.test(draft.brand.category) ? "cinematic" : "editorial"),
      title,
      subtitle: clamp(draft.website.subtitle, 300, "一句话说明你做什么，为谁而做。"),
      sections,
    },
    poster: {
      title: clamp(draft.poster.title, 120, title),
      line: clamp(draft.poster.line, 80, draft.brand.name).toUpperCase(),
      footnote: clamp(draft.poster.footnote, 120, draft.brand.name),
    },
    video: {
      duration: clamp(draft.video.duration, 20, "00:05"),
      scenes: scenes.length ? scenes : [{ number: "01", title: "开场", description: "一个安静的镜头，把注意力交给产品。" }],
    },
  });
}

/** Compact, token-cheap view of the current document for the edit model. */
export function summarizeSpec(spec: BrandSpec): unknown {
  return {
    brand: spec.brand,
    campaign: { name: spec.campaign.name, prompt: spec.campaign.prompt },
    themeId: spec.theme.id,
    website: {
      title: spec.website.title,
      subtitle: spec.website.subtitle,
      sections: spec.website.sections.map(({ id, type, eyebrow, title, body, cta, detail }) => ({ id, type, eyebrow, title, body, cta, detail })),
    },
    poster: spec.poster,
    video: spec.video,
    hasImage: Boolean(spec.assets.heroImage),
  };
}
