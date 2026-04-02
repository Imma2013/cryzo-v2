"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  Edit,
  LayoutGrid,
  List,
  Pause,
  Play,
  Plus,
  Rocket,
  ScrollText,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRunTime } from "@/lib/autonomy-run-history";
import {
  cronFromDraft,
  cronHumanFromDraft,
} from "@/lib/autonomy-intent";
import type { ToolkitConnection } from "./autonomous-types";

type AutonomousViewProps = {
  userId: string | null;
  toolkits: ToolkitConnection[];
  onConnect: (slug: string) => Promise<void>;
};

type TaskCadence = "hourly" | "daily" | "weekly";
type TaskStatus = "active" | "paused" | "archived";
type ViewMode = "board" | "list";

type TaskRecord = NonNullable<ReturnType<typeof useQuery<typeof api.autonomous.listTasks>>>;
type TaskItem = TaskRecord extends Array<infer T> ? T : never;

function statusColumnLabel(status: TaskStatus) {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    default:
      return "ARCHIVED";
  }
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function taskSortValue(task: TaskItem) {
  return (
    task.schedule?.nextRunAt ??
    task._creationTime?.toString?.() ??
    task.createdAt ??
    new Date().toISOString()
  );
}

function formatSchedule(task: TaskItem) {
  return task.schedule?.cronHuman ?? "Manual";
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const tone =
    status === "active"
      ? "bg-green-100 text-green-700"
      : status === "paused"
        ? "bg-neutral-100 text-neutral-700"
        : "bg-neutral-200 text-neutral-700";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

export function AutonomousView({
  userId,
  toolkits,
  onConnect,
}: AutonomousViewProps) {
  const tasks = useQuery(api.autonomous.listTasks, userId ? { userId } : "skip");
  const recentEvents = useQuery(
    api.autonomous.listRecentEvents,
    userId ? { userId, limit: 30 } : "skip",
  );

  const createTask = useMutation(api.autonomous.createTask);
  const updateTaskDefinition = useMutation(api.autonomous.updateTaskDefinition);
  const updateTaskStatus = useMutation(api.autonomous.updateTaskStatus);
  const runTaskNow = useAction(api.autonomousActions.runTaskNow);

  const [view, setView] = useState<ViewMode>("board");
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [cadence, setCadence] = useState<TaskCadence>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");

  const sortedTasks = useMemo(() => {
    return [...(tasks ?? [])].sort((left, right) =>
      taskSortValue(left).localeCompare(taskSortValue(right)),
    );
  }, [tasks]);

  const tasksByStatus = useMemo(() => {
    return {
      active: sortedTasks.filter((task) => task.status === "active"),
      paused: sortedTasks.filter((task) => task.status === "paused"),
      archived: sortedTasks.filter((task) => task.status === "archived"),
    } satisfies Record<TaskStatus, TaskItem[]>;
  }, [sortedTasks]);

  const upcomingTasks = useMemo(() => {
    return sortedTasks
      .filter((task) => task.status !== "archived")
      .slice(0, 5);
  }, [sortedTasks]);

  async function handleRunNow(taskId: string) {
    if (!userId) {
      return;
    }
    setRunningTaskId(taskId);
    try {
      await runTaskNow({ taskId: taskId as never, userId });
    } finally {
      setRunningTaskId(null);
    }
  }

  function openCreateTask() {
    setSelectedTask(null);
    setTitle("");
    setInstruction("");
    setCadence("daily");
    setTimeOfDay("09:00");
    setIsTaskDialogOpen(true);
  }

  function openEditTask(task: TaskItem) {
    setSelectedTask(task);
    setTitle(task.title);
    setInstruction(task.instruction);
    setCadence(
      task.schedule?.cadence === "hourly" || task.schedule?.cadence === "weekly"
        ? task.schedule.cadence
        : "daily",
    );
    setTimeOfDay(task.schedule?.timeOfDay ?? "09:00");
    setIsTaskDialogOpen(true);
  }

  async function handleSubmitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !title.trim() || !instruction.trim()) {
      return;
    }

    const schedule = {
      cadence,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeOfDay,
      cron: cronFromDraft({ cadence, timeOfDay, daysOfWeek: [] }),
      cronHuman: cronHumanFromDraft({ cadence, timeOfDay, daysOfWeek: [] }),
      nextRunAt: new Date().toISOString(),
    };

    if (selectedTask) {
      await updateTaskDefinition({
        taskId: selectedTask._id,
        title: title.trim(),
        instruction: instruction.trim(),
        schedule,
      });
    } else {
      await createTask({
        userId,
        title: title.trim(),
        instruction: instruction.trim(),
        workflowCode: [`TASK: ${title.trim()}`, `INSTRUCTION: ${instruction.trim()}`].join("\n"),
        inputSchema: {
          type: "object",
          properties: {},
        },
        outputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
        },
        defaultInputData: {},
        integrationSlugs: [],
        deliveryChannels: ["in_app", "email"],
        goals: splitLines("Deliver the scheduled update."),
        successCriteria: splitLines("Task runs on time and logs the result."),
        workflowType: "general_recurring_task",
        sourcePrompt: instruction.trim(),
        autonomyMode: "full_auto",
        triggerType: "schedule",
        schedule,
      });
    }

    setIsTaskDialogOpen(false);
  }

  async function toggleTaskStatus(task: TaskItem) {
    await updateTaskStatus({
      taskId: task._id,
      status: task.status === "active" ? "paused" : "active",
    });
  }

  const disconnectedToolkits = toolkits.filter((toolkit) => !toolkit.isConnected);

  return (
    <div className="p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Tasks</h2>
          <div className="flex gap-2">
            <Button onClick={openCreateTask} data-testid="new-task-btn">
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={view === "board" ? "default" : "outline"}
                  onClick={() => setView("board")}
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Board
                </Button>
                <Button
                  size="sm"
                  variant={view === "list" ? "default" : "outline"}
                  onClick={() => setView("list")}
                >
                  <List className="mr-2 h-4 w-4" />
                  List
                </Button>
              </div>
              <span className="text-sm font-bold">{sortedTasks.length} tasks</span>
            </div>
          </CardContent>
        </Card>

        {view === "board" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Task Board</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 xl:grid-cols-3">
                {(["active", "paused", "archived"] as const).map((status) => (
                  <div key={status} className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-2 text-base font-bold">
                      {statusColumnLabel(status)} ({tasksByStatus[status].length})
                    </div>
                    <div className="flex flex-col gap-2">
                      {tasksByStatus[status].map((task) => (
                        <div
                          key={task._id}
                          className="cursor-pointer rounded-md border bg-background p-3 transition-shadow hover:shadow-sm"
                          onClick={() => openEditTask(task)}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="line-clamp-2 text-sm font-bold">{task.title}</div>
                            <StatusBadge status={task.status} />
                          </div>
                          <div className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                            {task.instruction}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatSchedule(task)}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRunNow(task._id);
                                }}
                              >
                                <Rocket className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void toggleTaskStatus(task);
                                }}
                              >
                                {task.status === "active" ? (
                                  <Pause className="h-3.5 w-3.5" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Task List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {sortedTasks.map((task) => (
                  <div
                    key={task._id}
                    className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent"
                    onClick={() => openEditTask(task)}
                  >
                    <div>
                      <div className="text-base font-bold">{task.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatSchedule(task)}
                        {task.schedule?.nextRunAt ? ` • Next ${formatRunTime(task.schedule.nextRunAt)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={task.status} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRunNow(task._id);
                        }}
                      >
                        <Rocket className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditTask(task);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {upcomingTasks.map((task) => (
                <div
                  key={task._id}
                  className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent"
                  onClick={() => openEditTask(task)}
                >
                  <div>
                    <div className="text-base font-bold">{task.title}</div>
                    <div className="text-sm text-muted-foreground">
                      <CalendarIcon className="mr-1 inline h-3.5 w-3.5" />
                      {task.schedule?.nextRunAt
                        ? `Next ${formatRunTime(task.schedule.nextRunAt)}`
                        : "No next run scheduled"}
                      {" • "}
                      {task.schedule?.cron ?? "manual"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={task.status} />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRunNow(task._id);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditTask(task);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleTaskStatus(task);
                      }}
                    >
                      {task.status === "active" ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Recent Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {(recentEvents ?? []).slice(0, 6).map((event) => (
                <div key={event._id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{event.type.replaceAll("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{formatRunTime(event.createdAt)}</div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {event.source}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {disconnectedToolkits.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Connect Apps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {disconnectedToolkits.slice(0, 6).map((toolkit) => (
                  <Button
                    key={toolkit.slug}
                    variant="outline"
                    onClick={() => void onConnect(toolkit.slug)}
                  >
                    {toolkit.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {isTaskDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {selectedTask ? "Edit Task" : "Create New Task"}
              </h3>
              <button
                type="button"
                onClick={() => setIsTaskDialogOpen(false)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSubmitTask} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-neutral-300 px-4 text-sm outline-none focus:border-black"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Instruction</label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={5}
                  required
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cadence</label>
                  <Select value={cadence} onValueChange={(value) => setCadence(value as TaskCadence)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Time</label>
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    className="h-11 w-full rounded-xl border border-neutral-300 px-4 text-sm outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="font-mono">{cronFromDraft({ cadence, timeOfDay, daysOfWeek: [] })}</div>
                <div className="mt-1">{cronHumanFromDraft({ cadence, timeOfDay, daysOfWeek: [] })}</div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsTaskDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {selectedTask ? "Update Task" : "Create Task"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
