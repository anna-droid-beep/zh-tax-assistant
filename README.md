# ZH Tax Assistant

A Chrome extension that helps you fill in the Kanton Zürich
[ZHprivateTax](https://zhp.services.zh.ch/app/ZHprivateTax/) online tax
declaration: upload your documents, review what got extracted, then walk
through the form section by section with AI-suggested values you confirm
before anything is written to the page.

No build step — this is a plain Manifest V3 extension, load it as-is.

## Install

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this `zh-tax-assistant` folder.
3. Click the extension's **Details → Extension options**, pick an **AI
   provider**, and paste your own API key for it:
   - **Claude (Anthropic)** — [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
   - **ChatGPT (OpenAI)** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Gemini (Google)** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **Custom** — any OpenAI-compatible `/chat/completions` endpoint
     (OpenRouter, Groq, a local Ollama/LM Studio server, etc.) — set a base
     URL and model name; an API key may not be required for local endpoints.

   Whichever you pick, the key is stored only in this browser
   (`chrome.storage.local`) and calls go straight from your browser to that
   provider's own API — there's no proxy server involved. For a custom
   endpoint, Chrome will ask you to grant the extension permission to reach
   that specific host the first time you save it.
4. Open the side panel (toolbar icon, or it opens automatically once you
   navigate to zhp.services.zh.ch).

You can switch providers at any time from the options page — nothing else
about the extension changes.

## How it works

1. **Documents** — upload your Lohnausweis, 3a certificate, e-tax statements,
   etc. Each is sent once to your configured AI provider for extraction, then
   discarded; only the extracted numbers are kept (in this browser, nothing
   synced elsewhere).
2. **Review** — sanity-check the extracted profile before anything touches
   the real form.
3. **Fill in** — open your ZHprivateTax declaration in the same browser,
   navigate to a section, hit **"Scan this page."** The assistant reads the
   visible form fields, proposes a value + a one-line rationale for each, and
   waits for you to approve or edit before writing anything in.

## The Interactive Brokers / Morgan Stanley At Work case

Foreign brokers and equity-plan administrators like IBKR or Morgan Stanley At
Work don't produce a Swiss e-tax statement, and their transactions come as
dozens of individual buy/sell/vesting rows rather than one number. Instead of
asking you to install a second Chrome extension to handle this, it's built
in:

1. Add the security normally via **"Wertschrift suchen"** (search by ISIN),
   open it, and enable **"Zu- oder Abgänge erfassen"** (the assistant can
   flip this on for you).
2. Export your data:
   - **IBKR**: Performance & Reports → Flex Queries → a query with ISIN,
     Date/Time, Quantity columns, CSV format.
   - **Morgan Stanley At Work**: Activity → Reports → Activity Report,
     "Previous Calendar Year", CSV output (a ZIP of report files).
3. Upload that file directly in the side panel's "Bulk import transactions"
   card. It's parsed locally (no AI call - it's structured data, not a
   document) and each row is entered by calling the same internal API the
   page's own "add row" button uses - no typing, no second extension.

This reimplements the approach documented by
[stefanloerwald/zh-tax-csv-import](https://github.com/stefanloerwald/zh-tax-csv-import)
(a separate Chrome extension that adds import buttons directly to the
ZHprivateTax page). That repo has no LICENSE file, so rather than copying its
code, this extension's `lib/csv/`, `lib/zip/`, and the import logic in
`content/content-script.js` were written from scratch after reading its
source to understand the CSV formats and the app's internal API shape -
credit to Stefan Loerwald for working that out first. Neither project is
affiliated with the Kanton of Zurich, IBKR, or Morgan Stanley; use is at your
own risk and you remain responsible for the correctness of your declaration.

## Project layout

```
manifest.json
background/background.js     side panel wiring, nothing else
sidepanel/                    the whole UI: upload, review, guided fill
options/                      API key + data management
content/content-script.js     runs on zhp.services.zh.ch: scans/fills fields, bulk-imports transactions
lib/
  schema.js                   canonical tax-profile shape
  storage.js                  chrome.storage.local wrapper (settings, profile, ui state)
  sections.js                 ZHprivateTax route → section registry
  errors.js                   shared error types (MissingApiKeyError, etc.)
  prompts.js                  per-document-type extraction prompts
  providers/
    index.js                  dispatches to whichever provider is configured
    anthropic.js               Claude (Anthropic Messages API)
    openai.js                  ChatGPT (OpenAI Responses API)
    gemini.js                  Gemini (Google Generative Language API)
    custom.js                  any OpenAI-compatible /chat/completions endpoint
    shared.js                  prompt text + JSON-response parsing shared by all of the above
  csv/
    parseIbkr.js               IBKR Flex Query CSV → transaction list
    parseMsaw.js                Morgan Stanley At Work export → transaction list
    util.js                    tiny CSV line splitter
  zip/unzip.js                 dependency-free ZIP reader (for the Morgan Stanley At Work export)
knowledge/*.md                paraphrased per-section guidance fed to the AI
```

## Design notes / why it's built this way

- **AI backend is pluggable, not tied to one vendor.** `lib/providers/index.js`
  is the only thing the UI calls; it dispatches to whichever adapter matches
  the provider you picked in Settings. Adding another vendor means adding one
  file under `lib/providers/` with the same `{meta, extractDocumentFields,
  suggestFieldValues}` shape — nothing else changes.
- **Field discovery is dynamic, not hardcoded.** ZHprivateTax is an Angular
  SPA whose elements mostly lack stable CSS selectors (auto-generated
  classes), but its form controls do expose a real accessible name (verified
  live — e.g. `textbox "IBAN-Nr."`). So the content script reads whatever's
  on the page at scan time by accessible name, instead of a hand-maintained
  selector-per-field map that would silently break on the next Kanton app
  update.
- **Hybrid fill, not full auto-fill.** The assistant highlights a field,
  proposes a value with its reasoning, and only writes it after you approve
  or edit — so a bad AI guess never silently lands in your tax return.
- **Nothing is submitted automatically.** "Einreichen" is always a manual,
  deliberate step you take yourself.
- **Bulk import calls the app's own API instead of re-deriving a whole
  e-tax-statement format.** The security-detail "Zu- & Abgänge" table is
  backed by a plain REST API (`ADD_ROW` then three field-set calls); the
  content script calls it directly with the browser's existing session, the
  same way the page's own "add row" button does.

## Known limitations / next steps

- Only the Persönliches → Bankverbindung subsection, the Wertschriften →
  Wertschriftenverzeichnis page, and the security-detail dialog (verified
  live against the Kanton's public demo at
  `ZHprivateTax2025/#/demo/...`) were inspected live; other subsections rely
  on the same dynamic-scan approach but haven't been individually verified —
  test each section before relying on it, and file corrections to
  `lib/sections.js` / `knowledge/*.md` as you go.
- The bulk-import API calls assume the current (2025) app version's request
  shapes; if the Kanton changes them, `content/content-script.js`'s
  `addAndFillTransactionRow` is the one place to update.
- No automated tests yet — this was hand-verified against the live site
  structure and Node's syntax checker, not exercised end-to-end inside
  Chrome.
- If Chrome's side panel doesn't auto-open on navigation (platform-dependent
  gesture requirement), click the toolbar icon manually.
