// lib/csv/parseMsaw.js
//
// Parses a Morgan Stanley At Work "Activity Report" export (a ZIP containing
// per-report CSVs) into the transaction list the Wertschriften bulk-import
// feature needs. Export it from Morgan Stanley At Work via Activity →
// Reports → Activity Report, reporting period "Previous Calendar Year",
// output format CSV (downloads as a .zip of individual reports).
//
// Two reports inside matter here:
//  - "Releases Net Shares Report.csv"  → equity vesting events (additions)
//  - "Withdrawals Report.csv"          → sale events (disposals)
// Both share the same column layout: a date in column 0 (e.g. "25-Jan-2024")
// and a share quantity in column 6. Withdrawals also has a "Plan" column
// (index 2) that reads "Cash" for cash-settled rows, which aren't share
// transactions and get skipped. Note this only supports a single security
// per export - Morgan Stanley At Work doesn't include an ISIN column, so
// (matching the upstream tool this is based on) the whole export is assumed
// to belong to whichever security's detail page you're currently importing
// into.
import { splitCsvRows } from "./util.js";

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function toDdMmYyyy(dateStr) {
  const [day, monName, year] = dateStr.split("-");
  const month = MONTHS[monName];
  if (!day || !month || !year) return null;
  return `${day}.${month}.${year}`;
}

function parseReport(csvText, { dateCol, quantityCol, skipRow }) {
  const rows = splitCsvRows(csvText);
  const transactions = [];

  for (const row of rows) {
    const dateStr = row[dateCol];
    if (!dateStr || dateStr.split("-").length !== 3) continue; // skips header/footer rows
    if (skipRow?.(row)) continue;

    const date = toDdMmYyyy(dateStr);
    const amount = Number(row[quantityCol]);
    if (!date || !Number.isFinite(amount)) continue;

    transactions.push({ date, amount });
  }

  return transactions;
}

const REPORT_FILES = {
  releases: "releases net shares report.csv",
  withdrawals: "withdrawals report.csv",
};

function findFile(filesMap, targetName) {
  for (const [name, bytes] of filesMap.entries()) {
    if (name.toLowerCase().endsWith(targetName)) return bytes;
  }
  return null;
}

/**
 * @param {Map<string, Uint8Array>} filesMap - result of lib/zip/unzip.js's unzip()
 * @returns {Array<{date:string, amount:number}>}
 */
export function parseMsawFiles(filesMap) {
  const decoder = new TextDecoder("utf-8");
  const transactions = [];

  const releasesBytes = findFile(filesMap, REPORT_FILES.releases);
  if (releasesBytes) {
    transactions.push(...parseReport(decoder.decode(releasesBytes), { dateCol: 0, quantityCol: 6 }));
  }

  const withdrawalsBytes = findFile(filesMap, REPORT_FILES.withdrawals);
  if (withdrawalsBytes) {
    transactions.push(
      ...parseReport(decoder.decode(withdrawalsBytes), {
        dateCol: 0,
        quantityCol: 6,
        skipRow: (row) => row[2] === "Cash",
      })
    );
  }

  if (!releasesBytes && !withdrawalsBytes) {
    throw new Error(
      'Neither "Releases Net Shares Report.csv" nor "Withdrawals Report.csv" was found in this ZIP - is it the Morgan Stanley At Work Activity Report export?'
    );
  }

  return transactions;
}
