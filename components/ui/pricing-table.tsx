"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Check, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PricingFeature {
  text: string;
  hasInfo?: boolean;
}

export interface PricingTier {
  name: string;
  description: string;
  price?: number;
  priceLabel?: string;
  billingPeriod?: string;
  buttonText: string;
  buttonVariant?: "default" | "secondary" | "outline";
  isPrimary?: boolean;
  features: PricingFeature[];
  hasAnnualToggle?: boolean;
  creditOptions?: string[];
  defaultCredits?: string;
  featuresTitle?: string;
  buttonHref?: string;
}

export interface PricingProps {
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  tiers: PricingTier[];
  footerTitle?: string;
  footerDescription?: string;
  footerButtonText?: string;
  footerButtonHref?: string;
  className?: string;
}

export function Pricing({
  icon,
  title,
  subtitle,
  tiers,
  footerTitle,
  footerDescription,
  footerButtonText,
  footerButtonHref,
  className,
}: PricingProps) {
  const [annualBilling, setAnnualBilling] = useState<Record<string, boolean>>({});
  const [selectedCredits, setSelectedCredits] = useState<Record<string, string>>({});

  const resolvedCredits = useMemo(
    () =>
      Object.fromEntries(
        tiers.map((tier) => [
          tier.name,
          selectedCredits[tier.name] || tier.defaultCredits || tier.creditOptions?.[0] || "",
        ]),
      ),
    [selectedCredits, tiers],
  );

  return (
    <div className={cn("w-full bg-background px-4 py-16 text-foreground", className)}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          {icon ? <div className="mb-4 flex justify-center">{icon}</div> : null}
          <h1 className="mb-4 text-5xl font-bold text-balance">{title}</h1>
          <p className="text-lg text-balance text-muted-foreground">{subtitle}</p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={cn(
                "flex flex-col border-border bg-card p-6",
                tier.isPrimary && "ring-2 ring-purple-500",
              )}
            >
              <div className="mb-6">
                <h2 className="mb-2 text-2xl font-bold">{tier.name}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {tier.description}
                </p>
              </div>

              <div className="mb-6">
                {tier.price !== undefined ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold">${tier.price}</span>
                    <span className="text-muted-foreground">
                      {tier.billingPeriod || "per month"}
                    </span>
                  </div>
                ) : (
                  <div className="text-xl font-semibold">{tier.priceLabel}</div>
                )}
              </div>

              {tier.hasAnnualToggle ? (
                <div className="mb-6 flex items-center gap-3">
                  <button
                    onClick={() =>
                      setAnnualBilling((prev) => ({
                        ...prev,
                        [tier.name]: !prev[tier.name],
                      }))
                    }
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      annualBilling[tier.name] ? "bg-muted/80" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-primary-foreground transition-transform",
                        annualBilling[tier.name] && "translate-x-5",
                      )}
                    />
                  </button>
                  <span className="text-sm text-foreground">Annual</span>
                </div>
              ) : null}

              {tier.buttonHref ? (
                <Button
                  asChild
                  className={cn(
                    "mb-6 w-full",
                    tier.isPrimary
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                  variant={tier.buttonVariant || "default"}
                >
                  <a href={tier.buttonHref} target="_blank" rel="noopener noreferrer">
                    {tier.buttonText}
                  </a>
                </Button>
              ) : (
                <Button
                  className={cn(
                    "mb-6 w-full",
                    tier.isPrimary
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                  variant={tier.buttonVariant || "default"}
                >
                  {tier.buttonText}
                </Button>
              )}

              {tier.creditOptions && tier.creditOptions.length > 0 ? (
                <div className="mb-6">
                  <Select
                    value={resolvedCredits[tier.name]}
                    onValueChange={(value) =>
                      setSelectedCredits((prev) => ({
                        ...prev,
                        [tier.name]: value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full border-border bg-secondary text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {tier.creditOptions.map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          className="focus:bg-accent focus:text-accent-foreground"
                        >
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {tier.featuresTitle ? (
                <div className="mb-4 text-sm font-medium text-foreground">
                  {tier.featuresTitle}
                </div>
              ) : null}

              <div className="flex-1 space-y-3">
                {tier.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
                    <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      {feature.text}
                    </span>
                    {feature.hasInfo ? (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {footerTitle ? (
          <Card className="flex flex-col items-center justify-between gap-4 border-border bg-card p-8 md:flex-row">
            <div>
              <h3 className="mb-2 text-xl font-bold">{footerTitle}</h3>
              {footerDescription ? (
                <p className="text-sm text-muted-foreground">{footerDescription}</p>
              ) : null}
            </div>
            {footerButtonText ? (
              footerButtonHref ? (
                <Button
                  asChild
                  variant="outline"
                  className="whitespace-nowrap border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <a href={footerButtonHref} target="_blank" rel="noopener noreferrer">
                    {footerButtonText}
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="whitespace-nowrap border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {footerButtonText}
                </Button>
              )
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
