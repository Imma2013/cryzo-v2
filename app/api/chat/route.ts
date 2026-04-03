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
import { getRubeTools } from "../../../lib/rube-tools";

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
  const rubeTools = getRubeTools(userId || "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252");
  const allTools = { ...composioTools, ...recipeTools, ...rubeTools };

  const systemPrompt = `You are Cryzo, an intelligent AI agent. Help the user accomplish tasks using their connected apps. Today's date is ${new Date().toLocaleDateString()}. Build reusable automations as saved recipes, then schedule or execute them.

Important:
- RECIPE_CREATE, RECIPE_CREATE_UPDATE, RECIPE_MANAGE_SCHEDULE, RECIPE_EXECUTE, RECIPE_CREATE_TRIGGER, RECIPE_LIST, RECIPE_PAUSE, and RECIPE_DELETE are native Cryzo tools, not Composio tools.
- RUBE_SEARCH_TOOLS, RUBE_MANAGE_CONNECTIONS, RUBE_WAIT_FOR_CONNECTIONS, RUBE_MULTI_EXECUTE_TOOL, RUBE_CREATE_UPDATE_RECIPE, and RUBE_MANAGE_RECIPE_SCHEDULE are native Cryzo wrappers that intentionally mimic the Rube flow.
- Do not try to search for schemas or discover the native Cryzo or RUBE_* tools through Composio.
- For a Rube-style recurring automation flow, prefer this exact order:
  1. call RUBE_SEARCH_TOOLS with the user's use case,
  2. if any toolkits are inactive, call RUBE_MANAGE_CONNECTIONS,
  3. if the user needs to finish OAuth, call RUBE_WAIT_FOR_CONNECTIONS,
  4. test the task once with RUBE_MULTI_EXECUTE_TOOL,
  5. save the reusable recipe with RUBE_CREATE_UPDATE_RECIPE,
  6. attach the schedule with RUBE_MANAGE_RECIPE_SCHEDULE.
- Use RECIPE_CREATE as a shortcut only when the request is simple and all required recipe details are obvious.
- For event-driven requests tied to app events, call RECIPE_CREATE_TRIGGER directly.
- When useful, include inputSchema, outputSchema, defaultInputData, and workflowCode in RECIPE_CREATE_UPDATE.
- In RUBE_CREATE_UPDATE_RECIPE, use Rube-compatible fields like name, description, input_schema, output_schema, workflow_code, and defaults_for_required_parameters.
- Prefer scheduleText like "every day at 8am Chicago time" unless you already have a valid UTC cron string.
- If the user explicitly wants "recipes" or "autonomous tasks" like Rube, use the RUBE_* wrappers first.`;

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
