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

  const systemPrompt = `You are Cryzo, an intelligent AI agent. Help the user accomplish tasks using their connected apps. Today's date is ${new Date().toLocaleDateString()}. Build reusable automations as saved recipes, then schedule or execute them.

Important:
- RECIPE_CREATE, RECIPE_CREATE_UPDATE, RECIPE_MANAGE_SCHEDULE, RECIPE_EXECUTE, RECIPE_CREATE_TRIGGER, RECIPE_LIST, RECIPE_PAUSE, and RECIPE_DELETE are native Cryzo tools, not Composio tools.
- Do not try to search for schemas or discover those recipe tools through Composio.
- For a Rube-style recurring automation flow:
  1. identify tools/integrations needed,
  2. check missing connections,
  3. call RECIPE_CREATE_UPDATE to save the reusable recipe definition,
  4. call RECIPE_MANAGE_SCHEDULE to attach the schedule and params.
- Use RECIPE_CREATE as a shortcut only when the request is simple and all required recipe details are obvious.
- For event-driven requests tied to app events, call RECIPE_CREATE_TRIGGER directly.
- When useful, include inputSchema, outputSchema, defaultInputData, and workflowCode in RECIPE_CREATE_UPDATE.
- Prefer scheduleText like "every day at 8am Chicago time" unless you already have a valid UTC cron string.`;

  const result = streamText({
    model: getAiModel({
      messages,
      system: systemPrompt,
    }),
    system: systemPrompt,
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
          model: getAiModelName({
            messages,
            system: systemPrompt,
          }),
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
