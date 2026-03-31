import type { UIMessage } from "ai";
import {
  generateChatTitle,
  readChats,
  writeChats,
} from "../../../../../lib/chat-store";

const USER_ID = "user_123";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await req.json()) as { messages: UIMessage[] };

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "Messages array is required" }, { status: 400 });
  }

  const chats = await readChats();
  const chatIndex = chats.findIndex(
    (entry) => entry.id === id && entry.userId === USER_ID,
  );

  if (chatIndex === -1) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const currentChat = chats[chatIndex];
  const nextTitle =
    currentChat.title === "New Chat"
      ? generateChatTitle(body.messages)
      : currentChat.title;

  chats[chatIndex] = {
    ...currentChat,
    title: nextTitle,
    messages: body.messages,
    updatedAt: new Date().toISOString(),
  };

  await writeChats(chats);

  return Response.json({
    success: true,
    messageCount: body.messages.length,
    title: nextTitle !== currentChat.title ? nextTitle : null,
  });
}
