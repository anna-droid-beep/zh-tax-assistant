// lib/prompts.js
// Per-document-type extraction instructions. Kept deliberately schema-shaped
// so the JSON Claude returns drops straight into lib/schema.js records.

export const EXTRACTION_PROMPTS = {
  lohnausweis: `This is a Swiss Lohnausweis (salary certificate). Extract:
{ "employer": string, "employeeName": string, "periodFrom": "YYYY-MM-DD", "periodTo": "YYYY-MM-DD",
  "nettolohn": number (Ziffer 11, in CHF), "bruttolohn": number|null (Ziffer 1-10 total if shown),
  "expenseAllowances": number|null (Ziffer 13), "notes": string|null (anything unusual, e.g. equity
  compensation mentioned in Ziffer 15/Bemerkungen) }`,

  pillar3a: `This is a Swiss 3rd-pillar (Säule 3a) contribution certificate. Extract:
{ "provider": string, "accountHolder": string, "amount": number (CHF contributed this tax year),
  "taxYear": number }`,

  "insurance-premium": `This is an insurance premium statement (health/life insurance or similar). Extract:
{ "provider": string, "policyType": string, "amount": number (CHF premiums paid/deductible this year),
  "taxYear": number }`,

  "etax-statement": `This is a Swiss e-tax statement (eSteuerauszug, eCH-0196 format) summary from a bank or
broker. Extract whatever summary totals are visible:
{ "institution": string, "accountId": string|null, "totalTaxValue": number|null,
  "totalIncome": number|null, "taxYear": number|null, "isNativeSwissFormat": true }`,

  "broker-statement": `This is a year-end statement from a bank or brokerage that is NOT in the Swiss
eCH-0196 e-tax-statement format (e.g. Interactive Brokers, a US/EU broker, or an equity
compensation plan administrator like Morgan Stanley At Work). Extract:
{ "brokerName": string, "brokerId": "ibkr"|"morganStanleyAtWork"|"other", "accountId": string|null,
  "isNonSwissBroker": true, "totalValueEndOfYear": number|null, "currency": string|null,
  "positions": [ { "name": string, "quantity": number|null, "valueEndOfYear": number|null } ] }
Set "brokerId" to "ibkr" for Interactive Brokers, "morganStanleyAtWork" for Morgan Stanley At Work
(equity award / RSU plan statements), or "other" for anything else. Set "isNonSwissBroker" to true
whenever the statement isn't an official Swiss eCH-0196 export - for "ibkr" and
"morganStanleyAtWork" this surfaces the native bulk transaction-import tool instead of manual entry.`,

  "donation-receipt": `This is a charitable donation receipt. Extract:
{ "organization": string, "amount": number (CHF), "date": "YYYY-MM-DD"|null }`,

  "prior-year-return": `This is a prior-year Swiss tax return, for reference only. Extract just enough
to sanity-check this year's figures:
{ "taxYear": number|null, "taxableIncome": number|null, "taxableWealth": number|null }`,

  other: `Extract any clearly labeled financial figures relevant to a Swiss personal tax return as a
flat JSON object of { label: value } pairs. If nothing relevant is present, return {}.`,
};

export function extractionPromptFor(docTypeId) {
  return EXTRACTION_PROMPTS[docTypeId] || EXTRACTION_PROMPTS.other;
}
