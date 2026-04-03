import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { api } from "../convex/_generated/api";
import { deriveCronFromText, nextCronTickFromExpression, validateCron } from "./cron";

function getConvex(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour] = parts;
  const h = Number(hour);
  const m = Number(min);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = String(m).padStart(2, "0");
    return `At ${displayH}:${displayM} ${period} UTC`;
  }
  return cron;
}

export function getRecipeTools(userId: string) {
  const convex = getConvex();
  const composio = new Composio({ provider: new VercelProvider() });

  const createSchema = z.object({
    title: z.string().describe("Short title for this recipe, e.g., 'Daily Gmail digest'"),
    instruction: z.string().describe(
      "The full instruction the AI agent should execute when this recipe runs. " +
      "Be specific: include what data to fetch, what to do with it, and where to send results. " +
      "Example: 'Fetch unread emails from Gmail, summarize them into 3 bullet points, and send to lloyd.ebone@gmail.com'"
    ),
    cron: z.string().optional().describe(
      "Optional 5-field cron expression (minute hour day month weekday) in UTC. " +
      "Examples: '0 13 * * *' (1 PM UTC daily), '0 9 * * 1' (Mondays 9 AM UTC)"
    ),
    scheduleText: z.string().optional().describe(
      "Natural schedule text if cron is not supplied. Examples: 'every day at 8am', 'weekdays at 9:30am', 'every monday at 1pm Chicago time'."
    ),
    timezone: z.string().default("UTC").describe("User's timezone for reference, e.g., 'America/Chicago'"),
    integrationSlugs: z.array(z.string()).default([]).describe(
      "List of Composio integration slugs this recipe will use, e.g., ['gmail', 'slack']. Leave empty if unknown."
    ),
  });

  const RECIPE_CREATE = tool({
    description:
      "Create a new scheduled recurring recipe that runs on a cron schedule. " +
      "Use this when the user asks to do something automatically on a recurring basis, " +
      "e.g., 'Send me unread emails every morning at 8 AM' or 'Post a summary to Slack daily at noon'. " +
      "Prefer passing scheduleText for plain-English schedules; cron is optional. " +
      "If using cron, it must be standard 5-field UTC: minute hour day-of-month month day-of-week.",
    parameters: createSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({ title, instruction, cron, scheduleText, timezone, integrationSlugs }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      const resolvedCron = deriveCronFromText({
        cron,
        scheduleText,
        instruction,
        title,
        timezone,
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
        return { success: false, error: "Could not compute next run time from cron expression" };
      }

      try {
        const result = await convex.mutation(api.recipes.create, {
          userId,
          title,
          instruction,
          mode: "schedule",
          cron: resolvedCron,
          cronHuman: humanizeCron(resolvedCron),
          timezone,
          integrationSlugs,
          nextRunAt: nextRun.toISOString(),
        });

        return {
          success: true,
          recipeId: result.recipeId,
          message: `Recipe "${title}" created. First run: ${nextRun.toLocaleString('en-US', { timeZone: timezone })} (${timezone}).`,
          cron: resolvedCron,
          nextRunAt: nextRun.toISOString(),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const triggerSchema = z.object({
    title: z.string().describe("Short title for this trigger recipe."),
    instruction: z.string().describe(
      "The instruction Cryzo should execute when this trigger fires."
    ),
    triggerSlug: z.string().describe(
      "The Composio trigger slug to subscribe to, e.g. GMAIL_NEW_GMAIL_MESSAGE."
    ),
    triggerConfig: z.record(z.string(), z.any()).optional().default({}).describe(
      "Trigger configuration required by the selected trigger slug."
    ),
    timezone: z.string().default("UTC").describe("User timezone for display/reference."),
    integrationSlugs: z.array(z.string()).default([]).describe(
      "List of integration slugs used by this trigger recipe."
    ),
  });

  const RECIPE_CREATE_TRIGGER = tool({
    description:
      "Create an event-driven recipe backed by a real Composio trigger. " +
      "Use this for requests like 'when I receive a Gmail, summarize it' or 'when a GitHub PR opens, post to Slack'.",
    parameters: triggerSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({
      title,
      instruction,
      triggerSlug,
      triggerConfig,
      timezone,
      integrationSlugs,
    }: z.infer<typeof triggerSchema>) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        await composio.triggers.getType(triggerSlug);
      } catch (error) {
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
          instruction,
          mode: "trigger",
          timezone,
          integrationSlugs,
          triggerSlug,
          triggerId: trigger.triggerId,
          triggerConfig,
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

  const listSchema = z.object({
    status: z.enum(["active", "paused"]).optional().describe("Filter by status, or omit to show all"),
  });

  const RECIPE_LIST = tool({
    description: "List all scheduled recipes for this user. Shows active and paused recipes.",
    parameters: listSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({ status }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId, status });
        return {
          success: true,
          count: recipes.length,
          recipes: recipes.map((r: any) => ({
            id: r._id,
            title: r.title,
            instruction: r.instruction,
            mode: r.mode,
            schedule: r.cronHuman,
            status: r.status,
            nextRun: r.nextRunAt,
            lastRun: r.lastRunAt,
            integrations: r.integrationSlugs,
            triggerSlug: r.triggerSlug,
            triggerId: r.triggerId,
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

  const pauseSchema = z.object({
    recipeId: z.string().describe("The recipe ID to pause/resume"),
    status: z.enum(["active", "paused"]).describe("Set to 'paused' to pause, 'active' to resume"),
  });

  const RECIPE_PAUSE = tool({
    description: "Pause or resume a recipe. Paused recipes will not run on schedule.",
    parameters: pauseSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({ recipeId, status }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId });
        const recipe = recipes.find((item: any) => item._id === recipeId);

        if (recipe?.mode === "trigger" && recipe.triggerId) {
          if (status === "paused") {
            await composio.triggers.disable(recipe.triggerId);
          } else {
            await composio.triggers.enable(recipe.triggerId);
          }
        }

        await convex.mutation(api.recipes.setStatus, { recipeId, status });
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

  const deleteSchema = z.object({
    recipeId: z.string().describe("The recipe ID to delete"),
  });

  const RECIPE_DELETE = tool({
    description: "Permanently delete a recipe.",
    parameters: deleteSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({ recipeId }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      try {
        const recipes = await convex.query(api.recipes.list, { userId });
        const recipe = recipes.find((item: any) => item._id === recipeId);

        if (recipe?.mode === "trigger" && recipe.triggerId) {
          await composio.triggers.delete(recipe.triggerId);
        }

        await convex.mutation(api.recipes.remove, { recipeId });
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
    RECIPE_CREATE_TRIGGER,
    RECIPE_LIST,
    RECIPE_PAUSE,
    RECIPE_DELETE,
  };
}
