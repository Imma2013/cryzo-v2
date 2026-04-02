import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

import {
  autonomyModeValidator,
  deliveryChannelValidator,
  memoryScopeValidator,
  memorySourceValidator,
  resolvedApprovalStatusValidator,
  taskScheduleValidator,
  taskStatusValidator,
  terminalRunStatusValidator,
  triggerSourceValidator,
  triggerTypeValidator,
} from "./autonomySchema";
import type { RecentAutonomousRun } from "../lib/autonomy-run-history";

function nowIso() {
  return new Date().toISOString();
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function getNextRunAt(
  schedule:
    | {
        cadence: "manual" | "hourly" | "daily" | "weekly" | "custom";
        timezone?: string;
        cron?: string;
        cronHuman?: string;
        timeOfDay?: string;
        daysOfWeek?: number[];
        nextRunAt?: string;
        lastRunAt?: string;
      }
    | undefined,
  from = new Date(),
) {
  if (!schedule) {
    return undefined;
  }

  if (schedule.cadence === "manual") {
    return undefined;
  }

  if (schedule.cadence === "custom") {
    return schedule.nextRunAt;
  }

  if (schedule.cadence === "hourly") {
    return addHours(from, 1).toISOString();
  }

  const applyTimeOfDay = (base: Date) => {
    if (!schedule.timeOfDay) {
      return base;
    }

    const [rawHour, rawMinute] = schedule.timeOfDay.split(":");
    const hour = Number(rawHour);
    const minute = Number(rawMinute ?? "0");
    const next = new Date(base);
    next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
    return next;
  };

  if (schedule.cadence === "daily") {
    const sameDay = applyTimeOfDay(new Date(from));
    if (schedule.timeOfDay && sameDay.getTime() > from.getTime()) {
      return sameDay.toISOString();
    }

    return applyTimeOfDay(addDays(from, 1)).toISOString();
  }

  if (schedule.cadence === "weekly") {
    const allowedDays =
      schedule.daysOfWeek && schedule.daysOfWeek.length > 0
        ? [...schedule.daysOfWeek].sort((left, right) => left - right)
        : [from.getDay()];
    const currentDay = from.getDay();

    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = addDays(from, offset);
      if (!allowedDays.includes(candidate.getDay())) {
        continue;
      }

      const nextCandidate = applyTimeOfDay(candidate);
      if (nextCandidate.getTime() > from.getTime()) {
        return nextCandidate.toISOString();
      }
    }

    return applyTimeOfDay(addDays(from, 7)).toISOString();
  }

  return undefined;
}

function normalizeSchedule(args: {
  cadence: "manual" | "hourly" | "daily" | "weekly" | "custom";
  timezone?: string;
  cron?: string;
  cronHuman?: string;
  timeOfDay?: string;
  daysOfWeek?: number[];
  nextRunAt?: string;
  lastRunAt?: string;
}) {
  return {
    cadence: args.cadence,
    timezone: args.timezone,
    cron: args.cron,
    cronHuman: args.cronHuman,
    timeOfDay: args.timeOfDay,
    daysOfWeek: args.daysOfWeek,
    nextRunAt: args.nextRunAt,
    lastRunAt: args.lastRunAt,
  };
}

type TaskDoc = Doc<"autonomousTasks">;
type TaskScheduleDoc = Doc<"autonomousTaskSchedules">;

function mergeTaskWithSchedule(
  task: TaskDoc,
  scheduleDoc: TaskScheduleDoc | null,
) {
  return {
    ...task,
    schedule: scheduleDoc?.schedule ?? task.schedule,
    scheduleStatus: scheduleDoc?.status ?? task.status,
    scheduleId: scheduleDoc?._id ?? null,
  };
}

async function getScheduleByTaskId(
  ctx: any,
  taskId: Id<"autonomousTasks">,
) {
  return await ctx.db
    .query("autonomousTaskSchedules")
    .withIndex("by_task", (q: any) => q.eq("taskId", taskId))
    .unique();
}

async function getSchedulesByTaskIds(
  ctx: any,
  taskIds: Id<"autonomousTasks">[],
) {
  const uniqueTaskIds = [...new Set(taskIds)];
  const schedules = await Promise.all(
    uniqueTaskIds.map((taskId) => getScheduleByTaskId(ctx, taskId)),
  );

  return new Map(
    uniqueTaskIds.map((taskId, index) => [taskId, schedules[index] ?? null]),
  );
}

function toRecentAutonomousRun(
  run: Doc<"autonomousRuns">,
  task: Pick<Doc<"autonomousTasks">, "title" | "status"> | null,
): RecentAutonomousRun {
  return {
    ...run,
    taskTitle: task?.title ?? "Unknown task",
    taskStatus: task?.status ?? "archived",
  };
}

async function hasQueuedRunForTaskAt(
  ctx: any,
  taskId: Id<"autonomousTasks">,
  scheduledFor?: string,
) {
  const runs = await ctx.db
    .query("autonomousRuns")
    .withIndex("by_task_created", (q: any) => q.eq("taskId", taskId))
    .collect();

  return runs.some(
    (run: any) =>
      run.status === "queued" &&
      (run.scheduledFor ?? null) === (scheduledFor ?? null),
  );
}

export const createTask = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    instruction: v.string(),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    integrationSlugs: v.array(v.string()),
    deliveryChannels: v.array(deliveryChannelValidator),
    goals: v.array(v.string()),
    successCriteria: v.array(v.string()),
    workflowType: v.optional(v.string()),
    sourcePrompt: v.optional(v.string()),
    recipeMetadata: v.optional(v.any()),
    autonomyMode: autonomyModeValidator,
    triggerType: triggerTypeValidator,
    schedule: v.optional(taskScheduleValidator),
    memoryKey: v.optional(v.string()),
    policyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    const taskId = await ctx.db.insert("autonomousTasks", {
      userId: args.userId,
      title: args.title,
      instruction: args.instruction,
      workflowCode: args.workflowCode,
      inputSchema: args.inputSchema,
      outputSchema: args.outputSchema,
      defaultInputData: args.defaultInputData,
      status: "active",
      autonomyMode: args.autonomyMode,
      triggerType: args.triggerType,
      schedule: args.schedule ? normalizeSchedule(args.schedule) : undefined,
      integrationSlugs: args.integrationSlugs,
      deliveryChannels: args.deliveryChannels,
      goals: args.goals,
      successCriteria: args.successCriteria,
      workflowType: args.workflowType,
      sourcePrompt: args.sourcePrompt,
      recipeMetadata: args.recipeMetadata,
      memoryKey: args.memoryKey,
      policyKey: args.policyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (args.schedule) {
      await ctx.db.insert("autonomousTaskSchedules", {
        taskId,
        userId: args.userId,
        status: "active",
        schedule: normalizeSchedule(args.schedule),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return { taskId };
  },
});

export const listTasks = query({
  args: {
    userId: v.string(),
    status: v.optional(taskStatusValidator),
  },
  handler: async (ctx, args) => {
    const tasks = args.status
      ? await ctx.db
          .query("autonomousTasks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", args.userId).eq("status", args.status!),
          )
          .collect()
      : await ctx.db
          .query("autonomousTasks")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect();

    const scheduleMap = await getSchedulesByTaskIds(
      ctx,
      tasks.map((task) => task._id),
    );

    return tasks.map((task) =>
      mergeTaskWithSchedule(task, scheduleMap.get(task._id) ?? null),
    );
  },
});

export const listRecentRuns = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 12, 50));
    const runs = await ctx.db
      .query("autonomousRuns")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    const taskIds = [...new Set(runs.map((run) => run.taskId))];
    const tasks = await Promise.all(taskIds.map((taskId) => ctx.db.get(taskId)));
    const taskMap = new Map(
      tasks
        .filter((task): task is NonNullable<typeof task> => task !== null)
        .map((task) => [task._id, task]),
    );

    return runs.map((run) => toRecentAutonomousRun(run, taskMap.get(run.taskId) ?? null));
  },
});

export const listRecentEventsByTask = query({
  args: {
    taskId: v.id("autonomousTasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 10, 25));
    return await ctx.db
      .query("autonomousEvents")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(limit);
  },
});

export const listRecentEvents = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    return await ctx.db
      .query("autonomousEvents")
      .withIndex("by_user_created", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("autonomousTasks"),
    status: taskStatusValidator,
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: timestamp,
    });

    const scheduleDoc = await getScheduleByTaskId(ctx, args.taskId);
    if (scheduleDoc) {
      await ctx.db.patch(scheduleDoc._id, {
        status: args.status,
        updatedAt: timestamp,
      });
    }

    return { success: true };
  },
});

export const updateTaskDefinition = mutation({
  args: {
    taskId: v.id("autonomousTasks"),
    title: v.optional(v.string()),
    instruction: v.optional(v.string()),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    goals: v.optional(v.array(v.string())),
    successCriteria: v.optional(v.array(v.string())),
    integrationSlugs: v.optional(v.array(v.string())),
    deliveryChannels: v.optional(v.array(deliveryChannelValidator)),
    schedule: v.optional(taskScheduleValidator),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found.");
    }

    const timestamp = nowIso();
    const taskPatch: Record<string, unknown> = {
      updatedAt: timestamp,
    };

    if (args.title !== undefined) {
      taskPatch.title = args.title;
    }
    if (args.instruction !== undefined) {
      taskPatch.instruction = args.instruction;
    }
    if (args.workflowCode !== undefined) {
      taskPatch.workflowCode = args.workflowCode;
    }
    if (args.inputSchema !== undefined) {
      taskPatch.inputSchema = args.inputSchema;
    }
    if (args.outputSchema !== undefined) {
      taskPatch.outputSchema = args.outputSchema;
    }
    if (args.defaultInputData !== undefined) {
      taskPatch.defaultInputData = args.defaultInputData;
    }
    if (args.goals !== undefined) {
      taskPatch.goals = args.goals;
    }
    if (args.successCriteria !== undefined) {
      taskPatch.successCriteria = args.successCriteria;
    }
    if (args.integrationSlugs !== undefined) {
      taskPatch.integrationSlugs = args.integrationSlugs;
    }
    if (args.deliveryChannels !== undefined) {
      taskPatch.deliveryChannels = args.deliveryChannels;
    }
    if (args.schedule !== undefined) {
      taskPatch.schedule = normalizeSchedule(args.schedule);
    }

    await ctx.db.patch(args.taskId, taskPatch);

    if (args.schedule !== undefined) {
      const scheduleDoc = await getScheduleByTaskId(ctx, args.taskId);
      if (scheduleDoc) {
        await ctx.db.patch(scheduleDoc._id, {
          schedule: normalizeSchedule(args.schedule),
          updatedAt: timestamp,
        });
      } else {
        await ctx.db.insert("autonomousTaskSchedules", {
          taskId: args.taskId,
          userId: task.userId,
          status: task.status,
          schedule: normalizeSchedule(args.schedule),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    return { success: true };
  },
});

export const queueRun = mutation({
  args: {
    taskId: v.id("autonomousTasks"),
    userId: v.string(),
    triggerSource: triggerSourceValidator,
    scheduledFor: v.optional(v.string()),
    inputData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    const runId = await ctx.db.insert("autonomousRuns", {
      taskId: args.taskId,
      userId: args.userId,
      status: "queued",
      triggerSource: args.triggerSource,
      scheduledFor: args.scheduledFor,
      inputData: args.inputData,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return { runId };
  },
});

export const ensureScheduledRuns = mutation({
  args: {
    before: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const boundary = args.before ?? nowIso();
    const activeTasks = (await ctx.db.query("autonomousTasks").collect()).filter(
      (task) => task.status === "active",
    );

    let queuedCount = 0;
    for (const task of activeTasks) {
      const scheduleDoc = await getScheduleByTaskId(ctx, task._id);
      const schedule = scheduleDoc?.schedule ?? task.schedule;
      const scheduledFor = schedule?.nextRunAt;
      if (!scheduledFor || scheduledFor > boundary) {
        continue;
      }

      const alreadyQueued = await hasQueuedRunForTaskAt(
        ctx,
        task._id,
        scheduledFor,
      );

      if (alreadyQueued) {
        continue;
      }

      const timestamp = nowIso();
      await ctx.db.insert("autonomousRuns", {
        taskId: task._id,
        userId: task.userId,
        status: "queued",
        triggerSource: "scheduler",
        scheduledFor,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      queuedCount += 1;

      const nextSchedule = normalizeSchedule({
        ...schedule,
        lastRunAt: scheduledFor,
        nextRunAt: getNextRunAt(
          {
            ...schedule,
            lastRunAt: scheduledFor,
          },
          new Date(scheduledFor),
        ),
      });

      await ctx.db.patch(task._id, {
        schedule: nextSchedule,
        updatedAt: timestamp,
      });

      if (scheduleDoc) {
        await ctx.db.patch(scheduleDoc._id, {
          schedule: nextSchedule,
          updatedAt: timestamp,
        });
      } else {
        await ctx.db.insert("autonomousTaskSchedules", {
          taskId: task._id,
          userId: task.userId,
          status: task.status,
          schedule: nextSchedule,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    return { queuedCount };
  },
});

export const listDueRuns = query({
  args: {
    before: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const boundary = args.before ?? nowIso();
    const queuedRuns = await ctx.db
      .query("autonomousRuns")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", boundary),
      )
      .collect();

    return queuedRuns;
  },
});

export const claimNextDueRun = mutation({
  args: {
    before: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const boundary = args.before ?? nowIso();
    const queuedRuns = await ctx.db
      .query("autonomousRuns")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", boundary),
      )
      .collect();

    const sortedRuns = queuedRuns.sort((left, right) => {
      const leftKey = left.scheduledFor ?? left.createdAt;
      const rightKey = right.scheduledFor ?? right.createdAt;
      return leftKey.localeCompare(rightKey);
    });

    for (const run of sortedRuns) {
      const task = await ctx.db.get(run.taskId);
      if (!task || task.status !== "active") {
        continue;
      }

      const timestamp = nowIso();
      await ctx.db.patch(run._id, {
        status: "running",
        startedAt: timestamp,
        updatedAt: timestamp,
      });

      return {
        claimed: true,
        runId: run._id,
        taskId: task._id,
        userId: run.userId,
      };
    }

    return { claimed: false };
  },
});

export const startRun = mutation({
  args: {
    runId: v.id("autonomousRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found.");
    }

    if (run.status !== "queued") {
      throw new Error("Only queued runs can be started.");
    }

    const timestamp = nowIso();
    await ctx.db.patch(args.runId, {
      status: "running",
      startedAt: timestamp,
      updatedAt: timestamp,
    });

    return { success: true };
  },
});

export const getRunDispatchContext = query({
  args: {
    runId: v.id("autonomousRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return null;
    }

    const task = await ctx.db.get(run.taskId);
    if (!task) {
      return null;
    }
    const scheduleDoc = await getScheduleByTaskId(ctx, task._id);

    const [taskMemory, policies, approvals] = await Promise.all([
      ctx.db
        .query("autonomousMemory")
        .withIndex("by_task_key", (q) => q.eq("taskId", task._id))
        .collect(),
      ctx.db
        .query("autonomousPolicies")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect(),
      ctx.db
        .query("autonomousApprovals")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
    ]);

    const userMemory = await ctx.db
      .query("autonomousMemory")
      .withIndex("by_user_scope_key", (q) =>
        q.eq("userId", task.userId).eq("scope", "user"),
      )
      .collect();

    return {
      run,
      task: mergeTaskWithSchedule(task, scheduleDoc),
      memory: {
        user: userMemory,
        task: taskMemory,
      },
      policies,
      approvals,
    };
  },
});

export const completeRun = mutation({
  args: {
    runId: v.id("autonomousRuns"),
    status: terminalRunStatusValidator,
    summary: v.optional(v.string()),
    outputData: v.optional(v.any()),
    error: v.optional(v.string()),
    score: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found.");
    }

    await ctx.db.patch(args.runId, {
      status: args.status,
      summary: args.summary,
      outputData: args.outputData,
      error: args.error,
      score: args.score,
      completedAt:
        args.status === "awaiting_approval" ? undefined : timestamp,
      updatedAt: timestamp,
    });

    if (args.summary) {
      await ctx.db.patch(run.taskId, {
        lastOutcomeSummary: args.summary,
        updatedAt: timestamp,
      });
    }

    return { success: true };
  },
});

export const requeueRun = mutation({
  args: {
    runId: v.id("autonomousRuns"),
    scheduledFor: v.optional(v.string()),
    triggerSource: v.optional(triggerSourceValidator),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found.");
    }

    await ctx.db.patch(args.runId, {
      status: "queued",
      scheduledFor: args.scheduledFor ?? run.scheduledFor,
      triggerSource: args.triggerSource ?? "retry",
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
      updatedAt: nowIso(),
    });

    return { success: true };
  },
});

export const rescheduleTask = mutation({
  args: {
    taskId: v.id("autonomousTasks"),
    nextRunAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found.");
    }

    const scheduleDoc = await getScheduleByTaskId(ctx, args.taskId);
    const baseSchedule = scheduleDoc?.schedule ?? task.schedule;
    if (!baseSchedule) {
      throw new Error("Task does not have a schedule.");
    }

    const timestamp = nowIso();
    const nextSchedule = normalizeSchedule({
      ...baseSchedule,
      nextRunAt:
        args.nextRunAt ??
        getNextRunAt(baseSchedule, new Date()),
    });

    await ctx.db.patch(args.taskId, {
      schedule: nextSchedule,
      updatedAt: timestamp,
    });

    if (scheduleDoc) {
      await ctx.db.patch(scheduleDoc._id, {
        schedule: nextSchedule,
        updatedAt: timestamp,
      });
    } else {
      await ctx.db.insert("autonomousTaskSchedules", {
        taskId: args.taskId,
        userId: task.userId,
        status: task.status,
        schedule: nextSchedule,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return { success: true };
  },
});

export const upsertMemory = mutation({
  args: {
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    scope: memoryScopeValidator,
    key: v.string(),
    value: v.any(),
    source: memorySourceValidator,
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();

    const existing =
      args.scope === "task" && args.taskId
        ? await ctx.db
            .query("autonomousMemory")
            .withIndex("by_task_key", (q) =>
              q.eq("taskId", args.taskId).eq("key", args.key),
            )
            .unique()
        : await ctx.db
            .query("autonomousMemory")
            .withIndex("by_user_scope_key", (q) =>
              q.eq("userId", args.userId).eq("scope", args.scope).eq("key", args.key),
            )
            .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        source: args.source,
        updatedAt: timestamp,
      });

      return { memoryId: existing._id, updated: true };
    }

    const memoryId = await ctx.db.insert("autonomousMemory", {
      userId: args.userId,
      taskId: args.taskId,
      scope: args.scope,
      key: args.key,
      value: args.value,
      source: args.source,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return { memoryId, updated: false };
  },
});

export const upsertPolicy = mutation({
  args: {
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    name: v.string(),
    approvalMode: autonomyModeValidator,
    maxActionsPerRun: v.optional(v.number()),
    escalationChannels: v.array(v.string()),
    allowedIntegrationSlugs: v.array(v.string()),
    blockedIntegrationSlugs: v.array(v.string()),
    policy: v.any(),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    const existing = await ctx.db
      .query("autonomousPolicies")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", args.userId).eq("name", args.name),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        taskId: args.taskId,
        approvalMode: args.approvalMode,
        maxActionsPerRun: args.maxActionsPerRun,
        escalationChannels: args.escalationChannels,
        allowedIntegrationSlugs: args.allowedIntegrationSlugs,
        blockedIntegrationSlugs: args.blockedIntegrationSlugs,
        policy: args.policy,
        updatedAt: timestamp,
      });

      return { policyId: existing._id, updated: true };
    }

    const policyId = await ctx.db.insert("autonomousPolicies", {
      userId: args.userId,
      taskId: args.taskId,
      name: args.name,
      approvalMode: args.approvalMode,
      maxActionsPerRun: args.maxActionsPerRun,
      escalationChannels: args.escalationChannels,
      allowedIntegrationSlugs: args.allowedIntegrationSlugs,
      blockedIntegrationSlugs: args.blockedIntegrationSlugs,
      policy: args.policy,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return { policyId, updated: false };
  },
});

export const createApprovalRequest = mutation({
  args: {
    taskId: v.id("autonomousTasks"),
    runId: v.id("autonomousRuns"),
    userId: v.string(),
    requestedAction: v.string(),
    reason: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = nowIso();
    const approvalId = await ctx.db.insert("autonomousApprovals", {
      taskId: args.taskId,
      runId: args.runId,
      userId: args.userId,
      status: "pending",
      requestedAction: args.requestedAction,
      reason: args.reason,
      expiresAt: args.expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.patch(args.runId, {
      status: "awaiting_approval",
      updatedAt: timestamp,
    });

    return { approvalId };
  },
});

export const resolveApprovalRequest = mutation({
  args: {
    approvalId: v.id("autonomousApprovals"),
    status: resolvedApprovalStatusValidator,
    decisionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      throw new Error("Approval request not found.");
    }

    const timestamp = nowIso();
    await ctx.db.patch(args.approvalId, {
      status: args.status,
      decisionNote: args.decisionNote,
      updatedAt: timestamp,
    });

    await ctx.db.patch(approval.runId, {
      status: args.status === "approved" ? "queued" : "cancelled",
      updatedAt: timestamp,
      completedAt: args.status === "approved" ? undefined : timestamp,
    });

    return { success: true };
  },
});

export const recordEvent = mutation({
  args: {
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    runId: v.optional(v.id("autonomousRuns")),
    type: v.string(),
    source: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("autonomousEvents", {
      userId: args.userId,
      taskId: args.taskId,
      runId: args.runId,
      type: args.type,
      source: args.source,
      payload: args.payload,
      createdAt: nowIso(),
    });

    return { eventId };
  },
});
