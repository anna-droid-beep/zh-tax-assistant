// lib/providers/gemini.js — Gemini (Google Generative Language API)
import { MissingApiKeyError, ProviderApiError } from "../errors.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SUGGESTION_SYSTEM_PROMPT,
  buildSuggestionUserText,
  buildExtractionUserText,
  parseJsonResponse,
} from "./shared.js";

export const meta = {
  id: "gemini",
  label: "Gemini (Google)",
  defaultModel: "gemini-2.5-pro",
  supportsPdf: true,
  requiresApiKey: true,
  keyPlaceholder: "AIza...",
  keyHelpUrl: "https://aistudio.google.com/apikey",
  needsBaseUrl: false,
  needsModel: false,
};

function apiUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function callGenerateContent({ apiKey, model, systemText, parts }) {
  if (!apiKey) throw new MissingApiKeyError(meta.label);

  const res = await fetch(apiUrl(model, apiKey), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderApiError(meta.label, res.status, body);
  }

  const data = await res.json();
  const parts_ = data.candidates?.[0]?.content?.parts || [];
  return parts_.map((p) => p.text || "").join("");
}

export async function extractDocumentFields({ apiKey, model, file, docType, prompt }) {
  const text = await callGenerateContent({
    apiKey,
    model,
    systemText: EXTRACTION_SYSTEM_PROMPT,
    parts: [
      { text: buildExtractionUserText(docType, prompt) },
      { inline_data: { mime_type: file.mediaType, data: file.base64 } },
    ],
  });

  return parseJsonResponse(text);
}

export async function suggestFieldValues({ apiKey, model, sectionGuidance, profileSlice, fields }) {
  const text = await callGenerateContent({
    apiKey,
    model,
    systemText: SUGGESTION_SYSTEM_PROMPT,
    parts: [{ text: buildSuggestionUserText({ sectionGuidance, profileSlice, fields }) }],
  });

  return parseJsonResponse(text);
}
