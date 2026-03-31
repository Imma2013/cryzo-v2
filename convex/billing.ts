import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentBillingWindow,
  getMonthlyTokensForPlan,
  LEGACY_TOKENS_PER_CREDIT,
  type PlanId,
} from "../lib/pricing";

function getStoredMonthlyTokens(profile: {
  monthlyTokens?: number;
  monthlyCredits?: number;
  plan: PlanId | string;
}) {
  return (
    profile.monthlyTokens ??
    (profile.monthlyCredits !== undefined
      ? profile.monthlyCredits * LEGACY_TOKENS_PER_CREDIT
      : getMonthlyTokensForPlan(profile.plan as PlanId))
  );
}

function getStoredUsedTokens(profile: {
  usedTokens?: number;
  usedCredits?: number;
}) {
  return (
    profile.usedTokens ??
    (profile.usedCredits !== undefined
      ? profile.usedCredits * LEGACY_TOKENS_PER_CREDIT
      : 0)
  );
}

async function getOrCreateBillingProfile(
  ctx: any,
  userId: string,
) {
  const now = new Date().toISOString();
  const currentWindow = getCurrentBillingWindow();
  const existing = await ctx.db
    .query("billingProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .unique();

  if (!existing) {
    const profile = {
      userId,
      plan: "free" as PlanId,
      subscriptionStatus: "free",
      monthlyTokens: getMonthlyTokensForPlan("free"),
      usedTokens: 0,
      totalTokensUsed: 0,
      cycleStart: currentWindow.cycleStart,
      cycleEnd: currentWindow.cycleEnd,
      isTrial: false,
      createdAt: now,
      updatedAt: now,
    };

    const id = await ctx.db.insert("billingProfiles", profile);
    return { _id: id, ...profile };
  }

  if (existing.monthlyTokens === undefined || existing.usedTokens === undefined) {
    const migratedMonthlyTokens = getStoredMonthlyTokens(existing);
    const migratedUsedTokens = getStoredUsedTokens(existing);

    await ctx.db.patch(existing._id, {
      monthlyTokens: migratedMonthlyTokens,
      usedTokens: migratedUsedTokens,
      monthlyCredits: undefined,
      usedCredits: undefined,
      updatedAt: now,
    });

    return {
      ...existing,
      monthlyTokens: migratedMonthlyTokens,
      usedTokens: migratedUsedTokens,
      monthlyCredits: undefined,
      usedCredits: undefined,
      updatedAt: now,
    };
  }

  if (new Date(existing.cycleEnd).getTime() <= Date.now()) {
    const refreshedWindow = getCurrentBillingWindow();
    const monthlyTokens = getMonthlyTokensForPlan(existing.plan as PlanId);
    await ctx.db.patch(existing._id, {
      monthlyTokens,
      usedTokens: 0,
      totalTokensUsed: 0,
      cycleStart: refreshedWindow.cycleStart,
      cycleEnd: refreshedWindow.cycleEnd,
      updatedAt: now,
    });

    return {
      ...existing,
      monthlyTokens,
      usedTokens: 0,
      monthlyCredits: undefined,
      usedCredits: undefined,
      totalTokensUsed: 0,
      cycleStart: refreshedWindow.cycleStart,
      cycleEnd: refreshedWindow.cycleEnd,
      updatedAt: now,
    };
  }

  return existing;
}

export const ensureBillingProfile = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const profile = await getOrCreateBillingProfile(ctx, args.userId);
    return {
      plan: profile.plan,
      subscriptionStatus: profile.subscriptionStatus,
      stripeCustomerId: profile.stripeCustomerId ?? null,
      stripeSubscriptionId: profile.stripeSubscriptionId ?? null,
    };
  },
});

export const getBillingSummary = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("billingProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!profile) {
      const tokens = getMonthlyTokensForPlan("free");
      const currentWindow = getCurrentBillingWindow();
      return {
        plan: "free" as PlanId,
        subscriptionStatus: "free",
        isTrial: false,
        monthlyTokens: tokens,
        usedTokens: 0,
        remainingTokens: tokens,
        totalTokensUsed: 0,
        cycleStart: currentWindow.cycleStart,
        cycleEnd: currentWindow.cycleEnd,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
    }

    const monthlyTokens = getStoredMonthlyTokens(profile);
    const usedTokens = getStoredUsedTokens(profile);
    const remainingTokens = Math.max(monthlyTokens - usedTokens, 0);

    return {
      plan: profile.plan as PlanId,
      subscriptionStatus: profile.subscriptionStatus,
      isTrial: profile.isTrial,
      monthlyTokens,
      usedTokens,
      remainingTokens,
      totalTokensUsed: profile.totalTokensUsed,
      cycleStart: profile.cycleStart,
      cycleEnd: profile.cycleEnd,
      stripeCustomerId: profile.stripeCustomerId ?? null,
      stripeSubscriptionId: profile.stripeSubscriptionId ?? null,
    };
  },
});

export const recordUsage = mutation({
  args: {
    userId: v.string(),
    model: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await getOrCreateBillingProfile(ctx, args.userId);
    const now = new Date().toISOString();
    const usedTokens = getStoredUsedTokens(profile);
    const totalTokensUsed = profile.totalTokensUsed ?? 0;

    await ctx.db.insert("usageEvents", {
      userId: args.userId,
      plan: profile.plan,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      createdAt: now,
    });

    await ctx.db.patch(profile._id, {
      usedTokens: usedTokens + args.totalTokens,
      monthlyCredits: undefined,
      usedCredits: undefined,
      totalTokensUsed: totalTokensUsed + args.totalTokens,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const upsertSubscription = mutation({
  args: {
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
    isTrial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await getOrCreateBillingProfile(ctx, args.userId);
    const now = new Date().toISOString();
    const monthlyTokens = getMonthlyTokensForPlan(args.plan);

    await ctx.db.patch(profile._id, {
      plan: args.plan,
      subscriptionStatus: args.subscriptionStatus,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      monthlyTokens,
      monthlyCredits: undefined,
      usedCredits: undefined,
      isTrial: args.isTrial ?? false,
      updatedAt: now,
    });

    return { success: true };
  },
});
