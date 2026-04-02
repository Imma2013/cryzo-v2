import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryState, mutationState } = vi.hoisted(() => ({
  queryState: {
    values: [] as unknown[],
    calls: [] as Array<{ apiRef: unknown; args: unknown }>,
  },
  mutationState: {
    calls: [] as unknown[],
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (apiRef: unknown, args: unknown) => {
    queryState.calls.push({ apiRef, args });
    return queryState.values.shift();
  },
  useMutation: () => (...args: unknown[]) => {
    mutationState.calls.push(args);
    return Promise.resolve();
  },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    autonomous: {
      listTasks: "autonomous.listTasks",
      listRecentRuns: "autonomous.listRecentRuns",
      createTask: "autonomous.createTask",
      updateTaskStatus: "autonomous.updateTaskStatus",
    },
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("@/lib/autonomy-run-history", () => ({
  formatRunTime: (value?: string) => value ?? "Waiting to run",
  getRunStatusTone: (status: string) => `tone-${status}`,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span>AlertCircle</span>,
  Bot: () => <span>Bot</span>,
  Pause: () => <span>Pause</span>,
  Play: () => <span>Play</span>,
  Zap: () => <span>Zap</span>,
}));

import { AutonomousView } from "../components/autonomous/autonomous-view";

function renderView(recentRuns: unknown) {
  queryState.values = [[], recentRuns];
  queryState.calls = [];
  mutationState.calls = [];

  return renderToStaticMarkup(
    <AutonomousView
      userId="user-1"
      toolkits={[]}
      onConnect={async () => {}}
    />,
  );
}

describe("AutonomousView run history", () => {
  beforeEach(() => {
    queryState.values = [];
    queryState.calls = [];
    mutationState.calls = [];
  });

  it("shows a loading state while recent runs are unresolved", () => {
    const html = renderView(undefined);

    expect(html).toContain("Loading run history...");
    expect(queryState.calls[1]).toMatchObject({
      args: { userId: "user-1", limit: 8 },
    });
  });

  it("shows an empty state when no runs have been recorded", () => {
    const html = renderView([]);

    expect(html).toContain("No autonomous runs have been recorded yet.");
  });

  it("renders summary and failure states for recent runs", () => {
    const html = renderView([
      {
        _id: "run-1",
        taskTitle: "Daily CRM sync",
        taskStatus: "active",
        triggerSource: "scheduler",
        status: "succeeded",
        summary: "Synced 12 records.",
        createdAt: "2026-04-01T12:00:00.000Z",
      },
      {
        _id: "run-2",
        taskTitle: "Email triage",
        taskStatus: "paused",
        triggerSource: "retry",
        status: "failed",
        error: "Task requires disconnected integrations: slack.",
        createdAt: "2026-04-01T13:00:00.000Z",
      },
    ]);

    expect(html).toContain("Daily CRM sync");
    expect(html).toContain("Synced 12 records.");
    expect(html).toContain("task active");
    expect(html).toContain("source scheduler");
    expect(html).toContain("Task requires disconnected integrations: slack.");
    expect(html).toContain("task paused");
    expect(html).toContain("source retry");
  });
});
