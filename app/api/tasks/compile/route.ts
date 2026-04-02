import { Composio } from "@composio/core";

import {
  buildAutonomyDraft,
  type AutonomousTaskDraft,
  withDraftScheduleMetadata,
} from "../../../../lib/autonomy-intent";
import type { ToolkitConnection } from "../../../../components/autonomous/autonomous-types";

const composio = new Composio();
const FALLBACK_USER_ID = "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252";

const TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googlesheets",
  "twitter",
  "googledrive",
  "googledocs",
  "youtube",
  "reddit",
  "hackernews",
  "shopify",
  "linkedin",
  "google_maps",
  "one_drive",
  "salesforce",
  "slackbot",
  "slack",
  "stripe",
  "cursor",
  "linkedin_ads",
  "metaads",
  "facebook",
  "browserbase_tool",
  "browser_tool",
  "instagram",
  "tiktok",
  "canva",
  "google_analytics",
  "googleads",
  "google_search_console",
  "mailchimp",
] as const;

function normalizeToolkitSlug(slug: string) {
  return slug.replace(/[-\s]/g, "_").toLowerCase();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function extractRelevantToolkits(payload: any): string[] {
  const topLevelToolkits = Array.isArray(payload?.toolkits)
    ? payload.toolkits
    : Array.isArray(payload?.toolkitConnectionStatuses)
      ? payload.toolkitConnectionStatuses.map((item: any) => item?.toolkit)
      : [];

  const resultToolkits = Array.isArray(payload?.results)
    ? payload.results.flatMap((result: any) =>
        Array.isArray(result?.toolkits) ? result.toolkits : [],
      )
    : [];

  return unique(
    [...topLevelToolkits, ...resultToolkits]
      .map((value) => String(value ?? ""))
      .filter(Boolean)
      .map(normalizeToolkitSlug),
  );
}

function applyDiscoveryToDraft(args: {
  draft: AutonomousTaskDraft;
  availableToolkits: ToolkitConnection[];
  discoveredToolkits: string[];
}) {
  const { draft, availableToolkits, discoveredToolkits } = args;

  if (discoveredToolkits.length === 0) {
    return draft;
  }

  const connected = new Set(
    availableToolkits
      .filter((toolkit) => toolkit.isConnected)
      .map((toolkit) => normalizeToolkitSlug(toolkit.slug)),
  );

  return withDraftScheduleMetadata({
    ...draft,
    integrationSlugs: discoveredToolkits,
    missingIntegrationSlugs: discoveredToolkits.filter(
      (slug) => !connected.has(normalizeToolkitSlug(slug)),
    ),
    recipeMetadata: {
      compiler: "composio_search",
      discoveredToolkits,
      compiledAt: new Date().toISOString(),
    },
  });
}

export async function POST(req: Request) {
  let prompt = "";
  let timezone = "UTC";
  let availableToolkits: ToolkitConnection[] = [];

  try {
    const payload: {
      prompt: string;
      userId?: string;
      timezone?: string;
      toolkits?: ToolkitConnection[];
    } = await req.json();

    prompt = payload.prompt?.trim() ?? "";
    timezone = payload.timezone || "UTC";
    availableToolkits = Array.isArray(payload.toolkits) ? payload.toolkits : [];

    if (!prompt) {
      return Response.json({ error: "Prompt is required." }, { status: 400 });
    }

    const session = await composio.create(payload.userId || FALLBACK_USER_ID);
    const searchResponse = await session.search({ query: prompt });
    const discoveredToolkits = extractRelevantToolkits(searchResponse);

    const baseDraft = buildAutonomyDraft(
      prompt,
      availableToolkits,
      timezone,
    );
    const draft = applyDiscoveryToDraft({
      draft: baseDraft,
      availableToolkits,
      discoveredToolkits,
    });

    return Response.json({
      draft,
      discovery: {
        relevantToolkits: discoveredToolkits,
        compiler: "composio_search",
      },
    });
  } catch (error) {
    console.error("Failed to compile task recipe.", error);
    const fallbackDraft = buildAutonomyDraft(
      prompt,
      availableToolkits,
      timezone,
    );

    return Response.json({
      draft: fallbackDraft,
      discovery: {
        relevantToolkits: fallbackDraft.integrationSlugs,
        compiler: "local_fallback",
        error: error instanceof Error ? error.message : "Unknown compiler failure.",
      },
    });
  }
}
