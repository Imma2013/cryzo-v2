import { ConvexHttpClient } from "convex/browser";
import { streamText } from "ai";
import { Composio } from "@composio/core";
import { api } from "../convex/_generated/api";
import { getAiModel } from "./ai-model";

type RecipeRecord = {
  _id: string;
  userId: string;
  title: string;
  instruction: string;
  cron?: string;
  mode: "schedule" | "trigger";
  triggerId?: string;
  triggerSlug?: string;
};

type TriggerContext = {
  triggerId?: string;
  triggerSlug?: string;
  payload: unknown;
};

function getTriggerPrompt(recipeInstruction: string, triggerContext?: TriggerContext) {
  if (!triggerContext) {
    return recipeInstruction;
  }

  return `${recipeInstruction}

Trigger event details:
${JSON.stringify(triggerContext.payload, null, 2)}`;
}

export async function executeRecipeRun(args: {
  convex: ConvexHttpClient;
  composio: Composio<any>;
  recipe: RecipeRecord;
  nextRunAt?: string;
  source: "schedule" | "trigger";
  triggerContext?: TriggerContext;
}) {
  const { convex, composio, recipe, nextRunAt, source, triggerContext } = args;
  const session = await composio.create(recipe.userId);
  const composioTools = await session.tools();
  const prompt = source === "trigger"
    ? getTriggerPrompt(recipe.instruction, triggerContext)
    : recipe.instruction;

  const result = streamText({
    model: getAiModel({
      prompt,
      preferLarge: true,
    }),
    system:
      source === "trigger"
        ? `You are Cryzo, an AI agent executing an event-driven recipe. The trigger slug is ${triggerContext?.triggerSlug ?? "unknown"}.`
        : `You are Cryzo, an AI agent executing a scheduled recipe.`,
    prompt,
    tools: composioTools,
  });

  let finalText = "";
  for await (const chunk of result.textStream) {
    finalText += chunk;
  }

  await convex.mutation(api.recipes.markRan, {
    recipeId: recipe._id as never,
    nextRunAt,
    result: finalText.slice(0, 500),
  });

  await convex.mutation(api.recipes.recordEvent, {
    recipeId: recipe._id as never,
    userId: recipe.userId,
    source,
    triggerId: triggerContext?.triggerId,
    triggerSlug: triggerContext?.triggerSlug,
    payload: triggerContext?.payload ?? null,
    result: finalText.slice(0, 500),
  });

  return finalText;
}
