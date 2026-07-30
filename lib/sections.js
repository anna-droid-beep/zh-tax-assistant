// lib/sections.js
//
// ZHprivateTax routing map, confirmed by live inspection (July 2026,
// app build 1.2.1-2026-06-22T07:35Z) of https://zhp.services.zh.ch/app/ZHprivateTax2025/.
//
// URL shape: https://zhp.services.zh.ch/app/ZHprivateTax<year>/#/<caseId>/tax-assistant/<section>[/<subsection>]
//
// The app is an Angular SPA whose elements mostly lack stable CSS
// selectors/ids (auto-generated classes), but its form controls DO expose a
// proper accessible name (label text / aria-label). That's why the content
// script does *runtime* field discovery by accessible name rather than
// relying on a hand-maintained CSS selector per field: a static map would go
// stale the moment the Kanton ships an app update. This registry only needs
// to describe which tax-profile slice is relevant to which route, plus the
// paraphrased guidance to ground the AI's suggestions - not exact selectors.

export const SECTIONS = [
  {
    id: "personal",
    label: "Persönliches",
    routeMatch: /\/tax-assistant\/personal(\/|$)/,
    profileKey: "personal",
    knowledgeFile: "personal.md",
    subsections: [
      "Steuerpflichtige Personen",
      "Kinder",
      "Unterstützte Personen",
      "Vertreter",
      "Erhaltene Schenkungen / Erbschaften",
      "Ausgerichtete Schenkungen / Erbvorbezüge",
      "Kapitalleistungen",
      "Bankverbindung für Rückerstattungen", // confirmed fields: "IBAN-Nr.", "Konto lautend auf"
    ],
  },
  {
    id: "income",
    label: "Einkünfte",
    routeMatch: /\/tax-assistant\/revenue(\/|$)/,
    profileKey: "income",
    knowledgeFile: "income.md",
    subsections: ["Erwerb", "Renten und Versicherungen", "Übrige Einkünfte", "Liegenschaften"],
  },
  {
    id: "deductions",
    label: "Abzüge",
    routeMatch: /\/tax-assistant\/deductions(\/|$)/,
    profileKey: "deductions",
    knowledgeFile: "deductions.md",
    subsections: [
      "Berufsbedingte Fahrkosten",
      "Weitere Berufsauslagen",
      "Säule 3a und weitere Vorsorgearten",
      "Versicherungsprämien",
      "Gemeinnützige Zuwendungen",
      "Weitere Abzüge",
    ],
  },
  {
    id: "securities",
    label: "Wertschriften",
    routeMatch: /\/tax-assistant\/securities(\/|$)/,
    profileKey: "securities",
    knowledgeFile: "securities.md",
    subsections: [
      "Wertschriftenverzeichnis", // route: /tax-assistant/securities/security-list
      "Angaben zum DA-1 Formular",
    ],
    // Confirmed on the live "Wertschriftenverzeichnis" page: three ways to add
    // a position - "eSteuerauszug importieren", "Wertschrift suchen",
    // and manual entry via "Bankkonto" / "Wertschrift und Guthaben" /
    // "Wertschrift mit ausl. QS (DA-1)". The IBKR/CSV corner case hooks into
    // the first of these - see knowledge/securities.md and the special-case
    // handling in sidepanel/sidepanel.js (handleIbkrCase).
    specialCases: ["ibkrCsvImport"],
  },
  {
    id: "wealth",
    label: "Vermögen",
    routeMatch: /\/tax-assistant\/assets(\/|$)/,
    profileKey: "wealth",
    knowledgeFile: "wealth.md",
    subsections: ["Liegenschaften", "Bewegliches Vermögen", "Lebens- und Rentenversicherungen"],
  },
  {
    id: "closing",
    label: "Abschluss",
    routeMatch: /\/tax-assistant\/completion(\/|$)/,
    profileKey: "closing",
    knowledgeFile: "closing.md",
    subsections: ["Steuerausscheidung", "Bemerkungen", "Beilagen", "Einreichen"],
  },
];

/** Given a location.hash from the ZHprivateTax app, find the matching section. */
export function matchSection(hash) {
  return SECTIONS.find((s) => s.routeMatch.test(hash)) || null;
}

export function isHomeRoute(hash) {
  return /\/home(\?|$)/.test(hash);
}
