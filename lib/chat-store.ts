import { promises as fs } from "node:fs";
import path from "node:path";
import type { UIMessage } from "ai";

export type StoredChat = {
  id: string;
  userId: string;
  title: string;
  model: string | null;
  messages: UIMessage[];
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "chats.json");
const TEMP_FILE = path.join(DATA_DIR, "chats.json.tmp");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

export async function readChats(): Promise<StoredChat[]> {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const chats = parseChats(raw);
  return Array.isArray(chats) ? chats : [];
}

export async function writeChats(chats: StoredChat[]) {
  await ensureStore();
  const payload = JSON.stringify(chats, null, 2);
  await fs.writeFile(TEMP_FILE, payload, "utf8");
  await fs.rename(TEMP_FILE, DATA_FILE);
}

export function generateChatTitle(messages: UIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstTextPart = firstUserMessage?.parts.find(
    (part): part is Extract<(typeof firstUserMessage.parts)[number], { type: "text" }> =>
      part.type === "text",
  );
  const content = String(firstTextPart?.text ?? "").trim().replace(/\n/g, " ");

  if (!content) return "New Chat";
  return content.length <= 50 ? content : `${content.slice(0, 47)}...`;
}

function parseChats(raw: string): StoredChat[] {
  try {
    return JSON.parse(raw) as StoredChat[];
  } catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      return [];
    }

    try {
      return JSON.parse(raw.slice(start, end + 1)) as StoredChat[];
    } catch {
      const recoveryEnd = raw.indexOf("\n]   ],");
      if (recoveryEnd !== -1) {
        return JSON.parse(`${raw.slice(start, recoveryEnd + 2)}`) as StoredChat[];
      }
      return [];
    }
  }
}
