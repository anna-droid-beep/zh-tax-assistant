# Wertschriften — guidance for the assistant

Everybody has something to declare here: every bank account (Swiss or
foreign — Switzerland taxes worldwide movable assets) and every security
(stocks, funds, ETFs, bonds, crypto) belongs in the Wertschriftenverzeichnis.
This section drives both income tax (interest/dividends) and wealth tax
(year-end value), so it matters even for accounts with zero activity.

- **Kontoangaben**: the refund IBAN (same as Persönliches) plus three
  checkboxes: "Beiblätter" (supplying auxiliary broker documents),
  "Formular DA-1 Kopie" (claiming foreign withholding-tax credit via DA-1),
  "Lotto-/Totoabrechnungen" (lottery winnings). Check DA-1 if the user holds
  foreign securities that withheld tax at source.
- **Wertschriftenverzeichnis**: the actual list of accounts/securities.
  Confirmed live, the page offers three entry methods:
  1. **"eSteuerauszug importieren"** — upload an official Swiss e-tax
     statement (eCH-0196 XML) that a Swiss bank/broker exports natively.
     This is the fast path and should always be preferred when available.
  2. **"Wertschrift suchen"** — look up a known security by name/ISIN and
     let the app pull its official tax value.
  3. **Manual entry** — "Bankkonto" (bank account), "Wertschrift und
     Guthaben" (security/balance), or "Wertschrift mit ausl. QS (DA-1)"
     (foreign security with withholding tax) for anything not covered
     above.

## Special case: Interactive Brokers (IBKR) / Morgan Stanley At Work

Foreign brokers and equity-plan administrators like IBKR or Morgan Stanley At
Work don't produce a Swiss eCH-0196 e-tax statement, so option 1 above isn't
available for them. Their transactions also aren't "one account, one number"
like a bank statement - each buy/sell/vesting event is its own row, which
makes manual entry tedious for anyone who traded more than a handful of
times.

This is NOT handled via the eSteuerauszug import. Instead, once the security
itself has been added (via "Wertschrift suchen", searching by ISIN) and its
detail page is open with **"Zu- oder Abgänge erfassen"** enabled, the
assistant can bulk-import every row directly:

1. Export the broker's data:
   - **IBKR**: Performance & Reports → Flex Queries → create a query with
     ISIN, Date/Time, Quantity columns (CSV, header row included).
   - **Morgan Stanley At Work**: Activity → Reports → Activity Report,
     reporting period "Previous Calendar Year", CSV output (downloads as a
     ZIP of several reports).
2. Upload that file directly in the assistant's side panel while the
   security's detail page is open.
3. The assistant parses it locally (no AI call needed - it's structured
   data, not a document to interpret) and calls the same internal API the
   page's own "add row" button uses, once per transaction, so nothing needs
   to be typed by hand. Buy vs. sell is inferred from the sign of the
   quantity in the export.

For IBKR, rows are matched to the currently open security by ISIN (a single
export can cover many securities - only the matching rows get imported).
Morgan Stanley At Work exports don't include an ISIN column, so the whole
file is assumed to belong to whichever security's detail page is open.
