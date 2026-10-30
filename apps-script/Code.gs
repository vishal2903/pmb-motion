/**
 * PMB in Motion: JSON feed for the dashboard.
 * Bound to the "PMB Product Tracker" spreadsheet. Deploy as Web app: Execute as Me, Access: Anyone.
 * Read-only: it never writes to any sheet.
 */

const INVOICE_SHEET_ID = '1FAAE7llp5162it9BFhprAHq8aVwkqOgygN6gsUYbiwE'; // Chahat's "invoice pmb" sheet
const INVOICE_TAB = 'invoice';
const CACHE_SECONDS = 60;
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('feed');
  if (hit) return json_(hit);
  const body = JSON.stringify(buildFeed_());
  // Cache entries are capped at 100KB; an oversized feed is simply served uncached.
  if (body.length < 100000) cache.put('feed', body, CACHE_SECONDS);
  return json_(body);
}

function buildFeed_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const feed = { generatedAt: new Date().toISOString(), errors: [] };
  feed.tracker = readTable_(book.getSheetByName('Tracker'), 2, 4, 'Row ID');
  feed.servers = readTable_(book.getSheetByName('Servers'), 1, 3, 'Server name');
  feed.iterations = readTable_(book.getSheetByName('Iteration Log'), 1, 3, 'Row ID');
  feed.followUps = readTable_(book.getSheetByName('Billing Follow-up'), 1, 3, 'Row ID');
  // Not read on purpose: "How to fill" (instructions) and "Lists" (dropdown options).
  // Billing status itself comes from Chahat's invoice sheet; Billing Follow-up adds who is chasing it and notes.
  feed.usdInr = readUsdInr_(book.getSheetByName('Servers'));
  try {
    feed.billing = readBilling_(SpreadsheetApp.openById(INVOICE_SHEET_ID).getSheetByName(INVOICE_TAB));
  } catch (e) {
    // Billing is optional for the page: report it instead of failing the whole feed.
    feed.billing = { months: [], clients: [] };
    feed.errors.push('Billing sheet not readable: ' + e.message);
  }
  return feed;
}

/** Rows as objects keyed by header text, so added or reordered columns never break the feed. */
function readTable_(sheet, headerRow, firstDataRow, keyHeader) {
  if (!sheet) return [];
  const width = sheet.getLastColumn(), last = sheet.getLastRow();
  if (last < firstDataRow) return [];
  const headers = sheet.getRange(headerRow, 1, 1, width).getDisplayValues()[0].map(h => h.trim());
  const values = sheet.getRange(firstDataRow, 1, last - firstDataRow + 1, width).getDisplayValues();
  return tableToObjects_(headers, values, keyHeader);
}

function tableToObjects_(headers, values, keyHeader) {
  // The table ends at the first blank header: anything to its right (e.g. a side summary box) is not data.
  const end = headers.indexOf('') === -1 ? headers.length : headers.indexOf('');
  const out = [];
  values.forEach(row => {
    const obj = {};
    // If a header repeats, the first column wins so a later column can never overwrite real data.
    headers.slice(0, end).forEach((h, i) => { if (!(h in obj)) obj[h] = String(row[i] == null ? '' : row[i]).trim(); });
    if (obj[keyHeader]) out.push(obj);
  });
  return out;
}

/** Reads the USD to INR rate from a cell labelled "USD to INR" in the Servers tab (a GOOGLEFINANCE formula). */
function readUsdInr_(sheet) {
  if (!sheet) return null;
  const grid = sheet.getDataRange().getValues();
  for (const row of grid) {
    for (let c = 0; c < row.length - 1; c++) {
      if (String(row[c]).trim().toLowerCase() === 'usd to inr') {
        const v = Number(row[c + 1]);
        return v > 0 ? v : null;
      }
    }
  }
  return null;
}

function readBilling_(sheet) {
  const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
  return parseBilling_(range.getDisplayValues(), range.getBackgrounds());
}

/**
 * Chahat's sheet: row 1 holds a colour legend, row 2 the month headers (each month spans a volume
 * and an amount column), and each client's total row has an empty "service" column.
 * Status lives in the colour of the amount cell. Legend text decides the meaning, not hard-coded colours.
 */
function parseBilling_(values, colours) {
  const legend = {};
  values[0].forEach((text, c) => {
    const t = String(text).toLowerCase();
    const bg = String(colours[0][c]).toLowerCase();
    if (!bg || bg === '#ffffff') return;
    // Tolerant of the sheet's own spelling ("not rasied").
    if (t.indexOf('clear') >= 0) legend[bg] = t.indexOf('not') >= 0 ? 'raised' : 'cleared';
    else if (/not\s*ra/.test(t)) legend[bg] = 'not_raised';
  });

  const months = [];
  values[1].forEach((text, c) => {
    const m = MONTH_NAMES.indexOf(String(text).trim().toLowerCase().slice(0, 3));
    const isPrevious = String(text).toLowerCase().indexOf('previ') >= 0;
    if (m >= 0 && !isPrevious) months.push({ label: MONTH_NAMES[m][0].toUpperCase() + MONTH_NAMES[m].slice(1), amountCol: c + 1 });
  });

  const clients = [];
  for (let r = 2; r < values.length; r++) {
    const name = String(values[r][0]).trim(), service = String(values[r][1]).trim();
    if (!name || service) continue;
    const status = {};
    months.forEach(m => {
      const s = legend[String(colours[r][m.amountCol]).toLowerCase()];
      if (s) status[m.label] = s;
    });
    if (Object.keys(status).length) clients.push({ client: name, months: status });
  }
  return { months: months.map(m => m.label), clients: clients };
}

function json_(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Run from the editor to check the feed without deploying. */
function testFeed() {
  const f = buildFeed_();
  Logger.log('Tracker rows: %s, servers: %s, iterations: %s, follow-ups: %s, billing clients: %s, months: %s, USD/INR: %s, errors: %s',
    f.tracker.length, f.servers.length, f.iterations.length, f.followUps.length, f.billing.clients.length, f.billing.months.join(','), f.usdInr, f.errors.join(' | ') || 'none');
}
