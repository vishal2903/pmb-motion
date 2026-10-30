// Tests the pure parsing functions of apps-script/Code.gs in Node (no Google services needed).
// Run: node pmb-motion/tests/feed.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
const gs = new Function(src + '; return { tableToObjects_, parseBilling_ };')();

// Header mapping: keyed by header text, trimmed, rows without a key dropped, unknown columns kept.
const rows = gs.tableToObjects_(
  ['Row ID', 'Product', 'Lead developer', 'New column'],
  [['D-001', 'Call QC', ' Dev C ', 'x'], ['', 'ghost row', '', ''], ['D-002', 'Relay', 'Dev A', '']],
  'Row ID');
assert.strictEqual(rows.length, 2, 'rows without Row ID are dropped');
assert.strictEqual(rows[0]['Lead developer'], 'Dev C', 'values are trimmed');
assert.strictEqual(rows[0]['New column'], 'x', 'unknown columns pass through');

// Regression (30 Oct 2026): Servers tab has a side summary box whose header "Currency" repeats the real column.
// The table must stop at the first blank header and the first "Currency" must win.
const srv = gs.tableToObjects_(
  ['Server name', 'Monthly cost', 'Currency', '', 'Currency', 'Total monthly cost'],
  [['pupilcare', '594.00', 'INR', '', 'USD', '297.28']],
  'Server name');
assert.strictEqual(srv[0]['Currency'], 'INR', 'real Currency column is not overwritten by the summary box');
assert.ok(!('Total monthly cost' in srv[0]), 'columns after the first blank header are ignored');

// Billing: shaped like Chahat's sheet (legend row, month headers on volume columns, colour on amount column).
const W = '#ffffff', RED = '#ff0000', ORG = '#ff9900', GRN = '#00ff00';
const values = [
  ['all items', '', 'not rasied', 'not cleared', 'cleared', '', '', '', '', ''],
  ['project', 'service', 'rate', 'developer', 'billing by', 'previos months to april 26', 'april', '', 'may', ''],
  ['client a', 'CallQC', '0.5', 'dev a', 'pmb', '', '10', '5', '12', '6'],
  ['client a', '', '', '', 'pmb', '100', '', '5', '', '6'],
  ['client b', '', '', '', 'pmb', '', '', '9', '', '9'],
  ['nobody', '', '', '', 'pmb', '', '', '1', '', '1'],
];
const colours = [
  [W, W, RED, ORG, GRN, W, W, W, W, W],
  Array(10).fill(W),
  Array(10).fill(W),
  [W, W, W, W, W, ORG, W, GRN, W, ORG],
  [W, W, W, W, W, W, W, RED, W, RED],
  Array(10).fill(W),
];
const b = gs.parseBilling_(values, colours);
assert.deepStrictEqual(b.months, ['Apr', 'May'], 'month headers detected, "previous months" skipped');
assert.strictEqual(b.clients.length, 2, 'only client total rows with a coloured month are kept');
assert.deepStrictEqual(b.clients[0], { client: 'client a', months: { Apr: 'cleared', May: 'raised' } });
assert.deepStrictEqual(b.clients[1].months, { Apr: 'not_raised', May: 'not_raised' });

console.log('feed.test.js: all passed');
