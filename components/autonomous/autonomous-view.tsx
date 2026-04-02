"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Compass,
  Pause,
  Play,
  Plus,
  Search,
  Zap,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRunTime } from "@/lib/autonomy-run-history";
import {
  cronFromDraft,
  cronHumanFromDraft,
} from "@/lib/autonomy-intent";
import type { ToolkitConnection } from "./autonomous-types";

const CRON_PRESETS = [
  { label: "Hourly", cadence: "hourly" as const, timeOfDay: "" },
  { label: "Daily 8 AM", cadence: "daily" as const, timeOfDay: "08:00" },
  { label: "Daily 9 AM", cadence: "daily" as const, timeOfDay: "09:00" },
  { label: "Daily 5 PM", cadence: "daily" as const, timeOfDay: "17:00" },
  { label: "Weekly Mon", cadence: "weekly" as const, timeOfDay: "09:00" },
  { label: "Custom", cadence: "daily" as const, timeOfDay: "" },
];

const DISCOVER_TEMPLATES = [
  {
    id: "daily-gmail-digest",
    name: "Daily Gmail Digest",
    description: "Summarise unread emails every morning and highlight anything urgent.",
    integrations: ["gmail"],
    cadence: "daily" as const,
    timeOfDay: "08:00",
    instruction: "Check my Gmail inbox and send me a concise summary of unread emails, highlighting anything that needs my attention.",
    category: "Email",
  },
  {
    id: "weekly-github-pr",
    name: "Weekly GitHub PR Summary",
    description: "Get a rundown of open pull requests every Friday afternoon.",
    integrations: ["github"],
    cadence: "weekly" as const,
    timeOfDay: "17:00",
    instruction: "List all open pull requests in my GitHub repos, summarise what each one does and flag any that have been open more than 3 days.",
    category: "Engineering",
  },
  {
    id: "daily-calendar-briefing",
    name: "Morning Calendar Briefing",
    description: "A daily briefing of your Google Calendar meetings before you start.",
    integrations: ["googlecalendar"],
    cadence: "daily" as const,
    timeOfDay: "07:30",
    instruction: "Fetch my Google Calendar events for today and give me a concise briefing: meeting times, attendees, and any prep I should do.",
    category: "Calendar",
  },
  {
    id: "daily-slack-digest",
    name: "Daily Slack Digest",
    description: "Catch up on unread Slack messages each morning.",
    integrations: ["slack"],
    cadence: "daily" as const,
    timeOfDay: "08:30",
    instruction: "Summarise my unread Slack messages from the past 24 hours, grouped by channel, and flag any @mentions.",
    category: "Messaging",
  },
  {
    id: "weekly-notion-update",
    name: "Weekly Notion Pages Update",
    description: "Review and update your Notion docs every Monday morning.",
    integrations: ["notion"],
    cadence: "weekly" as const,
    timeOfDay: "09:00",
    instruction: "Check my Notion workspace for pages updated in the last 7 days and give me a summary of what changed.",
    category: "Productivity",
  },
  {
    id: "daily-twitter-digest",
    name: "Daily X / Twitter Digest",
    description: "Summarise your Twitter timeline and mentions every morning.",
    integrations: ["twitter"],
    cadence: "daily" as const,
    timeOfDay: "08:00",
    instruction: "Fetch my Twitter/X timeline from the past 24 hours and give me a digest of the most interesting posts and any mentions.",
    category: "Social",
  },
  {
    id: "weekly-google-sheets-report",
    name: "Weekly Analytics Report",
    description: "Auto-fill a Google Sheet with weekly metrics every Monday.",
    integrations: ["googlesheets"],
    cadence: "weekly" as const,
    timeOfDay: "09:00",
    instruction: "Pull key metrics from my connected analytics sources and append a new row to my Google Sheet weekly report tracker.",
    category: "Analytics",
  },
  {
    id: "daily-reddit-digest",
    name: "Daily Reddit Digest",
    description: "Get the top posts from your subreddits each morning.",
    integrations: ["reddit"],
    cadence: "daily" as const,
    timeOfDay: "08:00",
    instruction: "Fetch the top 5 posts from my saved subreddits from the last 24 hours and give me a concise digest.",
    category: "Social",
  },
];

const SLUG_COLORS: Record<string, string> = {
  gmail: "bg-red-100 text-red-700",
  googlecalendar: "bg-blue-100 text-blue-700",
  googlesheets: "bg-green-100 text-green-700",
  googledrive: "bg-yellow-100 text-yellow-700",
  googledocs: "bg-blue-100 text-blue-600",
  slack: "bg-purple-100 text-purple-700",
  notion: "bg-neutral-200 text-neutral-700",
  twitter: "bg-sky-100 text-sky-700",
  reddit: "bg-orange-100 text-orange-700",
  github: "bg-neutral-200 text-neutral-800",
  linear: "bg-violet-100 text-violet-700",
  youtube: "bg-red-100 text-red-600",
};

function SlugIcon({ slug }: { slug: string }) {
  const color = SLUG_COLORS[slug.toLowerCase()] ?? "bg-neutral-100 text-neutral-600";
  const label = slug.slice(0, 2).toUpperCase();
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${color}`}>
      {label}
    </span>
  );
}

type AutonomousViewProps = {
  userId: string | null;
  toolkits: ToolkitConnection[];
  onConnect: (slug: string) => Promise<void>;
};

type TaskCadence = "hourly" | "daily" | "weekly";

type TaskRecord = NonNullable<ReturnType<typeof useQuery<typeof api.autonomous.listTasks>>>;
type TaskItem = TaskRecord extends Array<infer T> ? T : never;

function splitLines(value: string) {
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

function taskSortValue(task: TaskItem) {
  return task.schedule?.nextRunAt ?? task._creationTime?.toString?.() ?? task.createdAt ?? new Date().toISOString();
}

function ActiveBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function AutonomousView({ userId, toolkits, onConnect }: AutonomousViewProps) {
  const tasks = useQuery(api.autonomous.listTasks, userId ? { userId } : "skip");

  const createTask = useMutation(api.autonomous.createTask);
  const updateTaskDefinition = useMutation(api.autonomous.updateTaskDefinition);
  const updateTaskStatus = useMutation(api.autonomous.updateTaskStatus);

  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "runs">("overview");
  const [listTab, setListTab] = useState<"tasks" | "discover">("tasks");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const taskRuns = useQuery(
    api.autonomous.listRunsByTask,
    detailTaskId ? { taskId: detailTaskId as never, limit: 20 } : "skip",
  );

  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [cadence, setCadence] = useState<TaskCadence>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");

  const sortedTasks = useMemo(() => {
    return [...(tasks ?? [])].sort((a, b) => taskSortValue(a).localeCompare(taskSortValue(b)));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return sortedTasks;
    const q = search.toLowerCase();
    return sortedTasks.filter((t) => t.title.toLowerCase().includes(q) || t.instruction.toLowerCase().includes(q));
  }, [sortedTasks, search]);

  const scheduledTasks = useMemo(() => filteredTasks.filter((t) => t.status === "active" && t.schedule?.cronHuman), [filteredTasks]);
  const otherTasks = useMemo(() => filteredTasks.filter((t) => !(t.status === "active" && t.schedule?.cronHuman)), [filteredTasks]);

  const detailTask = useMemo(() => tasks?.find((t) => t._id === detailTaskId) ?? null, [tasks, detailTaskId]);

  async function handleRunNow(taskId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!userId) return;
    setRunningTaskId(taskId);
    try {
      await fetch("/api/autonomous/run-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, userId }),
      });
    } finally {
      setRunningTaskId(null);
    }
  }

  function openCreate(template?: typeof DISCOVER_TEMPLATES[number]) {
    setEditingTask(null);
    if (template) {
      setTitle(template.name);
      setInstruction(template.instruction);
      setCadence(template.cadence);
      setTimeOfDay(template.timeOfDay);
      setIsDialogOpen(true);
      return;
    }
    setTitle("");
    setInstruction("");
    setCadence("daily");
    setTimeOfDay("09:00");
    setIsDialogOpen(true);
  }

  function formatRunDuration(run: { startedAt?: string; completedAt?: string }) {
    if (!run.startedAt || !run.completedAt) return "-";
    const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function openEdit(task: TaskItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingTask(task);
    setTitle(task.title);
    setInstruction(task.instruction);
    setCadence(task.schedule?.cadence === "hourly" || task.schedule?.cadence === "weekly" ? task.schedule.cadence : "daily");
    setTimeOfDay(task.schedule?.timeOfDay ?? "09:00");
    setIsDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || !title.trim() || !instruction.trim()) return;

    const schedule = {
      cadence,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeOfDay,
      cron: cronFromDraft({ cadence, timeOfDay, daysOfWeek: [] }),
      cronHuman: cronHumanFromDraft({ cadence, timeOfDay, daysOfWeek: [] }),
      nextRunAt: new Date().toISOString(),
    };

    if (editingTask) {
      await updateTaskDefinition({ taskId: editingTask._id, title: title.trim(), instruction: instruction.trim(), schedule });
    } else {
      await createTask({
        userId, title: title.trim(), instruction: instruction.trim(),
        workflowCode: `TASK: ${title.trim()}\nINSTRUCTION: ${instruction.trim()}`,
        inputSchema: { type: "object", properties: {} },
        outputSchema: { type: "object", properties: { summary: { type: "string" } } },
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
    setIsDialogOpen(false);
  }

  async function toggleStatus(task: TaskItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    await updateTaskStatus({ taskId: task._id, status: task.status === "active" ? "paused" : "active" });
  }

  if (detailTask) {
    return (
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <button
            onClick={() => setDetailTaskId(null)}
            className="mb-8 flex items-center gap-2 rounded-lg p-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <h1 className="mb-8 text-3xl font-bold text-neutral-900">{detailTask.title}</h1>

          <div className="mb-8 flex flex-col gap-4">
            {detailTask.integrationSlugs && detailTask.integrationSlugs.length > 0 && (
              <div className="flex items-center gap-6">
                <span className="w-24 text-sm text-neutral-400">Apps</span>
                <div className="flex items-center gap-2">
                  {detailTask.integrationSlugs.map((slug) => (
                    <SlugIcon key={slug} slug={slug} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-6">
              <span className="w-24 text-sm text-neutral-400">Schedule</span>
              <div className="flex items-center gap-2">
                <ActiveBadge status={detailTask.status} />
                {detailTask.schedule?.cronHuman ? (
                  <span className="text-sm text-neutral-600">{detailTask.schedule.cronHuman}</span>
                ) : (
                  <span className="text-sm text-neutral-400">Manual only</span>
                )}
              </div>
            </div>

            {detailTask.schedule?.nextRunAt && detailTask.status === "active" && (
              <div className="flex items-center gap-6">
                <span className="w-24 text-sm text-neutral-400">Next run</span>
                <span className="text-sm text-neutral-600">{formatRunTime(detailTask.schedule.nextRunAt)}</span>
              </div>
            )}
          </div>

          <div className="mb-8 flex items-center gap-3">
            <button
              onClick={() => void handleRunNow(detailTask._id)}
              disabled={runningTaskId === detailTask._id}
              className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              {runningTaskId === detailTask._id ? "Running…" : "Run"}
            </button>
            <button
              onClick={(e) => void toggleStatus(detailTask, e)}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              {detailTask.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {detailTask.status === "active" ? "Pause" : "Resume"}
            </button>
            <button
              onClick={(e) => openEdit(detailTask, e)}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Clock className="h-3.5 w-3.5" />
              Edit Schedule
            </button>
          </div>

          <div className="border-b border-neutral-200">
            <div className="flex gap-6">
              {(["overview", "runs"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`pb-2 text-sm font-medium capitalize transition-colors ${
                    detailTab === tab
                      ? "border-b-2 border-black text-black"
                      : "text-neutral-400 hover:text-neutral-700"
                  }`}
                >
                  {tab === "runs" ? "Run History" : "Overview"}
                </button>
              ))}
            </div>
          </div>

          {detailTab === "overview" && (
            <div className="py-6">
              <p className="leading-relaxed text-neutral-600">{detailTask.instruction}</p>
            </div>
          )}

          {detailTab === "runs" && (
            <div className="py-4">
              {!taskRuns || taskRuns.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Clock className="mb-2 h-8 w-8 text-neutral-300" />
                  <p className="text-sm text-neutral-400">No runs yet. Hit Run to execute this task.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-4 gap-4 px-3 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                    <span>Status</span><span>Triggered</span><span>Duration</span><span>Source</span>
                  </div>
                  {taskRuns.map((run) => (
                    <div key={run._id} className="grid grid-cols-4 gap-4 rounded-lg px-3 py-2.5 text-sm hover:bg-neutral-50">
                      <span className="flex items-center gap-1.5">
                        {run.status === "succeeded" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : run.status === "failed" ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : run.status === "running" ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                        ) : (
                          <Clock className="h-4 w-4 text-neutral-400" />
                        )}
                        <span className={`capitalize ${
                          run.status === "succeeded" ? "text-green-700" :
                          run.status === "failed" ? "text-red-600" :
                          run.status === "running" ? "text-blue-600" :
                          "text-neutral-500"
                        }`}>{run.status}</span>
                      </span>
                      <span className="text-neutral-500">{run.scheduledFor ? formatRunTime(run.scheduledFor) : formatRunTime(run.createdAt)}</span>
                      <span className="text-neutral-500">{formatRunDuration(run)}</span>
                      <span className="capitalize text-neutral-400">{run.triggerSource?.replace("_", " ") ?? "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {isDialogOpen && (
          <TaskDialog
            editing={editingTask}
            title={title} setTitle={setTitle}
            instruction={instruction} setInstruction={setInstruction}
            cadence={cadence} setCadence={setCadence}
            timeOfDay={timeOfDay} setTimeOfDay={setTimeOfDay}
            onSubmit={handleSubmit}
            onClose={() => setIsDialogOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-1">
            <button
              onClick={() => setListTab("tasks")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                listTab === "tasks" ? "bg-black text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setListTab("discover")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                listTab === "discover" ? "bg-black text-white" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Discover
            </button>
          </div>
          <div className="flex items-center gap-3">
            {listTab === "tasks" && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="h-9 w-48 rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm outline-none focus:border-neutral-400 focus:bg-white"
                />
              </div>
            )}
            <button
              onClick={() => openCreate()}
              data-testid="new-task-btn"
              className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-80"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          </div>
        </div>

        {listTab === "discover" && (
          <div className="mb-4">
            <p className="mb-5 text-sm text-neutral-500">Pre-built tasks — click <strong>Use</strong> to customise and save.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {DISCOVER_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="mb-1 flex items-start justify-between">
                    <span className="text-xs font-medium text-neutral-400">{tpl.category}</span>
                    <div className="flex gap-1">
                      {tpl.integrations.map((s) => <SlugIcon key={s} slug={s} />)}
                    </div>
                  </div>
                  <div className="mb-1.5 text-base font-semibold text-neutral-900">{tpl.name}</div>
                  <p className="mb-4 text-sm text-neutral-500 line-clamp-2">{tpl.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">{cronHumanFromDraft({ cadence: tpl.cadence, timeOfDay: tpl.timeOfDay, daysOfWeek: [] })}</span>
                    <button
                      onClick={() => openCreate(tpl)}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:opacity-80"
                    >
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {listTab === "tasks" && (
          <>
            {scheduledTasks.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-4 text-xl font-bold text-neutral-900">Scheduled</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {scheduledTasks.map((task) => (
                    <div
                      key={task._id}
                      onClick={() => setDetailTaskId(task._id)}
                      className="group cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <ActiveBadge status={task.status} />
                          <span>{task.schedule?.cronHuman}</span>
                        </div>
                        <button onClick={(e) => e.stopPropagation()} className="rounded p-0.5 text-neutral-300 hover:text-neutral-600">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="3" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="13" r="1.2" />
                          </svg>
                        </button>
                      </div>
                      <div className="mb-3 text-base font-semibold text-neutral-900 line-clamp-1">{task.title}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {(task.integrationSlugs ?? []).slice(0, 3).map((slug) => (
                            <SlugIcon key={slug} slug={slug} />
                          ))}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => void handleRunNow(task._id, e)}
                            disabled={runningTaskId === task._id}
                            className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            {runningTaskId === task._id ? "…" : "Run"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailTaskId(task._id); }}
                            className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            View <span className="text-neutral-400">→</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherTasks.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-bold text-neutral-900">Tasks</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {otherTasks.map((task) => (
                    <div
                      key={task._id}
                      onClick={() => setDetailTaskId(task._id)}
                      className="group cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <ActiveBadge status={task.status} />
                        <button onClick={(e) => e.stopPropagation()} className="rounded p-0.5 text-neutral-300 hover:text-neutral-600">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="3" r="1.2" /><circle cx="8" cy="8" r="1.2" /><circle cx="8" cy="13" r="1.2" />
                          </svg>
                        </button>
                      </div>
                      <div className="mb-3 text-base font-semibold text-neutral-900 line-clamp-1">{task.title}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {(task.integrationSlugs ?? []).slice(0, 3).map((slug) => (
                            <SlugIcon key={slug} slug={slug} />
                          ))}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => void handleRunNow(task._id, e)}
                            disabled={runningTaskId === task._id}
                            className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            {runningTaskId === task._id ? "…" : "Run"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailTaskId(task._id); }}
                            className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            View <span className="text-neutral-400">→</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {listTab === "tasks" && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-3 text-4xl">⏱</div>
            <div className="mb-1 text-base font-semibold text-neutral-700">No tasks yet</div>
            <div className="mb-6 text-sm text-neutral-400">Create a task or ask Cryzo to set one up for you.</div>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-80"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          </div>
        )}
      </div>

      {isDialogOpen && (
        <TaskDialog
          editing={editingTask}
          title={title} setTitle={setTitle}
          instruction={instruction} setInstruction={setInstruction}
          cadence={cadence} setCadence={setCadence}
          timeOfDay={timeOfDay} setTimeOfDay={setTimeOfDay}
          onSubmit={handleSubmit}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
}

function TaskDialog({
  editing, title, setTitle, instruction, setInstruction,
  cadence, setCadence, timeOfDay, setTimeOfDay, onSubmit, onClose,
}: {
  editing: TaskItem | null;
  title: string; setTitle: (v: string) => void;
  instruction: string; setInstruction: (v: string) => void;
  cadence: TaskCadence; setCadence: (v: TaskCadence) => void;
  timeOfDay: string; setTimeOfDay: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold">{editing ? "Edit Task" : "New Task"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Title</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} required
              placeholder="e.g. Daily Unread Gmail Digest"
              className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Instruction</label>
            <textarea
              value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} required
              placeholder="Describe what this task should do…"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-700">Schedule</label>
            <div className="flex flex-wrap gap-2">
              {CRON_PRESETS.map((preset) => {
                const isCustom = preset.label === "Custom";
                const isActive = !isCustom
                  ? cadence === preset.cadence && timeOfDay === preset.timeOfDay
                  : !CRON_PRESETS.filter((p) => p.label !== "Custom").some(
                      (p) => cadence === p.cadence && timeOfDay === p.timeOfDay,
                    );
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { if (!isCustom) { setCadence(preset.cadence); setTimeOfDay(preset.timeOfDay); } }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            {!CRON_PRESETS.filter((p) => p.label !== "Custom").some(
              (p) => cadence === p.cadence && timeOfDay === p.timeOfDay,
            ) && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Select value={cadence} onValueChange={(v) => setCadence(v as TaskCadence)}>
                  <SelectTrigger className="h-9 rounded-lg border-neutral-200 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)}
                  className="h-9 rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-black"
                />
              </div>
            )}
            <p className="pt-1 text-xs text-neutral-400">
              {cronHumanFromDraft({ cadence, timeOfDay, daysOfWeek: [] })}
              <span className="ml-2 font-mono">{cronFromDraft({ cadence, timeOfDay, daysOfWeek: [] })}</span>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-80">
              {editing ? "Update" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
