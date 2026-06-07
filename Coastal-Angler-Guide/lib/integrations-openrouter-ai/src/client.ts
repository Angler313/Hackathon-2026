import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenRouter(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY must be set.");
  }
  _client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });
  return _client;
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
