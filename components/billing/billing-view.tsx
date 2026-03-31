"use client";

import { CreditCard } from "lucide-react";

import { Pricing } from "@/components/ui/pricing-table";

const billingLinks = {
  free: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_FREE_URL || "#",
  proMonthly: process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_PRO_MONTHLY_URL || "#",
  businessMonthly:
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_BUSINESS_MONTHLY_URL || "#",
  enterprise: process.env.NEXT_PUBLIC_STRIPE_CONTACT_SALES_URL || "#",
  student: process.env.NEXT_PUBLIC_STRIPE_STUDENT_DISCOUNT_URL || "#",
};

export function BillingView() {
  return (
    <Pricing
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
          <CreditCard className="h-6 w-6" />
        </div>
      }
      title="Billing"
      subtitle="Start for free. Upgrade when you want more credits, higher limits, and better controls."
      tiers={[
        {
          name: "Free",
          description: "Discover what the app can do before you start paying.",
          price: 0,
          billingPeriod: "per month",
          buttonText: "Get Started",
          buttonHref: billingLinks.free,
          features: [
            { text: "5 daily credits (up to 30/month)" },
            { text: "Public projects" },
            { text: "Unlimited collaborators" },
          ],
          featuresTitle: "Free for everyone",
        },
        {
          name: "Pro",
          description: "For fast-moving teams building together in real time.",
          price: 25,
          billingPeriod: "per month",
          buttonText: "Upgrade to Pro",
          buttonHref: billingLinks.proMonthly,
          isPrimary: true,
          hasAnnualToggle: true,
          creditOptions: [
            "100 credits / month",
            "200 credits / month",
            "500 credits / month",
          ],
          defaultCredits: "100 credits / month",
          featuresTitle: "Everything in Free, plus:",
          features: [
            { text: "100 monthly credits", hasInfo: true },
            { text: "5 daily credits (up to 150/month)" },
            { text: "Credit rollovers", hasInfo: true },
            { text: "Custom domains" },
            { text: "Remove the badge" },
            { text: "Private projects" },
            { text: "User roles & permissions" },
          ],
        },
        {
          name: "Business",
          description: "Advanced controls for growing departments and client work.",
          price: 50,
          billingPeriod: "per month",
          buttonText: "Start Business",
          buttonHref: billingLinks.businessMonthly,
          hasAnnualToggle: true,
          creditOptions: [
            "100 credits / month",
            "200 credits / month",
            "500 credits / month",
          ],
          defaultCredits: "100 credits / month",
          featuresTitle: "All features in Pro, plus:",
          features: [
            { text: "100 monthly credits", hasInfo: true },
            { text: "SSO" },
            { text: "Personal projects" },
            { text: "Opt out of data training" },
            { text: "Design templates" },
          ],
        },
        {
          name: "Enterprise",
          description: "Built for large orgs that need flexibility, scale, and governance.",
          priceLabel: "Flexible billing",
          buttonText: "Book a demo",
          buttonHref: billingLinks.enterprise,
          featuresTitle: "Everything in Business, plus:",
          features: [
            { text: "Dedicated support" },
            { text: "Onboarding services" },
            { text: "Custom connections" },
            { text: "Group-based access control" },
            { text: "Custom design systems" },
          ],
        },
      ]}
      footerTitle="Student discount"
      footerDescription="Connect your billing links now and swap the placeholder Stripe checkout URLs later."
      footerButtonText="Learn more"
      footerButtonHref={billingLinks.student}
      className="py-10"
    />
  );
}
