// 前端 API 封装：全部走相对路径 /api/*，由 Next.js rewrite 代理到后端，
// 前端不包含任何 API Key。

export type TaskStatus = "pending" | "processing" | "completed" | "failed";
export type TaskStage = "analysis" | "copywriting" | "poster" | "video" | "completed";

export interface GenerationStatus {
  task_id: string;
  status: TaskStatus;
  stage: TaskStage;
  poster_url: string | null;
  video_url: string | null;
  copy_text: string[];
  error_message: string | null;
  mock_mode: boolean; // 海报为本地模板生成
  poster_model: string | null;
  video_mode: string;
  copy_is_mock: boolean; // 文案为本地示例
  model_name: string | null;
}

export interface ModelOption {
  id: string;
  name: string;
  configured: boolean;
  is_mock: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ApiError extends Error {}

async function parseError(res: Response): Promise<never> {
  let detail = `请求失败（HTTP ${res.status}）`;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") detail = data.detail;
  } catch {
    if (res.status >= 500) {
      detail = "暂时无法连接生成服务，请确认服务已启动后重试";
    }
  }
  throw new ApiError(detail);
}

export async function createGeneration(form: {
  images: File[];
  product_name: string;
  description: string;
  style: string;
  platform: string;
  model_id: string;
}): Promise<{ task_id: string; status: string }> {
  const fd = new FormData();
  fd.append("model_id", form.model_id);
  for (const img of form.images) fd.append("images", img);
  fd.append("product_name", form.product_name);
  fd.append("description", form.description);
  fd.append("style", form.style);
  fd.append("platform", form.platform);

  let res: Response;
  try {
    res = await fetch("/api/generations", { method: "POST", body: fd });
  } catch {
    throw new ApiError("网络请求失败：无法连接服务器，请确认后端已启动");
  }
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getGeneration(taskId: string): Promise<GenerationStatus> {
  let res: Response;
  try {
    res = await fetch(`/api/generations/${taskId}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ApiError("网络请求失败：无法连接服务器，请确认后端已启动");
  }
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function listModels(): Promise<ModelOption[]> {
  let res: Response;
  try {
    res = await fetch("/api/models", { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ApiError("网络请求失败：无法获取模型列表，请确认后端已启动");
  }
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function sendChat(req: {
  model_id: string;
  messages: ChatMessage[];
  product_name: string;
  description: string;
  style: string;
  platform: string;
}): Promise<{ reply: string; model_id: string; is_mock: boolean }> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(70000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError("模型回复超时，请稍后重试，输入内容已保留");
    }
    throw new ApiError("网络请求失败：无法连接服务器，请确认后端已启动");
  }
  if (!res.ok) await parseError(res);
  return res.json();
}

export interface GenerationConfig {
  poster_mode: "local" | "ai";
  poster_model: string | null;
  poster_configured: boolean;
  video_mode: string;
}

export async function getGenerationConfig(): Promise<GenerationConfig> {
  const res = await fetch("/api/generation-config", { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) await parseError(res);
  return res.json();
}
