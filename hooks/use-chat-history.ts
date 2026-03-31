"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";

export type ChatSummary = {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export function useChatHistory() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);

  const fetchChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const response = await fetch("/api/chats", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch chats");
      }
      const data = await response.json();
      setChats(data.chats ?? []);
    } catch {
      setChats([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  const createChat = useCallback(async (model?: string) => {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const newChat = data.chat as ChatSummary;
    setChats((prev) => [newChat, ...prev]);
    return newChat;
  }, []);

  const selectChat = useCallback(async (chatId: string): Promise<UIMessage[]> => {
    const response = await fetch(`/api/chats/${chatId}`);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.chat.messages ?? [];
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    const response = await fetch(`/api/chats/${chatId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
  }, []);

  const saveMessages = useCallback(async (chatId: string, messages: UIMessage[]) => {
    if (messages.length === 0) return;

    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setChats((prev) =>
      prev
        .map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                title: data.title || chat.title,
                updatedAt: new Date().toISOString(),
                messageCount: messages.length,
              }
            : chat,
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    );
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  return {
    chats,
    isLoadingChats,
    createChat,
    selectChat,
    deleteChat,
    saveMessages,
  };
}
