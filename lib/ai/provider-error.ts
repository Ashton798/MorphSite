export type ProviderFailure = {
  httpStatus: number;
  category: "invalid_request" | "billing" | "permission" | "authentication" | "model" | "daily_quota" | "zero_quota" | "rate_limit" | "quota_unknown" | "unavailable" | "timeout" | "unknown";
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  quotaIds: string[];
};

/** Only allowlisted diagnostics reach the browser; raw provider errors may contain credentials. */
export function classifyProviderError(error: unknown): ProviderFailure {
  const input = error as { status?: number; message?: string } | null;
  let payload: { error?: { code?: number; message?: string; details?: Array<{ retryDelay?: string; violations?: Array<{ quotaId?: string; description?: string }> }> } } = {};
  try { payload = JSON.parse(input?.message ?? ""); } catch { /* transport error */ }
  const provider = payload.error;
  const status = Number(input?.status ?? provider?.code) || 502;
  const text = `${provider?.message ?? input?.message ?? ""} ${JSON.stringify(provider?.details ?? [])}`.toLowerCase();
  const quotaIds = (provider?.details ?? []).flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "").filter((v) => /^[a-z0-9_-]{1,160}$/i.test(v));
  const delay = (provider?.details ?? []).map((d) => d.retryDelay).find(Boolean);
  const retryAfterSeconds = delay && /^\d+(\.\d+)?s$/.test(delay) ? Math.ceil(parseFloat(delay)) : undefined;
  const base = { httpStatus: status, quotaIds, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) };
  const result = (category: ProviderFailure["category"], message: string, retryable = false): ProviderFailure => ({ ...base, category, message: `${message}（HTTP ${status}）`, retryable });
  if (status === 401) return result("authentication", "API 密钥无效或已失效，请检查服务端配置");
  if (status === 402 || /billing[_ ](?:disabled|not enabled)|billing account|payment required|paid tier|insufficient.*(?:balance|credit)/.test(text)) return result("billing", "模型需要有效的计费账号或余额，请在 Google 项目中核对计费设置；系统未自动开通付费");
  if (status === 403) return result("permission", "当前项目没有该模型的访问权限，或 API / 区域策略禁止访问");
  if (status === 404) return result("model", "模型 ID 不存在、已下线或不向当前项目开放，请检查模型配置");
  if (status === 400) return result("invalid_request", "模型请求参数或模型能力不匹配，请检查模型 ID、图片比例和输出类型");
  if (status === 429) {
    if (/limit:\s*0\b|quota_value["\s:]+0\b/.test(text)) return result("zero_quota", "当前模型的可用配额为 0（可能没有免费层或尚未获得配额）。请核对项目配额与计费；自动重试无效，已保留现有图片或渐变背景");
    if (/perday|per_day|per day|daily|requests per day|\brpd\b/.test(text)) return result("daily_quota", "模型每日额度（RPD）已耗尽，请等待配额重置或申请配额；本次不自动重试");
    if (/perminute|per_minute|per minute|\brpm\b|\btpm\b|rate limit/.test(text)) return result("rate_limit", "模型每分钟请求或 token 速率（RPM / TPM）达到上限，请稍后重试", true);
    return result("quota_unknown", "模型服务返回额度或频率限制，但未说明是每日还是每分钟限制。请查看 Google 项目配额；系统不会盲目重试");
  }
  if (status === 503) return result("unavailable", "模型服务暂时繁忙，请稍后重试", true);
  if (status === 504 || /timeout|timed out|deadline/.test(text)) return result("timeout", "模型请求超时，现有网站和图片已保留");
  return result("unknown", "模型供应商请求失败，现有网站和图片已保留");
}

export async function withImageRetry<T>(action: () => Promise<T>, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) {
      const failure = classifyProviderError(error);
      // At most two retries. Long provider RetryInfo is left to an explicit later user action.
      if (!failure.retryable || attempt >= 2 || (failure.retryAfterSeconds ?? 0) > 15) throw error;
      await wait(Math.max((failure.retryAfterSeconds ?? 0) * 1000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250));
    }
  }
}
