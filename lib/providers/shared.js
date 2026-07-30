// lib/providers/shared.js
// Prompt text and response parsing shared across all provider adapters, so
// switching providers doesn't change what's being asked - only how the
// request is transported.

export const EXTRACTION_SYSTEM_PROMPT =
  "You extract structured data from Swiss tax documents for a personal tax-filing assistant. " +
  "Respond with ONLY a single JSON object, no prose, no markdown fences. " +
  "If a field isn't present in the document, omit it rather than guessing.";

export const SUGGESTION_SYSTEM_PROMPT =
  "You are a careful assistant helping a Swiss taxpayer fill in the Kanton Zürich " +
  "ZHprivateTax online form. You never invent numbers - every suggestion must trace back " +
  "to the provided profile data. If you're not confident about a field, set confidence to " +
  '"low" and explain why in the rationale instead of guessing. ' +
  "Respond with ONLY a JSON object of the shape: " +
  '{"suggestions": [{"fieldId": string, "value": string, "rationale": string, "confidence": "high"|"medium"|"low"}]}';

export function buildSuggestionUserText({ sectionGuidance, profileSlice, fields }) {
  return [
    "SECTION GUIDANCE:",
    sectionGuidance,
    "",
    "USER'S TAX PROFILE (relevant slice):",
    JSON.stringify(profileSlice, null, 2),
    "",
    "FORM FIELDS DETECTED ON THE CURRENT PAGE:",
    JSON.stringify(fields, null, 2),
  ].join("\n");
}

export function buildExtractionUserText(docType, prompt) {
  return `Document type: ${docType}\n\n${prompt}`;
}

/** Extract a JSON object from a model response, tolerating ```json fences and stray prose. */
export function parseJsonResponse(text) {
  if (!text) throw new Error("Empty response from model");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const candidate = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(candidate.trim());
}
