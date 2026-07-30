import { getSettings, setSettings, clearSettings, clearAll } from "../lib/storage.js";
import { PROVIDERS, getProviderMeta } from "../lib/providers/index.js";

const providerSelect = document.getElementById("provider");
const apiKeyInput = document.getElementById("apiKey");
const apiKeyLabel = document.getElementById("apiKeyLabel");
const apiKeyHelp = document.getElementById("apiKeyHelp");
const modelInput = document.getElementById("model");
const modelLabel = document.getElementById("modelLabel");
const baseUrlRow = document.getElementById("baseUrlRow");
const baseUrlInput = document.getElementById("baseUrl");
const status = document.getElementById("status");
const profileStatus = document.getElementById("profileStatus");

let current = null;

function populateProviderOptions() {
  providerSelect.innerHTML = "";
  for (const p of PROVIDERS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    providerSelect.appendChild(opt);
  }
}

function applyProviderUi(providerId) {
  const meta = getProviderMeta(providerId);
  if (!meta) return;

  apiKeyLabel.textContent = meta.requiresApiKey ? "API key" : "API key (optional)";
  apiKeyInput.placeholder = meta.keyPlaceholder || "";
  apiKeyHelp.innerHTML = meta.keyHelpUrl
    ? `Get a key at <a href="${meta.keyHelpUrl}" target="_blank" rel="noopener">${new URL(meta.keyHelpUrl).hostname}</a>.`
    : "This provider may not require a key, depending on how it's configured.";

  modelLabel.textContent = meta.needsModel ? "Model (required)" : "Model (optional override)";
  modelInput.placeholder = meta.defaultModel || "e.g. llama3.1:70b";

  baseUrlRow.classList.toggle("hidden", !meta.needsBaseUrl);
}

async function init() {
  populateProviderOptions();
  current = await getSettings();

  providerSelect.value = current.providerId;
  apiKeyInput.value = current.apiKey || "";
  modelInput.value = current.model || "";
  baseUrlInput.value = current.baseUrl || "";
  applyProviderUi(current.providerId);

  if (current.apiKey || current.baseUrl) status.textContent = "Current settings loaded.";

  providerSelect.addEventListener("change", () => applyProviderUi(providerSelect.value));
}

async function ensureHostPermission(baseUrl) {
  let origin;
  try {
    origin = new URL(baseUrl).origin + "/*";
  } catch {
    throw new Error("That base URL doesn't look valid.");
  }
  const already = await chrome.permissions.contains({ origins: [origin] });
  if (already) return true;
  return chrome.permissions.request({ origins: [origin] });
}

document.getElementById("save").addEventListener("click", async () => {
  const providerId = providerSelect.value;
  const meta = getProviderMeta(providerId);
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();

  if (meta.requiresApiKey && !apiKey) {
    status.textContent = "This provider needs an API key.";
    return;
  }
  if (meta.needsBaseUrl && !baseUrl) {
    status.textContent = "This provider needs a base URL.";
    return;
  }
  if (meta.needsModel && !model) {
    status.textContent = "This provider needs a model name.";
    return;
  }

  if (meta.needsBaseUrl) {
    try {
      const granted = await ensureHostPermission(baseUrl);
      if (!granted) {
        status.textContent = "Permission to reach that host was denied, so it wasn't saved.";
        return;
      }
    } catch (err) {
      status.textContent = err.message;
      return;
    }
  }

  await setSettings({ providerId, apiKey, model, baseUrl });
  status.textContent = "Saved.";
});

document.getElementById("clear").addEventListener("click", async () => {
  await clearSettings();
  apiKeyInput.value = "";
  modelInput.value = "";
  baseUrlInput.value = "";
  status.textContent = "Settings removed.";
});

document.getElementById("clearProfile").addEventListener("click", async () => {
  if (!confirm("This deletes all uploaded documents and extracted tax data stored in this browser. Continue?")) {
    return;
  }
  await clearAll();
  profileStatus.textContent = "Tax data cleared.";
});

init();
