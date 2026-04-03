import { ConvexHttpClient } from "convex/browser";
import { streamText } from "ai";
import { Composio } from "@composio/core";
import { api } from "../convex/_generated/api";
import { getAiModel } from "./ai-model";

type RecipeRecord = {
  _id: string;
  userId: string;
  title: string;
  description?: string;
  instruction: string;
  workflowCode?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  defaultInputData?: unknown;
  scheduleParams?: unknown;
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
  source: "schedule" | "trigger" | "manual";
  inputData?: unknown;
  triggerContext?: TriggerContext;
}) {
  const { convex, composio, recipe, nextRunAt, source, inputData, triggerContext } = args;
  const session = await composio.create(recipe.userId);
  const composioTools = await session.tools();
  const effectiveInputData =
    inputData ??
    (source === "schedule" ? recipe.scheduleParams : undefined) ??
    recipe.defaultInputData ??
    null;
  const prompt = source === "trigger"
    ? getTriggerPrompt(recipe.instruction, triggerContext)
    : recipe.workflowCode || recipe.instruction;

  const execution = await convex.mutation(api.recipes.beginExecution, {
    recipeId: recipe._id as never,
    userId: recipe.userId,
    source,
    inputData: effectiveInputData,
    triggerId: triggerContext?.triggerId,
    triggerSlug: triggerContext?.triggerSlug,
    eventPayload: triggerContext?.payload,
  });

  try {
    const result = streamText({
      model: getAiModel({
        prompt,
        preferLarge: true,
      }),
      system:
        source === "trigger"
          ? `You are Cryzo, executing a saved event-driven recipe. Use the stored recipe definition, input schema, and trigger payload exactly. Trigger slug: ${triggerContext?.triggerSlug ?? "unknown"}.`
          : `You are Cryzo, executing a saved recipe. Use the stored recipe definition, workflow, and input data exactly.`,
      prompt: `${prompt}

Recipe metadata:
${JSON.stringify(
        {
          title: recipe.title,
          description: recipe.description,
          inputSchema: recipe.inputSchema ?? null,
          outputSchema: recipe.outputSchema ?? null,
          inputData: effectiveInputData,
        },
        null,
        2,
      )}`,
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

    if (source !== "manual") {
      await convex.mutation(api.recipes.recordEvent, {
        recipeId: recipe._id as never,
        userId: recipe.userId,
        source,
        triggerId: triggerContext?.triggerId,
        triggerSlug: triggerContext?.triggerSlug,
        payload: triggerContext?.payload ?? null,
        result: finalText.slice(0, 500),
      });
    }

    await convex.mutation(api.recipes.completeExecution, {
      executionId: execution.executionId,
      status: "success",
      outputData: {
        text: finalText,
      },
    });

    return finalText;
  } catch (error) {
    await convex.mutation(api.recipes.completeExecution, {
      executionId: execution.executionId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
