import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api as convexApi } from "@/convex/_generated/api";
import { getPriceIdForPlan, stripe } from "@/lib/stripe";
import type { PlanId } from "@/lib/pricing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const { plan, userId, email }: { plan: PlanId; userId?: string; email?: string } =
    await req.json();

  if (!userId || (plan !== "pro" && plan !== "business")) {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const priceId = getPriceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json({ error: "Missing Stripe price configuration." }, { status: 500 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const billingSummary = convex
    ? await convex.query(convexApi.billing.getBillingSummary, { userId })
    : null;

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: userId,
    customer: billingSummary?.stripeCustomerId ?? undefined,
    customer_email: billingSummary?.stripeCustomerId ? undefined : email,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
    metadata: {
      userId,
      plan,
    },
  });

  return NextResponse.json({ url: session.url });
}
