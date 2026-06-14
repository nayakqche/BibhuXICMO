import { NextResponse } from "next/server";
import { env } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Diagnostic — fires a real Gemini image-generation request and reports
 * the HTTP status + first 500 chars of the response per candidate model.
 * Use to see EXACTLY why hero images aren't appearing for a deploy.
 *
 *   GET /api/health/image-gen
 */
const MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
];

export async function GET() {
  if (!env.GOOGLE_GEMINI_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: "GOOGLE_GEMINI_API_KEY not set on the server.",
    });
  }

  const probes = await Promise.all(MODELS.map((m) => probe(m)));
  const winner = probes.find((p) => p.hasImage);

  return NextResponse.json({
    ok: !!winner,
    winner: winner?.model ?? null,
    keyPreview: maskKey(env.GOOGLE_GEMINI_API_KEY),
    probes,
  });
}

async function probe(model: string) {
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GOOGLE_GEMINI_API_KEY!)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Generate a tiny test 16:9 illustration of a purple geometric pattern. No text.",
              },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const candidate = (json as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string } }> };
      }>;
    })?.candidates?.[0];
    const hasImage =
      !!candidate?.content?.parts?.some((p) => !!p.inlineData?.data);
    return {
      model,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - t0,
      hasImage,
      // Hide huge base64 blobs but keep useful error / status info.
      preview: text.length > 600 ? text.slice(0, 600) + "…" : text,
    };
  } catch (err) {
    return {
      model,
      status: 0,
      ok: false,
      ms: Date.now() - t0,
      hasImage: false,
      preview: `EXCEPTION: ${(err as Error).message}`,
    };
  }
}

function maskKey(k: string): string {
  if (k.length <= 8) return "***";
  return `${k.slice(0, 6)}…${k.slice(-4)} (len ${k.length})`;
}
