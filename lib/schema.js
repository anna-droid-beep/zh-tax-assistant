// lib/schema.js
// Canonical shape of the user's tax profile, built up from uploaded documents
// and refined as the user works through the guided fill-in flow. This object
// is the single source of truth the assistant reasons over; it never leaves
// the browser except as (redacted, field-scoped) context sent to the
// Anthropic API for suggestion generation.

/**
 * @returns {object} an empty tax profile matching the ZHprivateTax section
 * structure we mapped on the live site (Persönliches / Einkünfte / Abzüge /
 * Wertschriften / Vermögen / Abschluss).
 */
export function createEmptyProfile() {
  return {
    meta: {
      taxYear: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    personal: {
      taxpayers: [], // { name, ahvn13, confession, secondPillar }
      children: [],
      dependents: [],
      representative: null,
      giftsReceived: [],
      giftsGiven: [],
      capitalBenefits: [],
      refundAccount: { iban: null, accountHolder: null },
    },
    income: {
      employment: [], // one per Lohnausweis: { employer, nettolohn, ziffer, periodFrom, periodTo, sourceDocumentId }
      selfEmployment: [],
      pensionsAndInsurance: [],
      otherIncome: [], // includes equity comp (RSU/GSU) vesting income, Korporationsanteile
      realEstateIncome: [],
    },
    deductions: {
      commutingCosts: null,
      professionalExpenses: null,
      weeklyResident: null,
      pillar3a: [], // { provider, amount, sourceDocumentId }
      insurancePremiums: [], // { provider, amount, sourceDocumentId }
      charitableDonations: [],
      otherDeductions: [],
    },
    securities: {
      accountDetails: {
        suppliesAuxDocs: false, // Beiblätter
        filesDA1: false, // Formular DA-1 Kopie
        lotteryWinnings: false, // Lotto-/Totoabrechnungen
      },
      eTaxStatements: [], // official eSteuerauszug files (native broker exports)
      bulkImportBrokers: [], // e.g. [{ brokerId: "ibkr", label: "Interactive Brokers", accountId, sourceDocumentId }] - see BULK_IMPORT_BROKERS
      securitiesList: [], // { label, valorNr, country, category, balance, taxValue, income, da1 }
    },
    wealth: {
      realEstate: [],
      movableProperty: [], // cars, precious metals, other
      lifeAndPensionInsurance: [],
    },
    closing: {
      overseasTaxAllocation: null,
      remarks: null,
      attachments: [],
    },
    documents: [], // { id, filename, docType, uploadedAt, extractedFields, confidence }
  };
}

/** Shallow-merges a partial profile update into an existing profile, bumping updatedAt. */
export function mergeProfile(base, patch) {
  const merged = deepMerge(structuredClone(base), patch);
  merged.meta.updatedAt = new Date().toISOString();
  return merged;
}

function deepMerge(target, source) {
  if (Array.isArray(source)) return source;
  if (typeof source !== "object" || source === null) return source;
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      target[key] = deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/** Document types we know how to prompt for and extract. */
export const DOCUMENT_TYPES = [
  { id: "lohnausweis", label: "Lohnausweis (salary certificate)", section: "income" },
  { id: "pillar3a", label: "3rd pillar (Säule 3a) certificate", section: "deductions" },
  { id: "insurance-premium", label: "Insurance premium statement", section: "deductions" },
  { id: "etax-statement", label: "e-Tax statement (eSteuerauszug) from a bank/broker", section: "securities" },
  { id: "broker-statement", label: "Broker / bank year-end statement (non-Swiss format, e.g. IBKR)", section: "securities" },
  { id: "donation-receipt", label: "Donation receipt", section: "deductions" },
  { id: "prior-year-return", label: "Prior year tax return (for reference)", section: "meta" },
  { id: "other", label: "Other supporting document", section: "closing" },
];

/**
 * Brokers/plans the "Fill in" step can bulk-import buy/sell transactions for
 * directly on a security's Wertschriften detail page, instead of asking the
 * user to type each row by hand. See lib/csv/parseIbkr.js and
 * lib/csv/parseMsaw.js for the file formats each one expects.
 */
export const BULK_IMPORT_BROKERS = [
  {
    id: "ibkr",
    label: "Interactive Brokers (IBKR)",
    fileKind: "csv",
    accept: ".csv",
    hint: "A Flex Query CSV export (ISIN, Date/Time, Quantity) for the tax year.",
  },
  {
    id: "morganStanleyAtWork",
    label: "Morgan Stanley At Work",
    fileKind: "zip",
    accept: ".zip",
    hint: "The \"Activity Report\" ZIP export for the tax year (equity plan vesting/sales).",
  },
];
