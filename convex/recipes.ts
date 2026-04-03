import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const recipeStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("paused"),
);

const executionSource = v.union(
  v.literal("schedule"),
  v.literal("trigger"),
  v.literal("manual"),
);

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    instruction: v.string(),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    mode: v.optional(v.union(v.literal("schedule"), v.literal("trigger"))),
    cron: v.optional(v.string()),
    cronHuman: v.optional(v.string()),
    timezone: v.string(),
    integrationSlugs: v.array(v.string()),
    scheduleParams: v.optional(v.any()),
    triggerSlug: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    triggerConfig: v.optional(v.any()),
    nextRunAt: v.optional(v.string()),
    status: v.optional(recipeStatus),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const mode = args.mode ?? "schedule";
    const status =
      args.status ??
      (mode === "trigger" || args.nextRunAt || args.triggerId ? "active" : "draft");

    const id = await ctx.db.insert("recipes", {
      userId: args.userId,
      title: args.title,
      description: args.description,
      instruction: args.instruction,
      workflowCode: args.workflowCode,
      inputSchema: args.inputSchema,
      outputSchema: args.outputSchema,
      defaultInputData: args.defaultInputData,
      mode,
      cron: args.cron,
      cronHuman: args.cronHuman,
      timezone: args.timezone,
      integrationSlugs: args.integrationSlugs,
      scheduleParams: args.scheduleParams,
      triggerSlug: args.triggerSlug,
      triggerId: args.triggerId,
      triggerConfig: args.triggerConfig,
      status,
      nextRunAt: args.nextRunAt,
      createdAt: now,
      updatedAt: now,
    });
    return { recipeId: id };
  },
});

export const update = mutation({
  args: {
    recipeId: v.id("recipes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    instruction: v.optional(v.string()),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    integrationSlugs: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    await ctx.db.patch(args.recipeId, {
      title: args.title ?? recipe.title,
      description: args.description ?? recipe.description,
      instruction: args.instruction ?? recipe.instruction,
      workflowCode: args.workflowCode ?? recipe.workflowCode,
      inputSchema: args.inputSchema ?? recipe.inputSchema,
      outputSchema: args.outputSchema ?? recipe.outputSchema,
      defaultInputData: args.defaultInputData ?? recipe.defaultInputData,
      integrationSlugs: args.integrationSlugs ?? recipe.integrationSlugs,
      timezone: args.timezone ?? recipe.timezone,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

export const configureSchedule = mutation({
  args: {
    recipeId: v.id("recipes"),
    cron: v.optional(v.string()),
    cronHuman: v.optional(v.string()),
    timezone: v.optional(v.string()),
    scheduleParams: v.optional(v.any()),
    nextRunAt: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recipeId, {
      cron: args.cron,
      cronHuman: args.cronHuman,
      timezone: args.timezone,
      scheduleParams: args.scheduleParams,
      nextRunAt: args.nextRunAt,
      status: args.status,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const list = query({
  args: {
    userId: v.string(),
    status: v.optional(recipeStatus),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    if (args.status) {
      return results.filter((r) => r.status === args.status);
    }
    return results;
  },
});

export const getById = query({
  args: {
    recipeId: v.id("recipes"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.userId !== args.userId) {
      return null;
    }
    return recipe;
  },
});

export const setStatus = mutation({
  args: {
    recipeId: v.id("recipes"),
    status: recipeStatus,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recipeId, {
      status: args.status,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const markRan = mutation({
  args: {
    recipeId: v.id("recipes"),
    nextRunAt: v.optional(v.string()),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recipeId, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: args.nextRunAt,
      lastRunResult: args.result,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const beginExecution = mutation({
  args: {
    recipeId: v.id("recipes"),
    userId: v.string(),
    source: executionSource,
    inputData: v.optional(v.any()),
    triggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("recipeExecutions", {
      ...args,
      status: "running",
      createdAt: new Date().toISOString(),
    });

    return { executionId: id };
  },
});

export const completeExecution = mutation({
  args: {
    executionId: v.id("recipeExecutions"),
    status: v.union(v.literal("success"), v.literal("failed")),
    outputData: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: args.status,
      outputData: args.outputData,
      error: args.error,
      completedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const listExecutions = query({
  args: {
    recipeId: v.id("recipes"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe || recipe.userId !== args.userId) {
      return [];
    }

    const executions = await ctx.db
      .query("recipeExecutions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .order("desc")
      .take(args.limit ?? 10);

    return executions;
  },
});

export const getDueRecipes = query({
  args: { now: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("recipes")
      .withIndex("by_status_next_run", (q) => q.eq("status", "active"))
      .collect();

    return all.filter(
      (r) =>
        r.mode === "schedule" &&
        r.nextRunAt !== undefined &&
        r.nextRunAt <= args.now,
    );
  },
});

export const getTriggerRecipes = query({
  args: {
    userId: v.string(),
    triggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const activeTriggerRecipes = await ctx.db
      .query("recipes")
      .withIndex("by_mode_status", (q) =>
        q.eq("mode", "trigger").eq("status", "active"),
      )
      .collect();

    return activeTriggerRecipes.filter((recipe) => {
      if (recipe.userId !== args.userId) {
        return false;
      }

      if (args.triggerId && recipe.triggerId === args.triggerId) {
        return true;
      }

      if (args.triggerSlug && recipe.triggerSlug === args.triggerSlug) {
        return true;
      }

      return false;
    });
  },
});

export const recordEvent = mutation({
  args: {
    recipeId: v.id("recipes"),
    userId: v.string(),
    source: v.union(v.literal("schedule"), v.literal("trigger")),
    triggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
    payload: v.any(),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("recipeEvents", {
      ...args,
      createdAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recipeId);
    return { success: true };
  },
});
