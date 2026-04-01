"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { signInWithPopup, signOut } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import { BillingView } from "../components/billing/billing-view";
import { ChatSidebar } from "../components/chat/chat-sidebar";
import { ToolCallDisplay } from "../components/ToolCallDisplay";
import { useBillingSummary } from "../hooks/use-billing-summary";
import { useChatHistory } from "../hooks/use-chat-history";
import { useLocalStorage } from "../hooks/use-local-storage";
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

export default function ChatPage() {
  const [activeView, setActiveView] = useState<"chat" | "apps" | "billing">(
    "chat",
  );
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
  const [toolkits, setToolkits] = useState<
    {
      slug: string;
      name: string;
      logo?: string;
      isConnected: boolean;
      connectedAccountId?: string;
    }[]
  >([]);
  const { billingSummary, isLoadingBilling } = useBillingSummary(
    user?.uid ?? null,
    provisionalUsedTokens > 0 ? provisionalUsedTokens : pendingReconciliationTokens,
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
    if (activeView === "apps") {
      void fetchConnections();
    }
  }, [activeView, user?.uid]);

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

    const remainingChats = chats.filter((chat) => chat.id !== chatId);
    if (remainingChats.length > 0) {
      await handleSelectChat(remainingChats[0].id);
    } else {
      setActiveChatId(null);
      setMessages([]);
    }
  }

  async function fetchConnections() {
    if (!user?.uid) return;
    const res = await fetch(
      `/api/connections?userId=${encodeURIComponent(user.uid)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = await res.json();
    setToolkits(data.toolkits ?? []);
  }

  async function connect(slug: string) {
    if (!user?.uid) return;
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug, userId: user.uid }),
    });
    if (!res.ok) return;
    const data = await res.json();
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

  async function handleSignIn() {
    await signInWithPopup(auth, googleProvider);
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  if (!sidebarHydrated || !activeChatHydrated) {
    return <main className="h-screen bg-neutral-50" />;
  }

  if (authLoading) {
    return <main className="h-screen bg-neutral-50" />;
  }

  if (!user) {
    return (
      <main className="flex h-screen items-center justify-center bg-neutral-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-black">Sign in</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Use Google first. Chat history will be stored in Convex under your account.
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
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                Remaining credits
              </p>
              <p className="text-sm font-medium text-black">
                {tokensToCredits(billingSummary?.remainingTokens ?? 0).toLocaleString()}
              </p>
            </div>
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
              </div>
            </div>

            <div className="border-t border-neutral-200 bg-white p-4">
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!input.trim()) return;

                  let chatId = activeChatId;
                  if (!chatId) {
                    const newChat = await createChat();
                    if (!newChat) return;
                    chatId = newChat.id;
                    setActiveChatId(chatId);
                  }

                  provisionalPromptTokensRef.current =
                    estimateMessageTokens(messages) + estimateTextTokens(input);
                  usageBaselineRef.current = billingSummary?.totalTokensUsed ?? 0;
                  assistantTokenBaselineRef.current = messages.reduce(
                    (total, message) =>
                      total + (message.role === "assistant" ? estimateMessageTokens([message]) : 0),
                    0,
                  );
                  setPendingReconciliationTokens(0);
                  setProvisionalUsedTokens(provisionalPromptTokensRef.current);
                  sendMessage(
                    { text: input },
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
                        onClick={() => void disconnect(toolkit.connectedAccountId!)}
                        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
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
