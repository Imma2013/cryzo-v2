"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function useBillingSummary(userId: string | null) {
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

  return {
    billingSummary,
    isLoadingBilling: userId ? billingSummary === undefined : false,
  };
}
