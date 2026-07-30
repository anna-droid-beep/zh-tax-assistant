// lib/csv/util.js — tiny shared CSV helpers (no library needed for such simple, single-line exports).

/** Splits one CSV line into fields, stripping surrounding quotes. Good enough for the
 * quote-everything, no-embedded-commas exports these brokers produce. */
export function splitCsvLine(line) {
  return line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
}

export function splitCsvRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(splitCsvLine);
}
