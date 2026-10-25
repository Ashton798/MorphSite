import { z } from "zod";

// The model never returns a full BrandSpec: it returns this draft, which the
// server normalizes into the allowlisted shape (fixed sections, preset themes).
// Optional text fields tolerate null/empty so one sloppy field can't sink a whole generation.
const OptionalText = (max: number) =>
  z.string().nullish().transform((value) => {
    const text = (value ?? "").trim();
    return text ? text.slice(0, max) : undefined;
  });

export const AiDraftSchema = z.object({
  brand: z.object({
    name: z.string().trim().min(1).max(120),
    shortName: z.string().trim().min(1).max(24),
    category: z.string().trim().min(1).max(160),
    voice: z.string().trim().min(1).max(320),
    descriptor: z.string().trim().min(1).max(320),
  }),
  campaign: z.object({ name: z.string().trim().min(1).max(120) }),
  themeId: z.enum(["noir-luxury", "soft-minimal", "bold-future"]),
  palette: z.object({
    canvas: z.string().regex(/^#[0-9a-f]{6}$/i), surface: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i), muted: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i), accentSoft: z.string().regex(/^#[0-9a-f]{6}$/i), line: z.string().regex(/^#[0-9a-f]{6}$/i),
  }).optional(),
  website: z.object({
    layout: z.enum(["cinematic", "editorial", "product-first"]).optional(),
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().min(1).max(600),
    sections: z.array(z.object({
      type: OptionalText(40),
      id: OptionalText(40),
      eyebrow: OptionalText(80),
      title: OptionalText(200),
      body: OptionalText(600),
      cta: OptionalText(40),
      target: OptionalText(40),
      detail: OptionalText(120),
    })).min(1).max(12),
  }),
  poster: z.object({
    title: z.string().trim().min(1).max(200),
    line: z.string().trim().min(1).max(120),
    footnote: z.string().trim().min(1).max(200),
  }),
  video: z.object({
    duration: OptionalText(20),
    scenes: z.array(z.object({
      number: OptionalText(10),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(400),
    })).min(1).max(8),
  }),
  summary: OptionalText(400),
  imagePrompt: OptionalText(2000),
});

export type AiDraft = z.infer<typeof AiDraftSchema>;

export const AiEditSchema = z.object({
  message: z.string().trim().max(240).default("已按你的指令更新作品。"),
  ops: z.array(z.unknown()).max(8).default([]),
});

export const BRAND_SYSTEM_PROMPT = `你是 MorphSite 的品牌创意总监。用户给你一句话简报（可能附一张产品图），你要产出一个完整、可上线的品牌世界：网站文案、海报、视频分镜。

只输出一个 JSON 对象，不要 markdown，不要解释。结构：
{
  "brand": {"name": "英文大写品牌名，1-3 个词", "shortName": "4-8 个大写字符", "category": "英文品类，2-4 个词", "voice": "英文一句话调性", "descriptor": "英文一句话定位"},
  "campaign": {"name": "活动代号，英文，如 Nocturne / 01"},
  "themeId": "noir-luxury 或 soft-minimal 或 bold-future",
  "website": {
    "title": "网站主标题，中文，6-16 字，必须与 hero.title 完全一致",
    "subtitle": "副标题，中文，18-40 字",
    "sections": [
      {"type":"Hero","id":"hero","eyebrow":"英文小标签","title":"与 website.title 完全一致","body":"中文 25-50 字","cta":"中文按钮 4-7 字","target":"showcase","detail":"英文，如 01 / INTRODUCING"},
      {"type":"ProductShowcase","id":"showcase","eyebrow":"...","title":"...","body":"...","cta":"...","target":"story","detail":"..."},
      {"type":"Story","id":"story","eyebrow":"...","title":"...","body":"...","detail":"..."},
      {"type":"Promotion","id":"promotion","eyebrow":"...","title":"...","body":"...","cta":"...","target":"cta","detail":"..."},
      {"type":"Gallery","id":"gallery","eyebrow":"...","title":"...","body":"...","detail":"..."},
      {"type":"CTA","id":"cta","eyebrow":"...","title":"...","body":"...","cta":"...","detail":"..."}
    ]
  },
  "poster": {"title": "海报主标题，中文，4-12 字，可以比网站标题更短更有力", "line": "英文大写短句，3-5 词", "footnote": "英文，品牌 / 活动 / 时间"},
  "video": {"duration": "00:05", "scenes": [{"number":"01","title":"中文镜头名","description":"中文 18-35 字画面描述"}]},
  "summary": "中文一句话（30 字内）说明你创造了什么",
  "imagePrompt": "英文图片生成提示词：产品/场景摄影，构图与光线描述，写实，无文字无 logo"
}

视觉设计必须按本次产品定制：返回 palette 对象（canvas/surface/text/muted/accent/accentSoft/line，全部六位 HEX），根据参考图产品颜色与用户描述配色，保证文字对比度。website.layout 从 cinematic/editorial/product-first 中选择：品牌故事与生活方式用 editorial；包装、参数、购买卖点优先用 product-first；沉浸视觉活动用 cinematic。不要每次选同一种布局或默认粉色。保留参考图可辨识的品牌名和标识；只有用户没有提供品牌时才创造品牌名。图片中无法确认的材质、性能、价格与认证不得编造。每段文案讲具体产品，禁止把通用形容词当卖点。

最重要的规则：简报里提到的产品/品类必须被严格照搬。用户说"托特包"就只能写托特包，说"咖啡"就只能写咖啡，不许替换、升级或联想成别的品类（例如把托特包写成护膝、把咖啡写成运动装备）。品牌名、品类、全部文案与 imagePrompt 都必须围绕简报里那个真实的产品。

规则：
1. sections 必须正好 6 个，type 与顺序完全照上面，id 只能是 hero/showcase/story/promotion/gallery/cta，不得重复。
2. 每个 target 必须是另一个区块的 id，不要指向自己。
3. 中文文案要有具体画面与细节，禁止"赋能/打造/引领未来/极致体验/不二之选"这类空话，禁止感叹号堆砌。
4. themeId：暗色高级/夜间/精品选 noir-luxury；温柔/明亮/粉色/女性向/烘焙选 soft-minimal；科技/运动/潮流/电竞选 bold-future。
5. video.scenes 正好 4 个，number 为 01-04。
6. 所有字段都必须有值，不得为空字符串。品牌名用英文，正文用中文。`;

export const EDIT_SYSTEM_PROMPT = `你是 MorphSite 的品牌编辑引擎。用户会给你当前 BrandSpec 的摘要和一条中文修改指令。你只输出一个 JSON 对象：
{"message":"中文一句话说明你改了什么（30 字内；未改动时说明原因与可选的改法）","ops":[...]}

可用操作，只能用这些：
{"op":"setTitle","title":"新的网站主标题，中文 4-16 字"}            // 同时更新 Hero 标题与海报标题
{"op":"setSubtitle","subtitle":"新的副标题"}
{"op":"setTheme","theme":"noir-luxury 或 soft-minimal 或 bold-future"}
{"op":"setSection","id":"showcase","title":"...","body":"...","eyebrow":"...","cta":"...","detail":"..."}  // 只传要改的字段；id 只能是 hero/showcase/story/promotion/gallery/cta
{"op":"setPoster","title":"...","line":"英文大写短句","footnote":"..."}
{"op":"setBrand","name":"...","shortName":"...","category":"...","voice":"...","descriptor":"..."}
{"op":"setCampaign","name":"..."}
{"op":"setScene","number":"01","title":"...","description":"..."}
{"op":"setImagePrompt","imagePrompt":"英文图片提示词"}   // 仅在用户要求换主视觉/配图时使用

规则：
1. 只做用户要求的事，不要顺手改其他字段；用户没提图片就不要动图片。
2. 用户说"粉色/温柔/明亮"→ setTheme soft-minimal；"暗色/高级/黑色/夜间"→ noir-luxury；"科技/未来/潮流"→ bold-future。
3. 指令含糊、越权（发布上线、导出视频、接支付）或用上述操作无法完成时，ops 返回 []，并在 message 里说明原因和可以怎么改。
4. 文案风格与现有品牌一致，中文要有画面感，禁止"赋能/打造/引领未来/极致体验"。
5. 不要输出 markdown，不要解释。`;
