import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { nextCronTickFromExpression, validateCron } from "./cron";

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

  const createSchema = z.object({
    title: z.string().describe("Short title for this recipe, e.g., 'Daily Gmail digest'"),
    instruction: z.string().describe(
      "The full instruction the AI agent should execute when this recipe runs. " +
      "Be specific: include what data to fetch, what to do with it, and where to send results. " +
      "Example: 'Fetch unread emails from Gmail, summarize them into 3 bullet points, and send to lloyd.ebone@gmail.com'"
    ),
    cron: z.string().describe(
      "5-field cron expression (minute hour day month weekday) in UTC. " +
      "Examples: '0 13 * * *' (1 PM UTC daily), '0 9 * * 1' (Mondays 9 AM UTC)"
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
      "The cron expression MUST be in standard 5-field format: minute hour day-of-month month day-of-week (UTC time). " +
      "Example: '0 8 * * *' = 8:00 AM UTC daily. '30 17 * * 1-5' = 5:30 PM UTC weekdays.",
    parameters: createSchema,
    // @ts-expect-error - Vercel AI SDK tool() overload resolution issue
    execute: async ({ title, instruction, cron, timezone, integrationSlugs }) => {
      if (!convex) return { success: false, error: "Convex not configured" };

      const cronError = validateCron(cron);
      if (cronError) {
        return { success: false, error: `Invalid cron expression: ${cronError}` };
      }

      const nextRun = nextCronTickFromExpression(cron, new Date());
      if (!nextRun) {
        return { success: false, error: "Could not compute next run time from cron expression" };
      }

      try {
        const result = await convex.mutation(api.recipes.create, {
          userId,
          title,
          instruction,
          cron,
          cronHuman: humanizeCron(cron),
          timezone,
          integrationSlugs,
          nextRunAt: nextRun.toISOString(),
        });

        return {
          success: true,
          recipeId: result.recipeId,
          message: `Recipe "${title}" created. First run: ${nextRun.toLocaleString('en-US', { timeZone: timezone })} (${timezone}).`,
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
            schedule: r.cronHuman,
            status: r.status,
            nextRun: r.nextRunAt,
            lastRun: r.lastRunAt,
            integrations: r.integrationSlugs,
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
    RECIPE_LIST,
    RECIPE_PAUSE,
    RECIPE_DELETE,
  };
}
