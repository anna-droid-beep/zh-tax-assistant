// lib/providers/custom.js — any OpenAI-compatible /chat/completions endpoint
// (OpenRouter, Groq, local Ollama/LM Studio, etc.). Vision/PDF support
// depends entirely on the endpoint and model the user points this at, so we
// don't promise it - PDFs are rejected with a clear message rather than
// silently mis-sent.
import { MissingConfigError, ProviderApiError } from "../errors.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SUGGESTION_SYSTEM_PROMPT,
  buildSuggestionUserText,
  buildExtractionUserText,
  parseJsonResponse,
} from "./shared.js";

export const meta = {
  id: "custom",
  label: "Custom (OpenAI-compatible endpoint)",
  defaultModel: "",
  supportsPdf: false,
  requiresApiKey: false, // e.g. local Ollama doesn't need one
  keyPlaceholder: "(optional, depends on endpoint)",
  keyHelpUrl: null,
  needsBaseUrl: true,
  needsModel: true,
};

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

async function callChatCompletions({ apiKey, baseUrl, model, messages }) {
  if (!baseUrl) throw new MissingConfigError("Set a base URL for the custom endpoint in Settings.");
  if (!model) throw new MissingConfigError("Set a model name for the custom endpoint in Settings.");

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderApiError(meta.label, res.status, body);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message?.content;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map((p) => p.text || "").join("");
  return "";
}

export async function extractDocumentFields({ apiKey, model, baseUrl, file, docType, prompt }) {
  if (file.mediaType === "application/pdf") {
    throw new MissingConfigError(
      "This custom endpoint isn't guaranteed to support PDF input. Convert the document to an image (PNG/JPG) and upload that instead, or switch to Claude/ChatGPT/Gemini for this document."
    );
  }

  const messages = [
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: buildExtractionUserText(docType, prompt) },
        { type: "image_url", image_url: { url: `data:${file.mediaType};base64,${file.base64}` } },
      ],
    },
  ];

  const text = await callChatCompletions({ apiKey, baseUrl, model, messages });
  return parseJsonResponse(text);
}

export async function suggestFieldValues({ apiKey, model, baseUrl, sectionGuidance, profileSlice, fields }) {
  const messages = [
    { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
    { role: "user", content: buildSuggestionUserText({ sectionGuidance, profileSlice, fields }) },
  ];

  const text = await callChatCompletions({ apiKey, baseUrl, model, messages });
  return parseJsonResponse(text);
}
