import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { api } from "../convex/_generated/api";
import { deriveCronFromText, nextCronTickFromExpression, validateCron } from "./cron";
import { executeRecipeRun } from "./recipe-runner";

function getConvex(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

function humanizeCron(cron: string) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour] = parts;
  const h = Number(hour);
  const m = Number(min);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = String(m).padStart(2, "0");
    return `At ${displayH}:${displayM} ${period} UTC, every day`;
  }
  return cron;
}

const recipeDefinitionSchema = z.object({
  title: z.string().describe("Short recipe name, e.g. Daily Unread Gmail Digest."),
  description: z
    .string()
    .optional()
    .describe("User-facing summary of what the recipe does."),
  instruction: z.string().describe("Plain-language execution instruction for Cryzo."),
  workflowCode: z
    .string()
    .optional()
    .describe("Optional stored workflow definition or pseudo-code for the recipe."),
  inputSchema: z
    .record(z.string(), z.any())
    .optional()
    .describe("JSON-schema-like object describing the recipe input params."),
  outputSchema: z
    .record(z.string(), z.any())
    .optional()
    .describe("JSON-schema-like object describing the recipe output."),
  defaultInputData: z
    .record(z.string(), z.any())
    .optional()
    .describe("Default parameter values to use for manual and scheduled runs."),
  timezone: z.string().default("UTC").describe("User timezone, e.g. America/Chicago."),
  integrationSlugs: z
    .array(z.string())
    .default([])
    .describe("Connected app slugs used by this recipe, e.g. ['gmail']."),
});

const scheduleSchema = z.object({
  recipeId: z.string().describe("The recipe ID to schedule."),
  cron: z.string().optional().describe("Optional 5-field UTC cron expression."),
  scheduleText: z
    .string()
    .optional()
    .describe("Plain-English schedule like 'every day at 8am Chicago time'."),
  timezone: z.string().default("UTC").describe("Timezone to interpret scheduleText."),
  params: z
    .record(z.string(), z.any())
    .optional()
    .describe("Input params to pass for scheduled runs."),
  targetStatus: z
    .enum(["active", "paused"])
    .default("active")
    .describe("Whether to enable or pause the schedule."),
});

const executeSchema = z.object({
  recipeId: z.string().describe("The recipe ID to execute immediately."),
  inputData: z
    .record(z.string(), z.any())
    .optional()
    .describe("Optional input params to override default recipe inputs."),
});

const triggerSchema = z.object({
  title: z.string().describe("Short title for this trigger recipe."),
  description: z.string().optional().describe("User-facing summary of the trigger recipe."),
  instruction: z.string().describe("The instruction Cryzo should execute when this trigger fires."),
  workflowCode: z
    .string()
    .optional()
    .describe("Optional stored workflow definition or pseudo-code."),
  inputSchema: z.record(z.string(), z.any()).optional(),
  outputSchema: z.record(z.string(), z.any()).optional(),
  defaultInputData: z.record(z.string(), z.any()).optional(),
  triggerSlug: z.string().describe("The Composio trigger slug to subscribe to."),
  triggerConfig: z.record(z.string(), z.any()).optional().default({}),
  timezone: z.string().default("UTC"),
  integrationSlugs: z.array(z.string()).default([]),
});

const quickCreateSchema = recipeDefinitionSchema.extend({
  cron: z.string().optional(),
  scheduleText: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
  targetStatus: z.enum(["active", "paused"]).default("active"),
});

export function getRecipeTools(userId: string) {
  const convex = getConvex();
  const composio = new Composio({ provider: new VercelProvider() });

  async function applySchedule(args: z.infer<typeof scheduleSchema>) {
    if (!convex) return { success: false, error: "Convex not configured" };

    const recipe = await convex.query(api.recipes.getById, {
      recipeId: args.recipeId as never,
      userId,
    });

    if (!recipe) {
      return { success: false, error: "Recipe not found" };
    }

    const resolvedCron = deriveCronFromText({
      cron: args.cron,
      scheduleText: args.scheduleText,
      instruction: recipe.instruction,
      title: recipe.title,
      timezone: args.timezone,
    });

    if (!resolvedCron) {
      return {
        success: false,
        error:
          "Missing schedule. Provide either cron or scheduleText like 'every day at 8am Chicago time'.",
      };
    }

    const cronError = validateCron(resolvedCron);
    if (cronError) {
      return { success: false, error: `Invalid cron expression: ${cronError}` };
    }

    const nextRun = nextCronTickFromExpression(resolvedCron, new Date());
    if (!nextRun) {
      return { success: false, error: "Could not compute next run time from cron expression." };
    }

    await convex.mutation(api.recipes.configureSchedule, {
      recipeId: args.recipeId as never,
      cron: resolvedCron,
      cronHuman: humanizeCron(resolvedCron),
      timezone: args.timezone,
      scheduleParams: args.params,
      nextRunAt: args.targetStatus === "active" ? nextRun.toISOString() : undefined,
      status: args.targetStatus,
    });

    return {
      success: true,
      recipeId: args.recipeId,
      status: args.targetStatus,
      cron: resolvedCron,
      nextRunAt: nextRun.toISOString(),
      cronHuman: humanizeCron(resolvedCron),
    };
  }

  const RECIPE_CREATE_UPDATE = tool({
    description:
      "Create or update a reusable recipe definition. Use this before scheduling or executing recurring automations.",
    parameters: recipeDefinitionSchema,
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({
      title,
      description,
      instruction,
      workflowCode,
      inputSchema,
      outputSchema,
      defaultInputData,
      timezone,
      integrationSlugs,
    }: z.infer<typeof recipeDefinitionSchema>) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const result = await convex.mutation(api.recipes.create, {
          userId,
          title,
          description,
          instruction,
          workflowCode: workflowCode ?? instruction,
          inputSchema,
          outputSchema,
          defaultInputData,
          mode: "schedule",
          timezone,
          integrationSlugs,
          status: "draft",
        });

        return {
          success: true,
          recipeId: result.recipeId,
          message: `Recipe "${title}" created.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RECIPE_MANAGE_SCHEDULE = tool({
    description:
      "Attach or update a schedule for a saved recipe. Use this after RECIPE_CREATE_UPDATE.",
    parameters: scheduleSchema,
    // @ts-expect-error - AI SDK tool typing issue
    execute: async (args: z.infer<typeof scheduleSchema>) => applySchedule(args),
  });

  const RECIPE_EXECUTE = tool({
    description: "Execute a saved recipe immediately with optional input overrides.",
    parameters: executeSchema,
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({ recipeId, inputData }: z.infer<typeof executeSchema>) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      const recipe = await convex.query(api.recipes.getById, {
        recipeId: recipeId as never,
        userId,
      });

      if (!recipe) {
        return { success: false, error: "Recipe not found" };
      }

      try {
        const output = await executeRecipeRun({
          convex,
          composio,
          recipe,
          source: "manual",
          inputData,
        });

        return {
          success: true,
          recipeId,
          output,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RECIPE_CREATE_TRIGGER = tool({
    description:
      "Create an event-driven recipe backed by a real Composio trigger for when/whenever-style automations.",
    parameters: triggerSchema,
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({
      title,
      description,
      instruction,
      workflowCode,
      inputSchema,
      outputSchema,
      defaultInputData,
      triggerSlug,
      triggerConfig,
      timezone,
      integrationSlugs,
    }: z.infer<typeof triggerSchema>) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        await composio.triggers.getType(triggerSlug);
      } catch {
        return {
          success: false,
          error: `Unknown trigger slug: ${triggerSlug}.`,
        };
      }

      try {
        const trigger = await composio.triggers.create(userId, triggerSlug, {
          triggerConfig,
        });

        const result = await convex.mutation(api.recipes.create, {
          userId,
          title,
          description,
          instruction,
          workflowCode: workflowCode ?? instruction,
          inputSchema,
          outputSchema,
          defaultInputData,
          mode: "trigger",
          timezone,
          integrationSlugs,
          triggerSlug,
          triggerId: trigger.triggerId,
          triggerConfig,
          status: "active",
        });

        return {
          success: true,
          recipeId: result.recipeId,
          triggerId: trigger.triggerId,
          message: `Trigger recipe "${title}" created for ${triggerSlug}.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RECIPE_CREATE = tool({
    description:
      "Convenience shortcut to create a scheduled recipe definition and attach a schedule in one step.",
    parameters: quickCreateSchema,
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({
      title,
      description,
      instruction,
      workflowCode,
      inputSchema,
      outputSchema,
      defaultInputData,
      timezone,
      integrationSlugs,
      cron,
      scheduleText,
      params,
      targetStatus,
    }: z.infer<typeof quickCreateSchema>) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      const createResult = await convex.mutation(api.recipes.create, {
        userId,
        title,
        description,
        instruction,
        workflowCode: workflowCode ?? instruction,
        inputSchema,
        outputSchema,
        defaultInputData,
        mode: "schedule",
        timezone,
        integrationSlugs,
        status: "draft",
      });

      const scheduleResult = await applySchedule({
        recipeId: String(createResult.recipeId),
        cron,
        scheduleText,
        timezone,
        params,
        targetStatus,
      });

      return {
        recipeId: createResult.recipeId,
        ...scheduleResult,
      };
    },
  });

  const RECIPE_LIST = tool({
    description: "List all saved recipes for this user, including draft, active, and paused recipes.",
    parameters: z.object({
      status: z.enum(["draft", "active", "paused"]).optional(),
    }),
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({ status }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId, status });
        return {
          success: true,
          count: recipes.length,
          recipes: recipes.map((r) => ({
            id: r._id,
            title: r.title,
            description: r.description,
            mode: r.mode,
            status: r.status,
            cron: r.cron,
            cronHuman: r.cronHuman,
            nextRunAt: r.nextRunAt,
            lastRunAt: r.lastRunAt,
            integrationSlugs: r.integrationSlugs,
            triggerSlug: r.triggerSlug,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RECIPE_PAUSE = tool({
    description: "Pause or resume a recipe.",
    parameters: z.object({
      recipeId: z.string(),
      status: z.enum(["active", "paused"]),
    }),
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({ recipeId, status }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId });
        const recipe = recipes.find((item) => String(item._id) === recipeId);

        if (!recipe) {
          return { success: false, error: "Recipe not found" };
        }

        if (recipe.mode === "trigger" && recipe.triggerId) {
          if (status === "paused") {
            await composio.triggers.disable(recipe.triggerId);
          } else {
            await composio.triggers.enable(recipe.triggerId);
          }
        }

        await convex.mutation(api.recipes.setStatus, {
          recipeId: recipeId as never,
          status,
        });

        return {
          success: true,
          message: `Recipe ${status === "paused" ? "paused" : "resumed"}.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RECIPE_DELETE = tool({
    description: "Delete a saved recipe.",
    parameters: z.object({
      recipeId: z.string(),
    }),
    // @ts-expect-error - AI SDK tool typing issue
    execute: async ({ recipeId }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId });
        const recipe = recipes.find((item) => String(item._id) === recipeId);

        if (recipe?.mode === "trigger" && recipe.triggerId) {
          await composio.triggers.delete(recipe.triggerId);
        }

        await convex.mutation(api.recipes.remove, { recipeId: recipeId as never });
        return { success: true, message: "Recipe deleted." };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return {
    RECIPE_CREATE,
    RECIPE_CREATE_UPDATE,
    RECIPE_MANAGE_SCHEDULE,
    RECIPE_EXECUTE,
    RECIPE_CREATE_TRIGGER,
    RECIPE_LIST,
    RECIPE_PAUSE,
    RECIPE_DELETE,
  };
}
