import { readChats, writeChats } from "../../../../lib/chat-store";

const USER_ID = "user_123";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const chats = await readChats();
  const chat = chats.find((entry) => entry.id === id && entry.userId === USER_ID);

  if (!chat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json({ chat });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const chats = await readChats();
  const nextChats = chats.filter(
    (entry) => !(entry.id === id && entry.userId === USER_ID),
  );

  await writeChats(nextChats);

  return Response.json({ success: true });
}
