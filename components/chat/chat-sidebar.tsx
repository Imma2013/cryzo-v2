"use client";

import { useState } from "react";
import type { ChatSummary } from "../../hooks/use-chat-history";

type ChatSidebarProps = {
  activeView: "chat" | "apps" | "billing";
  onSelectView: (view: "chat" | "apps" | "billing") => void;
  chats: ChatSummary[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLoading: boolean;
};

export function ChatSidebar({
  activeView,
  onSelectView,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isCollapsed,
  onToggleCollapse,
  isLoading,
}: ChatSidebarProps) {
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="h-full w-80 shrink-0 border-r border-neutral-200 bg-white flex flex-col">
      <div className="h-14 shrink-0 border-b border-neutral-200 flex items-center justify-between px-3">
        <span className="text-sm font-semibold text-black">Chats</span>
        <div className="flex items-center">
          <button
            onClick={onNewChat}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-black transition-colors hover:bg-neutral-200"
            title="New chat"
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="border-b border-neutral-200 px-2 py-2">
        <button
          onClick={() => onSelectView("apps")}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
            activeView === "apps"
              ? "bg-neutral-100 text-black"
              : "text-neutral-500 hover:bg-neutral-50 hover:text-black"
          }`}
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
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Apps</span>
        </button>
        <button
          onClick={() => onSelectView("billing")}
          className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
            activeView === "billing"
              ? "bg-neutral-100 text-black"
              : "text-neutral-500 hover:bg-neutral-50 hover:text-black"
          }`}
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
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span>Billing</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-400">
            Loading chats...
          </div>
        ) : chats.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-400">
            No chats yet. Start a new conversation!
          </div>
        ) : (
          <div className="space-y-0.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  currentChatId === chat.id
                    ? "bg-neutral-100 text-black"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-black"
                }`}
                onClick={() => onSelectChat(chat.id)}
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => setHoveredChatId(null)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 opacity-50"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="flex-1 truncate">{chat.title}</span>

                {hoveredChatId === chat.id ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    className="rounded p-1 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Delete chat"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 px-3 py-2">
        <div className="text-center text-[10px] text-neutral-400">
          {chats.length} chat{chats.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
