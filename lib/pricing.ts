export type PlanId = "free" | "pro" | "business" | "enterprise";

export const PLAN_CONFIG: Record<PlanId, {
  id: PlanId;
  name: string;
  monthlyPrice: number | null;
  monthlyTokens: number;
  description: string;
  headline: string;
}> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    monthlyTokens: 375_000,
    description: "Good for trying the product and handling lightweight monthly usage.",
    headline: "375K monthly tokens included",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 29,
    monthlyTokens: 3_750_000,
    description: "For solo operators and small teams that need reliable monthly capacity.",
    headline: "3.75M monthly tokens included",
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 99,
    monthlyTokens: 18_750_000,
    description: "For teams shipping client work, automations, and higher message volume.",
    headline: "18.75M monthly tokens included",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    monthlyTokens: 75_000_000,
    description: "For organizations that need custom limits, support, procurement, and governance.",
    headline: "Custom monthly token budget",
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
