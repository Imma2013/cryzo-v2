import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  approvalStatusValidator,
  autonomyModeValidator,
  deliveryChannelValidator,
  memoryScopeValidator,
  memorySourceValidator,
  runStatusValidator,
  taskScheduleValidator,
  taskStatusValidator,
  triggerSourceValidator,
  triggerTypeValidator,
} from "./autonomySchema";

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
    taskId: v.optional(v.id("autonomousTasks")),
    runId: v.optional(v.id("autonomousRuns")),
    workflowType: v.optional(v.string()),
    triggerSource: v.optional(triggerSourceValidator),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    createdAt: v.string(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_run", ["runId"]),
  autonomousTasks: defineTable({
    userId: v.string(),
    title: v.string(),
    instruction: v.string(),
    workflowCode: v.optional(v.string()),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    defaultInputData: v.optional(v.any()),
    status: taskStatusValidator,
    autonomyMode: autonomyModeValidator,
    triggerType: triggerTypeValidator,
    schedule: v.optional(taskScheduleValidator),
    integrationSlugs: v.array(v.string()),
    deliveryChannels: v.optional(v.array(deliveryChannelValidator)),
    goals: v.array(v.string()),
    successCriteria: v.array(v.string()),
    workflowType: v.optional(v.string()),
    sourcePrompt: v.optional(v.string()),
    recipeMetadata: v.optional(v.any()),
    memoryKey: v.optional(v.string()),
    policyKey: v.optional(v.string()),
    lastOutcomeSummary: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),
  autonomousTaskSchedules: defineTable({
    taskId: v.id("autonomousTasks"),
    userId: v.string(),
    status: taskStatusValidator,
    schedule: taskScheduleValidator,
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_task", ["taskId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_status_next_run", ["status", "schedule.nextRunAt"]),
  autonomousRuns: defineTable({
    taskId: v.id("autonomousTasks"),
    userId: v.string(),
    status: runStatusValidator,
    triggerSource: triggerSourceValidator,
    scheduledFor: v.optional(v.string()),
    inputData: v.optional(v.any()),
    outputData: v.optional(v.any()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    error: v.optional(v.string()),
    summary: v.optional(v.string()),
    score: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status_scheduled", ["status", "scheduledFor"]),
  autonomousMemory: defineTable({
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    scope: memoryScopeValidator,
    key: v.string(),
    value: v.any(),
    source: memorySourceValidator,
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user_scope_key", ["userId", "scope", "key"])
    .index("by_task_key", ["taskId", "key"]),
  autonomousPolicies: defineTable({
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    name: v.string(),
    approvalMode: autonomyModeValidator,
    maxActionsPerRun: v.optional(v.number()),
    escalationChannels: v.array(v.string()),
    allowedIntegrationSlugs: v.array(v.string()),
    blockedIntegrationSlugs: v.array(v.string()),
    policy: v.any(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user_name", ["userId", "name"])
    .index("by_task", ["taskId"]),
  autonomousEvents: defineTable({
    userId: v.string(),
    taskId: v.optional(v.id("autonomousTasks")),
    runId: v.optional(v.id("autonomousRuns")),
    type: v.string(),
    source: v.string(),
    payload: v.any(),
    createdAt: v.string(),
  })
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_user_created", ["userId", "createdAt"]),
  autonomousApprovals: defineTable({
    taskId: v.id("autonomousTasks"),
    runId: v.id("autonomousRuns"),
    userId: v.string(),
    status: approvalStatusValidator,
    requestedAction: v.string(),
    reason: v.optional(v.string()),
    decisionNote: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_user_status", ["userId", "status"]),
});
