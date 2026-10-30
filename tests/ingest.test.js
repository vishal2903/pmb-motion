// Tests the dashboard's data rules (web/app.js) on a small feed shaped like the Apps Script output.
// Run: node pmb-motion/tests/ingest.test.js
const assert = require("assert");
global.window = { PMB_CONFIG: { excludeLeads: ["Excluded Dev"], clientAliases: { clientbx: "client b" } } };
const app = require("../web/app.js");

const T = (id, product, client, lead, status, extra = {}) =>
  ({ "Row ID": id, "Product": product, "Client": client, "Lead developer": lead, "Status": status, ...extra });

app.ingest({
  generatedAt: "2026-10-30T10:00:00Z", usdInr: 95, errors: [],
  tracker: [
    T("D-1", "Call QC", "Client A", "Dev A", "Live"),
    T("D-2", "Call QC", "Client B", "Dev A", "Live", { "Verified by owner": "Yes" }),
    T("D-3", "Relay", "Client D", "Dev A", "", { "Go-live actual": "12 Oct 2026" }),
    T("D-4", "Revenue Intelligence", "Client C", "Dev B", "Building", { "Blockers / dependencies": "Access blocked by their tech team" }),
    T("D-5", "Revenue Intelligence", "Client A", "Dev B", "Scoped", { "Blockers / dependencies": "Not in scope right now for me" }),
    T("D-6", "Summa", "Internal / no client yet", "Dev C", "Paused"),
    T("D-7", "Shopify Audit", "Client E", "Dev D", "Pilot", { "Next milestone": "Launch" }),
    T("D-8", "GrokBox", "", "Excluded Dev", "Live"),
    T("D-9", "<img src=x onerror=alert(1)>", "Client F", "Dev A", "Live"),
  ],
  servers: [
    { "Server name": "A", "Monthly cost": "10", "Currency": "USD", "Projects hosted (Row IDs)": "D-1, d-2", "Owner": "Dev A" },
    { "Server name": "B", "Monthly cost": "950", "Currency": "INR", "Owner": "Dev E" },
    { "Server name": "C", "Monthly cost": "", "Owner": "Dev F" },
    { "Server name": "D", "Provider": "hetzner", "Monthly cost": "7.5", "Owner": "Dev G" },
    { "Server name": "E", "Provider": "Hetzner", "Monthly cost": "8.5", "Owner": "Dev G" },
  ],
  iterations: [
    { "Date": "20 Oct 2026", "Row ID": "D-1", "Version": "V2", "Type": "Client request", "What changed / what was asked": "Add a new scoring rule", "Status": "In progress" },
    { "Date": "28 Oct 2026", "Row ID": "d-2", "What changed / what was asked": "New dashboard filter" },
    { "Date": "29 Oct 2026", "Row ID": "D-404", "What changed / what was asked": "Row that does not exist" },
    { "Date": "", "Row ID": "D-3" },
  ],
  followUps: [
    { "Row ID": "D-1", "Month": "Oct 2026", "Billing status": "Raised", "Follow-up owner": "Ops A", "Note": "Sent reminder" },
    { "Row ID": "D-1" },
  ],
  billing: { months: ["Apr", "May"], clients: [{ client: "client c and clientbx", months: { Apr: "cleared", May: "raised" } }] },
});
const d = app.get();

// Exclusions and state rules
assert.strictEqual(d.ROWS.length, 8, "rows led by excluded people are dropped");
const st = id => d.ROWS.find(r => r.id === id).state;
assert.strictEqual(st("D-1"), "delivered");
assert.strictEqual(st("D-3"), "notset", "blank status is not filled, even with a date");
assert.strictEqual(st("D-4"), "waiting", "access blocker means waiting on client");
assert.strictEqual(st("D-5"), "planned", "a non-access blocker does not mean waiting");
assert.strictEqual(st("D-6"), "paused");
assert.strictEqual(st("D-7"), "testing", "Pilot maps to testing");
assert.strictEqual(d.ROWS.find(r => r.id === "D-6").client, "Internal");

// Escaping: sheet text can never become markup
const evil = d.ROWS.find(r => r.id === "D-9").product;
assert.ok(!evil.includes("<") && evil.includes("&lt;img"), "product names are HTML-escaped");

// North Star: honest denominator (all active rows, blanks count against), paused excluded
assert.deepStrictEqual([d.NS.inMotion, d.NS.total], [4, 7], "3 live + 1 testing out of 7 non-paused rows");
assert.strictEqual(d.NS.pct, 57);
assert.strictEqual(d.PROD_LIVE, 2, "products with at least one live client: Call QC and the escaped one");

// Completeness counts
const c = Object.fromEntries(d.COMPLETENESS.map(x => [x.label, x.n]));
assert.strictEqual(c["Timeline dates entered"], 1);
assert.strictEqual(c["Verified by owner"], 1);
assert.strictEqual(c["Next step written"], 1);

// Servers: INR converted with the live rate, missing cost stays missing, Row IDs parsed case-insensitively
assert.strictEqual(d.SERVERS[1].usd, 10);
assert.strictEqual(d.SERVERS[2].usd, null);
assert.deepStrictEqual(d.SERVERS[0].ids, ["D-1", "D-2"]);

// Provider names typed in different case group as one
assert.deepStrictEqual([...new Set(d.SERVERS.filter(x=>x.owner==="Dev G").map(x=>x.provider))], ["Hetzner"]);

// Billing: joint client name splits and aliases (an alias fixes a client spelled differently in the invoice sheet)
assert.deepStrictEqual(d.BILLING[0].tokens, ["client c", "client b"]);
assert.deepStrictEqual(d.BILLING[0].months, { Apr: "c", May: "r" });

// Iteration Log: joined by Row ID (case-insensitive), unknown IDs and empty rows dropped, newest first
assert.deepStrictEqual(d.ITERATIONS.map(i => i.id), ["D-2", "D-1"]);
assert.strictEqual(d.ITERATIONS[1].row.product, "Call QC");
// Billing Follow-up: a row with only an ID is ignored
assert.strictEqual(d.FOLLOWUPS.length, 1);
assert.strictEqual(d.FOLLOWUPS[0].owner, "Ops A");

console.log("ingest.test.js: all passed");
