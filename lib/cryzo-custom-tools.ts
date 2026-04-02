import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function getCryzoCustomTools(
  convex: ConvexHttpClient | null,
  userId: string,
) {
  if (!convex) {
    return {};
  }

  return {
    CRYZO_CREATE_RECIPE: {
      description: `Create and save a new recurring task recipe backed by Convex.
Use this when the user wants to automate a recurring task (e.g. "give me my unread emails every day").
After creating, call CRYZO_SCHEDULE_RECIPE to activate the schedule.`,
      parameters: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Short title (e.g. 'Daily Unread Gmail Digest')" },
          instruction: { type: "string", description: "Natural language description of what the recipe does" },
          workflow_code: { type: "string", description: "Python code using run_composio_tool() to execute the workflow" },
          integration_slugs: {
            type: "array",
            items: { type: "string" },
            description: "Composio toolkit slugs needed (e.g. ['gmail', 'slack'])",
          },
          cron: { type: "string", description: "Cron expression (e.g. '0 8 * * *' for daily at 8am)" },
          cron_human: { type: "string", description: "Human-readable cron (e.g. 'Every day at 8:00 AM')" },
          timezone: { type: "string", description: "IANA timezone (e.g. 'America/Chicago')", default: "UTC" },
          delivery_channels: {
            type: "array",
            items: { type: "string", enum: ["in_app", "email"] },
            description: "How to deliver results",
            default: ["in_app"],
          },
        },
        required: ["title", "instruction", "integration_slugs", "cron", "cron_human"],
      },
      execute: async (args: {
        title: string;
        instruction: string;
        workflow_code?: string;
        integration_slugs: string[];
        cron: string;
        cron_human: string;
        timezone?: string;
        delivery_channels?: string[];
      }) => {
        try {
          const result = await convex.mutation(api.autonomous.createTask, {
            userId,
            title: args.title,
            instruction: args.instruction,
            workflowCode: args.workflow_code,
            integrationSlugs: args.integration_slugs,
            deliveryChannels: (args.delivery_channels ?? ["in_app"]) as ("in_app" | "email")[],
            goals: ["Execute the recurring workflow on schedule"],
            successCriteria: ["Workflow completes without errors"],
            workflowType: "general_recurring_task",
            autonomyMode: "full_auto",
            triggerType: "schedule",
            schedule: {
              cadence: "custom" as const,
              cron: args.cron,
              cronHuman: args.cron_human,
              timezone: args.timezone ?? "UTC",
            },
            recipeMetadata: {
              compiler: "cryzo_chat",
              compiledAt: new Date().toISOString(),
            },
          });

          return {
            success: true,
            recipe_id: result.taskId,
            message: `Recipe "${args.title}" created. Schedule: ${args.cron_human}. Now call CRYZO_SCHEDULE_RECIPE with recipe_id "${result.taskId}" to activate it.`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create recipe",
          };
        }
      },
    },

    CRYZO_SCHEDULE_RECIPE: {
      description: "Activate, pause, or update the schedule for an existing task recipe.",
      parameters: {
        type: "object" as const,
        properties: {
          recipe_id: { type: "string", description: "The recipe ID returned by CRYZO_CREATE_RECIPE" },
          status: { type: "string", enum: ["active", "paused"], description: "'active' to enable, 'paused' to disable" },
          cron: { type: "string", description: "New cron expression if updating the schedule" },
          cron_human: { type: "string", description: "Human-readable cron if updating the schedule" },
        },
        required: ["recipe_id", "status"],
      },
      execute: async (args: {
        recipe_id: string;
        status: "active" | "paused";
        cron?: string;
        cron_human?: string;
      }) => {
        try {
          await convex.mutation(api.autonomous.updateTaskStatus, {
            taskId: args.recipe_id as Id<"autonomousTasks">,
            status: args.status,
          });

          if (args.cron && args.cron_human) {
            await convex.mutation(api.autonomous.updateTaskDefinition, {
              taskId: args.recipe_id as Id<"autonomousTasks">,
              schedule: {
                cadence: "custom" as const,
                cron: args.cron,
                cronHuman: args.cron_human,
              },
            });
          }

          return {
            success: true,
            message: `Recipe ${args.status === "active" ? "activated ✅" : "paused ⏸️"}${args.cron ? ` — new schedule: ${args.cron_human}` : ""}`,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update recipe",
          };
        }
      },
    },

    CRYZO_RUN_RECIPE: {
      description: "Trigger an immediate one-off execution of a saved recipe (for testing).",
      parameters: {
        type: "object" as const,
        properties: {
          recipe_id: { type: "string", description: "The recipe ID to run immediately" },
        },
        required: ["recipe_id"],
      },
      execute: async (args: { recipe_id: string }) => {
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
            return {
              success: false,
              error: result.error ?? "Dispatch failed",
            };
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
    },

    CRYZO_LIST_RECIPES: {
      description: "List all saved task recipes for the current user.",
      parameters: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["active", "paused", "archived"],
            description: "Filter by status (omit for all)",
          },
        },
        required: [],
      },
      execute: async (args: { status?: "active" | "paused" | "archived" }) => {
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
    },
  };
}
