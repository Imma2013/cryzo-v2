"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function useBillingSummary(
  userId: string | null,
  provisionalUsedTokens = 0,
) {
  const ensureBillingProfile = useMutation(api.billing.ensureBillingProfile);
  const billingSummary = useQuery(
    api.billing.getBillingSummary,
    userId ? { userId } : "skip",
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    void ensureBillingProfile({ userId });
  }, [ensureBillingProfile, userId]);

  const optimisticBillingSummary = useMemo(() => {
    if (!billingSummary) {
      return billingSummary;
    }

    if (provisionalUsedTokens <= 0) {
      return billingSummary;
    }

    const totalUsed = billingSummary.totalTokensUsed + provisionalUsedTokens;
    const remaining = Math.max(billingSummary.monthlyTokens - totalUsed, 0);

    return {
      ...billingSummary,
      totalTokensUsed: totalUsed,
      remainingTokens: remaining,
    };
  }, [billingSummary, provisionalUsedTokens]);

  return {
    billingSummary: optimisticBillingSummary,
    isLoadingBilling: userId ? billingSummary === undefined : false,
  };
}
