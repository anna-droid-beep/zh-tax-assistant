// lib/csv/parseIbkr.js
//
// Parses an Interactive Brokers Flex Query CSV export into the transaction
// list the Wertschriften bulk-import feature needs. The export format is
// documented in the side panel's "How to export from IBKR" help text
// (Performance & Reports → Flex Queries): a Flex Query configured with
// columns ISIN, Date/Time, Quantity, CSV format, header row included,
// date format yyyy-MM-dd and time format HHmmss separated by ";".
//
// Example row: "US67066G1040","2025-03-14;131433","100"
//   - Quantity > 0 is a purchase, < 0 is a sale (that sign convention is
//     preserved all the way through to the ZHprivateTax API call).
import { splitCsvRows } from "./util.js";

/**
 * @param {string} csvText
 * @returns {Array<{isin:string, date:string, amount:number}>} date as DD.MM.YYYY
 */
export function parseIbkrCsv(csvText) {
  const rows = splitCsvRows(csvText);
  const transactions = [];

  for (const row of rows) {
    const [isin, dateTime, quantity] = row;
    if (!isin || !dateTime || quantity === undefined) continue;

    const [datePart] = dateTime.split(";");
    const dateSegments = datePart?.split("-") || [];
    if (dateSegments.length !== 3) continue; // skips the header row and any malformed line

    const amount = Number(quantity);
    if (!Number.isFinite(amount)) continue;

    const [year, month, day] = dateSegments;
    transactions.push({ isin: isin.replace(/\s+/g, ""), date: `${day}.${month}.${year}`, amount });
  }

  return transactions;
}
