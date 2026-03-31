"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Pricing } from "@/components/ui/pricing-table";
import {
  formatTokenCount,
  PLAN_CONFIG,
  tokensToCredits,
  type PlanId,
} from "@/lib/pricing";
import type { useBillingSummary } from "@/hooks/use-billing-summary";

const billingLinks = {
  student: process.env.NEXT_PUBLIC_STRIPE_STUDENT_DISCOUNT_URL || "#",
};

export function BillingView({
  userId,
  userEmail,
  billingSummary,
  isLoadingBilling,
  isLiveEstimating,
  provisionalUsedTokens,
}: {
  userId: string | null;
  userEmail?: string | null;
  billingSummary?: ReturnType<typeof useBillingSummary>["billingSummary"];
  isLoadingBilling?: boolean;
  isLiveEstimating?: boolean;
  provisionalUsedTokens?: number;
}) {
  const activePlan =
    billingSummary ? PLAN_CONFIG[billingSummary.plan] : PLAN_CONFIG.free;
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const remainingCredits = tokensToCredits(billingSummary?.remainingTokens ?? 0);
  const usedCredits = tokensToCredits(billingSummary?.totalTokensUsed ?? 0);
  const monthlyCredits = billingSummary
    ? PLAN_CONFIG[billingSummary.plan].monthlyCredits
    : PLAN_CONFIG.free.monthlyCredits;

  async function startCheckout(plan: PlanId) {
    if (!userId || (plan !== "pro" && plan !== "business")) {
      return;
    }

    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId, email: userEmail }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="mx-auto max-w-7xl">
        <Card className="border-border bg-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current billing status</p>
                  <h2 className="text-2xl font-semibold text-foreground">
                    {isLoadingBilling ? "Loading..." : activePlan.name}
                  </h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {activePlan.description}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Remaining credits
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {remainingCredits.toLocaleString()}
                </p>
                {isLiveEstimating ? (
                  <p className="mt-1 text-xs text-amber-600">
                    Live estimate during streaming
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Credits used
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {usedCredits.toLocaleString()}
                </p>
                {isLiveEstimating ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    +{tokensToCredits(provisionalUsedTokens ?? 0).toLocaleString()} in-flight
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Monthly allowance
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {monthlyCredits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTokenCount(
                    billingSummary?.monthlyTokens ?? PLAN_CONFIG.free.monthlyTokens,
                  )} tokens under the hood
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Pricing
        icon={
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
            <CreditCard className="h-6 w-6" />
          </div>
        }
        title="Billing"
        subtitle="Plans are sold in monthly credits. We meter actual model token usage server-side and convert it into credits behind the scenes."
        tiers={[
          {
            name: PLAN_CONFIG.free.name,
            description:
              "Great for trying the product. Credits reset every month and usage is tracked behind the scenes.",
            price: PLAN_CONFIG.free.monthlyPrice,
            billingPeriod: "per month",
            buttonText: billingSummary?.plan === "free" ? "Current plan" : "Included",
            buttonDisabled: true,
            features: [
              {
                text: `${PLAN_CONFIG.free.monthlyCredits.toLocaleString()} monthly credits`,
              },
              { text: "Recurring free monthly allowance" },
              { text: "Basic chat and app connections" },
            ],
            featuresTitle: "Included",
          },
          {
            name: PLAN_CONFIG.pro.name,
            description:
              "For solo operators and small teams that want a serious monthly working budget.",
            price: PLAN_CONFIG.pro.monthlyPrice,
            billingPeriod: "per month",
            buttonText: billingSummary?.plan === "pro" ? "Current plan" : "Upgrade to Pro",
            onButtonClick: () => void startCheckout("pro"),
            buttonDisabled:
              !userId || loadingPlan === "pro" || billingSummary?.plan === "pro",
            isPrimary: true,
            featuresTitle: "Everything in Free, plus:",
            features: [
              {
                text: `${PLAN_CONFIG.pro.monthlyCredits.toLocaleString()} monthly credits`,
                hasInfo: true,
              },
              { text: "Priority monthly budget" },
              { text: "Higher message volume for daily use" },
              { text: "Better fit for multi-app workflows" },
            ],
          },
          {
            name: PLAN_CONFIG.business.name,
            description:
              "For growing teams, client work, and heavier monthly automation volume.",
            price: PLAN_CONFIG.business.monthlyPrice,
            billingPeriod: "per month",
            buttonText:
              billingSummary?.plan === "business" ? "Current plan" : "Start Business",
            onButtonClick: () => void startCheckout("business"),
            buttonDisabled:
              !userId ||
              loadingPlan === "business" ||
              billingSummary?.plan === "business",
            featuresTitle: "Everything in Pro, plus:",
            features: [
              {
                text: `${PLAN_CONFIG.business.monthlyCredits.toLocaleString()} monthly credits`,
                hasInfo: true,
              },
              { text: "Larger team budget" },
              { text: "Better headroom for production usage" },
              { text: "Planned admin and usage controls" },
            ],
          },
        ]}
        footerTitle="How usage is billed"
        footerDescription="We expose credits in the UI and meter real model token usage server-side against your monthly plan allowance."
        footerButtonText="Learn more"
        footerButtonHref={billingLinks.student}
        className="py-10"
      />
    </div>
  );
}
