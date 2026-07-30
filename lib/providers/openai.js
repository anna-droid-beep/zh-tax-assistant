// lib/providers/openai.js — ChatGPT (OpenAI Responses API)
import { MissingApiKeyError, ProviderApiError } from "../errors.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SUGGESTION_SYSTEM_PROMPT,
  buildSuggestionUserText,
  buildExtractionUserText,
  parseJsonResponse,
} from "./shared.js";

export const meta = {
  id: "openai",
  label: "ChatGPT (OpenAI)",
  defaultModel: "gpt-5.1",
  supportsPdf: true,
  requiresApiKey: true,
  keyPlaceholder: "sk-...",
  keyHelpUrl: "https://platform.openai.com/api-keys",
  needsBaseUrl: false,
  needsModel: false,
};

const API_URL = "https://api.openai.com/v1/responses";

async function callResponses({ apiKey, model, systemText, contentParts }) {
  if (!apiKey) throw new MissingApiKeyError(meta.label);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemText }] },
        { role: "user", content: contentParts },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderApiError(meta.label, res.status, body);
  }

  const data = await res.json();
  if (typeof data.output_text === "string") return data.output_text;

  // Fall back to walking the structured output array.
  const texts = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) texts.push(part.text);
    }
  }
  return texts.join("\n");
}

export async function extractDocumentFields({ apiKey, model, file, docType, prompt }) {
  const isPdf = file.mediaType === "application/pdf";
  const dataUrl = `data:${file.mediaType};base64,${file.base64}`;
  const fileBlock = isPdf
    ? { type: "input_file", filename: "document.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl };

  const text = await callResponses({
    apiKey,
    model,
    systemText: EXTRACTION_SYSTEM_PROMPT,
    contentParts: [{ type: "input_text", text: buildExtractionUserText(docType, prompt) }, fileBlock],
  });

  return parseJsonResponse(text);
}

export async function suggestFieldValues({ apiKey, model, sectionGuidance, profileSlice, fields }) {
  const text = await callResponses({
    apiKey,
    model,
    systemText: SUGGESTION_SYSTEM_PROMPT,
    contentParts: [{ type: "input_text", text: buildSuggestionUserText({ sectionGuidance, profileSlice, fields }) }],
  });

  return parseJsonResponse(text);
}
