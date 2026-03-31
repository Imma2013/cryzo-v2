import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { ConvexHttpClient } from "convex/browser";
import {
  streamText,
  convertToModelMessages,
  generateId,
  stepCountIs,
  type UIMessage,
} from "ai";
import { api as convexApi } from "../../../convex/_generated/api";

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

export async function POST(req: Request) {
  const composio = new Composio({ provider: new VercelProvider() });
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const {
    messages,
    userId,
  }: { messages: UIMessage[]; userId?: string } = await req.json();

  if (convex && userId) {
    const billingSummary = await convex.query(convexApi.billing.getBillingSummary, {
      userId,
    });

    if ((billingSummary?.remainingTokens ?? 0) <= 0) {
      return Response.json(
        {
          error:
            "Monthly token limit reached. Upgrade your plan or wait for the next billing cycle.",
        },
        { status: 402 },
      );
    }
  }

  const session = await composio.create(
    userId || "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252",
  );
  const tools = await session.tools();
  const result = streamText({
    model: openai("gpt-5.4"),
    system: "You are a helpful assistant. Use Composio tools to help the user.",
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ usage }) => {
      if (!convex || !userId || !usage) {
        return;
      }

      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const totalTokens =
        usage.totalTokens ?? inputTokens + outputTokens;

      if (totalTokens <= 0) {
        return;
      }

      await convex.mutation(convexApi.billing.recordUsage, {
        userId,
        model: "gpt-5.4",
        inputTokens,
        outputTokens,
        totalTokens,
      });
    },
  });
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => generateId(),
  });
}
