import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Diagnostic endpoint — confirms whether each critical environment variable
 * is set at runtime AND reports the deployed git SHA so we can be sure the
 * latest code is actually live. Values are never returned in full; only the
 * last 8 chars are echoed back so you can spot trailing-space / wrong-value
 * typos.
 *
 * Optional: append `?live=1` to also run a tiny round-trip against
 * Anthropic + Apify Ahrefs and report success/failure. Use sparingly —
 * the Apify ping costs a real (tiny) credit.
 */
function probe(name: string) {
  const v = process.env[name];
  if (!v) return { set: false };
  return {
    set: true,
    len: v.length,
    preview: v.length > 8 ? `…${v.slice(-8)}` : "…(short)",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const live = url.searchParams.get("live") === "1";

  const envSummary = {
    ok: true,
    runtime: process.env.RENDER ? "render" : process.env.VERCEL ? "vercel" : "local",
    nodeEnv: process.env.NODE_ENV,
    region: process.env.RENDER_REGION ?? process.env.VERCEL_REGION ?? null,
    // Render exposes the deployed git commit via these env vars. Lets users
    // confirm exactly which version is running without leaving the browser.
    commitSha:
      process.env.RENDER_GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      null,
    commitBranch:
      process.env.RENDER_GIT_BRANCH ??
      process.env.VERCEL_GIT_COMMIT_REF ??
      null,
    serviceName:
      process.env.RENDER_SERVICE_NAME ?? null,

    // critical for register / login
    DATABASE_URL: probe("DATABASE_URL"),
    AUTH_SECRET: probe("AUTH_SECRET"),
    AUTH_URL: probe("AUTH_URL"),
    NEXT_PUBLIC_APP_URL: probe("NEXT_PUBLIC_APP_URL"),
    APP_URL: probe("APP_URL"),

    // LLM providers
    ANTHROPIC_API_KEY: probe("ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: probe("OPENAI_API_KEY"),
    GOOGLE_GEMINI_API_KEY: probe("GOOGLE_GEMINI_API_KEY"),
    OPENROUTER_API_KEY: probe("OPENROUTER_API_KEY"),

    // Site data + audits
    PAGESPEED_API_KEY: probe("PAGESPEED_API_KEY"),
    APIFY_TOKEN: probe("APIFY_TOKEN"),
    APIFY_AHREFS_ACTOR_ID: probe("APIFY_AHREFS_ACTOR_ID"),

    // Optional integrations
    GOOGLE_CLIENT_ID: probe("GOOGLE_CLIENT_ID"),
    GITHUB_CLIENT_ID: probe("GITHUB_CLIENT_ID"),
    STRIPE_SECRET_KEY: probe("STRIPE_SECRET_KEY"),
    RESEND_API_KEY: probe("RESEND_API_KEY"),
    REDIS_URL: probe("REDIS_URL"),

    // Reddit Sales Agent backend URL (set on xicmo-web after the
    // reddit-agent service is deployed). NEXT_PUBLIC_ so the browser
    // gets it via env injection at build / render time.
    NEXT_PUBLIC_REDDIT_AGENT_URL: probe("NEXT_PUBLIC_REDDIT_AGENT_URL"),

    ts: new Date().toISOString(),
  };

  if (!live) {
    return NextResponse.json(envSummary);
  }

  // Live mode: actually try Anthropic + Apify so we know whether the values
  // not only exist but ALSO work end-to-end from the running server.
  const checks: Record<string, unknown> = {};

  // Anthropic — tiny "ping" message, ~5 input tokens.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const t0 = Date.now();
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 4,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      const text = await res.text();
      checks.anthropic = {
        ok: res.ok,
        status: res.status,
        ms: Date.now() - t0,
        note: res.ok
          ? "API reachable, key valid"
          : text.slice(0, 200),
      };
    } catch (err) {
      checks.anthropic = { ok: false, error: (err as Error).message };
    }
  } else {
    checks.anthropic = { ok: false, error: "ANTHROPIC_API_KEY not set" };
  }

  // Apify — list user info, free + verifies token.
  if (process.env.APIFY_TOKEN) {
    try {
      const t0 = Date.now();
      const res = await fetch(
        `https://api.apify.com/v2/users/me?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`
      );
      const text = await res.text();
      checks.apify = {
        ok: res.ok,
        status: res.status,
        ms: Date.now() - t0,
        note: res.ok
          ? "API reachable, token valid"
          : text.slice(0, 200),
      };
    } catch (err) {
      checks.apify = { ok: false, error: (err as Error).message };
    }
  } else {
    checks.apify = { ok: false, error: "APIFY_TOKEN not set" };
  }

  // PageSpeed — quick check against a tiny static site so we know the key
  // is valid + API enabled.
  if (process.env.PAGESPEED_API_KEY) {
    try {
      const t0 = Date.now();
      const res = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          "https://example.com"
        )}&strategy=mobile&key=${encodeURIComponent(process.env.PAGESPEED_API_KEY)}`,
        { signal: AbortSignal.timeout(20_000) }
      );
      const text = await res.text();
      checks.pagespeed = {
        ok: res.ok,
        status: res.status,
        ms: Date.now() - t0,
        note: res.ok
          ? "API reachable, key valid"
          : text.slice(0, 200),
      };
    } catch (err) {
      checks.pagespeed = { ok: false, error: (err as Error).message };
    }
  } else {
    checks.pagespeed = { ok: false, error: "PAGESPEED_API_KEY not set" };
  }

  return NextResponse.json({ ...envSummary, liveChecks: checks });
}
