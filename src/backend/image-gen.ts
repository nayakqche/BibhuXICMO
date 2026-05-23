/**
 * Hero image generation for blog drafts.
 *
 * Tries Google Gemini's experimental image-generation endpoint first
 * (cheap + fast), then falls back to no image. We deliberately do
 * NOT throw — callers want the draft to land even when imagery is
 * unavailable.
 *
 * The returned URL is a data: URI containing the base64 PNG, so the
 * Markdown body can render the image inline without any S3 / blob
 * storage setup. For production-grade hosting move the upload step
 * to wherever your asset CDN lives.
 */
import { env } from "@/shared/env";

export type HeroImage = { url: string; alt: string };

const GEMINI_IMAGE_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

export async function generateHeroImage(args: {
  title: string;
  keyword: string;
  blogType: "listicle" | "descriptive";
}): Promise<HeroImage | null> {
  if (!env.GOOGLE_GEMINI_API_KEY) return null;

  const prompt = buildPrompt(args);
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      // The image-capable Gemini models return both TEXT and IMAGE parts.
      responseModalities: ["IMAGE"],
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(
      `${GEMINI_IMAGE_ENDPOINT}?key=${encodeURIComponent(env.GOOGLE_GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(
        `[image-gen] Gemini HTTP ${res.status}: ${txt.slice(0, 200)}`
      );
      return null;
    }
    const json = (await res.json()) as GeminiImageResponse;
    const part = json.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    );
    if (!part?.inlineData?.data) {
      console.warn("[image-gen] Gemini returned no image part");
      return null;
    }
    const mime = part.inlineData.mimeType || "image/png";
    return {
      url: `data:${mime};base64,${part.inlineData.data}`,
      alt: args.title,
    };
  } catch (err) {
    console.warn("[image-gen] threw:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(args: {
  title: string;
  keyword: string;
  blogType: "listicle" | "descriptive";
}): string {
  const style =
    args.blogType === "listicle"
      ? "Vibrant editorial illustration suitable as a blog post hero. " +
        "Composition implies a ranked selection or comparison — multiple " +
        "items arranged tastefully. No text, no logos."
      : "Clean editorial illustration suitable as a long-form article " +
        "hero. Conceptual, modern, soft gradients. No text, no logos.";

  return [
    `Generate a 16:9 hero image for an article titled "${args.title}".`,
    `Topic keyword: "${args.keyword}".`,
    style,
    "Avoid: stock-photo cliches, watermarks, signatures, or any embedded text.",
  ].join("\n");
}

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};
