"use client";

import { CreditCard } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Pricing } from "@/components/ui/pricing-table";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import {
  creditsToApproxTokens,
  formatTokenCount,
  PLAN_CONFIG,
} from "@/lib/pricing";

const billingLinks = {
  free: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_FREE_URL || "#",
  proMonthly: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_PRO_MONTHLY_URL || "#",
  businessMonthly:
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_BUSINESS_MONTHLY_URL || "#",
  enterprise: process.env.NEXT_PUBLIC_STRIPE_CONTACT_SALES_URL || "#",
  student: process.env.NEXT_PUBLIC_STRIPE_STUDENT_DISCOUNT_URL || "#",
};

export function BillingView({ userId }: { userId: string | null }) {
  const { billingSummary, isLoadingBilling } = useBillingSummary(userId);
  const activePlan =
    billingSummary ? PLAN_CONFIG[billingSummary.plan] : PLAN_CONFIG.free;

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
                  {billingSummary?.remainingCredits ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tokens used
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatTokenCount(billingSummary?.totalTokensUsed ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Monthly allowance
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {billingSummary?.monthlyCredits ?? PLAN_CONFIG.free.monthlyCredits}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ~
                  {formatTokenCount(
                    creditsToApproxTokens(
                      billingSummary?.monthlyCredits ?? PLAN_CONFIG.free.monthlyCredits,
                    ),
                  )}{" "}
                  tokens
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
        subtitle="Plans are sold in monthly credits. Raw model tokens are tracked in the backend and converted into credits automatically."
        tiers={[
          {
            name: PLAN_CONFIG.free.name,
            description:
              "Great for trying the product. Credits reset every month and token usage is tracked behind the scenes.",
            price: PLAN_CONFIG.free.monthlyPrice,
            billingPeriod: "per month",
            buttonText: "Get Started",
            buttonHref: billingLinks.free,
            features: [
              {
                text: `${PLAN_CONFIG.free.monthlyCredits} monthly credits (~${formatTokenCount(
                  creditsToApproxTokens(PLAN_CONFIG.free.monthlyCredits),
                )} tokens)`,
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
            buttonText: "Upgrade to Pro",
            buttonHref: billingLinks.proMonthly,
            isPrimary: true,
            featuresTitle: "Everything in Free, plus:",
            features: [
              {
                text: `${PLAN_CONFIG.pro.monthlyCredits} monthly credits (~${formatTokenCount(
                  creditsToApproxTokens(PLAN_CONFIG.pro.monthlyCredits),
                )} tokens)`,
                hasInfo: true,
              },
              { text: "Priority monthly capacity" },
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
            buttonText: "Start Business",
            buttonHref: billingLinks.businessMonthly,
            featuresTitle: "Everything in Pro, plus:",
            features: [
              {
                text: `${PLAN_CONFIG.business.monthlyCredits} monthly credits (~${formatTokenCount(
                  creditsToApproxTokens(PLAN_CONFIG.business.monthlyCredits),
                )} tokens)`,
                hasInfo: true,
              },
              { text: "Larger team budget pool" },
              { text: "Better headroom for production usage" },
              { text: "Planned admin and usage controls" },
            ],
          },
          {
            name: PLAN_CONFIG.enterprise.name,
            description:
              "For companies that need procurement, support, custom limits, and governance.",
            priceLabel: "Custom billing",
            buttonText: "Book a demo",
            buttonHref: billingLinks.enterprise,
            featuresTitle: "Everything in Business, plus:",
            features: [
              { text: "Custom monthly credit budget" },
              { text: "Priority support" },
              { text: "Custom billing and onboarding" },
              { text: "Advanced security and governance" },
            ],
          },
        ]}
        footerTitle="How usage is billed"
        footerDescription="We expose credits in the UI, but we meter real model token usage server-side and convert that usage into credits automatically."
        footerButtonText="Learn more"
        footerButtonHref={billingLinks.student}
        className="py-10"
      />
    </div>
  );
}
