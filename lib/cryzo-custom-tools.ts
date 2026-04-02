import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { nextCronTickFromExpression, validateCron } from "./cron";

/**
 * Minimal tool factory compatible with Vercel AI SDK streamText.
 * Uses Zod for parameter schemas so the SDK correctly extracts args.
 */
function defineTool<T extends z.ZodType>(opts: {
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<unknown>;
}) {
  return opts;
}

export function getCryzoCustomTools(
  convex: ConvexHttpClient | null,
  userId: string,
) {
  if (!convex) {
    return {};
  }

  return {
    CRYZO_CREATE_RECIPE: defineTool({
      description: `Create and save a new recurring task recipe backed by Convex.
Use this when the user wants to automate a recurring task (e.g. "send an email every day", "give me my unread emails every morning").
The recipe is created AND scheduled in one step — no separate activation call needed.`,
      parameters: z.object({
        title: z.string().describe("Short title (e.g. 'Daily Email to Lloyd')"),
        instruction: z.string().describe("Full natural-language description of what the recipe does"),
        workflow_code: z.string().optional().describe("Optional workflow code"),
        integration_slugs: z.array(z.string()).describe("Composio toolkit slugs needed (e.g. ['gmail', 'slack'])"),
        cron: z.string().describe("5-field cron expression in UTC (e.g. '20 22 * * *' for daily at 10:20 PM UTC). IMPORTANT: Convert user's local time to UTC before generating the cron."),
        cron_human: z.string().describe("Human-readable schedule (e.g. 'Every day at 4:20 PM CST')"),
        timezone: z.string().optional().describe("IANA timezone (e.g. 'America/Chicago'). Defaults to UTC."),
        delivery_channels: z.array(z.enum(["in_app", "email"])).optional().describe("How to deliver results. Defaults to ['in_app']."),
      }),
      execute: async (args) => {
        try {
          console.log("[CRYZO_CREATE_RECIPE] args:", JSON.stringify(args));

          const cronError = validateCron(args.cron);
          if (cronError) {
            return { success: false, error: `Invalid cron expression "${args.cron}": ${cronError}` };
          }

          const nextRun = nextCronTickFromExpression(args.cron);
          const nextRunAt = nextRun?.toISOString();

          const payload = {
            userId,
            title: args.title,
            instruction: args.instruction,
            ...(args.workflow_code ? { workflowCode: args.workflow_code } : {}),
            integrationSlugs: args.integration_slugs,
            deliveryChannels: (args.delivery_channels ?? ["in_app"]) as ("in_app" | "email")[],
            goals: ["Execute the recurring workflow on schedule"],
            successCriteria: ["Workflow completes without errors"],
            workflowType: "general_recurring_task" as const,
            autonomyMode: "full_auto" as const,
            triggerType: "schedule" as const,
            schedule: {
              cadence: "custom" as const,
              cron: args.cron,
              cronHuman: args.cron_human,
              timezone: args.timezone ?? "UTC",
              ...(nextRunAt ? { nextRunAt } : {}),
            },
            recipeMetadata: {
              compiler: "cryzo_chat",
              compiledAt: new Date().toISOString(),
            },
          };

          const result = await convex.mutation(api.autonomous.createTask, payload);

          return {
            success: true,
            recipe_id: result.taskId,
            next_run: nextRunAt ?? "unknown",
            message: `Recipe "${args.title}" created and scheduled! Schedule: ${args.cron_human}. Next run: ${nextRunAt ?? "pending"}.`,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error("[CRYZO_CREATE_RECIPE] Failed:", msg);
          return { success: false, error: msg };
        }
      },
    }),

    CRYZO_SCHEDULE_RECIPE: defineTool({
      description: "Activate, pause, or update the schedule for an existing task recipe.",
      parameters: z.object({
        recipe_id: z.string().describe("The recipe ID returned by CRYZO_CREATE_RECIPE or CRYZO_LIST_RECIPES"),
        status: z.enum(["active", "paused"]).describe("'active' to enable, 'paused' to disable"),
        cron: z.string().optional().describe("New 5-field cron expression (UTC) if updating the schedule"),
        cron_human: z.string().optional().describe("Human-readable schedule description"),
      }),
      execute: async (args) => {
        try {
          console.log("[CRYZO_SCHEDULE_RECIPE] args:", JSON.stringify(args));

          const taskId = args.recipe_id as Id<"autonomousTasks">;

          await convex.mutation(api.autonomous.updateTaskStatus, {
            taskId,
            status: args.status,
          });

          if (args.cron) {
            const cronError = validateCron(args.cron);
            if (cronError) {
              return { success: false, error: `Invalid cron: ${cronError}. Status was updated to ${args.status}.` };
            }

            const nextRun = nextCronTickFromExpression(args.cron);

            await convex.mutation(api.autonomous.updateTaskDefinition, {
              taskId,
              schedule: {
                cadence: "custom" as const,
                cron: args.cron,
                cronHuman: args.cron_human ?? args.cron,
                ...(nextRun ? { nextRunAt: nextRun.toISOString() } : {}),
              },
            });
          }

          return {
            success: true,
            message: `Recipe ${args.status === "active" ? "activated ✅" : "paused ⏸️"}${args.cron ? ` — schedule: ${args.cron_human ?? args.cron}` : ""}`,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error("[CRYZO_SCHEDULE_RECIPE] Failed:", msg);
          return { success: false, error: msg };
        }
      },
    }),

    CRYZO_RUN_RECIPE: defineTool({
      description: "Trigger an immediate one-off execution of a saved recipe (for testing).",
      parameters: z.object({
        recipe_id: z.string().describe("The recipe ID to run immediately"),
      }),
      execute: async (args) => {
        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            (process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : "http://localhost:3000");

          const response = await fetch(`${baseUrl}/api/autonomous/run-now`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: args.recipe_id, userId }),
          });

          const result = await response.json();

          if (!response.ok) {
            return { success: false, error: result.error ?? "Dispatch failed" };
          }

          return {
            success: true,
            run_id: result.runId,
            message: "Recipe is running now ✅",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to run recipe",
          };
        }
      },
    }),

    CRYZO_LIST_RECIPES: defineTool({
      description: "List all saved task recipes for the current user.",
      parameters: z.object({
        status: z.enum(["active", "paused", "archived"]).optional().describe("Filter by status (omit for all)"),
      }),
      execute: async (args) => {
        try {
          const tasks = await convex.query(api.autonomous.listTasks, {
            userId,
            status: args.status,
          });

          return {
            success: true,
            count: tasks.length,
            recipes: tasks.map((task) => ({
              recipe_id: task._id,
              title: task.title,
              status: task.status,
              schedule: task.schedule?.cronHuman ?? "Manual only",
              next_run: task.schedule?.nextRunAt ?? null,
              integrations: task.integrationSlugs,
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to list recipes",
          };
        }
      },
    }),
  };
}
