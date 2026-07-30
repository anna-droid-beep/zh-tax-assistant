// lib/errors.js
// Shared error types so both lib/providers/* and the UI can check
// `err instanceof ...` without circular imports.

export class MissingApiKeyError extends Error {
  constructor(providerLabel) {
    super(`No API key configured${providerLabel ? ` for ${providerLabel}` : ""}. Set one on the extension's options page.`);
    this.name = "MissingApiKeyError";
  }
}

export class MissingConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "MissingConfigError";
  }
}

export class ProviderApiError extends Error {
  constructor(providerLabel, status, body) {
    super(`${providerLabel} API error ${status}: ${body}`);
    this.name = "ProviderApiError";
    this.status = status;
  }
}
