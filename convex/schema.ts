import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  chats: defineTable({
    userId: v.string(),
    title: v.string(),
    model: v.optional(v.string()),
    messages: v.array(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),
  billingProfiles: defineTable({
    userId: v.string(),
    plan: v.union(
      v.literal("free"),
      v.literal("pro"),
      v.literal("business"),
      v.literal("enterprise"),
    ),
    subscriptionStatus: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    monthlyTokens: v.optional(v.number()),
    usedTokens: v.optional(v.number()),
    monthlyCredits: v.optional(v.number()),
    usedCredits: v.optional(v.number()),
    totalTokensUsed: v.number(),
    cycleStart: v.string(),
    cycleEnd: v.string(),
    isTrial: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_user", ["userId"]),
  usageEvents: defineTable({
    userId: v.string(),
    plan: v.string(),
    model: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    createdAt: v.string(),
  }).index("by_user_created", ["userId", "createdAt"]),

  recipes: defineTable({
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    instruction: v.string(),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    mode: v.union(v.literal("schedule"), v.literal("trigger")),
    cron: v.optional(v.string()),
    cronHuman: v.optional(v.string()),
    timezone: v.string(),
    integrationSlugs: v.array(v.string()),
    scheduleParams: v.optional(v.any()),
    triggerSlug: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    triggerConfig: v.optional(v.any()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
    nextRunAt: v.optional(v.string()),
    lastRunAt: v.optional(v.string()),
    lastRunResult: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_status_next_run", ["status", "nextRunAt"])
    .index("by_trigger", ["triggerId"])
    .index("by_mode_status", ["mode", "status"]),
  recipeExecutions: defineTable({
    recipeId: v.id("recipes"),
    userId: v.string(),
    source: v.union(v.literal("schedule"), v.literal("trigger"), v.literal("manual")),
    status: v.union(v.literal("running"), v.literal("success"), v.literal("failed")),
    inputData: v.optional(v.any()),
    outputData: v.optional(v.any()),
    error: v.optional(v.string()),
    triggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
    createdAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_recipe", ["recipeId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),
  recipeEvents: defineTable({
    recipeId: v.id("recipes"),
    userId: v.string(),
    source: v.union(v.literal("schedule"), v.literal("trigger")),
    triggerId: v.optional(v.string()),
    triggerSlug: v.optional(v.string()),
    payload: v.any(),
    result: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_recipe", ["recipeId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),
});
