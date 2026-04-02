import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiTokens, mockState } = vi.hoisted(() => ({
  apiTokens: {
    autonomous: {
      ensureScheduledRuns: "autonomous.ensureScheduledRuns",
      claimNextDueRun: "autonomous.claimNextDueRun",
      getRunDispatchContext: "autonomous.getRunDispatchContext",
      completeRun: "autonomous.completeRun",
      recordEvent: "autonomous.recordEvent",
    },
    billing: {
      getBillingSummary: "billing.getBillingSummary",
      recordUsage: "billing.recordUsage",
    },
  },
  mockState: {
    mutation: vi.fn(),
    query: vi.fn(),
    composioCreate: vi.fn(),
    generateText: vi.fn(),
    ensureScheduledRuns: vi.fn(),
    claimNextDueRun: vi.fn(),
    getRunDispatchContext: vi.fn(),
    getEffectiveIntegrationSlugs: vi.fn(),
    getMaxActionsPerRun: vi.fn(),
  },
}));

vi.mock("../convex/_generated/api", () => ({
  api: apiTokens,
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    mutation: (...args: unknown[]) => mockState.mutation(...args),
    query: (...args: unknown[]) => mockState.query(...args),
  })),
}));

vi.mock("@composio/core", () => ({
  Composio: vi.fn().mockImplementation(() => ({
    create: (...args: unknown[]) => mockState.composioCreate(...args),
  })),
}));

vi.mock("@composio/vercel", () => ({
  VercelProvider: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockState.generateText(...args),
  stepCountIs: vi.fn((count: number) => count),
}));

vi.mock("../lib/autonomy-executor", () => ({
  buildSystemPrompt: vi.fn(() => "system prompt"),
  ensureScheduledRuns: (...args: unknown[]) => mockState.ensureScheduledRuns(...args),
  claimNextDueRun: (...args: unknown[]) => mockState.claimNextDueRun(...args),
  getRunDispatchContext: (...args: unknown[]) => mockState.getRunDispatchContext(...args),
  getEffectiveIntegrationSlugs: (...args: unknown[]) =>
    mockState.getEffectiveIntegrationSlugs(...args),
  getMaxActionsPerRun: (...args: unknown[]) => mockState.getMaxActionsPerRun(...args),
}));

import { GET } from "../app/api/autonomous/dispatch/route";

function createDispatchContext(overrides?: Partial<any>) {
  return {
    run: {
      _id: "run-1",
      scheduledFor: "2026-04-01T12:00:00.000Z",
    },
    task: {
      _id: "task-1",
      userId: "user-1",
      title: "Daily CRM sync",
      instruction: "Sync and summarize.",
      integrationSlugs: ["slack"],
      goals: ["keep CRM fresh"],
      successCriteria: ["send summary"],
    },
    memory: {
      task: [],
      user: [],
    },
    policies: [],
    ...overrides,
  };
}

describe("/api/autonomous/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://convex.example");
    mockState.getEffectiveIntegrationSlugs.mockReturnValue(["slack"]);
    mockState.getMaxActionsPerRun.mockReturnValue(10);
  });

  it("rejects unauthorized scheduler requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTONOMOUS_DISPATCH_SECRET", "top-secret");

    const response = await GET(
      new Request("https://example.com/api/autonomous/dispatch"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized autonomous dispatch trigger.",
    });
    expect(mockState.mutation).not.toHaveBeenCalled();
    expect(mockState.query).not.toHaveBeenCalled();
  });

  it("fails claimed runs when the billing window has no remaining tokens", async () => {
    vi.stubEnv("AUTONOMOUS_DISPATCH_SECRET", "top-secret");

    mockState.ensureScheduledRuns.mockResolvedValue({ queuedCount: 0 });
    mockState.claimNextDueRun.mockResolvedValue({ claimed: true, runId: "run-1" });
    mockState.getRunDispatchContext.mockResolvedValue(createDispatchContext());

    mockState.mutation.mockImplementation(async (endpoint: string, args?: any) => {
      switch (endpoint) {
        case apiTokens.autonomous.completeRun:
        case apiTokens.autonomous.recordEvent:
          return { ok: true, args };
        default:
          throw new Error(`Unexpected mutation: ${endpoint}`);
      }
    });

    mockState.query.mockImplementation(async (endpoint: string) => {
      switch (endpoint) {
        case apiTokens.billing.getBillingSummary:
          return { remainingTokens: 0 };
        default:
          throw new Error(`Unexpected query: ${endpoint}`);
      }
    });

    const response = await GET(
      new Request("https://example.com/api/autonomous/dispatch", {
        headers: {
          "x-autonomous-dispatch-secret": "top-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      queuedCount: 0,
      processedCount: 1,
      results: [
        {
          runId: "run-1",
          status: "failed",
          error:
            "The user has no remaining tokens for autonomous execution in the current billing window.",
        },
      ],
    });
    expect(mockState.mutation).toHaveBeenCalledWith(
      apiTokens.autonomous.completeRun,
      {
        runId: "run-1",
        status: "failed",
        error:
          "The user has no remaining tokens for autonomous execution in the current billing window.",
      },
    );
    expect(mockState.mutation).toHaveBeenCalledWith(
      apiTokens.autonomous.recordEvent,
      expect.objectContaining({
        userId: "user-1",
        taskId: "task-1",
        runId: "run-1",
        type: "run_failed",
      }),
    );
    expect(mockState.composioCreate).not.toHaveBeenCalled();
  });

  it("fails claimed runs when required integrations are disconnected", async () => {
    vi.stubEnv("AUTONOMOUS_DISPATCH_SECRET", "top-secret");

    const toolkits = vi.fn().mockResolvedValue({
      items: [
        {
          slug: "slack",
          connection: { isActive: false },
        },
      ],
    });

    mockState.composioCreate.mockResolvedValue({
      toolkits,
      tools: vi.fn(),
    });

    mockState.ensureScheduledRuns.mockResolvedValue({ queuedCount: 0 });
    mockState.claimNextDueRun.mockResolvedValue({ claimed: true, runId: "run-1" });
    mockState.getRunDispatchContext.mockResolvedValue(createDispatchContext());

    mockState.mutation.mockImplementation(async (endpoint: string, args?: any) => {
      switch (endpoint) {
        case apiTokens.autonomous.completeRun:
        case apiTokens.autonomous.recordEvent:
          return { ok: true, args };
        default:
          throw new Error(`Unexpected mutation: ${endpoint}`);
      }
    });

    mockState.query.mockImplementation(async (endpoint: string) => {
      switch (endpoint) {
        case apiTokens.billing.getBillingSummary:
          return { remainingTokens: 500 };
        default:
          throw new Error(`Unexpected query: ${endpoint}`);
      }
    });

    const response = await GET(
      new Request("https://example.com/api/autonomous/dispatch", {
        headers: {
          authorization: "Bearer top-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processedCount: 1,
      results: [
        {
          runId: "run-1",
          status: "failed",
          error: "Task requires disconnected integrations: slack.",
        },
      ],
    });
    expect(mockState.composioCreate).toHaveBeenCalledWith("user-1");
    expect(toolkits).toHaveBeenCalledWith({ toolkits: ["slack"] });
    expect(mockState.mutation).toHaveBeenCalledWith(
      apiTokens.autonomous.completeRun,
      {
        runId: "run-1",
        status: "failed",
        error: "Task requires disconnected integrations: slack.",
      },
    );
    expect(mockState.generateText).not.toHaveBeenCalled();
  });
});
