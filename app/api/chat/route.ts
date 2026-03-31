import { openai } from "@ai-sdk/openai";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import {
  streamText,
  convertToModelMessages,
  generateId,
  stepCountIs,
  type UIMessage,
} from "ai";

const TOOLKITS = [
  "gmail",
  "googlecalendar",
  "googlesheets",
  "twitter",
  "googledrive",
  "googledocs",
  "youtube",
  "reddit",
  "hackernews",
  "shopify",
  "linkedin",
  "google_maps",
  "one_drive",
  "salesforce",
  "slackbot",
  "slack",
  "stripe",
  "cursor",
  "linkedin_ads",
  "metaads",
  "facebook",
  "browserbase_tool",
  "browser_tool",
  "instagram",
  "tiktok",
  "canva",
  "google_analytics",
  "googleads",
  "google_search_console",
  "mailchimp",
];

export async function POST(req: Request) {
  const composio = new Composio({ provider: new VercelProvider() });
  const {
    messages,
    userId,
  }: { messages: UIMessage[]; userId?: string } = await req.json();
  const session = await composio.create(
    userId || "pg-test-pg-test-43d08743-c471-4d27-ac73-9b9398880252",
  );
  const tools = await session.tools();
  const result = streamText({
    model: openai("gpt-5.4"),
    system: "You are a helpful assistant. Use Composio tools to help the user.",
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
  });
  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => generateId(),
  });
}
