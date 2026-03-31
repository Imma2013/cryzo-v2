import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentBillingWindow, getMonthlyCreditsForPlan, type PlanId } from "../lib/pricing";

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
      monthlyCredits: getMonthlyCreditsForPlan("free"),
      usedCredits: 0,
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

  if (new Date(existing.cycleEnd).getTime() <= Date.now()) {
    const refreshedWindow = getCurrentBillingWindow();
    const monthlyCredits = getMonthlyCreditsForPlan(existing.plan as PlanId);
    await ctx.db.patch(existing._id, {
      monthlyCredits,
      usedCredits: 0,
      totalTokensUsed: 0,
      cycleStart: refreshedWindow.cycleStart,
      cycleEnd: refreshedWindow.cycleEnd,
      updatedAt: now,
    });

    return {
      ...existing,
      monthlyCredits,
      usedCredits: 0,
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
      const credits = getMonthlyCreditsForPlan("free");
      const currentWindow = getCurrentBillingWindow();
      return {
        plan: "free" as PlanId,
        subscriptionStatus: "free",
        isTrial: false,
        monthlyCredits: credits,
        usedCredits: 0,
        remainingCredits: credits,
        totalTokensUsed: 0,
        cycleStart: currentWindow.cycleStart,
        cycleEnd: currentWindow.cycleEnd,
      };
    }

    const remainingCredits = Math.max(profile.monthlyCredits - profile.usedCredits, 0);

    return {
      plan: profile.plan as PlanId,
      subscriptionStatus: profile.subscriptionStatus,
      isTrial: profile.isTrial,
      monthlyCredits: profile.monthlyCredits,
      usedCredits: profile.usedCredits,
      remainingCredits,
      totalTokensUsed: profile.totalTokensUsed,
      cycleStart: profile.cycleStart,
      cycleEnd: profile.cycleEnd,
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
    creditsCharged: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await getOrCreateBillingProfile(ctx, args.userId);
    const now = new Date().toISOString();

    await ctx.db.insert("usageEvents", {
      userId: args.userId,
      plan: profile.plan,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      creditsCharged: args.creditsCharged,
      createdAt: now,
    });

    await ctx.db.patch(profile._id, {
      usedCredits: profile.usedCredits + args.creditsCharged,
      totalTokensUsed: profile.totalTokensUsed + args.totalTokens,
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
    const monthlyCredits = getMonthlyCreditsForPlan(args.plan);

    await ctx.db.patch(profile._id, {
      plan: args.plan,
      subscriptionStatus: args.subscriptionStatus,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      monthlyCredits,
      isTrial: args.isTrial ?? false,
      updatedAt: now,
    });

    return { success: true };
  },
});
