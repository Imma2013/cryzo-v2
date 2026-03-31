import { Composio } from "@composio/core";

const composio = new Composio();
const EXTERNAL_USER_ID = "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252";

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
];

const TOOLKIT_LABELS: Record<string, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googlesheets: "Google Sheets",
  twitter: "Twitter",
  googledrive: "Google Drive",
  googledocs: "Google Docs",
  youtube: "YouTube",
  reddit: "Reddit",
  hackernews: "Hacker News",
  shopify: "Shopify",
  linkedin: "LinkedIn",
  google_maps: "Google Maps",
  one_drive: "OneDrive",
  salesforce: "Salesforce",
  slackbot: "Slackbot",
  slack: "Slack",
  stripe: "Stripe",
  cursor: "Cursor",
  linkedin_ads: "LinkedIn Ads",
  metaads: "Meta Ads",
  facebook: "Facebook",
  browserbase_tool: "Browserbase",
  browser_tool: "Browser",
  instagram: "Instagram",
  tiktok: "TikTok",
  canva: "Canva",
  google_analytics: "Google Analytics",
  googleads: "Google Ads",
  google_search_console: "Google Search Console",
  mailchimp: "Mailchimp",
};

function normalizeToolkitSlug(slug: string) {
  return slug.replace(/[-\s]/g, "_").toLowerCase();
}

function getToolkitLogo(slug: string, logo?: string) {
  return logo ?? `https://logos.composio.dev/api/${slug}`;
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await composio.create(EXTERNAL_USER_ID);
    const { items } = await session.toolkits({ toolkits: TOOLKITS });
    const toolkitsBySlug = new Map(
      items.map((toolkit) => [normalizeToolkitSlug(toolkit.slug), toolkit]),
    );

    return Response.json({
      toolkits: TOOLKITS.map((slug) => {
        const toolkit = toolkitsBySlug.get(normalizeToolkitSlug(slug));

        return {
          slug,
          name: toolkit?.name ?? TOOLKIT_LABELS[slug] ?? slug,
          logo: getToolkitLogo(slug, toolkit?.logo),
          isConnected: toolkit?.connection?.isActive ?? false,
          connectedAccountId: toolkit?.connection?.connectedAccount?.id,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching toolkits:", error);
    return Response.json({ error: "Failed to fetch toolkits" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { toolkit }: { toolkit: string } = await req.json();
  const origin = new URL(req.url).origin;
  const session = await composio.create(EXTERNAL_USER_ID);
  const connectionRequest = await session.authorize(toolkit, {
    callbackUrl: origin,
  });

  return Response.json({ redirectUrl: connectionRequest.redirectUrl });
}
