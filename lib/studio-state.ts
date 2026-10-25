import { z } from "zod";
import { BrandSpecSchema, ImageSourceSchema, applyDemoPrompt, cloneBrandSpec, demoBrandSpec, makeUploadedAssetSpec, setBrandTheme, type BrandSpec, type ThemeId } from "./brand-spec";

export const MessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().min(1).max(4000),
});
export type Message = z.infer<typeof MessageSchema>;
export const MediaResultSchema = z.object({
  url: z.string().refine((value) => /^\/api\/marketing\/files\/[a-f0-9]{32}_(poster\.png|video\.mp4|bailian\.png|bailian\.mp4)$/.test(value) || /^\/api\/brand\/media\/[a-f0-9]{32}\.(png|jpg|webp|mp4)$/.test(value) || /^https:\/\//.test(value)),
  kind: z.enum(["image", "video"]),
  model: z.string(),
});
export const DraftSchema = z.object({
  documentId: z.string().uuid().optional(),
  spec: BrandSpecSchema.nullable(),
  image: ImageSourceSchema.nullable(),
  media: z.array(MediaResultSchema).max(12).default([]),
});
export type Draft = z.infer<typeof DraftSchema>;
export const SavedWorkspaceSchema = z.object({
  version: z.literal(1),
  draft: DraftSchema,
  messages: z.array(MessageSchema).max(60),
  history: z.array(DraftSchema).max(12).default([]),
});
export const HandoffSchema = z.object({ prompt: z.string().max(2000), image: ImageSourceSchema.nullable() });
export const STORAGE_KEY = "morphsite.workspace.v1";
export const HANDOFF_KEY = "morphsite.brief.v1";
export const PROJECT_KEY = "morphsite.project.v1";

export type StudioState = { draft: Draft; history: Draft[]; messages: Message[] };
export const initialStudioState: StudioState = {
  draft: { spec: null, image: null, media: [] },
  history: [],
  messages: [{ role: "assistant", text: "欢迎来到 MorphSite。描述你的品牌、产品或一场活动，我会生成网站、海报和分镜。也可以先看看 VOID COFFEE 的演示。" }],
};
export type StudioAction =
  | { type: "generate"; prompt: string; demo?: boolean; image?: string | null }
  | { type: "generated"; spec: BrandSpec; message: string; prompt: string }
  | { type: "prompt"; prompt: string }
  | { type: "applied"; spec: BrandSpec; message: string; prompt: string }
  | { type: "failed"; prompt: string; message: string }
  | { type: "media"; result: z.infer<typeof MediaResultSchema>; prompt: string }
  | { type: "hero-image"; image: string }
  | { type: "theme"; theme: ThemeId }
  | { type: "upload"; image: string }
  | { type: "layout"; layout: "cinematic" | "editorial" | "product-first" }
  | { type: "history"; index: number }
  | { type: "undo" }
  | { type: "restore"; saved: z.infer<typeof SavedWorkspaceSchema> };

function append(state: StudioState, messages: Message[]): StudioState {
  return { ...state, messages: [...state.messages, ...messages].slice(-60) };
}
function commit(state: StudioState, draft: z.input<typeof DraftSchema>, messages: Message[]): StudioState {
  const validated = DraftSchema.parse(draft);
  return append({ ...state, draft: validated, history: [...state.history, state.draft].slice(-12) }, messages);
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "restore": {
      const saved = SavedWorkspaceSchema.parse(action.saved);
      return { draft: saved.draft, messages: saved.messages, history: saved.history };
    }
    case "generate": {
      let spec = cloneBrandSpec(demoBrandSpec);
      const image = action.image !== undefined ? action.image : state.draft.image;
      if (image) spec = makeUploadedAssetSpec(spec, image);
      if (action.prompt.trim()) spec.campaign.prompt = action.prompt.trim();
      return commit(state, { documentId: crypto.randomUUID(), spec, image }, [
        { role: "user", text: action.demo ? "使用演示品牌" : action.prompt.trim() || "生成演示作品" },
        { role: "assistant", text: "VOID COFFEE 已就绪：6 个网站区块、1 张海报排版、4 幅分镜。这是本地演示品牌；试试下方的修改指令。" },
      ]);
    }
    case "generated": {
      const validated = BrandSpecSchema.parse(action.spec);
      return commit(state, { documentId: crypto.randomUUID(), spec: validated, image: validated.assets.heroImage ?? null, media: [] }, [
        { role: "user", text: action.prompt },
        { role: "assistant", text: action.message },
      ]);
    }
    case "prompt": {
      if (!state.draft.spec) return state;
      const result = applyDemoPrompt(state.draft.spec, action.prompt);
      const messages: Message[] = [{ role: "user", text: action.prompt }, { role: "assistant", text: result.message }];
      return result.changed ? commit(state, { ...state.draft, spec: result.spec }, messages) : append(state, messages);
    }
    case "applied": {
      if (!state.draft.spec) return state;
      const validated = BrandSpecSchema.parse(action.spec);
      const messages: Message[] = [{ role: "user", text: action.prompt }, { role: "assistant", text: action.message }];
      return action.message && JSON.stringify(validated) !== JSON.stringify(state.draft.spec)
        ? commit(state, { ...state.draft, spec: validated }, messages)
        : append(state, messages);
    }
    case "hero-image": {
      if (!state.draft.spec) return state;
      const current = state.draft.spec;
      const spec = BrandSpecSchema.parse({ ...current, assets: { ...current.assets, heroImage: action.image, gallery: [action.image, ...current.assets.gallery].slice(0, 4) } });
      return commit(state, { ...state.draft, spec }, [{ role: "assistant", text: "主视觉图片已更新，网站文案和主题保持不变。" }]);
    }
    case "media":
      return commit(state, { ...state.draft, media: [...state.draft.media, action.result].slice(-12) }, [{ role: "user", text: action.prompt }, { role: "assistant", text: `${action.result.kind === "image" ? "宣传图" : "视频"}已生成，可在右侧预览并下载。` }]);
    case "failed":
      return append(state, [{ role: "user", text: action.prompt }, { role: "assistant", text: action.message }]);
    case "theme": {
      if (!state.draft.spec || state.draft.spec.theme.id === action.theme) return state;
      const spec = setBrandTheme(state.draft.spec, action.theme);
      return commit(state, { ...state.draft, spec }, [{ role: "assistant", text: `已切换至 ${spec.theme.name}，品牌内容和图片保持不变。` }]);
    }
    case "upload": {
      const image = ImageSourceSchema.parse(action.image);
      const spec: BrandSpec | null = state.draft.spec ? makeUploadedAssetSpec(state.draft.spec, image) : null;
      return commit(state, { ...state.draft, spec, image }, [{ role: "assistant", text: spec ? "图片已应用到网站、海报与分镜预览。仅保存在当前浏览器标签页中，可撤销。" : "图片已准备好。生成品牌时它会作为主视觉。" }]);
    }
    case "layout": {
      if (!state.draft.spec || (state.draft.spec.website.layout ?? "cinematic") === action.layout) return state;
      const spec = BrandSpecSchema.parse({ ...state.draft.spec, website: { ...state.draft.spec.website, layout: action.layout } });
      return commit(state, { ...state.draft, spec }, [{ role: "assistant", text: "网站布局已切换，可在版本历史中恢复。" }]);
    }
    case "history": {
      const previous = state.history[action.index];
      if (!previous?.spec) return state;
      return commit(state, previous, [{ role: "assistant", text: "已恢复选中的历史版本。" }]);
    }
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return append({ ...state, draft: DraftSchema.parse(previous), history: state.history.slice(0, -1) }, [{ role: "assistant", text: "已撤销最近一次修改，恢复到上一版。" }]);
    }
  }
}
