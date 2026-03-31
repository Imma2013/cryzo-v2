import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function generateChatTitle(messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: unknown }> }>) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstTextPart = firstUserMessage?.parts?.find((part) => part.type === "text");
  const content = String(firstTextPart?.text ?? "").trim().replace(/\n/g, " ");

  if (!content) return "New Chat";
  return content.length <= 50 ? content : `${content.slice(0, 47)}...`;
}

export const listChats = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return chats
      .map((chat) => ({
        id: chat._id,
        title: chat.title,
        model: chat.model ?? null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  },
});

export const getChat = query({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      return null;
    }

    return {
      id: chat._id,
      title: chat.title,
      model: chat.model ?? null,
      messages: chat.messages,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  },
});

export const createChat = mutation({
  args: {
    userId: v.string(),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const chatId = await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title ?? "New Chat",
      model: args.model,
      messages: [],
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: chatId,
      title: args.title ?? "New Chat",
      model: args.model ?? null,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      return { success: false };
    }
    await ctx.db.delete(args.chatId);
    return { success: true };
  },
});

export const saveMessages = mutation({
  args: {
    chatId: v.id("chats"),
    userId: v.string(),
    messages: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      return { success: false };
    }

    const nextTitle =
      chat.title === "New Chat" ? generateChatTitle(args.messages) : chat.title;
    const updatedAt = new Date().toISOString();

    await ctx.db.patch(args.chatId, {
      title: nextTitle,
      messages: args.messages,
      updatedAt,
    });

    return {
      success: true,
      title: nextTitle !== chat.title ? nextTitle : null,
      updatedAt,
      messageCount: args.messages.length,
    };
  },
});
