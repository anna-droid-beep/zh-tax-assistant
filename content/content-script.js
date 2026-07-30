// content/content-script.js
//
// Injected on zhp.services.zh.ch/app/ZHprivateTax*. Deliberately dependency-
// free (no imports) - see lib/sections.js for why: this SPA's controls lack
// stable CSS selectors/ids, but DO expose a real accessible name (verified
// live: textbox "IBAN-Nr.", textbox "Konto lautend auf", etc. via el.labels).
// So field discovery happens at scan time by reading accessible names off
// whatever's on the page right now, rather than a hardcoded selector map
// that would break on the next app update.
//
// Message protocol (mirrored as plain strings in sidepanel/sidepanel.js):
//   ZHTA_PING          -> { hash }
//   ZHTA_SCAN_FIELDS   -> { fields: [{id, label, type, currentValue, options?}] }
//   ZHTA_FILL_FIELD    { fieldId, value } -> { ok }
// Outgoing (unsolicited, on navigation):
//   ZHTA_SECTION_CHANGED { hash }

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

let fieldRegistry = new Map(); // id -> element

function getAccessibleName(elm) {
  const ariaLabel = elm.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = elm.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (elm.labels && elm.labels.length) {
    const text = Array.from(elm.labels)
      .map((l) => l.textContent.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (elm.placeholder?.trim() && elm.placeholder.trim() !== " ") return elm.placeholder.trim();

  return null;
}

function isVisible(elm) {
  return !!(elm.offsetWidth || elm.offsetHeight || elm.getClientRects().length);
}

function currentValueOf(elm) {
  if (elm.tagName === "SELECT") {
    return elm.selectedOptions?.[0]?.textContent?.trim() || "";
  }
  if (elm.type === "checkbox" || elm.type === "radio") return elm.checked;
  return elm.value ?? "";
}

function scanFields() {
  fieldRegistry = new Map();
  const root = document.querySelector("main") || document.body;
  const controls = root.querySelectorAll("input, textarea, select");
  const fields = [];

  controls.forEach((elm, idx) => {
    if (elm.type === "hidden" || elm.disabled) return;
    if (!isVisible(elm)) return;
    const label = getAccessibleName(elm);
    if (!label) return;

    const id = `zhta-${idx}-${Math.random().toString(36).slice(2, 8)}`;
    elm.dataset.zhtaId = id;
    fieldRegistry.set(id, elm);

    const field = {
      id,
      label,
      type: elm.tagName === "SELECT" ? "select" : elm.type || "text",
      currentValue: currentValueOf(elm),
    };
    if (elm.tagName === "SELECT") {
      field.options = Array.from(elm.options).map((o) => o.textContent.trim());
    }
    fields.push(field);
  });

  return fields;
}

function fillField(fieldId, value) {
  let elm = fieldRegistry.get(fieldId);
  if (!elm) {
    elm = document.querySelector(`[data-zhta-id="${CSS.escape(fieldId)}"]`);
  }
  if (!elm) return { ok: false, error: "Field not found on page (try scanning again)" };

  elm.focus();

  if (elm.tagName === "SELECT") {
    const match = Array.from(elm.options).find(
      (o) => o.textContent.trim().toLowerCase() === String(value).trim().toLowerCase() || o.value === value
    );
    if (match) elm.value = match.value;
  } else if (elm.type === "checkbox" || elm.type === "radio") {
    elm.checked = value === true || value === "true" || value === "checked" || value === "yes";
  } else {
    // Native setter, so frameworks relying on property descriptors (Angular/React style) notice the change.
    const proto = elm.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(elm, value);
    else elm.value = value;
  }

  elm.dispatchEvent(new Event("input", { bubbles: true }));
  elm.dispatchEvent(new Event("change", { bubbles: true }));
  elm.blur();

  highlight(elm);
  return { ok: true };
}

function highlight(elm) {
  const prevOutline = elm.style.outline;
  const prevOffset = elm.style.outlineOffset;
  elm.style.outline = "2px solid #0d5ba5";
  elm.style.outlineOffset = "1px";
  setTimeout(() => {
    elm.style.outline = prevOutline;
    elm.style.outlineOffset = prevOffset;
  }, 1800);
}

// ---------- Wertschriften bulk transaction import ----------
//
// The security-detail dialog's "Zu- & Abgänge" (additions/disposals) table
// is backed by the app's own REST API. Instead of clicking "add row" and
// typing three fields per transaction by hand, we call that API directly.
// (These endpoint shapes are interoperability facts about how the ZHprivateTax
// app itself works, independently reverse-engineered - see README for
// attribution to the community project that first documented them.)

function getSecurityDetailState() {
  const wvTable = document.querySelector("zhp-securities-detail-buy-sell-table");
  const da1Table = document.querySelector("zhp-da1-detail-buy-sell-table");
  const onDetailPage = !!(wvTable || da1Table);
  const isVw = !!wvTable;

  const hashParts = location.hash.split("/");
  const taxId = hashParts[1] || null;
  const taxYearMatch = location.pathname.match(/ZHprivateTax(\d{4})/);
  const taxYear = taxYearMatch ? taxYearMatch[1] : null;

  let isin = null;
  let additionsEnabled = false;
  if (onDetailPage) {
    const isinInput = Array.from(document.querySelectorAll("input")).find(
      (el) => getAccessibleName(el)?.trim().toUpperCase() === "ISIN"
    );
    isin = isinInput?.value?.replace(/\s+/g, "") || null;

    const toggle = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((el) =>
      getAccessibleName(el)?.includes("Zu- oder Abgänge erfassen")
    );
    additionsEnabled = !!toggle?.checked;
  }

  return { onDetailPage, isVw, isin, additionsEnabled, taxId, taxYear };
}

function enableAdditionsToggle() {
  const toggle = Array.from(document.querySelectorAll('input[type="checkbox"]')).find((el) =>
    getAccessibleName(el)?.includes("Zu- oder Abgänge erfassen")
  );
  if (toggle && !toggle.checked) toggle.click();
  return { ok: !!toggle };
}

async function addAndFillTransactionRow(taxYear, taxId, prefix, transaction) {
  const jsonHeaders = { "content-type": "application/json" };

  const addRowRes = await fetch(`/api/ZHprivateTax${taxYear}/${taxId}/view/wizard.${prefix}/table`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      action: "ADD_ROW",
      rowIndex: -1,
      tableContext: null,
      tableId: `${prefix}WAAdditionDivestitureDetail`,
    }),
  });
  if (!addRowRes.ok) throw new Error(`Could not add a row (HTTP ${addRowRes.status}).`);
  const addRowJson = await addRowRes.json();
  const rows = addRowJson?.view?.[1]?.dialog?.tables?.[1]?.rows;
  const rowContext = rows?.[rows.length - 1]?.[0]?.context;
  if (!rowContext) throw new Error("Unexpected response shape when adding a row - the app may have changed.");

  const setField = (id, value) =>
    fetch(`/api/ZHprivateTax${taxYear}/${taxId}/view/wizard.${prefix}/entity`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ context: rowContext, deleteImport: false, id, value }),
    });

  const amount = Number(transaction.amount);
  await Promise.all([
    setField(`${prefix}WAAdditionDivestitureDetailReason`, amount >= 0 ? "00" : "10"), // 00 = Kauf, 10 = Verkauf
    setField(`${prefix}WAAdditionDivestitureDetailFaceValueQuantity`, Math.abs(amount)),
    setField(`${prefix}WAAdditionDivestitureDetailDate`, transaction.date), // expected DD.MM.YYYY
  ]);
}

async function importTransactions(transactions, filterByIsin) {
  const state = getSecurityDetailState();
  if (!state.onDetailPage) {
    return { ok: false, error: "Not on a security's detail page (with the additions/disposals table visible)." };
  }
  if (!state.taxId || !state.taxYear) {
    return { ok: false, error: "Couldn't determine the tax case ID/year from the page URL." };
  }

  const prefix = state.isVw ? "securities" : "da1";
  const toImport =
    filterByIsin && state.isin
      ? transactions.filter((t) => !t.isin || t.isin.replace(/\s+/g, "").toUpperCase() === state.isin.toUpperCase())
      : transactions;

  let done = 0;
  const errors = [];
  for (const transaction of toImport) {
    try {
      await addAndFillTransactionRow(state.taxYear, state.taxId, prefix, transaction);
    } catch (err) {
      errors.push({ transaction, error: err.message });
    }
    done++;
    chrome.runtime.sendMessage({ type: MSG.IMPORT_PROGRESS, done, total: toImport.length }).catch(() => {});
  }

  if (Number(state.taxYear) < 2025) {
    // Older app builds don't reactively re-render the table after these API calls.
    setTimeout(() => location.reload(), 300);
  }

  return {
    ok: true,
    imported: toImport.length - errors.length,
    total: toImport.length,
    skipped: transactions.length - toImport.length,
    errors,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case MSG.PING:
      sendResponse({ hash: location.hash });
      return false;
    case MSG.SCAN_FIELDS:
      sendResponse({ fields: scanFields() });
      return false;
    case MSG.FILL_FIELD:
      sendResponse(fillField(msg.fieldId, msg.value));
      return false;
    case MSG.SECURITY_DETAIL_STATE:
      sendResponse(getSecurityDetailState());
      return false;
    case MSG.ENABLE_ADDITIONS_TOGGLE:
      sendResponse(enableAdditionsToggle());
      return false;
    case MSG.IMPORT_TRANSACTIONS:
      importTransactions(msg.transactions, msg.filterByIsin).then(sendResponse);
      return true; // keep the message channel open for the async response
    default:
      return false;
  }
});

window.addEventListener("hashchange", () => {
  chrome.runtime.sendMessage({ type: MSG.SECTION_CHANGED, hash: location.hash }).catch(() => {});
});
