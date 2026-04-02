import { google } from "@ai-sdk/google";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

export function getAiModel() {
  return google(process.env.AI_MODEL || DEFAULT_MODEL);
}

export function getAiModelName() {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}
