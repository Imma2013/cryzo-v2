import { generateText, stepCountIs } from "ai";

import { api } from "../convex/_generated/api";
import { getAiModel } from "./ai-model";

type WorkflowMemoryEntry = {
  key: string;
  value: unknown;
};

type WorkflowContext = {
  run: {
    _id: string;
    scheduledFor?: string;
    inputData?: unknown;
  };
  task: {
    _id: string;
    userId: string;
    title: string;
    instruction: string;
    workflowCode?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    defaultInputData?: unknown;
    workflowType?: string;
    recipeMetadata?: {
      compiler?: string;
      discoveredToolkits?: string[];
      compiledAt?: string;
    };
    integrationSlugs: string[];
    deliveryChannels?: Array<"in_app" | "email">;
    goals: string[];
    successCriteria: string[];
  };
  memory: {
    task: WorkflowMemoryEntry[];
    user: WorkflowMemoryEntry[];
  };
  policies: Array<{
    name: string;
    policy: unknown;
  }>;
};

type WorkflowArgs = {
  ctx: any;
  session: {
    tools: () => Promise<any>;
  };
  context: WorkflowContext;
  integrationSlugs: string[];
  maxActionsPerRun: number;
};

type WorkflowRecipe = {
  key: string;
  label: string;
  summary: string;
  steps: string[];
  toolGuidance: string[];
  successChecklist: string[];
  maxStepsCap?: number;
};

export type WorkflowExecutionResult = {
  summary: string;
  outputData?: unknown;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  checkpoints: string[];
};

const WORKFLOW_RECIPES: Record<string, WorkflowRecipe> = {
  gmail_unread_digest: {
    key: "gmail_unread_digest",
    label: "Gmail Digest",
    summary:
      "Review unread Gmail messages, compile the relevant digest, and deliver it on schedule.",
    steps: ["fetch", "summarize", "deliver"],
    toolGuidance: [
      "Use Gmail tools to inspect unread messages and keep coverage bounded.",
      "Summarize sender, subject, preview, and what needs follow-up.",
      "If email delivery is configured, send only when the destination is safely known from task context or tool data.",
    ],
    successChecklist: [
      "Unread Gmail messages reviewed.",
      "Digest prepared or delivered.",
      "Any delivery blocker reported explicitly.",
    ],
    maxStepsCap: 12,
  },
  gmail_update: {
    key: "gmail_update",
    label: "Gmail Update",
    summary:
      "Check Gmail for the requested updates, summarize what matters, and deliver the result on schedule.",
    steps: ["fetch", "analyze", "deliver"],
    toolGuidance: [
      "Use Gmail tools to fetch the requested email updates.",
      "Prefer concise summaries over verbose mailbox dumps.",
      "Deliver using the configured channels and report any missing context.",
    ],
    successChecklist: [
      "Requested Gmail update collected.",
      "Important changes summarized.",
      "Delivery completed or blocker explained.",
    ],
  },
  social_monitor: {
    key: "social_monitor",
    label: "Social Monitor",
    summary:
      "Check connected social, ad, or content tools for recent changes and produce an operational digest.",
    steps: ["discover", "fetch", "analyze", "deliver"],
    toolGuidance: [
      "Use only the allowed connected social or ads integrations.",
      "Prioritize changes in performance, mentions, messages, or publishing status.",
      "Return the most important changes first, not raw data noise.",
    ],
    successChecklist: [
      "Relevant social or ads data reviewed.",
      "Material changes identified.",
      "Digest delivered with next actions or watchpoints.",
    ],
  },
  analytics_digest: {
    key: "analytics_digest",
    label: "Analytics Digest",
    summary:
      "Collect analytics metrics from connected tools, identify material changes, and deliver a digest.",
    steps: ["discover", "fetch", "analyze", "deliver"],
    toolGuidance: [
      "Use analytics tools to fetch the latest relevant metrics.",
      "Highlight deltas, anomalies, or traffic changes that matter operationally.",
      "Avoid restating dashboards without interpretation.",
    ],
    successChecklist: [
      "Metrics fetched from connected analytics tools.",
      "Meaningful changes summarized.",
      "Digest delivered with notable watchpoints.",
    ],
  },
  payment_digest: {
    key: "payment_digest",
    label: "Payment Digest",
    summary:
      "Review connected payment data, summarize important events, and deliver a scheduled digest.",
    steps: ["fetch", "analyze", "deliver"],
    toolGuidance: [
      "Use payment tools to inspect recent charges, payouts, failures, or disputes as relevant to the task.",
      "Call out exceptions, failed payments, and high-signal changes first.",
      "Keep the output operational and concise.",
    ],
    successChecklist: [
      "Payment events reviewed.",
      "Important changes summarized.",
      "Digest delivered with any blockers or risks.",
    ],
  },
  general_recurring_task: {
    key: "general_recurring_task",
    label: "General Task",
    summary:
      "Execute the saved recurring task using allowed connected tools and deliver the requested outcome.",
    steps: ["plan", "execute", "deliver"],
    toolGuidance: [
      "Use only the connected tools needed for the task.",
      "Prefer concrete action and observable output over generic advice.",
      "If delivery cannot be completed, return a usable in-app result and explain why.",
    ],
    successChecklist: [
      "Task executed against allowed tools.",
      "Outcome summarized clearly.",
      "Any blocker or follow-up reported.",
    ],
  },
};

function getWorkflowRecipe(workflowType?: string): WorkflowRecipe {
  if (workflowType && WORKFLOW_RECIPES[workflowType]) {
    return WORKFLOW_RECIPES[workflowType];
  }

  return WORKFLOW_RECIPES.general_recurring_task;
}

function formatMemoryEntries(entries: WorkflowMemoryEntry[]) {
  if (entries.length === 0) {
    return "None recorded.";
  }

  return entries
    .map((entry) => `${entry.key}: ${JSON.stringify(entry.value)}`)
    .join("\n");
}

async function recordCheckpoint(args: {
  ctx: any;
  context: WorkflowContext;
  checkpoints: string[];
  step: string;
  status: "started" | "completed" | "failed";
  payload?: Record<string, unknown>;
}) {
  const { ctx, context, checkpoints, step, status, payload } = args;
  checkpoints.push(`${step}:${status}`);

  await ctx.runMutation(api.autonomous.recordEvent, {
    userId: context.task.userId,
    taskId: context.task._id as never,
    runId: context.run._id as never,
    type: "workflow_checkpoint",
    source: "workflow_executor",
    payload: {
      workflowType: context.task.workflowType ?? "general_recurring_task",
      step,
      status,
      ...payload,
    },
  });
}

function buildWorkflowPrompt(args: {
  recipe: WorkflowRecipe;
  context: WorkflowContext;
  integrationSlugs: string[];
  maxActionsPerRun: number;
}) {
  const { recipe, context, integrationSlugs, maxActionsPerRun } = args;
  const integrationList =
    integrationSlugs.length > 0
      ? integrationSlugs.join(", ")
      : "no external integrations";

  return [
    `You are executing Cryzo workflow recipe \`${recipe.key}\`.`,
    recipe.summary,
    "This is a general workflow engine run, not a one-off chat reply.",
    `Task title: ${context.task.title}`,
    `Instruction: ${context.task.instruction}`,
    `Workflow code: ${context.task.workflowCode ?? "No explicit workflow code provided."}`,
    `Input schema: ${JSON.stringify(context.task.inputSchema ?? {})}`,
    `Output schema: ${JSON.stringify(context.task.outputSchema ?? {})}`,
    `Default input data: ${JSON.stringify(context.task.defaultInputData ?? {})}`,
    `Run input data: ${JSON.stringify(context.run.inputData ?? context.task.defaultInputData ?? {})}`,
    `Allowed integrations: ${integrationList}`,
    `Compile metadata: ${JSON.stringify(context.task.recipeMetadata ?? {})}`,
    `Delivery channels: ${(context.task.deliveryChannels ?? ["in_app"]).join(", ")}`,
    `Maximum tool-action steps this run: ${maxActionsPerRun}`,
    `Workflow steps: ${recipe.steps.join(" -> ")}`,
    `Tool guidance:\n${recipe.toolGuidance.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    `Goals: ${context.task.goals.length > 0 ? context.task.goals.join(" | ") : "None recorded."}`,
    `Success criteria: ${context.task.successCriteria.length > 0 ? context.task.successCriteria.join(" | ") : "None recorded."}`,
    `Task memory:\n${formatMemoryEntries(context.memory.task)}`,
    `User memory:\n${formatMemoryEntries(context.memory.user)}`,
    `Policies:\n${
      context.policies.length > 0
        ? context.policies
            .map((policy) => `${policy.name}: ${JSON.stringify(policy.policy)}`)
            .join("\n")
        : "None recorded."
    }`,
    `Success checklist:\n${recipe.successChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    "Return a concise operational summary with:",
    "1. What you did.",
    "2. What changed or what you observed.",
    "3. Any blocker or follow-up.",
  ].join("\n\n");
}

export async function executeAutonomousWorkflow(
  args: WorkflowArgs,
): Promise<WorkflowExecutionResult> {
  const { ctx, session, context, integrationSlugs, maxActionsPerRun } = args;
  const recipe = getWorkflowRecipe(context.task.workflowType);
  const checkpoints: string[] = [];
  const tools = (await session.tools()) as any;
  const effectiveMaxSteps = Math.max(
    1,
    Math.min(maxActionsPerRun, recipe.maxStepsCap ?? 25),
  );

  await recordCheckpoint({
    ctx,
    context,
    checkpoints,
    step: "workflow_start",
    status: "started",
    payload: {
      recipe: recipe.key,
      instruction: context.task.instruction,
      integrationSlugs,
    },
  });

  const agenticSystemPrompt = `You are executing an autonomous workflow for Cryzo.

**TASK:**
${context.task.title}

**INSTRUCTION:**
${context.task.instruction}

**WORKFLOW TYPE:** ${recipe.key}
**WORKFLOW STEPS:** ${recipe.steps.join(" → ")}

**YOUR APPROACH:**
1. Use COMPOSIO_SEARCH_TOOLS to discover the right tools for this task
2. Check connection status from the search results
3. Use COMPOSIO_MULTI_EXECUTE_TOOL to execute the discovered tools
4. Process results and determine if you need additional steps
5. Return a concise summary of what you did and what the outcome was

**CONTEXT:**
- Allowed integrations: ${integrationSlugs.length > 0 ? integrationSlugs.join(", ") : "all available"}
- Delivery channels: ${(context.task.deliveryChannels ?? ["in_app"]).join(", ")}
- Input data: ${JSON.stringify(context.run.inputData ?? context.task.defaultInputData ?? {})}
- Task memory: ${formatMemoryEntries(context.memory.task)}
- Maximum steps: ${effectiveMaxSteps}

**SUCCESS CRITERIA:**
${recipe.successChecklist.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Execute the workflow now. Be efficient and action-oriented.`;

  const result = await generateText({
    model: getAiModel(),
    system: agenticSystemPrompt,
    prompt: `Execute this autonomous workflow. Use meta-tools to discover and execute the right actions.`,
    tools,
    stopWhen: stepCountIs(effectiveMaxSteps),
  });

  await recordCheckpoint({
    ctx,
    context,
    checkpoints,
    step: "workflow_complete",
    status: "completed",
    payload: {
      recipe: recipe.key,
      totalTokens: result.usage?.totalTokens ?? 0,
      stepsExecuted: result.steps?.length ?? 0,
    },
  });

  return {
    summary:
      result.text.trim() ||
      "The workflow completed without a final natural-language summary.",
    outputData: {
      summary:
        result.text.trim() ||
        "The workflow completed without a final natural-language summary.",
      checkpoints,
      workflowType: recipe.key,
      inputData: context.run.inputData ?? context.task.defaultInputData ?? {},
      toolCallsExecuted: result.steps?.filter((s: any) => s.toolCalls?.length > 0).length ?? 0,
    },
    usage: result.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    checkpoints,
  };
}
