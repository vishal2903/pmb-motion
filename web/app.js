// Live data layer: fetches the Apps Script feed and derives everything the views show.
// All sheet text is HTML-escaped here once, because any sheet editor's input ends up in innerHTML.

const SRC_A = "Product Tracker sheet";
const SRC_B = "Chahat's invoice sheet";
const SRC_C = "Servers tab, Product Tracker sheet";

// Positive-first states. "Waiting on client" is neutral, never framed as our failure.
const STATE = {
  delivered:{label:"Live", order:0},
  testing:  {label:"Testing", order:1},
  building: {label:"Building", order:2},
  waiting:  {label:"Waiting on client", order:3},
  planned:  {label:"Planned", order:4},
  paused:   {label:"Paused", order:5},
  notset:   {label:"Status not filled", order:6},
};
const BILL_LABEL = {c:"Cleared", r:"Raised, awaiting payment", n:"Not raised yet"};
const DATE_COLUMNS = ["Start date","Go-live planned","Go-live actual","Next milestone date"];

let ROWS = [], SERVERS = [], BILLING = [], MONTHS = [], ITERATIONS = [], FOLLOWUPS = [], COUNT = {}, NS = {}, COMPLETENESS = [];
let PROD_LIVE = 0, PROD_ALL = 0, USD_INR = null, FEED_AT = null, FEED_ERRORS = [];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const groupBy = (arr,k) => arr.reduce((m,r)=>((m[r[k]||"Not set"] ||= []).push(r),m),{});
const initials = n => String(n||"?").replace(/&[^;]+;/g,"").trim().split(/\s+/).map(s=>s[0]).slice(0,2).join("").toUpperCase();
const by = s => ROWS.filter(r=>r.state===s);

function stateOf(status, blocker){
  if (/access|blocked|client/i.test(blocker)) return "waiting";
  const s = status.toLowerCase();
  if (s==="live") return "delivered";
  if (s==="pilot" || s==="testing") return "testing";
  if (s==="building") return "building";
  if (s==="scoped") return "planned";
  if (s==="paused" || s==="stopped") return "paused";
  return "notset";
}

function toRow(o){
  const g = k => esc((o[k]||"").trim());
  let client = g("Client");
  if (/^internal/i.test(client)) client = "Internal";
  const status = (o["Status"]||"").trim(), blocker = g("Blockers / dependencies");
  return { id:g("Row ID"), product:g("Product")||"Product not set", client:client||"Not set", lead:g("Lead developer"),
    status, done:g("Current version"), next:g("Next milestone"), blocker,
    verified:/^yes$/i.test((o["Verified by owner"]||"").trim()),
    hasDate: DATE_COLUMNS.some(k => (o[k]||"").trim()),
    state: stateOf(status, blocker), isInternal: client==="Internal" };
}

// Two units, always named: a product (counted once) and a client deployment (one product for one client = one sheet row).
function productGroups(rows){
  return Object.entries(groupBy(rows,"product")).map(([product,rs])=>({product, rows:rs.sort((a,b)=>STATE[a.state].order-STATE[b.state].order),
    delivered:rs.filter(r=>r.state==="delivered").length}))
    .sort((a,b)=>b.delivered-a.delivered||b.rows.length-a.rows.length);
}
function prodSummary(rows){ const gs=productGroups(rows); return {products:gs.length, productsLive:gs.filter(g=>g.delivered>0).length,
  deployments:rows.length, live:rows.filter(r=>r.state==="delivered").length, progress:rows.filter(r=>["building","testing"].includes(r.state)).length, waiting:rows.filter(r=>r.state==="waiting").length}; }

function billingTokens(name){
  const alias = (window.PMB_CONFIG||{}).clientAliases || {};
  return name.toLowerCase().split(/\s+and\s+|\s*\+\s*|,\s*/).map(t=>t.trim()).filter(Boolean).map(t=>alias[t]||t);
}
const titleCase = s => s.replace(/\b\w/g, c=>c.toUpperCase());
const billFor = client => BILLING.find(b => b.tokens.includes(String(client).toLowerCase().replace(/&amp;/g,"&")));

function toServer(o){
  const g = k => esc((o[k]||"").trim());
  const raw = (o["Monthly cost"]||"").replace(/[^0-9.]/g,"");
  const cost = raw ? Number(raw) : null, cur = (o["Currency"]||"").trim().toUpperCase() || "USD";
  const usd = cost==null ? null : cur==="INR" ? (USD_INR ? cost/USD_INR : null) : cost;
  // Provider names are typed freely ("hetzner" / "Hetzner"); capitalise so they group as one.
  const provider = g("Provider").replace(/^\w/, c=>c.toUpperCase());
  return { name:g("Server name"), provider:provider||"Not set", region:g("Region"), size:g("Size / capacity"), cost, cur, usd,
    ids:(o["Projects hosted (Row IDs)"]||"").toUpperCase().match(/D-\d+/g)||[], setupBy:g("Set up by"), owner:g("Owner")||"Not set", note:g("Notes") };
}

function ingest(feed){
  const exclude = ((window.PMB_CONFIG||{}).excludeLeads||[]).map(esc);
  USD_INR = feed.usdInr || null;
  ROWS = (feed.tracker||[]).map(toRow).filter(r=>!exclude.includes(r.lead));
  SERVERS = (feed.servers||[]).map(toServer);
  // Iteration Log rows, joined to the Tracker by Row ID; newest first. Unparseable dates sort last.
  ITERATIONS = (feed.iterations||[]).map(o=>{ const g=k=>esc((o[k]||"").trim()), id=g("Row ID").toUpperCase(), row=ROWS.find(r=>r.id.toUpperCase()===id);
    const t=Date.parse(o["Date"]||""); return { id, row, date:g("Date"), time:isNaN(t)?0:t, version:g("Version"), type:g("Type"),
      what:g("What changed / what was asked"), by:g("Requested by"), status:g("Status") }; })
    .filter(it=>it.row && (it.what||it.version||it.type)).sort((a,b)=>b.time-a.time);
  // Billing Follow-up rows (who is chasing which invoice), joined by Row ID. Rows with only an ID are ignored.
  FOLLOWUPS = (feed.followUps||[]).map(o=>{ const g=k=>esc((o[k]||"").trim()), id=g("Row ID").toUpperCase();
    return { id, row:ROWS.find(r=>r.id.toUpperCase()===id), month:g("Month"), status:g("Billing status"), owner:g("Follow-up owner"),
      last:g("Last follow-up date"), note:g("Note") }; })
    .filter(f=>f.row && (f.month||f.status||f.note||f.last));
  MONTHS = (feed.billing&&feed.billing.months)||[];
  const code = {cleared:"c", raised:"r", not_raised:"n"};
  BILLING = ((feed.billing&&feed.billing.clients)||[]).map(b=>({client:esc(titleCase(b.client)), tokens:billingTokens(b.client),
    months:Object.fromEntries(Object.entries(b.months).map(([m,s])=>[m,code[s]]).filter(([,s])=>s))}));
  FEED_AT = feed.generatedAt ? new Date(feed.generatedAt) : new Date();
  FEED_ERRORS = feed.errors||[];

  COUNT = Object.fromEntries(Object.keys(STATE).map(s=>[s,by(s).length]));
  // North Star, honest: live or progressing over ALL active rows. Blank statuses count against it; paused rows are excluded.
  NS = { inMotion: COUNT.delivered+COUNT.testing+COUNT.building, total: ROWS.length-COUNT.paused };
  NS.pct = NS.total ? Math.round(NS.inMotion/NS.total*100) : 0;
  COMPLETENESS = [
    ["Status filled", ROWS.filter(r=>r.state!=="notset").length],
    ["Owner set", ROWS.filter(r=>r.lead).length],
    ["Next step written", ROWS.filter(r=>r.next).length],
    ["Timeline dates entered", ROWS.filter(r=>r.hasDate).length],
    ["Verified by owner", ROWS.filter(r=>r.verified).length],
  ].map(([label,n])=>({label,n,of:ROWS.length,pct:ROWS.length?Math.round(n/ROWS.length*100):0}));
  const s = prodSummary(ROWS); PROD_LIVE = s.productsLive; PROD_ALL = s.products;
}

async function loadFeed(){
  const url = (window.PMB_CONFIG||{}).feedUrl;
  if (!url) throw new Error("Feed URL is not set in config.js");
  const res = await fetch(url, {cache:"no-store"});
  if (!res.ok) throw new Error("Feed returned HTTP "+res.status);
  ingest(await res.json());
}

if (typeof module !== "undefined") module.exports = { ingest, stateOf, billingTokens, esc,
  get: () => ({ROWS, SERVERS, BILLING, MONTHS, ITERATIONS, FOLLOWUPS, COUNT, NS, COMPLETENESS, PROD_LIVE, PROD_ALL, USD_INR}) };
