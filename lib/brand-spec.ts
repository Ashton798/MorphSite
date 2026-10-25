import { z } from "zod";

export const ThemeIdSchema = z.enum(["noir-luxury", "soft-minimal", "bold-future"]);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

const TextSchema = z.string().trim().min(1).max(2000);
const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "颜色必须为六位 HEX");
// Only local assets, HTTPS images and decoded raster uploads can enter a preview.
export const ImageSourceSchema = z.string().max(2_000_000).refine(
  (value) => /^\/assets\/[a-z0-9/_.,-]+$/i.test(value)
    || /^\/api\/brand\/media\/[a-f0-9]{32}\.(?:png|jpeg|jpg|webp|mp4|wav)$/i.test(value)
    || /^\/api\/marketing\/files\/[a-f0-9]{32}_[a-z0-9_.-]+\.(?:png|jpeg|jpg|webp)$/i.test(value)
    || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)
    || /^https:\/\/[^\s]+$/i.test(value),
  "图片地址格式无效",
);

export const BrandSpecSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    shortName: z.string().min(1),
    category: z.string().min(1),
    voice: z.string().min(1),
    descriptor: z.string().min(1),
  }),
  campaign: z.object({
    name: z.string().min(1),
    prompt: z.string().min(1),
    status: z.enum(["demo", "draft", "ready"]),
  }),
  theme: z.object({
    id: ThemeIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    palette: z.object({
      canvas: ColorSchema,
      surface: ColorSchema,
      text: ColorSchema,
      muted: ColorSchema,
      accent: ColorSchema,
      accentSoft: ColorSchema,
      line: ColorSchema,
    }),
  }),
  assets: z.object({
    logo: z.string().min(1),
    heroImage: ImageSourceSchema.optional(),
    gallery: z.array(ImageSourceSchema).max(4).default([]),
  }),
  website: z.object({
    layout: z.enum(["cinematic", "editorial", "product-first"]).optional(),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    sections: z.array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(80),
        type: z.enum(["Hero", "ProductShowcase", "Story", "Promotion", "Gallery", "CTA"]),
        eyebrow: z.string().optional(),
        title: TextSchema,
        body: TextSchema.optional(),
        cta: z.string().min(1).max(80).optional(),
        target: z.enum(["showcase", "story", "promotion", "gallery", "cta"]).optional(),
        detail: TextSchema.optional(),
      }),
    ).min(1).max(20),
  }),
  poster: z.object({
    title: z.string().min(1),
    line: z.string().min(1),
    footnote: z.string().min(1),
  }),
  video: z.object({
    duration: z.string().min(1),
    scenes: z.array(
      z.object({
        number: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    ).min(1).max(12),
  }),
}).superRefine((spec, ctx) => {
  const ids = spec.website.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "区块 ID 不可重复", path: ["website", "sections"] });
  }
  const heroes = spec.website.sections.filter((section) => section.type === "Hero");
  if (heroes.length !== 1 || heroes[0]?.title !== spec.website.title) {
    ctx.addIssue({ code: "custom", message: "必须有一个与网站标题一致的 Hero", path: ["website", "title"] });
  }
  for (const section of spec.website.sections) {
    if (section.target && !ids.includes(section.target)) {
      ctx.addIssue({ code: "custom", message: "按钮目标区块不存在", path: ["website", "sections"] });
    }
  }
});

export type BrandSpec = z.infer<typeof BrandSpecSchema>;
export type WebsiteSection = BrandSpec["website"]["sections"][number];

export const themePresets: Record<ThemeId, BrandSpec["theme"]> = {
  "noir-luxury": {
    id: "noir-luxury",
    name: "Noir Luxury",
    description: "Black coffee, brass light, late hours.",
    palette: { canvas: "#100e0d", surface: "#1b1715", text: "#f7efe4", muted: "#ad9e91", accent: "#d6a15d", accentSoft: "#3c2a1c", line: "#3a302b" },
  },
  "soft-minimal": {
    id: "soft-minimal",
    name: "Soft Minimal",
    description: "Cream paper, rose foam, an easy morning.",
    palette: { canvas: "#fff6f4", surface: "#fffdfb", text: "#321f2a", muted: "#785b66", accent: "#e66c93", accentSoft: "#fde0e9", line: "#f1ceda" },
  },
  "bold-future": {
    id: "bold-future",
    name: "Bold Future",
    description: "Electric roast, sharp edges, forward motion.",
    palette: { canvas: "#081217", surface: "#10232a", text: "#edfbf8", muted: "#82aaa9", accent: "#71f2c0", accentSoft: "#123e3c", line: "#1c4b4d" },
  },
};

export function cloneBrandSpec(spec: BrandSpec): BrandSpec {
  return BrandSpecSchema.parse(structuredClone(spec));
}

export function replaceWebsiteTitle(spec: BrandSpec, title: string): BrandSpec {
  const next = cloneBrandSpec(spec);
  next.website.title = title;
  next.website.sections = next.website.sections.map((section) => section.type === "Hero" ? { ...section, title } : section);
  next.poster.title = title;
  return BrandSpecSchema.parse(next);
}

export function applyDemoPrompt(spec: BrandSpec, rawPrompt: string): { spec: BrandSpec; message: string; changed: boolean } {
  const prompt = rawPrompt.trim();
  const next = cloneBrandSpec(spec);
  // Parse explicit title commands before colors: a title can itself contain “粉色”.
  const titleMatch = prompt.match(/^(?:把\s*)?(?:标题\s*(?:改成|换成)|(?:change\s+(?:the\s+)?)?title\s+(?:to|as))\s*(.+)$/i);
  if (titleMatch?.[1]) {
    const title = titleMatch[1].trim().replace(/^[“”"'「]|[“”"'」]$/g, "").trim();
    if (!title || title.length > 160) return { spec: next, changed: false, message: "标题需要 1–160 个字符，请缩短后再试。" };
    return { spec: replaceWebsiteTitle(next, title), changed: title !== spec.website.title, message: `已将网站主标题和海报标题改为「${title}」，其他品牌内容保持不变。` };
  }
  if (/^(?:(?:把)?(?:主题|颜色|网站|配色)?\s*(?:改成|换成|变成)\s*粉色|(?:make (?:it )?|change (?:the )?(?:theme|color) to )pink)[。！.!\s]*$/i.test(prompt)) {
    next.theme = structuredClone(themePresets["soft-minimal"]);
    return { spec: BrandSpecSchema.parse(next), changed: next.theme.id !== spec.theme.id, message: "已切换为粉色 Soft Minimal 主题。标题、图片和品牌内容均已保留。" };
  }
  return {
    spec: next,
    changed: false,
    message: "Demo 模式暂不理解这条指令，没有修改作品。试试「改成粉色」或「把标题改成周末咖啡节」，也可以使用预览上方的主题切换。",
  };
}

export function setBrandTheme(spec: BrandSpec, theme: ThemeId): BrandSpec {
  return BrandSpecSchema.parse({ ...spec, theme: structuredClone(themePresets[theme]) });
}

export function makeUploadedAssetSpec(spec: BrandSpec, imageDataUrl: string): BrandSpec {
  const next = cloneBrandSpec(spec);
  next.assets.heroImage = imageDataUrl;
  next.assets.gallery = [imageDataUrl, ...next.assets.gallery].slice(0, 4);
  return BrandSpecSchema.parse(next);
}

export const demoBrandSpec: BrandSpec = BrandSpecSchema.parse({
  brand: {
    name: "VOID COFFEE",
    shortName: "VOID",
    category: "Independent coffee house",
    voice: "Quietly electric. Warm without the noise.",
    descriptor: "Coffee for the in-between hours.",
  },
  campaign: {
    name: "Nocturne / 01",
    prompt: "A cinematic campaign for a coffee house that makes the late morning feel like a ritual.",
    status: "demo",
  },
  theme: themePresets["noir-luxury"],
  assets: { logo: "VOID", heroImage: "/assets/void-coffee.svg", gallery: [] },
  website: {
    title: "Coffee for the in-between hours.",
    subtitle: "Small-batch roasts, slow mornings, and a little more room to think.",
    sections: [
      { id: "hero", type: "Hero", eyebrow: "VOID COFFEE / NOCTURNE 01", title: "Coffee for the in-between hours.", body: "A considered roast for the moment before the day asks anything of you.", cta: "Find your ritual", target: "showcase", detail: "01 / INTRODUCING" },
      { id: "showcase", type: "ProductShowcase", eyebrow: "THE HOUSE ROAST", title: "Dark, precise, and never in a hurry.", body: "Ethiopian heirloom meets cocoa, toasted fig, and a clean finish that stays with you.", cta: "Explore the roast", target: "story", detail: "250g / WHOLE BEAN" },
      { id: "story", type: "Story", eyebrow: "OUR APPROACH", title: "Make the ordinary feel intentional.", body: "We source slowly, roast in small lots, and leave enough silence around the cup.", detail: "ORIGIN / PROCESS / PLACE" },
      { id: "promotion", type: "Promotion", eyebrow: "WEEKEND SERVICE", title: "The slow table is open.", body: "Every Saturday, 08:00 — 14:00. Bring a book. Leave with a better morning.", cta: "Plan a visit", target: "cta", detail: "SAT / 08:00—14:00" },
      { id: "gallery", type: "Gallery", eyebrow: "FROM THE COUNTER", title: "A few things worth noticing.", body: "Light on ceramic, a little steam, the geometry of a good pour.", detail: "FIELD NOTES / 2026" },
      { id: "cta", type: "CTA", eyebrow: "KEEP IN TOUCH", title: "Make room for a good cup.", body: "Seasonal notes, new roasts, and occasional reasons to come by.", cta: "Join the list", detail: "VOID COFFEE" },
    ],
  },
  poster: { title: "Coffee for the in-between hours.", line: "THE SLOW TABLE IS OPEN", footnote: "VOID COFFEE / WEEKEND SERVICE" },
  video: {
    duration: "00:18",
    scenes: [
      { number: "01", title: "The first light", description: "A dark room. One hard beam finds the rim of a cup." },
      { number: "02", title: "The pour", description: "A slow bloom. Steam folds into the frame." },
      { number: "03", title: "The table", description: "A hand, a book, the ritual in its natural habitat." },
      { number: "04", title: "The invitation", description: "Weekend service. The door is already open." },
    ],
  },
});
