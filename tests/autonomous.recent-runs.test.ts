import { describe, expect, it, vi } from "vitest";

vi.mock("../convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
}));

import { listRecentRuns } from "../convex/autonomous";

type RunRecord = {
  _id: string;
  taskId: string;
  userId: string;
  status: string;
  triggerSource: string;
  createdAt: string;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  error?: string;
};

type TaskRecord = {
  _id: string;
  title: string;
  status: "active" | "paused" | "archived";
};

function createRecentRunsCtx(args: {
  runs: RunRecord[];
  tasks: Record<string, TaskRecord | null>;
}) {
  return {
    db: {
      query(table: string) {
        if (table !== "autonomousRuns") {
          throw new Error(`Unexpected table query: ${table}`);
        }

        return {
          withIndex(indexName: string, callback: (queryBuilder: any) => any) {
            if (indexName !== "by_user_created") {
              throw new Error(`Unexpected index: ${indexName}`);
            }

            let userId: string | null = null;
            const queryBuilder = {
              eq(field: string, value: string) {
                if (field === "userId") {
                  userId = value;
                }
                return queryBuilder;
              },
            };

            callback(queryBuilder);

            const filteredRuns = args.runs.filter((run) => run.userId === userId);

            return {
              order(direction: "asc" | "desc") {
                const orderedRuns = [...filteredRuns].sort((left, right) =>
                  direction === "desc"
                    ? right.createdAt.localeCompare(left.createdAt)
                    : left.createdAt.localeCompare(right.createdAt),
                );

                return {
                  async take(limit: number) {
                    return orderedRuns.slice(0, limit);
                  },
                };
              },
            };
          },
        };
      },
      async get(taskId: string) {
        return args.tasks[taskId] ?? null;
      },
    },
  };
}

describe("listRecentRuns", () => {
  it("returns newest runs first, enriches task metadata, and falls back for missing tasks", async () => {
    const ctx = createRecentRunsCtx({
      runs: [
        {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "succeeded",
          triggerSource: "scheduler",
          createdAt: "2026-04-02T12:00:00.000Z",
          summary: "Synced 12 records.",
        },
        {
          _id: "run-2",
          taskId: "task-2",
          userId: "user-1",
          status: "failed",
          triggerSource: "retry",
          createdAt: "2026-04-02T13:00:00.000Z",
          error: "Billing exhausted.",
        },
        {
          _id: "run-3",
          taskId: "task-3",
          userId: "user-2",
          status: "queued",
          triggerSource: "manual",
          createdAt: "2026-04-02T14:00:00.000Z",
        },
      ],
      tasks: {
        "task-1": {
          _id: "task-1",
          title: "Daily CRM sync",
          status: "active",
        },
        "task-2": null,
      },
    });

    const result = await listRecentRuns.handler(
      ctx as any,
      { userId: "user-1", limit: 10 },
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      _id: "run-2",
      taskTitle: "Unknown task",
      taskStatus: "archived",
      error: "Billing exhausted.",
    });
    expect(result[1]).toMatchObject({
      _id: "run-1",
      taskTitle: "Daily CRM sync",
      taskStatus: "active",
      summary: "Synced 12 records.",
    });
  });

  it("clamps the requested limit into the supported range", async () => {
    const runs = Array.from({ length: 60 }, (_, index) => ({
      _id: `run-${index + 1}`,
      taskId: `task-${index + 1}`,
      userId: "user-1",
      status: "succeeded",
      triggerSource: "scheduler",
      createdAt: `2026-04-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    }));

    const ctx = createRecentRunsCtx({
      runs,
      tasks: Object.fromEntries(
        runs.map((run) => [
          run.taskId,
          {
            _id: run.taskId,
            title: `Task ${run.taskId}`,
            status: "active",
          } satisfies TaskRecord,
        ]),
      ),
    });

    const limitedToMax = await listRecentRuns.handler(
      ctx as any,
      { userId: "user-1", limit: 500 },
    );
    const limitedToMin = await listRecentRuns.handler(
      ctx as any,
      { userId: "user-1", limit: 0 },
    );

    expect(limitedToMax).toHaveLength(50);
    expect(limitedToMin).toHaveLength(1);
  });
});
