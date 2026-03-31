import { ConvexHttpClient } from "convex/browser";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { api as convexApi } from "@/convex/_generated/api";
import { getPlanFromStripePriceId, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

async function syncSubscription(subscription: Stripe.Subscription) {
  if (!stripe) {
    return;
  }

  const userId =
    subscription.metadata.userId ||
    (typeof subscription.customer === "string" ? undefined : undefined);

  if (!userId) {
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const plan = getPlanFromStripePriceId(priceId) ?? "free";
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return;
  }

  const convex = new ConvexHttpClient(convexUrl);
  await convex.mutation(convexApi.billing.upsertSubscription, {
    userId,
    plan,
    subscriptionStatus: subscription.status,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    isTrial: Boolean(subscription.trial_end && subscription.status === "trialing"),
  });
}

export async function POST(req: Request) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
  }

  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && stripe) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id,
        );
        await syncSubscription(subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.userId;
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (userId && convexUrl) {
        const convex = new ConvexHttpClient(convexUrl);
        await convex.mutation(convexApi.billing.upsertSubscription, {
          userId,
          plan: "free",
          subscriptionStatus: "canceled",
          stripeCustomerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
          stripeSubscriptionId: subscription.id,
          isTrial: false,
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
