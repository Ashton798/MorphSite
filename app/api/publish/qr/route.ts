import QRCode from "qrcode";
import { publishedWebsite } from "@/lib/publishing/store";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const website = await publishedWebsite(query.get("id") ?? "");
  if (!website) return Response.json({ error: "网站未发布或已下线，无法生成二维码。" }, { status: 404 });
  const svg = query.get("format") === "svg";
  const options = { margin: 4, width: 512, errorCorrectionLevel: "M" as const };
  const bytes = svg ? await QRCode.toString(website.url, { ...options, type: "svg" }) : new Uint8Array(await QRCode.toBuffer(website.url, { ...options, type: "png" }));
  return new Response(bytes, { headers: {
    "Content-Type": svg ? "image/svg+xml" : "image/png", "Cache-Control": "no-store",
    "Content-Disposition": (query.get("download") === "1" ? "attachment" : "inline") + "; filename=morphsite-" + website.id + (svg ? ".svg" : ".png"),
  } });
}
