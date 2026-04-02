import type { ConvexHttpClient } from "convex/browser";

import { api as convexApi } from "@/convex/_generated/api";

export async function getRunDispatchContext(
  convex: ConvexHttpClient,
  runId: Awaited<ReturnType<typeof claimNextDueRun>>["runId"],
) {
  if (!runId) {
    return null;
  }

  return convex.query(convexApi.autonomous.getRunDispatchContext, { runId });
}

export type DispatchContext = NonNullable<
  Awaited<ReturnType<typeof getRunDispatchContext>>
>;

export type DispatchClaim = Awaited<ReturnType<typeof claimNextDueRun>>;

export type DispatchResult =
  | {
      runId: DispatchContext["run"]["_id"];
      status: "succeeded";
      summary: string;
    }
  | {
      runId: DispatchContext["run"]["_id"];
      status: "failed";
      error: string;
    };

export async function claimNextDueRun(convex: ConvexHttpClient) {
  return convex.mutation(convexApi.autonomous.claimNextDueRun, {});
}

export async function ensureScheduledRuns(convex: ConvexHttpClient) {
  return convex.mutation(convexApi.autonomous.ensureScheduledRuns, {});
}

export function formatMemoryEntries(
  entries: Array<Pick<DispatchContext["memory"]["task"][number], "key" | "value">>,
) {
  if (entries.length === 0) {
    return "None recorded.";
  }

  return entries
    .map((entry) => `${entry.key}: ${JSON.stringify(entry.value)}`)
    .join("\n");
}

export function getMaxActionsPerRun(policies: DispatchContext["policies"]) {
  const positiveCaps = policies
    .map((policy) => policy.maxActionsPerRun)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );

  if (positiveCaps.length === 0) {
    return 10;
  }

  return Math.min(...positiveCaps);
}

export function getEffectiveIntegrationSlugs(context: DispatchContext) {
  const taskIntegrations = context.task.integrationSlugs;
  const allowedSets = context.policies
    .map((policy) => policy.allowedIntegrationSlugs)
    .filter((slugs) => slugs.length > 0);
  const blocked = new Set(
    context.policies.flatMap((policy) => policy.blockedIntegrationSlugs),
  );

  const allowSet =
    allowedSets.length === 0
      ? null
      : new Set(allowedSets.flatMap((slugs) => slugs));

  return taskIntegrations.filter((slug) => {
    if (blocked.has(slug)) {
      return false;
    }

    if (allowSet && !allowSet.has(slug)) {
      return false;
    }

    return true;
  });
}

export function buildSystemPrompt(args: {
  context: DispatchContext;
  integrationSlugs: string[];
  maxActionsPerRun: number;
}) {
  const { context, integrationSlugs, maxActionsPerRun } = args;
  const { task, memory, policies } = context;
  const integrationList =
    integrationSlugs.length > 0
      ? integrationSlugs.join(", ")
      : "no external integrations";

  return [
    "You are Cryzo's autonomous business operator.",
    "Carry out the saved task using connected Composio tools only when they are necessary.",
    "Do not use integrations outside the allowed list.",
    "Act without asking for confirmation unless the task cannot be completed safely.",
    "Prefer concrete actions over advice. If no external action is needed, return an operational summary.",
    `Task title: ${task.title}`,
    `Primary instruction: ${task.instruction}`,
    `Allowed integrations: ${integrationList}`,
    `Maximum tool-action steps this run: ${maxActionsPerRun}`,
    `Goals: ${task.goals.length > 0 ? task.goals.join(" | ") : "None recorded."}`,
    `Success criteria: ${
      task.successCriteria.length > 0
        ? task.successCriteria.join(" | ")
        : "None recorded."
    }`,
    `Task memory:\n${formatMemoryEntries(memory.task)}`,
    `User memory:\n${formatMemoryEntries(memory.user)}`,
    `Policies:\n${
      policies.length > 0
        ? policies
            .map((policy) => `${policy.name}: ${JSON.stringify(policy.policy)}`)
            .join("\n")
        : "None recorded."
    }`,
    "In your final answer, include:",
    "1. What you did.",
    "2. What changed or what you observed.",
    "3. Any follow-up risk or blocker.",
  ].join("\n\n");
}
