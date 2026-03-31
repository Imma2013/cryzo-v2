import Stripe from "stripe";
import { getPlanFromPriceId, type PlanId } from "./pricing";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe =
  secretKey
    ? new Stripe(secretKey, {
        apiVersion: "2026-03-25.dahlia",
      })
    : null;

export const STRIPE_PRICE_IDS: Partial<Record<Exclude<PlanId, "free" | "enterprise">, string>> = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
  business: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY,
};

export function getPriceIdForPlan(plan: PlanId) {
  if (plan === "pro") {
    return STRIPE_PRICE_IDS.pro ?? null;
  }

  if (plan === "business") {
    return STRIPE_PRICE_IDS.business ?? null;
  }

  return null;
}

export function getPlanFromStripePriceId(priceId?: string | null) {
  return getPlanFromPriceId(priceId);
}
