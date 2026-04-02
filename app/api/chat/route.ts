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
import { getAiModel, getAiModelName } from "../../../lib/ai-model";
import { getRecipeTools } from "../../../lib/recipe-tools";

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
  const composioTools = await session.tools();
  const recipeTools = getRecipeTools(userId || "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252");
  const allTools = { ...composioTools, ...recipeTools };

  const result = streamText({
    model: getAiModel(),
    system: `You are Cryzo, an intelligent AI agent. Help the user accomplish tasks using their connected apps. Today's date is ${new Date().toLocaleDateString()}. You can create scheduled recurring recipes using RECIPE_CREATE when the user wants something automated on a schedule (e.g., "send me unread emails every morning").`,
    messages: await convertToModelMessages(messages),
    tools: allTools,
    stopWhen: stepCountIs(25),
  });
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => generateId(),
    onFinish: async () => {
      if (!convex || !userId) {
        return;
      }

      try {
        const usage = await result.totalUsage;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

        if (totalTokens <= 0) {
          console.warn("No final usage recorded for completed chat stream.", {
            userId,
            usage,
          });
          return;
        }

        await convex.mutation(convexApi.billing.recordUsage, {
          userId,
          model: getAiModelName(),
          inputTokens,
          outputTokens,
          totalTokens,
        });
      } catch (error) {
        console.error("Failed to persist final billing usage.", {
          userId,
          error,
        });
      }
    },
  });
}
