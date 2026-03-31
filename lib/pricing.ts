export type PlanId = "free" | "pro" | "business" | "enterprise";

export const TOKENS_PER_CREDIT = 7_500;
export const MINIMUM_CREDITS_PER_REQUEST = 1;

export const PLAN_CONFIG: Record<
  Exclude<PlanId, "enterprise">,
  {
    id: Exclude<PlanId, "enterprise">;
    name: string;
    monthlyPrice: number;
    monthlyCredits: number;
    description: string;
    headline: string;
  }
> & {
  enterprise: {
    id: "enterprise";
    name: string;
    monthlyPrice: null;
    monthlyCredits: number;
    description: string;
    headline: string;
  };
} = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    monthlyCredits: 50,
    description: "Good for trying the product and handling lightweight monthly usage.",
    headline: "50 monthly credits included",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 29,
    monthlyCredits: 500,
    description: "For solo operators and small teams that need reliable monthly capacity.",
    headline: "500 monthly credits included",
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 99,
    monthlyCredits: 2500,
    description: "For teams shipping client work, automations, and higher message volume.",
    headline: "2,500 monthly credits included",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    monthlyCredits: 10000,
    description: "For organizations that need custom limits, support, procurement, and governance.",
    headline: "Custom billing and custom limits",
  },
};

export function creditsToApproxTokens(credits: number) {
  return credits * TOKENS_PER_CREDIT;
}

export function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  }

  return `${tokens}`;
}

export function tokensToCredits(totalTokens: number, model?: string | null) {
  const multiplier = getModelCreditMultiplier(model);
  return Math.max(
    MINIMUM_CREDITS_PER_REQUEST,
    Math.ceil((totalTokens * multiplier) / TOKENS_PER_CREDIT),
  );
}

export function getMonthlyCreditsForPlan(plan: PlanId) {
  return PLAN_CONFIG[plan].monthlyCredits;
}

export function getModelCreditMultiplier(model?: string | null) {
  switch (model) {
    case "gpt-5.4":
      return 1;
    default:
      return 1;
  }
}

export function getCurrentBillingWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    cycleStart: start.toISOString(),
    cycleEnd: end.toISOString(),
  };
}
