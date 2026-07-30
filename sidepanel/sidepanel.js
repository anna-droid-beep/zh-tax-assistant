import { getSettings, getProfile, setProfile } from "../lib/storage.js";
import { createEmptyProfile, mergeProfile, DOCUMENT_TYPES } from "../lib/schema.js";
import { matchSection } from "../lib/sections.js";
import { extractDocumentFields, suggestFieldValues, getProviderMeta, MissingApiKeyError, MissingConfigError } from "../lib/providers/index.js";
import { extractionPromptFor } from "../lib/prompts.js";
import { parseIbkrCsv } from "../lib/csv/parseIbkr.js";
import { parseMsawFiles } from "../lib/csv/parseMsaw.js";
import { unzip } from "../lib/zip/unzip.js";

// -- message protocol shared (by convention, not import) with content/content-script.js --
const MSG = {
  PING: "ZHTA_PING",
  SCAN_FIELDS: "ZHTA_SCAN_FIELDS",
  FILL_FIELD: "ZHTA_FILL_FIELD",
  SECTION_CHANGED: "ZHTA_SECTION_CHANGED",
  SECURITY_DETAIL_STATE: "ZHTA_SECURITY_DETAIL_STATE",
  ENABLE_ADDITIONS_TOGGLE: "ZHTA_ENABLE_ADDITIONS_TOGGLE",
  IMPORT_TRANSACTIONS: "ZHTA_IMPORT_TRANSACTIONS",
  IMPORT_PROGRESS: "ZHTA_IMPORT_PROGRESS",
};

let profile = null;
const docs = []; // { id, filename, docType, status, extractedFields, error }
let currentStep = "upload";
let currentSectionMeta = null;
const knowledgeCache = {};

const el = (id) => document.getElementById(id);

async function init() {
  profile = (await getProfile()) || createEmptyProfile();
  await refreshNoKeyBanner();
  el("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

  renderDocTypeList();
  renderDocList();
  renderProfileSummary();

  document.querySelectorAll(".step").forEach((btn) =>
    btn.addEventListener("click", () => goToStep(btn.dataset.step))
  );
  el("toReview").addEventListener("click", () => goToStep("review"));
  el("toFill").addEventListener("click", () => goToStep("fill"));
  el("scanPage").addEventListener("click", scanActiveTab);

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === MSG.SECTION_CHANGED) {
      updateSectionHeader(msg.hash, sender?.tab?.id);
    }
  });

  // Settings are edited on a separate options page/tab - pick up changes live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.zhta_ai_settings) refreshNoKeyBanner();
  });

  goToStep("upload");
}

/** True once the current provider has everything it needs to be called. */
function settingsAreReady(settings) {
  const meta = getProviderMeta(settings.providerId);
  if (!meta) return false;
  if (meta.requiresApiKey && !settings.apiKey) return false;
  if (meta.needsBaseUrl && !settings.baseUrl) return false;
  if (meta.needsModel && !settings.model) return false;
  return true;
}

async function refreshNoKeyBanner() {
  const settings = await getSettings();
  const meta = getProviderMeta(settings.providerId);
  const ready = settingsAreReady(settings);
  el("noKeyBanner").classList.toggle("hidden", ready);
  if (!ready) {
    el("noKeyBanner").querySelector("p").textContent = meta
      ? `${meta.label} isn't fully configured yet.`
      : "No AI provider configured yet.";
  }
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll(".step").forEach((b) => b.classList.toggle("active", b.dataset.step === step));
  document.querySelectorAll(".step-panel").forEach((p) => p.classList.add("hidden"));
  el(`step${capitalize(step)}`).classList.remove("hidden");
  if (step === "review") renderProfileSummary();
  if (step === "fill") pingActiveTab();
}

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}

// ---------- Step 1: documents ----------

function renderDocTypeList() {
  const container = el("docTypeList");
  container.innerHTML = "";
  for (const dt of DOCUMENT_TYPES) {
    const row = document.createElement("div");
    row.className = "doc-type-row";
    row.innerHTML = `
      <div>
        <div class="label">${dt.label}</div>
        <div class="sub">Goes under ${dt.section}</div>
      </div>
      <label class="secondary" style="cursor:pointer; display:inline-block; padding:6px 10px; border:1px solid var(--border); border-radius:6px;">
        Upload
        <input type="file" accept="image/*,application/pdf" style="display:none" data-doctype="${dt.id}" />
      </label>
    `;
    row.querySelector("input[type=file]").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFileUpload(dt.id, file);
      e.target.value = "";
    });
    container.appendChild(row);
  }
}

function renderDocList() {
  const list = el("docList");
  list.innerHTML = "";
  for (const doc of docs) {
    const li = document.createElement("li");
    li.className = "doc-item";
    li.innerHTML = `
      <div class="doc-row">
        <span>${escapeHtml(doc.filename)}</span>
        <span class="doc-status ${doc.status}">${statusLabel(doc)}</span>
      </div>
      ${doc.status === "error" ? `<div class="doc-error">${escapeHtml(doc.error || "Unknown error")}</div>` : ""}
      ${doc.status === "error" && doc.file ? `<button class="small secondary retry">Retry</button>` : ""}
    `;
    if (doc.status === "error" && doc.file) {
      li.querySelector(".retry").addEventListener("click", () => handleFileUpload(doc.docType, doc.file, doc.id));
    }
    list.appendChild(li);
  }
}

function statusLabel(doc) {
  if (doc.status === "extracting") return "Extracting…";
  if (doc.status === "done") return "Extracted";
  if (doc.status === "error") return "Failed";
  return "Pending";
}

async function handleFileUpload(docTypeId, file, existingDocId) {
  let doc = existingDocId && docs.find((d) => d.id === existingDocId);
  if (doc) {
    doc.status = "extracting";
    doc.error = null;
  } else {
    doc = {
      id: crypto.randomUUID(),
      filename: file.name,
      docType: docTypeId,
      status: "extracting",
      file, // kept in memory only (for Retry) - never persisted to chrome.storage
    };
    docs.push(doc);
  }
  renderDocList();

  try {
    const settings = await getSettings();
    const { base64, mediaType } = await readFileAsBase64(file);
    console.log(`[ZH Tax Assistant] extracting "${file.name}" as ${docTypeId} via ${settings.providerId}, mediaType=${mediaType}, size=${file.size}B`);
    const extracted = await extractDocumentFields(settings, { base64, mediaType }, docTypeId, extractionPromptFor(docTypeId));
    doc.status = "done";
    doc.extractedFields = extracted;
    applyExtractionToProfile(docTypeId, doc.id, extracted);
    await setProfile(profile);
  } catch (err) {
    doc.status = "error";
    doc.error = err?.message || String(err);
    console.error(`[ZH Tax Assistant] extraction failed for "${file.name}":`, err);
    if (err instanceof MissingApiKeyError || err instanceof MissingConfigError) {
      await refreshNoKeyBanner();
    }
  }
  renderDocList();
  renderProfileSummary();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = reader.result.split(",");
      // Some OSes/browsers hand back an empty file.type for PDFs picked from
      // certain file dialogs - fall back to the extension so we don't
      // accidentally send a PDF tagged as a generic binary/image.
      let mediaType = file.type;
      if (!mediaType && /\.pdf$/i.test(file.name)) mediaType = "application/pdf";
      resolve({ base64, mediaType: mediaType || "application/octet-stream" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function applyExtractionToProfile(docTypeId, docId, extracted) {
  const record = { ...extracted, sourceDocumentId: docId };
  const patch = {};

  switch (docTypeId) {
    case "lohnausweis":
      patch.income = { employment: [...profile.income.employment, record] };
      break;
    case "pillar3a":
      patch.deductions = { pillar3a: [...profile.deductions.pillar3a, record] };
      break;
    case "insurance-premium":
      patch.deductions = { insurancePremiums: [...profile.deductions.insurancePremiums, record] };
      break;
    case "donation-receipt":
      patch.deductions = { charitableDonations: [...profile.deductions.charitableDonations, record] };
      break;
    case "etax-statement":
      patch.securities = { eTaxStatements: [...profile.securities.eTaxStatements, record] };
      break;
    case "broker-statement":
      if (extracted.isNonSwissBroker && (extracted.brokerId === "ibkr" || extracted.brokerId === "morganStanleyAtWork")) {
        patch.securities = {
          bulkImportBrokers: [
            ...profile.securities.bulkImportBrokers,
            {
              brokerId: extracted.brokerId,
              label: extracted.brokerName || extracted.brokerId,
              accountId: extracted.accountId || null,
              sourceDocumentId: docId,
            },
          ],
        };
      } else if (Array.isArray(extracted.positions)) {
        patch.securities = { securitiesList: [...profile.securities.securitiesList, ...extracted.positions] };
      }
      break;
    default:
      break; // prior-year-return / other: kept only in profile.documents below
  }

  patch.documents = [
    ...profile.documents,
    { id: docId, docType: docTypeId, extractedAt: new Date().toISOString(), extractedFields: extracted },
  ];

  profile = mergeProfile(profile, patch);
}

// ---------- Step 2: review ----------

function renderProfileSummary() {
  const container = el("profileSummary");
  container.innerHTML = "";
  const sections = [
    {
      title: "Persönliches",
      rows: [
        ["Refund IBAN", profile.personal.refundAccount.iban || "—"],
        ["Refund account holder", profile.personal.refundAccount.accountHolder || "—"],
      ],
    },
    {
      title: "Einkünfte",
      rows: [
        ["Employment documents", String(profile.income.employment.length)],
        [
          "Total Nettolohn",
          formatChf(profile.income.employment.reduce((sum, e) => sum + (Number(e.nettolohn) || 0), 0)),
        ],
      ],
    },
    {
      title: "Abzüge",
      rows: [
        ["3a certificates", String(profile.deductions.pillar3a.length)],
        [
          "3a total",
          formatChf(profile.deductions.pillar3a.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)),
        ],
        ["Donation receipts", String(profile.deductions.charitableDonations.length)],
      ],
    },
    {
      title: "Wertschriften",
      rows: [
        ["Native e-tax statements", String(profile.securities.eTaxStatements.length)],
        [
          "Bulk-import brokers detected",
          profile.securities.bulkImportBrokers.length
            ? profile.securities.bulkImportBrokers.map((b) => b.label).join(", ")
            : "None",
        ],
      ],
    },
  ];

  for (const s of sections) {
    const div = document.createElement("div");
    div.className = "profile-section";
    div.innerHTML =
      `<h4>${s.title}</h4>` +
      s.rows.map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
    container.appendChild(div);
  }
}

function formatChf(n) {
  if (!n) return "CHF 0";
  return "CHF " + n.toLocaleString("de-CH");
}

// ---------- Step 3: guided fill ----------

async function getActiveZhTaxTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("zhp.services.zh.ch")) return null;
  return tab;
}

async function pingActiveTab() {
  const tab = await getActiveZhTaxTab();
  if (!tab) {
    el("notOnSiteBanner").classList.remove("hidden");
    el("sectionHeader").classList.add("hidden");
    el("bulkImportCard").classList.add("hidden");
    return;
  }
  el("notOnSiteBanner").classList.add("hidden");
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: MSG.PING });
    await updateSectionHeader(res.hash, tab.id);
  } catch {
    el("notOnSiteBanner").classList.remove("hidden");
  }
}

async function updateSectionHeader(hash, tabId) {
  currentSectionMeta = matchSection(hash || "");
  el("sectionHeader").classList.remove("hidden");
  el("sectionName").textContent = currentSectionMeta ? currentSectionMeta.label : "Overview";
  el("suggestions").innerHTML = "";
  el("scanEmpty").classList.add("hidden");

  if (currentSectionMeta?.id === "securities" && tabId) {
    await refreshBulkImportCard(tabId);
  } else {
    el("bulkImportCard").classList.add("hidden");
  }
}

// ---------- Wertschriften bulk transaction import (IBKR / Morgan Stanley At Work) ----------
//
// Instead of asking the user to install a second Chrome extension, this
// replicates the same technique natively: once a security is added and its
// detail page is open with "Zu- oder Abgänge erfassen" enabled, we can parse
// a broker export ourselves and drive the app's own add-row/set-field API
// directly (see content/content-script.js) - no manual per-row typing.

async function refreshBulkImportCard(tabId) {
  const card = el("bulkImportCard");
  let state;
  try {
    state = await chrome.tabs.sendMessage(tabId, { type: MSG.SECURITY_DETAIL_STATE });
  } catch {
    card.classList.add("hidden");
    return;
  }

  if (!state.onDetailPage) {
    const flagged = profile.securities.bulkImportBrokers;
    if (!flagged.length) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    const brokerNames = flagged.map((b) => b.label).join(", ");
    card.innerHTML = `
      <strong>Bulk transaction import available (${escapeHtml(brokerNames)})</strong>
      <p>Add the security first via <strong>"Wertschrift suchen"</strong> (search by ISIN), then open it.
      Once you're on its detail page with the additions/disposals table, come back to this panel to
      bulk-import every buy/sell from your broker export instead of typing each row by hand.</p>
    `;
    return;
  }

  card.classList.remove("hidden");
  card.innerHTML = `
    <strong>Bulk import transactions${state.isin ? ` — ${escapeHtml(state.isin)}` : ""}</strong>
    ${
      !state.additionsEnabled
        ? `<p><button id="enableAdditions" class="small">Enable "Zu- oder Abgänge erfassen"</button></p>`
        : `<div class="bulk-import-row">
            <label class="file-label">IBKR Flex Query CSV
              <input type="file" id="ibkrFile" accept=".csv" style="display:none" />
            </label>
            <label class="file-label">Morgan Stanley At Work ZIP
              <input type="file" id="msawFile" accept=".zip" style="display:none" />
            </label>
          </div>
          <div id="importStatus" class="hint"></div>`
    }
  `;

  card.querySelector("#enableAdditions")?.addEventListener("click", async () => {
    await chrome.tabs.sendMessage(tabId, { type: MSG.ENABLE_ADDITIONS_TOGGLE });
    await refreshBulkImportCard(tabId);
  });
  card.querySelector("#ibkrFile")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await runBulkImport(tabId, "ibkr", file);
    e.target.value = "";
  });
  card.querySelector("#msawFile")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) await runBulkImport(tabId, "morganStanleyAtWork", file);
    e.target.value = "";
  });
}

async function runBulkImport(tabId, brokerId, file) {
  const statusEl = el("bulkImportCard").querySelector("#importStatus");
  if (!statusEl) return;
  statusEl.textContent = "Parsing file…";

  let transactions;
  try {
    if (brokerId === "ibkr") {
      transactions = parseIbkrCsv(await file.text());
    } else {
      const files = await unzip(await file.arrayBuffer());
      transactions = parseMsawFiles(files);
    }
  } catch (err) {
    statusEl.textContent = `Couldn't read that file: ${err.message}`;
    return;
  }

  if (!transactions.length) {
    statusEl.textContent = "No transactions found in that file.";
    return;
  }

  statusEl.textContent = `Importing 0 of ${transactions.length}…`;
  const onProgress = (msg) => {
    if (msg?.type === MSG.IMPORT_PROGRESS) statusEl.textContent = `Importing ${msg.done} of ${msg.total}…`;
  };
  chrome.runtime.onMessage.addListener(onProgress);

  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: MSG.IMPORT_TRANSACTIONS,
      transactions,
      filterByIsin: brokerId === "ibkr",
    });
    if (!result.ok) {
      statusEl.textContent = `Import failed: ${result.error}`;
    } else {
      const parts = [`Imported ${result.imported} of ${result.total} transaction(s)`];
      if (result.skipped) parts.push(`skipped ${result.skipped} for a different ISIN`);
      if (result.errors.length) {
        parts.push(`${result.errors.length} failed`);
        console.error("[ZH Tax Assistant] bulk import errors:", result.errors);
      }
      statusEl.textContent = parts.join(", ") + ".";
    }
  } catch (err) {
    statusEl.textContent = `Import failed: ${err.message}`;
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
  }
}

async function scanActiveTab() {
  const tab = await getActiveZhTaxTab();
  if (!tab) return;
  const res = await chrome.tabs.sendMessage(tab.id, { type: MSG.SCAN_FIELDS });
  if (!res?.fields?.length) {
    el("scanEmpty").classList.remove("hidden");
    el("suggestions").innerHTML = "";
    return;
  }
  el("scanEmpty").classList.add("hidden");
  await requestSuggestions(res.fields, tab.id);
}

async function requestSuggestions(fields, tabId) {
  el("suggestions").innerHTML = `<div class="hint">Thinking…</div>`;
  try {
    const settings = await getSettings();
    const sectionGuidance = currentSectionMeta ? await loadKnowledge(currentSectionMeta.knowledgeFile) : "";
    const profileSlice = currentSectionMeta ? profile[currentSectionMeta.profileKey] : profile;
    const { suggestions } = await suggestFieldValues(settings, { sectionGuidance, profileSlice, fields });
    renderSuggestions(suggestions, tabId);
  } catch (err) {
    el("suggestions").innerHTML = `<div class="hint">Couldn't get suggestions: ${escapeHtml(err.message)}</div>`;
    if (err instanceof MissingApiKeyError || err instanceof MissingConfigError) await refreshNoKeyBanner();
  }
}

function renderSuggestions(suggestions, tabId) {
  const container = el("suggestions");
  container.innerHTML = "";
  for (const s of suggestions) {
    const div = document.createElement("div");
    div.className = "suggestion";
    div.innerHTML = `
      <div class="label">${escapeHtml(s.fieldId)} <span class="confidence ${s.confidence}">${s.confidence}</span></div>
      <div class="rationale">${escapeHtml(s.rationale || "")}</div>
      <input type="text" value="${escapeAttr(s.value ?? "")}" />
      <div class="actions">
        <button class="small apply">Apply</button>
        <button class="small secondary skip">Skip</button>
      </div>
    `;
    const input = div.querySelector("input");
    div.querySelector(".apply").addEventListener("click", async () => {
      await chrome.tabs.sendMessage(tabId, { type: MSG.FILL_FIELD, fieldId: s.fieldId, value: input.value });
      div.classList.add("applied");
    });
    div.querySelector(".skip").addEventListener("click", () => {
      div.classList.add("applied");
    });
    container.appendChild(div);
  }
}

async function loadKnowledge(file) {
  if (knowledgeCache[file]) return knowledgeCache[file];
  const res = await fetch(chrome.runtime.getURL(`knowledge/${file}`));
  const text = await res.text();
  knowledgeCache[file] = text;
  return text;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

init();
