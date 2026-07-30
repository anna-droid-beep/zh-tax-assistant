// background/background.js
// Minimal service worker: opens the side panel when the toolbar icon is
// clicked, and keeps the side panel enabled specifically for ZHprivateTax
// tabs. All the real logic lives in the side panel (lib/anthropic.js calls)
// and the content script (DOM scanning/filling) - the background script is
// just plumbing, on purpose, so there's one fewer place holding state.

const ZH_TAX_HOST = "zhp.services.zh.ch";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!info.url && info.status !== "complete") return;
  try {
    const url = new URL(tab.url || info.url || "");
    if (url.hostname === ZH_TAX_HOST) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel/sidepanel.html",
        enabled: true,
      });
    }
  } catch {
    // ignore non-http(s) tabs (chrome://, etc.)
  }
});
