import { isIP } from "node:net";

/** Canonical URLs are explicit configuration, never derived from a Host header. */
export function publicOrigin(value: string | undefined): string {
  if (!value) throw new Error("尚未配置公网地址。请部署到带持久磁盘的服务器，并设置 PUBLIC_SITE_URL；localhost 不能用于发布或扫码。");
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local = host === "localhost" || !host.includes(".") || /\.(localhost|local|internal|test|invalid|example)$/.test(host)
    || /^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || (isIP(host) === 6 && (/^(::|fc|fd|fe[89ab])/i.test(host)));
  if (url.protocol !== "https:" || local || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("PUBLIC_SITE_URL 必须是公网 HTTPS 根地址，不能使用 localhost、内网 IP 或带路径的地址。");
  return url.origin;
}
export function publishingOrigin(): string {
  if (process.env.VERCEL && !process.env.MORPHSITE_PUBLISH_DIR) throw new Error("当前部署没有持久磁盘。请先配置持久发布存储，不能将临时文件当成永久发布。");
  return publicOrigin(process.env.PUBLIC_SITE_URL);
}

function probeEnabled() {
  return !["off", "false", "0"].includes((process.env.MORPHSITE_PUBLIC_PROBE ?? "on").trim().toLowerCase());
}

/** One bounded request verifies DNS, TLS and HTTP without following redirects. */
export async function verifyPublicUrl(value: string): Promise<void> {
  const url = new URL(value);
  publicOrigin(url.origin);
  if (!probeEnabled()) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "连接超时" : error instanceof Error ? error.message : "连接失败";
    throw new Error(`公网 HTTPS 地址尚未通过访问检查（${reason}）。请检查 DNS、证书、反向代理和公开路由。`);
  } finally {
    clearTimeout(timer);
  }
}
