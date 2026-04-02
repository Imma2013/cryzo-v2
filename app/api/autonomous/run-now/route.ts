import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { ConvexHttpClient } from "convex/browser";
import { generateText, stepCountIs } from "ai";

import { api as convexApi } from "../../../../convex/_generated/api";
import { getAiModel, getAiModelName } from "../../../../lib/ai-model";
import {
  buildSystemPrompt,
  getEffectiveIntegrationSlugs,
  getMaxActionsPerRun,
} from "../../../../lib/autonomy-executor";

export async function POST(req: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_CONVEX_URL is not configured." },
      { status: 500 },
    );
  }

  let taskId: string;
  let userId: string;
  try {
    const body = await req.json();
    taskId = body.taskId;
    userId = body.userId;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!taskId || !userId) {
    return Response.json(
      { error: "taskId and userId are required." },
      { status: 400 },
    );
  }

  const convex = new ConvexHttpClient(convexUrl);

  const queueResult = await convex.mutation(convexApi.autonomous.queueRun, {
    taskId: taskId as never,
    userId,
    triggerSource: "manual",
    scheduledFor: new Date().toISOString(),
  });

  const { runId } = queueResult;

  await convex.mutation(convexApi.autonomous.startRun, {
    runId,
  });

  const context = await convex.query(
    convexApi.autonomous.getRunDispatchContext,
    { runId },
  );

  if (!context) {
    await convex.mutation(convexApi.autonomous.completeRun, {
      runId,
      status: "failed",
      error: "Dispatch context was unavailable for this run.",
    });
    return Response.json(
      { error: "Dispatch context unavailable." },
      { status: 500 },
    );
  }

  const billing = await convex.query(convexApi.billing.getBillingSummary, {
    userId: context.task.userId,
  });

  if ((billing.remainingTokens ?? 0) <= 0) {
    const error =
      "No remaining tokens for autonomous execution in the current billing window.";
    await convex.mutation(convexApi.autonomous.completeRun, {
      runId,
      status: "failed",
      error,
    });
    return Response.json({ error }, { status: 402 });
  }

  const effectiveIntegrationSlugs = getEffectiveIntegrationSlugs(context);
  const maxActionsPerRun = getMaxActionsPerRun(context.policies);

  const composio = new Composio({ provider: new VercelProvider() });
  const session = await composio.create(
    context.task.userId,
  );

  if (effectiveIntegrationSlugs.length > 0) {
    const { items } = await session.toolkits({
      toolkits: effectiveIntegrationSlugs,
    });
    const inactive = items
      .filter((t: any) => !t.connection?.isActive)
      .map((t: any) => t.slug);

    if (inactive.length > 0) {
      const error = `Task requires disconnected integrations: ${inactive.join(", ")}.`;
      await convex.mutation(convexApi.autonomous.completeRun, {
        runId,
        status: "failed",
        error,
      });
      return Response.json({ error }, { status: 400 });
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
      triggerSource: "manual",
      integrationSlugs: effectiveIntegrationSlugs,
      maxActionsPerRun,
    },
  });

  try {
    const tools = await session.tools();
    const result = await generateText({
      model: getAiModel(),
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
      result.text.trim() || "Run completed without a final summary.";
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
      payload: { summary, usage, integrations: effectiveIntegrationSlugs },
    });

    if ((usage.totalTokens ?? 0) > 0) {
      await convex.mutation(convexApi.billing.recordUsage, {
        userId: context.task.userId,
        model: getAiModelName(),
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      });
    }

    return Response.json({ success: true, runId: context.run._id, summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown execution failure.";

    await convex.mutation(convexApi.autonomous.completeRun, {
      runId: context.run._id,
      status: "failed",
      error: message,
    });

    await convex.mutation(convexApi.autonomous.recordEvent, {
      userId: context.task.userId,
      taskId: context.task._id,
      runId: context.run._id,
      type: "run_failed",
      source: "executor",
      payload: { error: message },
    });

    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
