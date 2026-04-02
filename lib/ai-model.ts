import { anthropic } from "@ai-sdk/anthropic";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getAiModel() {
  return anthropic(process.env.AI_MODEL || DEFAULT_MODEL);
}

export function getAiModelName() {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}
