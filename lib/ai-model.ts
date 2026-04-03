import { google } from "@ai-sdk/google";

const SMALL_MODEL = process.env.AI_SMALL_MODEL || "gemini-3-flash-preview";
const LARGE_MODEL = process.env.AI_LARGE_MODEL || "gemini-3.1-pro-preview";

type MessageLike = {
  role?: string;
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
};

type ModelSelectionInput = {
  messages?: MessageLike[];
  prompt?: string;
  system?: string;
  preferLarge?: boolean;
};

function textFromMessage(message: MessageLike) {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n");
  }

  return "";
}

function collectText(input: ModelSelectionInput) {
  const messageText =
    input.messages
      ?.map(textFromMessage)
      .filter(Boolean)
      .join("\n") ?? "";
  return [input.system, input.prompt, messageText].filter(Boolean).join("\n");
}

function shouldUseLargeModel(input?: ModelSelectionInput) {
  if (!input) {
    return false;
  }

  if (input.preferLarge) {
    return true;
  }

  const text = collectText(input).toLowerCase();
  const latestUserMessage =
    [...(input.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
  const latestText = latestUserMessage ? textFromMessage(latestUserMessage).toLowerCase() : text;
  const messageCount = input.messages?.length ?? 0;

  if (messageCount >= 8) {
    return true;
  }

  if (latestText.length >= 700 || text.length >= 1800) {
    return true;
  }

  if ((latestText.match(/\n/g)?.length ?? 0) >= 6) {
    return true;
  }

  if ((latestText.match(/\band\b/gi)?.length ?? 0) >= 3) {
    return true;
  }

  return /\b(automate|automation|schedule|scheduled|cron|daily|weekly|monthly|compare|analyze|analysis|research|investigate|plan|strategy|debug|fix|implement|build|refactor|workflow|multi-step|step by step)\b/i.test(
    latestText,
  ) || /\bevery\s+\w+\b/i.test(latestText)
    || /summarize[\s\S]*\b(and|then)\b/i.test(latestText);
}

export function getAiModel(input?: ModelSelectionInput) {
  return google(shouldUseLargeModel(input) ? LARGE_MODEL : SMALL_MODEL);
}

export function getAiModelName(input?: ModelSelectionInput) {
  return shouldUseLargeModel(input) ? LARGE_MODEL : SMALL_MODEL;
}
