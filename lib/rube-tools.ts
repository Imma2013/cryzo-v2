import { tool } from "ai";
import { z } from "zod";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { deriveCronFromText, nextCronTickFromExpression, validateCron } from "./cron";

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

const searchQuerySchema = z.object({
  use_case: z.string(),
  known_fields: z.string().optional(),
});

const searchToolsSchema = z.object({
  queries: z.array(searchQuerySchema).min(1).max(4),
  session: z
    .object({
      generate_id: z.boolean().optional(),
      id: z.string().optional(),
    })
    .optional(),
});

const manageConnectionsSchema = z.object({
  toolkits: z.array(z.string()).min(1),
  session_id: z.string(),
});

const waitConnectionsSchema = z.object({
  toolkits: z.array(z.string()).min(1),
  session_id: z.string(),
  mode: z.enum(["any", "all"]).default("all"),
  timeout_seconds: z.number().int().positive().max(20).default(10),
  poll_interval_ms: z.number().int().positive().max(5000).default(1500),
});

const multiExecuteSchema = z.object({
  tools: z
    .array(
      z.object({
        tool_slug: z.string(),
        arguments: z.record(z.string(), z.any()).optional(),
      }),
    )
    .min(1),
  session_id: z.string(),
  sync_response_to_workbench: z.boolean().optional(),
});

const createUpdateRecipeSchema = z.object({
  recipe_id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.string(), z.any()).optional(),
  output_schema: z.record(z.string(), z.any()).optional(),
  workflow_code: z.string(),
  defaults_for_required_parameters: z.record(z.string(), z.any()).optional(),
  timezone: z.string().optional(),
  integration_slugs: z.array(z.string()).optional(),
});

const manageScheduleSchema = z.object({
  vibeApiId: z.string().optional(),
  recipe_id: z.string().optional(),
  cron: z.string().optional(),
  schedule_text: z.string().optional(),
  timezone: z.string().optional(),
  targetStatus: z.enum(["active", "paused"]).default("active"),
  params: z.record(z.string(), z.any()).optional(),
});

function getConvex() {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRubeTools(userId: string) {
  const composio = new Composio({ provider: new VercelProvider() });
  const convex = getConvex();

  const resolveSession = async (sessionId?: string) => {
    if (sessionId) {
      return composio.use(sessionId);
    }
    return composio.create(userId);
  };

  const RUBE_SEARCH_TOOLS = tool({
    description:
      "Rube-style step 1. Search for relevant tools, return a real session_id, connection status, and recommended next steps.",
    parameters: searchToolsSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({ queries, session }: z.infer<typeof searchToolsSchema>) => {
      try {
        const routerSession = await resolveSession(
          session?.generate_id === false ? session?.id : undefined,
        );

        const results = await Promise.all(
          queries.map(async (query, index) => {
            const search = await routerSession.search({ query: query.use_case, toolkits: TOOLKITS });
            const result = search.results[0];
            return {
              index: index + 1,
              use_case: query.use_case,
              difficulty: result?.difficulty ?? "unknown",
              execution_guidance: result?.executionGuidance,
              known_pitfalls: result?.knownPitfalls ?? [],
              plan_id: result?.planId,
              primary_tool_slugs: result?.primaryToolSlugs ?? [],
              related_tool_slugs: result?.relatedToolSlugs ?? [],
              recommended_plan_steps: result?.recommendedPlanSteps ?? [],
              toolkits: result?.toolkits ?? [],
            };
          }),
        );

        const { items } = await routerSession.toolkits({ toolkits: TOOLKITS });

        return {
          data: {
            success: true,
            error: null,
            results,
            session: {
              id: routerSession.sessionId,
              generate_id: true,
              instructions: `REQUIRED: Pass session_id "${routerSession.sessionId}" in all subsequent RUBE_* calls for this workflow.`,
            },
            toolkit_connection_statuses: items.map((item) => ({
              toolkit: item.slug,
              description: item.name,
              has_active_connection: item.connection?.isActive ?? false,
              status_message:
                item.connection?.isActive
                  ? "Connection is active and ready to use"
                  : `No active connection for toolkit=${item.slug}. Call RUBE_MANAGE_CONNECTIONS before executing tools.`,
              connection_details: item.connection?.connectedAccount
                ? {
                    connected_account_id: item.connection.connectedAccount.id,
                    status: item.connection.connectedAccount.status,
                  }
                : undefined,
            })),
            next_steps_guidance: [
              "1) If required toolkits are inactive, call RUBE_MANAGE_CONNECTIONS with the returned session_id.",
              "2) Once connections are active, test once with RUBE_MULTI_EXECUTE_TOOL.",
            ],
          },
          successful: true,
        };
      } catch (error) {
        return {
          data: { success: false, error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RUBE_MANAGE_CONNECTIONS = tool({
    description:
      "Rube-style step 2. Create OAuth redirect URLs for one or more toolkits using the provided session_id.",
    parameters: manageConnectionsSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({ toolkits, session_id }: z.infer<typeof manageConnectionsSchema>) => {
      try {
        const routerSession = await resolveSession(session_id);
        const results = await Promise.all(
          toolkits.map(async (toolkit) => {
            const connection = await routerSession.authorize(toolkit);
            return [
              toolkit,
              {
                redirect_url: connection.redirectUrl,
              },
            ] as const;
          }),
        );

        return {
          data: {
            success: true,
            error: null,
            results: Object.fromEntries(results),
            session: {
              id: routerSession.sessionId,
              generate_id: false,
              instructions: `REQUIRED: Pass session_id "${routerSession.sessionId}" in all subsequent RUBE_* calls for this workflow.`,
            },
          },
          successful: true,
        };
      } catch (error) {
        return {
          data: { success: false, error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RUBE_WAIT_FOR_CONNECTIONS = tool({
    description:
      "Rube-style step 3. Poll connection state for toolkits until active or timeout.",
    parameters: waitConnectionsSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({
      toolkits,
      session_id,
      mode,
      timeout_seconds,
      poll_interval_ms,
    }: z.infer<typeof waitConnectionsSchema>) => {
      try {
        const routerSession = await resolveSession(session_id);
        const deadline = Date.now() + timeout_seconds * 1000;
        let latestItems = [] as Awaited<ReturnType<typeof routerSession.toolkits>>["items"];

        while (Date.now() <= deadline) {
          const response = await routerSession.toolkits({ toolkits });
          latestItems = response.items;

          const activeCount = latestItems.filter((item) => item.connection?.isActive).length;
          const satisfied =
            mode === "any" ? activeCount > 0 : activeCount === toolkits.length;

          if (satisfied) {
            break;
          }

          if (Date.now() + poll_interval_ms > deadline) {
            break;
          }

          await sleep(poll_interval_ms);
        }

        const statuses = Object.fromEntries(
          toolkits.map((toolkit) => {
            const item = latestItems.find((entry) => entry.slug === toolkit);
            return [
              toolkit,
              {
                status: item?.connection?.isActive ? "ACTIVE" : "INACTIVE",
                connected_account_id: item?.connection?.connectedAccount?.id,
              },
            ];
          }),
        );

        return {
          data: {
            success: true,
            error: null,
            results: statuses,
            session: {
              id: routerSession.sessionId,
              generate_id: false,
              instructions: `REQUIRED: Pass session_id "${routerSession.sessionId}" in all subsequent RUBE_* calls for this workflow.`,
            },
          },
          successful: true,
        };
      } catch (error) {
        return {
          data: { success: false, error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RUBE_MULTI_EXECUTE_TOOL = tool({
    description:
      "Rube-style step 4. Execute one or more tools inside the provided Composio session and return ordered results.",
    parameters: multiExecuteSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({ tools, session_id }: z.infer<typeof multiExecuteSchema>) => {
      try {
        const routerSession = await resolveSession(session_id);
        const results = await Promise.all(
          tools.map(async (entry, index) => {
            const response = await routerSession.execute(entry.tool_slug, entry.arguments ?? {});
            return {
              index,
              tool_slug: entry.tool_slug,
              response: {
                data: response.data,
                error: response.error,
                logId: response.logId,
              },
              error: response.error,
            };
          }),
        );

        return {
          data: {
            success: results.every((result) => !result.error),
            error: results.find((result) => result.error)?.error ?? null,
            results,
            session: {
              id: routerSession.sessionId,
              generate_id: false,
              instructions: `REQUIRED: Pass session_id "${routerSession.sessionId}" in all subsequent RUBE_* calls for this workflow.`,
            },
          },
          successful: results.every((result) => !result.error),
        };
      } catch (error) {
        return {
          data: { success: false, error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RUBE_CREATE_UPDATE_RECIPE = tool({
    description:
      "Rube-style step 5. Create or update a reusable Cryzo recipe using Rube-compatible field names.",
    parameters: createUpdateRecipeSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({
      recipe_id,
      name,
      description,
      input_schema,
      output_schema,
      workflow_code,
      defaults_for_required_parameters,
      timezone,
      integration_slugs,
    }: z.infer<typeof createUpdateRecipeSchema>) => {
      if (!convex) {
        return { success: false, error: "Convex not configured" };
      }

      try {
        if (recipe_id) {
          await convex.mutation(api.recipes.update, {
            recipeId: recipe_id as never,
            title: name,
            description,
            instruction: description,
            workflowCode: workflow_code,
            inputSchema: input_schema,
            outputSchema: output_schema,
            defaultInputData: defaults_for_required_parameters,
            integrationSlugs: integration_slugs,
            timezone,
          });

          return {
            data: {
              recipe_id,
              recipe_url: `/tasks/${recipe_id}`,
              updated: true,
            },
            successful: true,
          };
        }

        const created = await convex.mutation(api.recipes.create, {
          userId,
          title: name,
          description,
          instruction: description,
          workflowCode: workflow_code,
          inputSchema: input_schema,
          outputSchema: output_schema,
          defaultInputData: defaults_for_required_parameters,
          mode: "schedule",
          timezone: timezone ?? "UTC",
          integrationSlugs: integration_slugs ?? [],
          status: "draft",
        });

        return {
          data: {
            recipe_id: created.recipeId,
            recipe_url: `/tasks/${created.recipeId}`,
            updated: false,
          },
          successful: true,
        };
      } catch (error) {
        return {
          data: { error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const RUBE_MANAGE_RECIPE_SCHEDULE = tool({
    description:
      "Rube-style step 6. Attach a schedule to a saved recipe using cron or plain-English schedule text.",
    parameters: manageScheduleSchema,
    // @ts-expect-error AI SDK typing issue
    execute: async ({
      vibeApiId,
      recipe_id,
      cron,
      schedule_text,
      timezone,
      targetStatus,
      params,
    }: z.infer<typeof manageScheduleSchema>) => {
      if (!convex) {
        return { success: false, error: "Convex not configured" };
      }

      try {
        const recipeId = vibeApiId ?? recipe_id;
        if (!recipeId) {
          return {
            data: { error: "Missing vibeApiId or recipe_id" },
            successful: false,
            error: "Missing vibeApiId or recipe_id",
          };
        }

        const recipe = await convex.query(api.recipes.getById, {
          recipeId: recipeId as never,
          userId,
        });

        if (!recipe) {
          return {
            data: { error: "Recipe not found" },
            successful: false,
            error: "Recipe not found",
          };
        }

        const resolvedCron = deriveCronFromText({
          cron,
          scheduleText: schedule_text,
          instruction: recipe.instruction,
          title: recipe.title,
          timezone: timezone ?? recipe.timezone,
        });

        if (!resolvedCron) {
          return {
            data: { error: "Missing cron or schedule_text" },
            successful: false,
            error: "Missing cron or schedule_text",
          };
        }

        const cronError = validateCron(resolvedCron);
        if (cronError) {
          return {
            data: { error: `Invalid cron expression: ${cronError}` },
            successful: false,
            error: `Invalid cron expression: ${cronError}`,
          };
        }

        const nextRun = nextCronTickFromExpression(resolvedCron, new Date());
        if (!nextRun) {
          return {
            data: { error: "Could not compute next run time" },
            successful: false,
            error: "Could not compute next run time",
          };
        }

        await convex.mutation(api.recipes.configureSchedule, {
          recipeId: recipeId as never,
          cron: resolvedCron,
          cronHuman: humanizeCron(resolvedCron),
          timezone: timezone ?? recipe.timezone,
          scheduleParams: params,
          nextRunAt: targetStatus === "active" ? nextRun.toISOString() : undefined,
          status: targetStatus,
        });

        return {
          data: {
            schedule: {
              recipeId,
              status: targetStatus,
              cron: resolvedCron,
              cronHuman: humanizeCron(resolvedCron),
              nextRunAt: nextRun.toISOString(),
              params: params ?? recipe.defaultInputData ?? {},
            },
          },
          successful: true,
        };
      } catch (error) {
        return {
          data: { error: error instanceof Error ? error.message : String(error) },
          successful: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  return {
    RUBE_SEARCH_TOOLS,
    RUBE_MANAGE_CONNECTIONS,
    RUBE_WAIT_FOR_CONNECTIONS,
    RUBE_MULTI_EXECUTE_TOOL,
    RUBE_CREATE_UPDATE_RECIPE,
    RUBE_MANAGE_RECIPE_SCHEDULE,
  };
}
