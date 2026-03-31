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
});
