// lib/storage.js
// Thin wrapper around chrome.storage.local. Everything the assistant knows
// lives here and never syncs anywhere else (per the "browser-local only"
// privacy decision) except whichever AI provider's API you configured in
// Settings.

const KEYS = {
  settings: "zhta_ai_settings",
  profile: "zhta_tax_profile",
  uiState: "zhta_ui_state",
  legacyApiKey: "zhta_anthropic_api_key", // pre-multi-provider key, migrated on first read
};

const DEFAULT_SETTINGS = { providerId: "anthropic", apiKey: "", model: "", baseUrl: "" };

/** @returns {{providerId:string, apiKey:string, model:string, baseUrl:string}} */
export async function getSettings() {
  const stored = await chrome.storage.local.get([KEYS.settings, KEYS.legacyApiKey]);
  if (stored[KEYS.settings]) return { ...DEFAULT_SETTINGS, ...stored[KEYS.settings] };

  // One-time migration: earlier versions only stored a bare Anthropic key.
  if (stored[KEYS.legacyApiKey]) {
    const migrated = { ...DEFAULT_SETTINGS, providerId: "anthropic", apiKey: stored[KEYS.legacyApiKey] };
    await chrome.storage.local.set({ [KEYS.settings]: migrated });
    await chrome.storage.local.remove(KEYS.legacyApiKey);
    return migrated;
  }

  return { ...DEFAULT_SETTINGS };
}

export async function setSettings(settings) {
  await chrome.storage.local.set({ [KEYS.settings]: { ...DEFAULT_SETTINGS, ...settings } });
}

export async function clearSettings() {
  await chrome.storage.local.remove([KEYS.settings, KEYS.legacyApiKey]);
}

export async function getProfile() {
  const { [KEYS.profile]: value } = await chrome.storage.local.get(KEYS.profile);
  return value || null;
}

export async function setProfile(profile) {
  await chrome.storage.local.set({ [KEYS.profile]: profile });
}

export async function getUiState() {
  const { [KEYS.uiState]: value } = await chrome.storage.local.get(KEYS.uiState);
  return value || { step: "upload", currentSection: null };
}

export async function setUiState(state) {
  await chrome.storage.local.set({ [KEYS.uiState]: state });
}

export async function clearAll() {
  await chrome.storage.local.remove(Object.values(KEYS));
}
