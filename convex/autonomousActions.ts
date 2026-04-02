"use node";

import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function queueAndExecuteTaskNow(
  ctx: any,
  args: {
    taskId: Id<"autonomousTasks">;
    userId: string;
    inputData?: unknown;
  },
): Promise<{
  success: true;
  queued: true;
  runId: Id<"autonomousRuns">;
  dispatchStarted: boolean;
  dispatchError?: string;
}> {
  const tasks: Array<{
    _id: Id<"autonomousTasks">;
    status: "active" | "paused" | "archived";
  }> = await ctx.runQuery(api.autonomous.listTasks, {
    userId: args.userId,
  });
  const matchedTask = tasks.find(
    (entry: { _id: Id<"autonomousTasks"> }) => entry._id === args.taskId,
  );

  if (!matchedTask) {
    throw new Error("Task not found for this user.");
  }

  if (matchedTask.status !== "active") {
    throw new Error("Only active tasks can be run immediately.");
  }

  const queuedAt = new Date().toISOString();
  const queueResult: { runId: Id<"autonomousRuns"> } = await ctx.runMutation(
    api.autonomous.queueRun,
    {
      taskId: args.taskId,
      userId: args.userId,
      triggerSource: "manual",
      scheduledFor: queuedAt,
      inputData: args.inputData,
    },
  );

  try {
    await ctx.runAction(internal.autonomousRuntime.executeQueuedRun, {
      runId: queueResult.runId,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Manual execution failed after the run was queued.";

    await ctx.runMutation(api.autonomous.recordEvent, {
      userId: args.userId,
      taskId: args.taskId,
      runId: queueResult.runId,
      type: "manual_dispatch_failed",
      source: "autonomous_action",
      payload: {
        error: message,
        queuedAt,
      },
    });

    return {
      success: true,
      queued: true,
      runId: queueResult.runId,
      dispatchStarted: false,
      dispatchError: message,
    };
  }

  return {
    success: true,
    queued: true,
    runId: queueResult.runId,
    dispatchStarted: true,
  };
}

export const runTaskNow = action({
  args: {
    taskId: v.id("autonomousTasks"),
    userId: v.string(),
    inputData: v.optional(v.any()),
  },
  handler: async (
    ctx,
    args,
  ) => queueAndExecuteTaskNow(ctx, args),
});

export const executeTaskRecipe = action({
  args: {
    taskId: v.id("autonomousTasks"),
    userId: v.string(),
    inputData: v.optional(v.any()),
  },
  handler: async (ctx, args) => queueAndExecuteTaskNow(ctx, args),
});
