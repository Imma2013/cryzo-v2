import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { ConvexHttpClient } from "convex/browser";
import { generateText, stepCountIs } from "ai";

import { api as convexApi } from "../../../../convex/_generated/api";
import {
  buildSystemPrompt,
  claimNextDueRun,
  ensureScheduledRuns,
  getEffectiveIntegrationSlugs,
  getMaxActionsPerRun,
  getRunDispatchContext,
  type DispatchResult,
} from "../../../../lib/autonomy-executor";

const FALLBACK_EXTERNAL_USER_ID =
  "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252";

function getSchedulerSecret() {
  return (
    process.env.CRON_SECRET?.trim() ||
    process.env.AUTONOMOUS_DISPATCH_SECRET?.trim() ||
    null
  );
}

function isAuthorizedSchedulerRequest(req: Request) {
  const configuredSecret = getSchedulerSecret();
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerSecret = req.headers.get("x-autonomous-dispatch-secret")?.trim();
  const querySecret = url.searchParams.get("secret")?.trim();

  return [bearerToken, headerSecret, querySecret].some(
    (value) => value === configuredSecret,
  );
}

function parseDispatchLimit(req: Request, bodyLimit?: number) {
  const urlLimit = Number(new URL(req.url).searchParams.get("limit"));
  const rawLimit =
    typeof bodyLimit === "number" && Number.isFinite(bodyLimit)
      ? bodyLimit
      : urlLimit;

  if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
    return 1;
  }

  return Math.min(Math.floor(rawLimit), 5);
}

type DispatchRequestBody = {
  limit?: number;
};

type DispatchResponse = {
  queuedCount: number;
  processedCount: number;
  results: DispatchResult[];
};

async function completeRunWithError(args: {
  convex: ConvexHttpClient;
  userId: string;
  taskId: Awaited<ReturnType<typeof claimNextDueRun>>["taskId"];
  runId: Awaited<ReturnType<typeof claimNextDueRun>>["runId"];
  error: string;
}) {
  const { convex, userId, taskId, runId, error } = args;
  if (!taskId || !runId) {
    return;
  }

  await convex.mutation(convexApi.autonomous.completeRun, {
    runId,
    status: "failed",
    error,
  });

  await convex.mutation(convexApi.autonomous.recordEvent, {
    userId,
    taskId,
    runId,
    type: "run_failed",
    source: "executor",
    payload: { error },
  });
}

async function handleDispatch(req: Request) {
  if (!isAuthorizedSchedulerRequest(req)) {
    return Response.json(
      { error: "Unauthorized autonomous dispatch trigger." },
      { status: 401 },
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_CONVEX_URL is not configured." },
      { status: 500 },
    );
  }

  let bodyLimit: number | undefined;
  if (req.method !== "GET") {
    try {
      const body = (await req.json()) as DispatchRequestBody;
      bodyLimit = body.limit;
    } catch {
      bodyLimit = undefined;
    }
  }

  const limit = parseDispatchLimit(req, bodyLimit);
  const convex = new ConvexHttpClient(convexUrl);
  const composio = new Composio({ provider: new VercelProvider() });
  const queueResult = await ensureScheduledRuns(convex);
  const results: DispatchResult[] = [];

  for (let index = 0; index < limit; index += 1) {
    const claim = await claimNextDueRun(convex);
    if (!claim.claimed || !claim.runId) {
      break;
    }

    const context = await getRunDispatchContext(convex, claim.runId);

    if (!context) {
      await convex.mutation(convexApi.autonomous.completeRun, {
        runId: claim.runId,
        status: "failed",
        error: "Dispatch context was unavailable for the claimed run.",
      });
      results.push({
        runId: claim.runId,
        status: "failed",
        error: "Dispatch context was unavailable for the claimed run.",
      });
      continue;
    }

    const billingSummary = await convex.query(
      convexApi.billing.getBillingSummary,
      { userId: context.task.userId },
    );

    if ((billingSummary.remainingTokens ?? 0) <= 0) {
      const error =
        "The user has no remaining tokens for autonomous execution in the current billing window.";
      await completeRunWithError({
        convex,
        userId: context.task.userId,
        taskId: context.task._id,
        runId: context.run._id,
        error,
      });
      results.push({
        runId: context.run._id,
        status: "failed",
        error,
      });
      continue;
    }

    const effectiveIntegrationSlugs = getEffectiveIntegrationSlugs(context);
    const maxActionsPerRun = getMaxActionsPerRun(context.policies);

    if (
      context.task.integrationSlugs.length > 0 &&
      effectiveIntegrationSlugs.length === 0
    ) {
      const error =
        "No allowed integrations remain for this task after policy filtering.";
      await completeRunWithError({
        convex,
        userId: context.task.userId,
        taskId: context.task._id,
        runId: context.run._id,
        error,
      });
      results.push({
        runId: context.run._id,
        status: "failed",
        error,
      });
      continue;
    }

    const session = await composio.create(
      context.task.userId || FALLBACK_EXTERNAL_USER_ID,
    );

    if (effectiveIntegrationSlugs.length > 0) {
      const { items } = await session.toolkits({
        toolkits: effectiveIntegrationSlugs,
      });
      const inactiveIntegrations = items
        .filter((toolkit) => !toolkit.connection?.isActive)
        .map((toolkit) => toolkit.slug);

      if (inactiveIntegrations.length > 0) {
        const error = `Task requires disconnected integrations: ${inactiveIntegrations.join(
          ", ",
        )}.`;
        await completeRunWithError({
          convex,
          userId: context.task.userId,
          taskId: context.task._id,
          runId: context.run._id,
          error,
        });
        results.push({
          runId: context.run._id,
          status: "failed",
          error,
        });
        continue;
      }
    }

    await convex.mutation(convexApi.autonomous.recordEvent, {
      userId: context.task.userId,
      taskId: context.task._id,
      runId: context.run._id,
      type: "run_claimed",
      source: "executor",
      payload: {
        title: context.task.title,
        scheduledFor: context.run.scheduledFor ?? null,
        integrationSlugs: effectiveIntegrationSlugs,
        maxActionsPerRun,
      },
    });

    try {
      const tools = await session.tools();
      const result = await generateText({
        model: openai("gpt-5.4"),
        system: buildSystemPrompt({
          context,
          integrationSlugs: effectiveIntegrationSlugs,
          maxActionsPerRun,
        }),
        prompt: `Execute the autonomous task now. Current run ID: ${context.run._id}.`,
        tools,
        stopWhen: stepCountIs(Math.max(1, Math.min(maxActionsPerRun, 15))),
      });

      const summary =
        result.text.trim() ||
        "The run completed without a final natural-language summary.";
      const usage = result.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      await convex.mutation(convexApi.autonomous.completeRun, {
        runId: context.run._id,
        status: "succeeded",
        summary,
      });

      await convex.mutation(convexApi.autonomous.upsertMemory, {
        userId: context.task.userId,
        taskId: context.task._id,
        scope: "task",
        key: "last_run_summary",
        value: {
          runId: context.run._id,
          summary,
          completedAt: new Date().toISOString(),
        },
        source: "system",
      });

      await convex.mutation(convexApi.autonomous.recordEvent, {
        userId: context.task.userId,
        taskId: context.task._id,
        runId: context.run._id,
        type: "run_succeeded",
        source: "executor",
        payload: {
          summary,
          usage,
          integrations: effectiveIntegrationSlugs,
          maxActionsPerRun,
        },
      });

      if ((usage.totalTokens ?? 0) > 0) {
        await convex.mutation(convexApi.billing.recordUsage, {
          userId: context.task.userId,
          model: "gpt-5.4",
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
        });
      }

      results.push({
        runId: context.run._id,
        status: "succeeded",
        summary,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown autonomous execution failure.";

      await completeRunWithError({
        convex,
        userId: context.task.userId,
        taskId: context.task._id,
        runId: context.run._id,
        error: message,
      });

      results.push({
        runId: context.run._id,
        status: "failed",
        error: message,
      });
    }
  }

  const response: DispatchResponse = {
    queuedCount: queueResult.queuedCount,
    processedCount: results.length,
    results,
  };

  return Response.json(response);
}

export async function GET(req: Request) {
  return handleDispatch(req);
}

export async function POST(req: Request) {
  return handleDispatch(req);
}
