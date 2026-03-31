import { randomUUID } from "node:crypto";
import { readChats, writeChats, type StoredChat } from "../../../lib/chat-store";

const USER_ID = "user_123";

export async function GET() {
  const chats = await readChats();
  const userChats = chats
    .filter((chat) => chat.userId === USER_ID)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(({ messages, ...chat }) => ({
      ...chat,
      messageCount: messages.length,
    }));

  return Response.json({ chats: userChats });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    model?: string;
  };

  const now = new Date().toISOString();
  const newChat: StoredChat = {
    id: randomUUID(),
    userId: USER_ID,
    title: body.title || "New Chat",
    model: body.model || null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const chats = await readChats();
  chats.unshift(newChat);
  await writeChats(chats);

  return Response.json({ chat: { ...newChat, messageCount: 0 } }, { status: 201 });
}
