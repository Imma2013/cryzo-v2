import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../convex/_generated/server", () => ({
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
}));

import {
  completeRun,
  createTask,
  listDueRuns,
  resolveApprovalRequest,
  startRun,
} from "../convex/autonomous";

type TableName =
  | "autonomousTasks"
  | "autonomousRuns"
  | "autonomousApprovals";

type RecordMap = Record<string, Record<string, any>>;

function createMockDb(seed?: Partial<RecordMap>) {
  const data: RecordMap = {
    autonomousTasks: {},
    autonomousRuns: {},
    autonomousApprovals: {},
    ...seed,
  };

  const counters: Record<TableName, number> = {
    autonomousTasks: Object.keys(data.autonomousTasks).length,
    autonomousRuns: Object.keys(data.autonomousRuns).length,
    autonomousApprovals: Object.keys(data.autonomousApprovals).length,
  };

  return {
    data,
    async insert(table: TableName, value: Record<string, any>) {
      counters[table] += 1;
      const id = `${table}-${counters[table]}`;
      data[table][id] = { _id: id, ...value };
      return id;
    },
    async patch(id: string, value: Record<string, any>) {
      for (const table of Object.keys(data) as TableName[]) {
        if (data[table][id]) {
          data[table][id] = { ...data[table][id], ...value };
          return;
        }
      }

      throw new Error(`Record ${id} not found.`);
    },
    async get(id: string) {
      for (const table of Object.keys(data) as TableName[]) {
        if (data[table][id]) {
          return data[table][id];
        }
      }

      return null;
    },
    query(table: TableName) {
      const rows = Object.values(data[table]);

      return {
        withIndex(indexName: string, callback: (queryBuilder: any) => any) {
          const filters: Array<{ type: "eq" | "lte"; field: string; value: any }> = [];
          const queryBuilder = {
            eq(field: string, value: any) {
              filters.push({ type: "eq", field, value });
              return queryBuilder;
            },
            lte(field: string, value: any) {
              filters.push({ type: "lte", field, value });
              return queryBuilder;
            },
          };

          callback(queryBuilder);

          let filteredRows = rows.filter((row) =>
            filters.every((filter) => {
              const fieldValue = row[filter.field];
              if (filter.type === "eq") {
                return fieldValue === filter.value;
              }

              return fieldValue !== undefined && fieldValue <= filter.value;
            }),
          );

          if (indexName === "by_status_scheduled") {
            filteredRows = filteredRows.sort((a, b) =>
              String(a.scheduledFor).localeCompare(String(b.scheduledFor)),
            );
          }

          return {
            async collect() {
              return filteredRows;
            },
            async unique() {
              return filteredRows[0] ?? null;
            },
          };
        },
      };
    },
  };
}

describe("autonomous task lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T15:30:00.000Z"));
  });

  it("creates active tasks with normalized schedule fields and timestamps", async () => {
    const db = createMockDb();

    const result = await createTask.handler(
      { db } as any,
      {
        userId: "user-1",
        title: "Daily CRM sync",
        instruction: "Sync leads and summarize changes.",
        integrationSlugs: ["salesforce"],
        goals: ["keep CRM fresh"],
        successCriteria: ["summary generated"],
        autonomyMode: "approval_required",
        triggerType: "schedule",
        schedule: {
          cadence: "daily",
          timezone: "America/Chicago",
          nextRunAt: "2026-04-02T12:00:00.000Z",
        },
        memoryKey: "crm",
        policyKey: "default",
      },
    );

    const task = db.data.autonomousTasks[result.taskId];

    expect(task).toMatchObject({
      userId: "user-1",
      title: "Daily CRM sync",
      instruction: "Sync leads and summarize changes.",
      status: "active",
      autonomyMode: "approval_required",
      triggerType: "schedule",
      schedule: {
        cadence: "daily",
        timezone: "America/Chicago",
        cron: undefined,
        nextRunAt: "2026-04-02T12:00:00.000Z",
      },
      integrationSlugs: ["salesforce"],
      goals: ["keep CRM fresh"],
      successCriteria: ["summary generated"],
      memoryKey: "crm",
      policyKey: "default",
      createdAt: "2026-04-01T15:30:00.000Z",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
  });

  it("lists only queued runs that are due by the requested boundary", async () => {
    const db = createMockDb({
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "queued",
          triggerSource: "scheduler",
          scheduledFor: "2026-04-01T14:00:00.000Z",
        },
        "run-2": {
          _id: "run-2",
          taskId: "task-2",
          userId: "user-1",
          status: "queued",
          triggerSource: "scheduler",
          scheduledFor: "2026-04-01T16:00:00.000Z",
        },
        "run-3": {
          _id: "run-3",
          taskId: "task-3",
          userId: "user-1",
          status: "running",
          triggerSource: "scheduler",
          scheduledFor: "2026-04-01T13:00:00.000Z",
        },
        "run-4": {
          _id: "run-4",
          taskId: "task-4",
          userId: "user-1",
          status: "queued",
          triggerSource: "manual",
        },
      },
    });

    const dueRuns = await listDueRuns.handler(
      { db } as any,
      { before: "2026-04-01T15:30:00.000Z" },
    );

    expect(dueRuns.map((run) => run._id)).toEqual(["run-1"]);
  });

  it("starts queued runs and records the start timestamp", async () => {
    const db = createMockDb({
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "queued",
          triggerSource: "scheduler",
          createdAt: "2026-04-01T15:00:00.000Z",
          updatedAt: "2026-04-01T15:00:00.000Z",
        },
      },
    });

    await startRun.handler({ db } as any, { runId: "run-1" as any });

    expect(db.data.autonomousRuns["run-1"]).toMatchObject({
      status: "running",
      startedAt: "2026-04-01T15:30:00.000Z",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
  });

  it("rejects starting runs that are not queued", async () => {
    const db = createMockDb({
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "running",
          triggerSource: "scheduler",
        },
      },
    });

    await expect(
      startRun.handler({ db } as any, { runId: "run-1" as any }),
    ).rejects.toThrow("Only queued runs can be started.");
  });

  it("completes runs, stamps completion, and updates the parent task summary", async () => {
    const db = createMockDb({
      autonomousTasks: {
        "task-1": {
          _id: "task-1",
          userId: "user-1",
          title: "Daily CRM sync",
          status: "active",
          updatedAt: "2026-04-01T15:00:00.000Z",
        },
      },
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "running",
          triggerSource: "scheduler",
        },
      },
    });

    await completeRun.handler(
      { db } as any,
      {
        runId: "run-1" as any,
        status: "succeeded",
        summary: "Synced 12 records.",
        score: 0.95,
      },
    );

    expect(db.data.autonomousRuns["run-1"]).toMatchObject({
      status: "succeeded",
      summary: "Synced 12 records.",
      score: 0.95,
      completedAt: "2026-04-01T15:30:00.000Z",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
    expect(db.data.autonomousTasks["task-1"]).toMatchObject({
      lastOutcomeSummary: "Synced 12 records.",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
  });

  it("keeps completion unset when a run moves to awaiting approval", async () => {
    const db = createMockDb({
      autonomousTasks: {
        "task-1": {
          _id: "task-1",
          userId: "user-1",
          title: "Daily CRM sync",
          status: "active",
        },
      },
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "running",
          triggerSource: "scheduler",
          completedAt: "2026-04-01T15:10:00.000Z",
        },
      },
    });

    await completeRun.handler(
      { db } as any,
      {
        runId: "run-1" as any,
        status: "awaiting_approval",
        summary: "Needs approval before sending email.",
      },
    );

    expect(db.data.autonomousRuns["run-1"]).toMatchObject({
      status: "awaiting_approval",
      completedAt: undefined,
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
  });

  it("requeues approved runs and cancels rejected approvals", async () => {
    const approvedDb = createMockDb({
      autonomousApprovals: {
        "approval-1": {
          _id: "approval-1",
          runId: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "pending",
        },
      },
      autonomousRuns: {
        "run-1": {
          _id: "run-1",
          taskId: "task-1",
          userId: "user-1",
          status: "awaiting_approval",
          triggerSource: "scheduler",
          completedAt: "2026-04-01T15:05:00.000Z",
        },
      },
    });

    await resolveApprovalRequest.handler(
      { db: approvedDb } as any,
      {
        approvalId: "approval-1" as any,
        status: "approved",
        decisionNote: "Looks safe.",
      },
    );

    expect(approvedDb.data.autonomousApprovals["approval-1"]).toMatchObject({
      status: "approved",
      decisionNote: "Looks safe.",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
    expect(approvedDb.data.autonomousRuns["run-1"]).toMatchObject({
      status: "queued",
      completedAt: undefined,
      updatedAt: "2026-04-01T15:30:00.000Z",
    });

    const rejectedDb = createMockDb({
      autonomousApprovals: {
        "approval-2": {
          _id: "approval-2",
          runId: "run-2",
          taskId: "task-2",
          userId: "user-1",
          status: "pending",
        },
      },
      autonomousRuns: {
        "run-2": {
          _id: "run-2",
          taskId: "task-2",
          userId: "user-1",
          status: "awaiting_approval",
          triggerSource: "scheduler",
        },
      },
    });

    await resolveApprovalRequest.handler(
      { db: rejectedDb } as any,
      {
        approvalId: "approval-2" as any,
        status: "rejected",
      },
    );

    expect(rejectedDb.data.autonomousRuns["run-2"]).toMatchObject({
      status: "cancelled",
      completedAt: "2026-04-01T15:30:00.000Z",
      updatedAt: "2026-04-01T15:30:00.000Z",
    });
  });
});
