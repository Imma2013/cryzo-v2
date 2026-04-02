"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { useQuery } from "convex/react";
import { useMutation } from "convex/react";
import { signInWithPopup, signOut } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import type {
  AppView,
  ConnectionsResponse,
  ToolkitConnection,
} from "../components/autonomous/autonomous-types";
import { AutonomousView } from "../components/autonomous/autonomous-view";
import { AnalyticsView } from "../components/analytics/analytics-view";
import { BillingView } from "../components/billing/billing-view";
import { ChatSidebar } from "../components/chat/chat-sidebar";
import { ToolCallDisplay } from "../components/ToolCallDisplay";
import { api } from "../convex/_generated/api";
import { useBillingSummary } from "../hooks/use-billing-summary";
import { useChatHistory } from "../hooks/use-chat-history";
import { useLocalStorage } from "../hooks/use-local-storage";
import {
  buildAutonomyDraft,
  cronFromDraft,
  formatCadenceLabel,
  formatWorkflowTypeLabel,
  isRecurringAutonomyPrompt,
  type AutonomousTaskDraft,
  type DeliveryChannel,
  withDraftScheduleMetadata,
} from "../lib/autonomy-intent";
import { auth, googleProvider } from "../lib/firebase";
import { tokensToCredits } from "../lib/pricing";

function estimateTextTokens(text: string) {
  return Math.max(0, Math.ceil(text.trim().length / 4));
}

function estimateMessageTokens(messages: UIMessage[]) {
  return messages.reduce((total, message) => {
    return (
      total +
      message.parts.reduce((partTotal, part) => {
        if (part.type !== "text") {
          return partTotal;
        }

        return partTotal + estimateTextTokens(String(part.text ?? ""));
      }, 0)
    );
  }, 0);
}

function LoadingShell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="flex h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-black" />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Cryzo
          </p>
        </div>
        <h1 className="text-2xl font-semibold text-black">{title}</h1>
        <p className="mt-2 text-sm text-neutral-500">{description}</p>
      </div>
    </main>
  );
}

function formatTimeLabel(value: string) {
  const [hourString, minuteString] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function nextRunAtFromDraft(draft: AutonomousTaskDraft) {
  const [hourString, minuteString] = draft.timeOfDay.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString ?? "0");
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);

  if (draft.cadence === "hourly") {
    next.setMinutes(next.getMinutes() + 60);
    return next.toISOString();
  }

  if (draft.cadence === "weekly" && draft.daysOfWeek.length > 0) {
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(next);
      candidate.setDate(next.getDate() + offset);
      if (!draft.daysOfWeek.includes(candidate.getDay())) {
        continue;
      }
      if (candidate.getTime() > Date.now()) {
        return candidate.toISOString();
      }
    }
  }

  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

function RecurringTaskConfirmation({
  draft,
  toolkits,
  isSaving,
  saveError,
  onDismiss,
  onRunOnce,
  onChange,
  onToggleDelivery,
  onToggleIntegration,
  onConnect,
  onSave,
}: {
  draft: AutonomousTaskDraft;
  toolkits: ToolkitConnection[];
  isSaving: boolean;
  saveError: string | null;
  onDismiss: () => void;
  onRunOnce: () => Promise<void>;
  onChange: (patch: Partial<AutonomousTaskDraft>) => void;
  onToggleDelivery: (channel: DeliveryChannel) => void;
  onToggleIntegration: (slug: string) => void;
  onConnect: (slug: string) => Promise<void>;
  onSave: () => Promise<void>;
}) {
  const connectedToolkits = toolkits.filter((toolkit) => toolkit.isConnected);
  const missingToolkits = toolkits.filter((toolkit) =>
    draft.missingIntegrationSlugs.includes(toolkit.slug),
  );

  return (
    <div className="mx-auto mb-4 max-w-3xl rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            Task Recipe
          </p>
          <h3 className="mt-2 text-lg font-semibold text-black">{draft.title}</h3>
          <p className="mt-2 text-sm text-neutral-600">
            This looks like a recurring request. Save it as a reusable task recipe, or run it once instead.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-white"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
            {formatWorkflowTypeLabel(draft.workflowType)}
          </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-700">
              {formatCadenceLabel({
                cadence: draft.cadence,
                timeOfDay: draft.timeOfDay,
                cronHuman: draft.cronHuman,
              })}
            </span>
        </div>
        <p className="mt-3">{draft.description}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-black">Task title</label>
          <input
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none focus:border-black"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-black">Delivery time</label>
          <input
            type="time"
            value={draft.timeOfDay}
            onChange={(event) => onChange({ timeOfDay: event.target.value })}
            className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none focus:border-black"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-sm font-medium text-black">Recurring instruction</label>
        <textarea
          value={draft.instruction}
          onChange={(event) => onChange({ instruction: event.target.value })}
          rows={4}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-black"
        />
      </div>

      {missingToolkits.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Missing app connections</p>
          <p className="mt-1">
            Connect the missing apps first so this task recipe can run cleanly.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missingToolkits.map((toolkit) => (
              <button
                key={toolkit.slug}
                type="button"
                onClick={() => void onConnect(toolkit.slug)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Connect {toolkit.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(["hourly", "daily", "weekly"] as const).map((cadence) => (
          <button
            key={cadence}
            type="button"
            onClick={() => onChange({ cadence })}
            className={`rounded-xl border px-4 py-2 text-sm ${
              draft.cadence === cadence
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
            }`}
          >
            {cadence}
          </button>
        ))}
        <span className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-500">
          {draft.timezone}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-black">Delivery channels</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["in_app", "email"] as const).map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() => onToggleDelivery(channel)}
              className={`rounded-xl border px-4 py-2 text-sm ${
                draft.deliveryChannels.includes(channel)
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
              }`}
            >
              {channel === "in_app" ? "In-app" : "Email"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-black">Allowed integrations</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {connectedToolkits.length === 0 ? (
            <span className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-500">
              No connected apps loaded yet.
            </span>
          ) : (
            connectedToolkits.map((toolkit) => (
              <button
                key={toolkit.slug}
                type="button"
                onClick={() => onToggleIntegration(toolkit.slug)}
                className={`rounded-xl border px-4 py-2 text-sm ${
                  draft.integrationSlugs.includes(toolkit.slug)
                    ? "border-black bg-black text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                }`}
              >
                {toolkit.name}
              </button>
            ))
          )}
        </div>
      </div>

        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
          <p className="font-medium text-black">Recipe plan</p>
          <p className="mt-1">
            The agent will run {draft.cadence} at {formatTimeLabel(draft.timeOfDay)}, then deliver updates through{" "}
            {draft.deliveryChannels.map((channel) => (channel === "in_app" ? "in-app" : "email")).join(" and ")}.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Cron: <span className="font-mono">{draft.cron}</span> ({draft.cronHuman})
          </p>
        </div>

      {saveError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onRunOnce()}
          className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-white"
        >
          Run Once Instead
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={
            isSaving ||
            !draft.title.trim() ||
            !draft.instruction.trim() ||
            draft.missingIntegrationSlugs.length > 0
          }
          className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {isSaving ? "Saving task..." : "Save Task Recipe"}
        </button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [user, authLoading] = useAuthState(auth);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    "composio-chat:sidebar:collapsed",
    false,
  );
  const [, , sidebarHydrated] = useLocalStorage(
    "composio-chat:sidebar:collapsed",
    false,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const provisionalPromptTokensRef = useRef(0);
  const assistantTokenBaselineRef = useRef(0);
  const usageBaselineRef = useRef(0);
  const [provisionalUsedTokens, setProvisionalUsedTokens] = useState(0);
  const [pendingReconciliationTokens, setPendingReconciliationTokens] = useState(0);

  const {
    chats,
    isLoadingChats,
    createChat,
    selectChat,
    deleteChat,
    saveMessages,
  } = useChatHistory(user?.uid ?? null);

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
  } = useChat<UIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ userId: user?.uid }),
    }),
  });

  const [activeChatId, setActiveChatId, activeChatHydrated] = useLocalStorage<
    string | null
  >("composio-chat:active-chat-id", null);
  const [input, setInput] = useLocalStorage("composio-chat:input", "");
  const [toolkits, setToolkits] = useState<ToolkitConnection[]>([]);
  const [autonomyDraft, setAutonomyDraft] = useState<AutonomousTaskDraft | null>(null);
  const [isSavingAutonomyDraft, setIsSavingAutonomyDraft] = useState(false);
  const [autonomyDraftError, setAutonomyDraftError] = useState<string | null>(null);
  const { billingSummary, isLoadingBilling } = useBillingSummary(
    user?.uid ?? null,
    provisionalUsedTokens > 0 ? provisionalUsedTokens : pendingReconciliationTokens,
  );
  const createAutonomousTask = useMutation(api.autonomous.createTask);
  const autonomousTasks = useQuery(
    api.autonomous.listTasks,
    user?.uid ? { userId: user.uid } : "skip",
  );
  const isLiveEstimating =
    provisionalUsedTokens > 0 || pendingReconciliationTokens > 0;

  activeChatIdRef.current = activeChatId;

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    const currentAssistantTokens = messages.reduce((total, message) => {
      if (message.role !== "assistant") {
        return total;
      }
      return total + estimateMessageTokens([message]);
    }, 0);

    if (status === "submitted" || status === "streaming") {
      const streamedAssistantTokens = Math.max(
        0,
        currentAssistantTokens - assistantTokenBaselineRef.current,
      );
      setProvisionalUsedTokens(
        provisionalPromptTokensRef.current + streamedAssistantTokens,
      );
      return;
    }

    if (provisionalUsedTokens > 0) {
      setPendingReconciliationTokens(provisionalUsedTokens);
    }

    provisionalPromptTokensRef.current = 0;
    assistantTokenBaselineRef.current = 0;
    setProvisionalUsedTokens(0);
  }, [messages, provisionalUsedTokens, status]);

  useEffect(() => {
    if (!billingSummary || pendingReconciliationTokens <= 0) {
      return;
    }

    if (billingSummary.totalTokensUsed > usageBaselineRef.current) {
      usageBaselineRef.current = billingSummary.totalTokensUsed;
      setPendingReconciliationTokens(0);
    }
  }, [billingSummary, pendingReconciliationTokens]);

  useEffect(() => {
    if (!user?.uid) return;
    if (activeView === "apps" || activeView === "autonomous") {
      void fetchConnections();
    }
  }, [activeView, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    void fetchConnections();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!activeChatHydrated) return;
    if (!activeChatId) return;
    void (async () => {
      const selectedMessages = await selectChat(activeChatId);
      setMessages(selectedMessages);
    })();
  }, [activeChatHydrated, activeChatId, selectChat, setMessages, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!activeChatIdRef.current || messages.length === 0) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveMessages(activeChatIdRef.current!, messages);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, saveMessages, user?.uid]);

  useEffect(() => {
    if (user) return;
    setActiveChatId(null);
    setMessages([]);
    setToolkits([]);
    setAutonomyDraft(null);
    setAutonomyDraftError(null);
    provisionalPromptTokensRef.current = 0;
    assistantTokenBaselineRef.current = 0;
    usageBaselineRef.current = 0;
    setProvisionalUsedTokens(0);
    setPendingReconciliationTokens(0);
  }, [setActiveChatId, setMessages, user]);

  async function handleSelectChat(chatId: string) {
    if (!user?.uid) return;
    setActiveView("chat");
    setActiveChatId(chatId);
    const selectedMessages = await selectChat(chatId);
    setMessages(selectedMessages);
  }

  async function handleNewChat() {
    if (!user?.uid) return;
    const newChat = await createChat();
    if (!newChat) return;
    setActiveView("chat");
    setActiveChatId(newChat.id);
    setMessages([]);
    setInput("");
  }

  async function handleDeleteChat(chatId: string) {
    if (!user?.uid) return;
    await deleteChat(chatId);
    if (activeChatId !== chatId) return;

    const remainingChats = chats.filter((chat: { id: string }) => chat.id !== chatId);
    if (remainingChats.length > 0) {
      await handleSelectChat(remainingChats[0].id);
    } else {
      setActiveChatId(null);
      setMessages([]);
    }
  }

  async function fetchConnections() {
    if (!user?.uid) return [] as ToolkitConnection[];
    const res = await fetch(
      `/api/connections?userId=${encodeURIComponent(user.uid)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [] as ToolkitConnection[];
    const data = (await res.json()) as ConnectionsResponse;
    const nextToolkits = data.toolkits ?? [];
    setToolkits(nextToolkits);
    return nextToolkits;
  }

  async function connect(slug: string) {
    if (!user?.uid) return;
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug, userId: user.uid }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { redirectUrl?: string };
    if (!data.redirectUrl) return;
    window.location.href = data.redirectUrl;
  }

  async function disconnect(connectedAccountId: string) {
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId }),
    });
    await fetchConnections();
  }

  async function compileTaskDraft(
    prompt: string,
    availableToolkits: ToolkitConnection[],
  ): Promise<AutonomousTaskDraft> {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch("/api/tasks/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        userId: user?.uid,
        timezone,
        toolkits: availableToolkits,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to compile task recipe.");
    }

    const data = (await response.json()) as {
      draft?: AutonomousTaskDraft;
    };

    if (!data.draft) {
      throw new Error("Task compiler did not return a draft.");
    }

    return withDraftScheduleMetadata(data.draft) as AutonomousTaskDraft;
  }

  async function handleSignIn() {
    await signInWithPopup(auth, googleProvider);
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  async function saveAutonomyDraft(draft: AutonomousTaskDraft) {
    if (!user?.uid) {
      return;
    }

    setIsSavingAutonomyDraft(true);
    setAutonomyDraftError(null);
    try {
      await createAutonomousTask({
        userId: user.uid,
        title: draft.title.trim(),
        instruction: draft.instruction.trim(),
        workflowCode: [
          `TASK: ${draft.title.trim()}`,
          `WORKFLOW TYPE: ${draft.workflowType}`,
          `INSTRUCTION: ${draft.instruction.trim()}`,
          `DELIVERY CHANNELS: ${draft.deliveryChannels.join(", ")}`,
        ].join("\n"),
        inputSchema: {
          type: "object",
          properties: {},
        },
        outputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            checkpoints: { type: "array" },
          },
        },
        defaultInputData: {},
        integrationSlugs: draft.integrationSlugs,
        deliveryChannels: draft.deliveryChannels,
        goals: draft.goals,
        successCriteria: draft.successCriteria,
        workflowType: draft.workflowType,
        sourcePrompt: draft.sourcePrompt,
        recipeMetadata: draft.recipeMetadata,
        autonomyMode: "full_auto",
        triggerType: "schedule",
        schedule: {
          cadence: draft.cadence,
          timezone: draft.timezone,
          cron: draft.cron || cronFromDraft(draft),
          cronHuman: draft.cronHuman,
          timeOfDay: draft.timeOfDay,
          daysOfWeek:
            draft.cadence === "weekly" ? draft.daysOfWeek : undefined,
          nextRunAt: nextRunAtFromDraft(draft),
        },
      });

      setAutonomyDraft(null);
      setInput("");
      setActiveView("autonomous");
    } catch (error) {
      setAutonomyDraftError(
        error instanceof Error
          ? error.message
          : "Failed to save the task.",
      );
    } finally {
      setIsSavingAutonomyDraft(false);
    }
  }

  async function handleSaveAutonomyDraft() {
    if (!autonomyDraft) {
      return;
    }

    await saveAutonomyDraft(autonomyDraft);
  }

  async function handleRunOnceFromDraft() {
    if (!autonomyDraft || !user?.uid) {
      return;
    }

    const prompt = autonomyDraft.sourcePrompt || autonomyDraft.instruction;
    setAutonomyDraft(null);
    setAutonomyDraftError(null);

    let chatId = activeChatId;
    if (!chatId) {
      const newChat = await createChat();
      if (!newChat) return;
      chatId = newChat.id;
      setActiveChatId(chatId);
    }

    provisionalPromptTokensRef.current =
      estimateMessageTokens(messages) + estimateTextTokens(prompt);
    usageBaselineRef.current = billingSummary?.totalTokensUsed ?? 0;
    assistantTokenBaselineRef.current = messages.reduce(
      (total, message) =>
        total + (message.role === "assistant" ? estimateMessageTokens([message]) : 0),
      0,
    );
    setPendingReconciliationTokens(0);
    setProvisionalUsedTokens(provisionalPromptTokensRef.current);
    sendMessage({ text: prompt }, { body: { userId: user.uid } });
    setInput("");
  }

  if (!sidebarHydrated || !activeChatHydrated) {
    return (
      <LoadingShell
        title="Preparing your workspace"
        description="Loading your local session, sidebar state, and saved chat context."
      />
    );
  }

  if (authLoading) {
    return (
      <LoadingShell
        title="Checking your session"
        description="Firebase authentication is still loading. If this takes too long on the custom domain, the issue is in app bootstrap, not Vercel hosting."
      />
    );
  }

  if (!user) {
    return (
      <main className="flex h-screen items-center justify-center bg-neutral-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-black">Sign in</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Use Google first to connect your workspace and start using the agent.
            </p>
          </div>
          <button
            onClick={() => void handleSignIn()}
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full overflow-hidden bg-neutral-50 text-black">
      <ChatSidebar
        activeView={activeView}
        onSelectView={setActiveView}
        chats={chats}
        currentChatId={activeChatId}
        onSelectChat={(chatId) => void handleSelectChat(chatId)}
        onNewChat={() => void handleNewChat()}
        onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        isLoading={isLoadingChats}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-white">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-3">
          <button
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-black"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {sidebarCollapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
          <div className="flex items-center gap-3">
            {activeView === "autonomous" ? (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Tasks
                </p>
                <p className="text-sm font-medium text-black">
                  {autonomousTasks?.length ?? 0}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                  Remaining credits
                </p>
                <p className="text-sm font-medium text-black">
                  {tokensToCredits(billingSummary?.remainingTokens ?? 0).toLocaleString()}
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="text-sm font-medium text-black">
                {user.displayName || user.email || "Signed in"}
              </p>
              <p className="text-xs text-neutral-500">{user.email}</p>
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </div>
        {activeView === "chat" ? (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 pb-32 pt-6 md:px-6"
            >
              <div className="mx-auto max-w-3xl">
                {autonomyDraft ? (
                  <RecurringTaskConfirmation
                    draft={autonomyDraft}
                    toolkits={toolkits}
                    isSaving={isSavingAutonomyDraft}
                    saveError={autonomyDraftError}
                    onDismiss={() => {
                      setAutonomyDraft(null);
                      setAutonomyDraftError(null);
                    }}
                    onRunOnce={handleRunOnceFromDraft}
                    onChange={(patch) =>
                      setAutonomyDraft((current) =>
                        current
                          ? (withDraftScheduleMetadata({
                              ...current,
                              ...patch,
                            }) as AutonomousTaskDraft)
                          : current,
                      )
                    }
                    onToggleDelivery={(channel) =>
                      setAutonomyDraft((current) => {
                        if (!current) {
                          return current;
                        }

                        return {
                          ...current,
                          deliveryChannels: current.deliveryChannels.includes(channel)
                            ? current.deliveryChannels.filter((value) => value !== channel)
                            : [...current.deliveryChannels, channel],
                        };
                      })
                    }
                    onToggleIntegration={(slug) =>
                      setAutonomyDraft((current) => {
                        if (!current) {
                          return current;
                        }

                        return {
                          ...current,
                          integrationSlugs: current.integrationSlugs.includes(slug)
                            ? current.integrationSlugs.filter((value) => value !== slug)
                            : [...current.integrationSlugs, slug],
                          missingIntegrationSlugs: current.missingIntegrationSlugs.filter(
                            (value) => value !== slug,
                          ),
                        };
                      })
                    }
                    onConnect={connect}
                    onSave={handleSaveAutonomyDraft}
                  />
                ) : null}
                {messages.length === 0 ? (
                  <div className="px-6 py-16" />
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`border-b border-neutral-200 px-6 py-6 ${
                        message.role === "user" ? "bg-white" : "bg-neutral-50"
                      }`}
                    >
                      <div className="mb-2 text-sm font-medium">
                        {message.role === "user" ? "You" : "Agent"}
                      </div>
                      <div className="space-y-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">
                        {message.parts.map((part, index) => {
                          if (part.type === "text") {
                            return (
                              <span key={index}>
                                {String(part.text)
                                  .split(/(https?:\/\/[^\s)]+)/g)
                                  .map((segment, segmentIndex) =>
                                    /^https?:\/\//.test(segment) ? (
                                      <a
                                        key={segmentIndex}
                                        href={segment}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline"
                                      >
                                        {segment}
                                      </a>
                                    ) : (
                                      segment
                                    ),
                                  )}
                              </span>
                            );
                          }

                          if (isToolUIPart(part)) {
                            return (
                              <ToolCallDisplay
                                key={part.toolCallId}
                                toolName={getToolName(part)}
                                input={part.input}
                                output={
                                  part.state === "output-available"
                                    ? part.output
                                    : undefined
                                }
                                isLoading={part.state !== "output-available"}
                              />
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  ))
                )}

                {isLoading ? (
                  <div className="px-6 py-4 text-sm text-neutral-400">
                    Thinking...
                  </div>
                ) : null}

                {error ? (
                  <div className="px-6 py-4">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      <p className="font-medium">Agent request failed</p>
                      <p className="mt-1">
                        {error.message ||
                          "The model request failed before a response could be rendered."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-neutral-200 bg-white p-4">
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!input.trim()) return;

                  const trimmedInput = input.trim();
                  if (isRecurringAutonomyPrompt(trimmedInput)) {
                    const availableToolkits =
                      toolkits.length > 0 ? toolkits : await fetchConnections();
                    try {
                      const draft = await compileTaskDraft(
                        trimmedInput,
                        availableToolkits,
                      );
                      await saveAutonomyDraft(draft);
                      setAutonomyDraftError(null);
                    } catch (error) {
                      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                      try {
                        await saveAutonomyDraft(
                          buildAutonomyDraft(trimmedInput, availableToolkits, timezone),
                        );
                        setAutonomyDraftError(null);
                      } catch {
                        setAutonomyDraftError(
                          error instanceof Error
                            ? error.message
                            : "Failed to save the recurring task.",
                        );
                      }
                    }
                    return;
                  }

                  let chatId = activeChatId;
                  if (!chatId) {
                    const newChat = await createChat();
                    if (!newChat) return;
                    chatId = newChat.id;
                    setActiveChatId(chatId);
                  }

                  provisionalPromptTokensRef.current =
                    estimateMessageTokens(messages) + estimateTextTokens(trimmedInput);
                  usageBaselineRef.current = billingSummary?.totalTokensUsed ?? 0;
                  assistantTokenBaselineRef.current = messages.reduce(
                    (total, message) =>
                      total + (message.role === "assistant" ? estimateMessageTokens([message]) : 0),
                    0,
                  );
                  setPendingReconciliationTokens(0);
                  setProvisionalUsedTokens(provisionalPromptTokensRef.current);
                  sendMessage(
                    { text: trimmedInput },
                    { body: { userId: user.uid } },
                  );
                  setInput("");
                }}
                className="mx-auto flex max-w-3xl gap-3"
              >
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask me anything..."
                  disabled={isLoading}
                  rows={3}
                  className="min-h-[72px] flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-black"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="self-end rounded-xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : activeView === "autonomous" ? (
          <div className="flex-1 overflow-y-auto">
            <AutonomousView
              userId={user?.uid ?? null}
              toolkits={toolkits}
              onConnect={connect}
            />
          </div>
        ) : activeView === "apps" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-5xl">
              <h2 className="mb-2 text-2xl font-bold">App Connections</h2>
              <p className="mb-6 text-gray-500">
                Connect your apps to give your agent access.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {toolkits.map((toolkit) => (
                  <div
                    key={toolkit.slug}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-3">
                      {toolkit.logo ? (
                        <img
                          src={toolkit.logo}
                          alt={toolkit.name}
                          className="h-8 w-8 rounded"
                        />
                      ) : null}
                      <div>
                        <p className="font-medium">{toolkit.name}</p>
                        <p
                          className={`text-xs ${
                            toolkit.isConnected
                              ? "text-green-600"
                              : "text-gray-400"
                          }`}
                        >
                          {toolkit.isConnected
                            ? "Connected"
                            : "Not connected"}
                        </p>
                      </div>
                    </div>
                    {toolkit.isConnected ? (
                      <button
                        onClick={() =>
                          toolkit.connectedAccountId
                            ? void disconnect(toolkit.connectedAccountId)
                            : undefined
                        }
                        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                        disabled={!toolkit.connectedAccountId}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => void connect(toolkit.slug)}
                        className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeView === "analytics" ? (
          <div className="flex-1 overflow-y-auto">
            <AnalyticsView toolkits={toolkits} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <BillingView
              userId={user?.uid ?? null}
              userEmail={user?.email}
              billingSummary={billingSummary}
              isLoadingBilling={isLoadingBilling}
              isLiveEstimating={isLiveEstimating}
              provisionalUsedTokens={
                provisionalUsedTokens > 0
                  ? provisionalUsedTokens
                  : pendingReconciliationTokens
              }
            />
          </div>
        )}
      </section>
    </main>
  );
}
