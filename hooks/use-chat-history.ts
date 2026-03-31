"use client";

import { useCallback, useMemo } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { UIMessage } from "ai";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export type ChatSummary = {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export function useChatHistory(userId: string | null) {
  const convex = useConvex();
  const chats = useQuery(api.chats.listChats, userId ? { userId } : "skip");
  const createChatMutation = useMutation(api.chats.createChat);
  const deleteChatMutation = useMutation(api.chats.deleteChat);
  const saveMessagesMutation = useMutation(api.chats.saveMessages);

  const isLoadingChats = userId ? chats === undefined : false;

  const createChat = useCallback(
    async (model?: string) => {
      if (!userId) {
        return null;
      }
      const chat = await createChatMutation({ userId, model });
      return chat as ChatSummary;
    },
    [createChatMutation, userId],
  );

  const selectChat = useCallback(
    async (chatId: string): Promise<UIMessage[]> => {
      if (!userId) {
        return [];
      }
      const chat = await convex.query(api.chats.getChat, {
        chatId: chatId as Id<"chats">,
        userId,
      });
      return (chat?.messages ?? []) as UIMessage[];
    },
    [convex, userId],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!userId) {
        return;
      }
      await deleteChatMutation({
        chatId: chatId as Id<"chats">,
        userId,
      });
    },
    [deleteChatMutation, userId],
  );

  const saveMessages = useCallback(
    async (chatId: string, messages: UIMessage[]) => {
      if (!userId || messages.length === 0) {
        return;
      }
      await saveMessagesMutation({
        chatId: chatId as Id<"chats">,
        userId,
        messages,
      });
    },
    [saveMessagesMutation, userId],
  );

  return useMemo(
    () => ({
      chats: chats ?? [],
      isLoadingChats,
      createChat,
      selectChat,
      deleteChat,
      saveMessages,
    }),
    [
      chats,
      createChat,
      deleteChat,
      isLoadingChats,
      saveMessages,
      selectChat,
    ],
  );
}
