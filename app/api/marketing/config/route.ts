import { backendRequest, relayJson } from "@/lib/marketing/backend";

export const runtime = "nodejs";

export async function GET() {
  return relayJson(await backendRequest("/api/generation-config"));
}
