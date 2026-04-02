"use node";

import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { v } from "convex/values";

import { api } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { getAiModelName } from "../lib/ai-model";
import { executeAutonomousWorkflow } from "../lib/autonomous-workflows";

const FALLBACK_EXTERNAL_USER_ID =
  "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252";

function getMaxActionsPerRun(
  policies: Array<{ maxActionsPerRun?: number }>,
) {
  const positiveCaps = policies
    .map((policy) => policy.maxActionsPerRun)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );

  if (positiveCaps.length === 0) {
    return 10;
  }

  return Math.min(...positiveCaps);
}

function getEffectiveIntegrationSlugs(context: {
  task: { integrationSlugs: string[] };
  policies: Array<{
    allowedIntegrationSlugs: string[];
    blockedIntegrationSlugs: string[];
  }>;
}) {
  const taskIntegrations = context.task.integrationSlugs;
  const allowedSets = context.policies
    .map((policy) => policy.allowedIntegrationSlugs)
    .filter((slugs) => slugs.length > 0);
  const blocked = new Set(
    context.policies.flatMap((policy) => policy.blockedIntegrationSlugs),
  );

  const allowSet =
    allowedSets.length === 0
      ? null
      : new Set(allowedSets.flatMap((slugs) => slugs));

  return taskIntegrations.filter((slug) => {
    if (blocked.has(slug)) {
      return false;
    }

    if (allowSet && !allowSet.has(slug)) {
      return false;
    }

    return true;
  });
}

async function completeRunWithError(args: {
  ctx: any;
  userId: string;
  taskId: any;
  runId: any;
  error: string;
  outputData?: unknown;
}) {
  const { ctx, userId, taskId, runId, error, outputData } = args;
  await ctx.runMutation(api.autonomous.completeRun, {
    runId,
    status: "failed",
    error,
    outputData: outputData ?? { error },
  });
  await ctx.runMutation(api.autonomous.recordEvent, {
    userId,
    taskId,
    runId,
    type: "run_failed",
    source: "executor",
    payload: { error },
  });
}

type DispatchCycleResult = {
  queuedCount: number;
  processedCount: number;
  results: Array<Record<string, unknown>>;
};

async function executeRunById(args: {
  ctx: any;
  composio: any;
  runId: any;
  alreadyRunning?: boolean;
}): Promise<Record<string, unknown>> {
  const { ctx, composio, runId, alreadyRunning = false } = args;

  if (!alreadyRunning) {
    await ctx.runMutation(api.autonomous.startRun, {
      runId,
    });
  }

  const context = await ctx.runQuery(api.autonomous.getRunDispatchContext, {
    runId,
  });

  if (!context) {
    await ctx.runMutation(api.autonomous.completeRun, {
      runId,
      status: "failed",
      error: "Dispatch context was unavailable for the claimed run.",
      outputData: {
        error: "Dispatch context was unavailable for the claimed run.",
      },
    });
    return {
      runId,
      status: "failed",
      error: "Dispatch context was unavailable for the claimed run.",
    };
  }

  const billingSummary = await ctx.runQuery(api.billing.getBillingSummary, {
    userId: context.task.userId,
  });

  if ((billingSummary.remainingTokens ?? 0) <= 0) {
    const error =
      "The user has no remaining tokens for autonomous execution in the current billing window.";
    await completeRunWithError({
      ctx,
      userId: context.task.userId,
      taskId: context.task._id,
      runId: context.run._id,
      error,
    });
    return {
      runId: context.run._id,
      status: "failed",
      error,
    };
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
      ctx,
      userId: context.task.userId,
      taskId: context.task._id,
      runId: context.run._id,
      error,
    });
    return {
      runId: context.run._id,
      status: "failed",
      error,
    };
  }

  const session = await composio.create(
    context.task.userId || FALLBACK_EXTERNAL_USER_ID,
  );

  if (effectiveIntegrationSlugs.length > 0) {
    const { items } = await session.toolkits({
      toolkits: effectiveIntegrationSlugs,
    });
    const inactiveIntegrations = items
      .filter((toolkit: any) => !toolkit.connection?.isActive)
      .map((toolkit: any) => toolkit.slug);

    if (inactiveIntegrations.length > 0) {
      const error = `Task requires disconnected integrations: ${inactiveIntegrations.join(
        ", ",
      )}.`;
      await completeRunWithError({
        ctx,
        userId: context.task.userId,
        taskId: context.task._id,
        runId: context.run._id,
        error,
      });
      return {
        runId: context.run._id,
        status: "failed",
        error,
      };
    }
  }

  await ctx.runMutation(api.autonomous.recordEvent, {
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
    const workflowResult = await executeAutonomousWorkflow({
      ctx,
      session,
      context,
      integrationSlugs: effectiveIntegrationSlugs,
      maxActionsPerRun,
    });
    const summary = workflowResult.summary;
    const usage = workflowResult.usage;

    await ctx.runMutation(api.autonomous.completeRun, {
      runId: context.run._id,
      status: "succeeded",
      summary,
      outputData: workflowResult.outputData,
    });
    await ctx.runMutation(api.autonomous.upsertMemory, {
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
    await ctx.runMutation(api.autonomous.recordEvent, {
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
        workflowType: context.task.workflowType ?? "general_recurring_task",
        checkpoints: workflowResult.checkpoints,
      },
    });

    if ((usage.totalTokens ?? 0) > 0) {
      await ctx.runMutation(api.billing.recordUsage, {
        userId: context.task.userId,
        model: getAiModelName(),
        taskId: context.task._id,
        runId: context.run._id,
        workflowType: context.task.workflowType ?? "general_recurring_task",
        triggerSource: context.run.triggerSource,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      });
    }

    return {
      runId: context.run._id,
      status: "succeeded",
      summary,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown autonomous execution failure.";
    await completeRunWithError({
      ctx,
      userId: context.task.userId,
      taskId: context.task._id,
      runId: context.run._id,
      error: message,
    });
    return {
      runId: context.run._id,
      status: "failed",
      error: message,
    };
  }
}

export const executeQueuedRun = internalAction({
  args: {
    runId: v.id("autonomousRuns"),
    alreadyRunning: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const composio = new Composio({ provider: new VercelProvider() });
    return executeRunById({
      ctx,
      composio,
      runId: args.runId,
      alreadyRunning: args.alreadyRunning ?? false,
    });
  },
});

export const dispatchScheduledRuns = internalAction({
  args: {},
  handler: async (ctx): Promise<DispatchCycleResult> => {
    const composio = new Composio({ provider: new VercelProvider() });
    const queueResult: { queuedCount: number } = await ctx.runMutation(
      api.autonomous.ensureScheduledRuns,
      {},
    );
    const results: Array<Record<string, unknown>> = [];

    for (let index = 0; index < 5; index += 1) {
      const claim = await ctx.runMutation(api.autonomous.claimNextDueRun, {});
      if (!claim.claimed || !claim.runId) {
        break;
      }
      const result = await executeRunById({
        ctx,
        composio,
        runId: claim.runId,
        alreadyRunning: true,
      });
      results.push(result);
    }

    await ctx.runMutation(api.autonomous.recordEvent, {
      userId: "system",
      type: "scheduler_cycle_completed",
      source: "convex_cron",
      payload: {
        queuedCount: queueResult.queuedCount,
        processedCount: results.length,
        results,
      },
    });

    return {
      queuedCount: queueResult.queuedCount,
      processedCount: results.length,
      results,
    };
  },
});
