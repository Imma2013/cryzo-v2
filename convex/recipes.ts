import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    instruction: v.string(),
    mode: v.optional(v.union(v.literal("schedule"), v.literal("trigger"))),
    cron: v.optional(v.string()),
    cronHuman: v.optional(v.string()),
    timezone: v.string(),
    integrationSlugs: v.array(v.string()),
    triggerSlug: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    triggerConfig: v.optional(v.any()),
    nextRunAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("recipes", {
      userId: args.userId,
      title: args.title,
      instruction: args.instruction,
      mode: args.mode ?? "schedule",
      cron: args.cron,
      cronHuman: args.cronHuman,
      timezone: args.timezone,
      integrationSlugs: args.integrationSlugs,
      triggerSlug: args.triggerSlug,
      triggerId: args.triggerId,
      triggerConfig: args.triggerConfig,
      status: "active",
      nextRunAt: args.nextRunAt,
      createdAt: now,
      updatedAt: now,
    });
    return { recipeId: id };
  },
});

export const list = query({
  args: {
    userId: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"))),
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

export const setStatus = mutation({
  args: {
    recipeId: v.id("recipes"),
    status: v.union(v.literal("active"), v.literal("paused")),
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
