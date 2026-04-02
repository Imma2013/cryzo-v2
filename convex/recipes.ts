import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    instruction: v.string(),
    cron: v.string(),
    cronHuman: v.string(),
    timezone: v.string(),
    integrationSlugs: v.array(v.string()),
    nextRunAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const id = await ctx.db.insert("recipes", {
      userId: args.userId,
      title: args.title,
      instruction: args.instruction,
      cron: args.cron,
      cronHuman: args.cronHuman,
      timezone: args.timezone,
      integrationSlugs: args.integrationSlugs,
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
    nextRunAt: v.string(),
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
      (r) => r.nextRunAt !== undefined && r.nextRunAt <= args.now,
    );
  },
});

export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recipeId);
    return { success: true };
  },
});
