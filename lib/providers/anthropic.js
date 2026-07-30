// lib/providers/anthropic.js — Claude (Anthropic Messages API)
import { MissingApiKeyError, ProviderApiError } from "../errors.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SUGGESTION_SYSTEM_PROMPT,
  buildSuggestionUserText,
  buildExtractionUserText,
  parseJsonResponse,
} from "./shared.js";

export const meta = {
  id: "anthropic",
  label: "Claude (Anthropic)",
  defaultModel: "claude-sonnet-5",
  supportsPdf: true,
  requiresApiKey: true,
  keyPlaceholder: "sk-ant-...",
  keyHelpUrl: "https://console.anthropic.com/settings/keys",
  needsBaseUrl: false,
  needsModel: false,
};

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

async function callMessages({ apiKey, model, system, messages, maxTokens = 4096 }) {
  if (!apiKey) throw new MissingApiKeyError(meta.label);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderApiError(meta.label, res.status, body);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

export async function extractDocumentFields({ apiKey, model, file, docType, prompt }) {
  const isPdf = file.mediaType === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: file.mediaType, data: file.base64 } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.base64 } };

  const text = await callMessages({
    apiKey,
    model,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: buildExtractionUserText(docType, prompt) }],
      },
    ],
  });

  return parseJsonResponse(text);
}

export async function suggestFieldValues({ apiKey, model, sectionGuidance, profileSlice, fields }) {
  const text = await callMessages({
    apiKey,
    model,
    system: SUGGESTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSuggestionUserText({ sectionGuidance, profileSlice, fields }) }],
  });

  return parseJsonResponse(text);
}
