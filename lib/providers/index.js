// lib/providers/index.js
// Single entry point the UI talks to. Swapping AI vendors is a matter of
// picking a different providerId in Settings - the side panel never calls a
// vendor SDK directly.

import * as anthropic from "./anthropic.js";
import * as openai from "./openai.js";
import * as gemini from "./gemini.js";
import * as custom from "./custom.js";
import { MissingApiKeyError, MissingConfigError } from "../errors.js";

const MODULES = [anthropic, openai, gemini, custom];

export const PROVIDERS = MODULES.map((m) => m.meta);
const REGISTRY = Object.fromEntries(MODULES.map((m) => [m.meta.id, m]));

export function getProviderMeta(providerId) {
  return REGISTRY[providerId]?.meta || null;
}

function resolve(settings) {
  const provider = REGISTRY[settings?.providerId];
  if (!provider) throw new Error(`Unknown or unset AI provider: "${settings?.providerId}". Check Settings.`);

  if (provider.meta.requiresApiKey && !settings.apiKey) throw new MissingApiKeyError(provider.meta.label);
  if (provider.meta.needsBaseUrl && !settings.baseUrl) {
    throw new MissingConfigError(`${provider.meta.label} needs a base URL - set one in Settings.`);
  }
  if (provider.meta.needsModel && !settings.model) {
    throw new MissingConfigError(`${provider.meta.label} needs a model name - set one in Settings.`);
  }

  return {
    module: provider,
    apiKey: settings.apiKey || "",
    model: settings.model || provider.meta.defaultModel,
    baseUrl: settings.baseUrl || "",
  };
}

/** @param {{base64:string, mediaType:string}} file */
export async function extractDocumentFields(settings, file, docType, prompt) {
  const { module, apiKey, model, baseUrl } = resolve(settings);
  return module.extractDocumentFields({ apiKey, model, baseUrl, file, docType, prompt });
}

export async function suggestFieldValues(settings, { sectionGuidance, profileSlice, fields }) {
  const { module, apiKey, model, baseUrl } = resolve(settings);
  return module.suggestFieldValues({ apiKey, model, baseUrl, sectionGuidance, profileSlice, fields });
}

export { MissingApiKeyError, MissingConfigError };
