import { z } from "zod";
import { BrandSpecSchema, ThemeIdSchema, replaceWebsiteTitle, setBrandTheme, type BrandSpec, type WebsiteSection } from "@/lib/brand-spec";

// Whitelisted edit operations. The model can only produce these; each one maps
// to a pure function over BrandSpec, so no HTML/CSS/JS or unknown field can enter.
const SectionIdSchema = z.enum(["hero", "showcase", "story", "promotion", "gallery", "cta"]);
const Text = (max: number) => z.string().trim().min(1).max(max);

export const EditOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setTitle"), title: Text(160) }),
  z.object({ op: z.literal("setSubtitle"), subtitle: Text(300) }),
  z.object({ op: z.literal("setTheme"), theme: ThemeIdSchema }),
  z.object({
    op: z.literal("setSection"),
    id: SectionIdSchema,
    title: Text(200).optional(),
    body: Text(600).optional(),
    eyebrow: Text(80).optional(),
    cta: Text(40).optional(),
    detail: Text(120).optional(),
  }),
  z.object({
    op: z.literal("setPoster"),
    title: Text(160).optional(),
    line: Text(80).optional(),
    footnote: Text(120).optional(),
  }),
  z.object({
    op: z.literal("setBrand"),
    name: Text(60).optional(),
    shortName: Text(12).optional(),
    category: Text(80).optional(),
    voice: Text(160).optional(),
    descriptor: Text(160).optional(),
  }),
  z.object({ op: z.literal("setCampaign"), name: Text(60) }),
  z.object({
    op: z.literal("setScene"),
    number: z.string().trim().regex(/^\d{1,2}$/),
    title: Text(60).optional(),
    description: Text(300).optional(),
  }),
  z.object({ op: z.literal("setImagePrompt"), imagePrompt: Text(900) }),
]);
export type EditOp = z.infer<typeof EditOpSchema>;

const OP_ALIASES: Record<string, EditOp["op"]> = {
  settitle: "setTitle", changetitle: "setTitle", title: "setTitle",
  setsubtitle: "setSubtitle", subtitle: "setSubtitle",
  settheme: "setTheme", theme: "setTheme", setcolor: "setTheme",
  setsection: "setSection", section: "setSection", editsection: "setSection",
  setposter: "setPoster", poster: "setPoster",
  setbrand: "setBrand", brand: "setBrand",
  setcampaign: "setCampaign", campaign: "setCampaign",
  setscene: "setScene", scene: "setScene",
  setimageprompt: "setImagePrompt", imageprompt: "setImagePrompt",
};

/** Coerces loose model output (aliases, string ops, null fields) into strict ops. */
export function parseOps(raw: unknown[]): { ops: EditOp[]; rejected: number } {
  const ops: EditOp[] = [];
  let rejected = 0;
  for (const item of raw) {
    const candidate = typeof item === "string" ? { op: item } : item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : null;
    if (!candidate) { rejected++; continue; }
    const key = String(candidate.op ?? candidate.type ?? candidate.action ?? "").replace(/[\s_-]/g, "").toLowerCase();
    const op = OP_ALIASES[key];
    if (!op) { rejected++; continue; }
    const cleaned: Record<string, unknown> = { op };
    for (const [field, value] of Object.entries(candidate)) {
      if (field === "op" || field === "type" || field === "action") continue;
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        const text = value.trim();
        if (text) cleaned[field] = text;
        continue;
      }
      cleaned[field] = value;
    }
    const parsed = EditOpSchema.safeParse(cleaned);
    if (parsed.success) ops.push(parsed.data);
    else rejected++;
  }
  return { ops: ops.slice(0, 8), rejected };
}

export function applyOps(spec: BrandSpec, ops: EditOp[]): { spec: BrandSpec; changed: boolean; imagePrompt?: string } {
  let next = spec;
  let imagePrompt: string | undefined;
  for (const op of ops) {
    switch (op.op) {
      case "setTitle":
        next = replaceWebsiteTitle(next, op.title);
        break;
      case "setSubtitle":
        next = BrandSpecSchema.parse({ ...next, website: { ...next.website, subtitle: op.subtitle } });
        break;
      case "setTheme":
        next = setBrandTheme(next, op.theme);
        break;
      case "setSection": {
        const sections = next.website.sections.map((section): WebsiteSection => {
          if (section.id !== op.id) return section;
          const updated: WebsiteSection = { ...section };
          if (op.title) updated.title = op.title;
          if (op.body) updated.body = op.body;
          if (op.eyebrow) updated.eyebrow = op.eyebrow;
          if (op.cta) updated.cta = op.cta;
          if (op.detail) updated.detail = op.detail;
          return updated;
        });
        // Keep the Hero/website title invariant: a hero rewrite also renames the site + poster.
        if (op.id === "hero" && op.title) next = replaceWebsiteTitle({ ...next, website: { ...next.website, sections } }, op.title);
        else next = BrandSpecSchema.parse({ ...next, website: { ...next.website, sections } });
        break;
      }
      case "setPoster":
        next = BrandSpecSchema.parse({
          ...next,
          poster: {
            title: op.title ?? next.poster.title,
            // Poster display type is uppercase Latin by design (see draftToBrandSpec).
            line: op.line ? op.line.toUpperCase() : next.poster.line,
            footnote: op.footnote ?? next.poster.footnote,
          },
        });
        break;
      case "setBrand":
        next = BrandSpecSchema.parse({
          ...next,
          brand: {
            name: op.name ?? next.brand.name,
            shortName: op.shortName ?? next.brand.shortName,
            category: op.category ?? next.brand.category,
            voice: op.voice ?? next.brand.voice,
            descriptor: op.descriptor ?? next.brand.descriptor,
          },
          assets: { ...next.assets, logo: op.shortName ?? next.assets.logo },
        });
        break;
      case "setCampaign":
        next = BrandSpecSchema.parse({ ...next, campaign: { ...next.campaign, name: op.name } });
        break;
      case "setScene": {
        const scenes = next.video.scenes.map((scene) =>
          scene.number === op.number
            ? { ...scene, title: op.title ?? scene.title, description: op.description ?? scene.description }
            : scene);
        next = BrandSpecSchema.parse({ ...next, video: { ...next.video, scenes } });
        break;
      }
      case "setImagePrompt":
        imagePrompt = op.imagePrompt;
        break;
    }
  }
  return { spec: next, changed: JSON.stringify(next) !== JSON.stringify(spec), ...(imagePrompt ? { imagePrompt } : {}) };
}
