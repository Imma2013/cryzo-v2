import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs } from "ai";
import { getAiModel } from "../../../../lib/ai-model";

const FALLBACK_USER_ID =
  "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252";

const PLATFORM_TOOLKITS: Record<string, string[]> = {
  instagram: ["instagram"],
  linkedin: ["linkedin"],
  twitter: ["twitter"],
  youtube: ["youtube"],
  facebook: ["facebook"],
  tiktok: ["tiktok"],
  reddit: ["reddit"],
  pinterest: ["pinterest"],
  threads: ["threads"],
};

const PLATFORM_PROMPTS: Record<string, string> = {
  instagram:
    "Fetch Instagram analytics. Get follower count, impressions, reach, engagement rate, profile views, and saves for the connected account. Use any available Instagram insight or analytics tools.",
  linkedin:
    "Fetch LinkedIn analytics. Get follower count, impressions, engagement rate, reactions, comments, and shares for the connected LinkedIn profile/page. Use any available LinkedIn analytics tools.",
  twitter:
    "Fetch Twitter/X analytics. Get follower count, impressions, engagement rate, retweets, likes, and replies for the connected account. Use any available Twitter analytics tools.",
  youtube:
    "Fetch YouTube analytics. Get subscriber count, total views, watch time, likes, comments, and CTR for the connected channel. Use any available YouTube analytics tools.",
  facebook:
    "Fetch Facebook analytics. Get follower count, reach, engagement, page views, reactions, and shares for the connected page. Use any available Facebook analytics tools.",
  tiktok:
    "Fetch TikTok analytics. Get follower count, video views, likes, comments, shares, and average watch time for the connected account. Use any available TikTok analytics tools.",
  reddit:
    "Fetch Reddit analytics. Get karma, post views, and upvotes for the connected account. Use any available Reddit tools.",
  pinterest:
    "Fetch Pinterest analytics. Get follower count, impressions, and saves for the connected account. Use any available Pinterest tools.",
  threads:
    "Fetch Threads analytics. Get follower count, impressions, and engagement for the connected account. Use any available Threads tools.",
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || FALLBACK_USER_ID;
  const days = parseInt(url.searchParams.get("days") || "7", 10);

  const toolkitSlugs = PLATFORM_TOOLKITS[platform.toLowerCase()];
  if (!toolkitSlugs) {
    return Response.json(
      { error: `Unsupported platform: ${platform}` },
      { status: 400 },
    );
  }

  try {
    const composio = new Composio({ provider: new VercelProvider() });
    const session = await composio.create(userId);

    const { items } = await session.toolkits({ toolkits: toolkitSlugs });
    const inactive = items
      .filter((t: any) => !t.connection?.isActive)
      .map((t: any) => t.slug);

    if (inactive.length > 0) {
      return Response.json(
        {
          error: `Platform not connected: ${inactive.join(", ")}`,
          connected: false,
        },
        { status: 400 },
      );
    }

    const tools = await session.tools();

    const systemPrompt = `You are a data extraction agent. Your ONLY job is to fetch social media analytics and return them as structured JSON.

RULES:
- Use the available tools to fetch analytics data from ${platform}.
- Return ONLY a valid JSON array. No markdown, no explanation, no code blocks.
- Each element must have this shape:
  { "label": string, "total": number, "change": number }
  - "label": metric name (e.g. "Followers", "Impressions")
  - "total": the current value as a number
  - "change": percentage change over the period (positive or negative number, 0 if unknown)
- If a metric is unavailable, omit it. Do NOT invent or hallucinate data.
- If you cannot fetch any data at all, return an empty array: []

Example output:
[{"label":"Followers","total":12400,"change":4.2},{"label":"Impressions","total":26300,"change":12.5}]`;

    const userPrompt = `${PLATFORM_PROMPTS[platform.toLowerCase()] || `Fetch analytics for ${platform}.`}

Time range: last ${days} days.
Return the JSON array now.`;

    const result = await generateText({
      model: getAiModel(),
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(10),
    });

    const text = result.text.trim();

    let metrics: Array<{ label: string; total: number; change: number }> = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        metrics = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.warn(
        `[analytics/${platform}] Could not parse AI response as JSON:`,
        text,
      );
    }

    return Response.json({
      platform,
      days,
      metrics,
      raw: text,
      connected: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown analytics error";
    console.error(`[analytics/${platform}] Error:`, message);
    return Response.json({ error: message, connected: true }, { status: 500 });
  }
}
