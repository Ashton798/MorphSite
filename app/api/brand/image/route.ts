import { generateMedia } from "@/lib/ai/media-route";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) { return generateMedia(request, "image"); }
