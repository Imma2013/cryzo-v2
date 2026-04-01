export type PlanId = "free" | "pro" | "business" | "enterprise";

export const LEGACY_TOKENS_PER_CREDIT = 7_500;
export const TOKENS_PER_CREDIT = 500;

export const PLAN_CONFIG: Record<PlanId, {
  id: PlanId;
  name: string;
  monthlyPrice: number | null;
  monthlyCredits: number;
  monthlyTokens: number;
  description: string;
  headline: string;
}> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    monthlyCredits: 5_000,
    monthlyTokens: 2_500_000,
    description: "Good for trying the product and handling lightweight monthly usage.",
    headline: "5K monthly credits included",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 20,
    monthlyCredits: 20_000,
    monthlyTokens: 10_000_000,
    description: "For solo operators and small teams that need reliable monthly capacity.",
    headline: "20K monthly credits included",
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 80,
    monthlyCredits: 100_000,
    monthlyTokens: 50_000_000,
    description: "For teams shipping client work, automations, and higher message volume.",
    headline: "100K monthly credits included",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    monthlyCredits: 500_000,
    monthlyTokens: 250_000_000,
    description: "For organizations that need custom limits, support, procurement, and governance.",
    headline: "Custom monthly credit budget",
  },
};

export function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(tokens % 1_000_000_000 === 0 ? 0 : 1)}B`;
  }

  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  }

  return `${tokens}`;
}

export function getMonthlyTokensForPlan(plan: PlanId) {
  return PLAN_CONFIG[plan].monthlyTokens;
}

export function getMonthlyCreditsForPlan(plan: PlanId) {
  return PLAN_CONFIG[plan].monthlyCredits;
}

export function tokensToCredits(tokens: number) {
  return Math.max(0, Math.ceil(tokens / TOKENS_PER_CREDIT));
}

export function creditsToTokens(credits: number) {
  return credits * TOKENS_PER_CREDIT;
}

export function getCurrentBillingWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    cycleStart: start.toISOString(),
    cycleEnd: end.toISOString(),
  };
}

export function getPlanFromPriceId(priceId?: string | null): PlanId | null {
  if (!priceId) {
    return null;
  }

  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY) {
    return "pro";
  }

  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY) {
    return "business";
  }

  return null;
}
