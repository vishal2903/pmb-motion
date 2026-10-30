// Shared nav, footer, status chip, product grouping and side sheet for every view.
const ICON = {
  brief:'<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5M8 17h3"/>',
  flow:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  motion:'<circle cx="7" cy="12" r="4"/><path d="M11 12h10M17 8l4 4-4 4"/>',
  people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"/>',
  lines:'<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5"/>',
  inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
};
const VIEWS = [["briefing.html","Briefing","brief"],["products.html","Products","lines"],["people.html","People","people"],["servers.html","Servers","server"]];
function shell(){
  const here = location.pathname.split("/").pop() || "index.html";
  const cur = h => h===here || (h==="briefing.html" && here==="index.html");
  document.body.insertAdjacentHTML("afterbegin", `
    <div class="navbar"><div class="in">
      <img src="pmb-logo.png" alt="PMB logo"><span class="brand">PMB in Motion</span>
      <nav class="tabs" aria-label="Views">${VIEWS.map(([h,l,i])=>`<a href="${h}" ${cur(h)?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[i]}</svg><span>${l}</span></a>`).join("")}</nav>
    </div></div>`);
  document.body.insertAdjacentHTML("beforeend",
    `<p class="mock-note" id="live-note" aria-live="polite"></p>
     <div class="scrim" onclick="closeSheet()"></div><aside class="sheet" role="dialog" aria-modal="true" aria-label="Details"><button class="close" onclick="closeSheet()" aria-label="Close">&times;</button><div id="sheet-body"></div></aside>`);
  document.addEventListener("keydown", e => { if (e.key==="Escape") closeSheet(); });
  const bar=document.querySelector(".navbar"), edge=()=>bar.classList.toggle("scrolled", scrollY>4);
  addEventListener("scroll", edge, {passive:true}); edge();
}
let lastFocus;
function openSheet(html){ lastFocus=document.activeElement; document.getElementById("sheet-body").innerHTML=html; document.body.classList.add("sheet-open"); document.querySelector(".sheet .close").focus(); }
function closeSheet(){ document.body.classList.remove("sheet-open"); lastFocus?.focus(); }

const chip = r => `<span class="chip c-${r.state}">${STATE[r.state].label}</span>`;
const src = s => `<span class="src">Source: ${s}</span>`;
const stateBar = rs => `<div class="bar">${Object.keys(STATE).map(k=>{const n=rs.filter(r=>r.state===k).length;return n?`<span class="f-${k}" style="width:${n/rs.length*100}%" title="${STATE[k].label}: ${n}"></span>`:""}).join("")}</div>`;
const legend = (keys=["delivered","testing","building","waiting","planned","notset"]) =>
  `<div class="legend">${keys.map(k=>`<span><i class="f-${k}"></i>${STATE[k].label}</span>`).join("")}</div>`;
const clientName = r => r.isInternal ? "Internal" : r.client;

const plural = (n,w) => `${n} ${w}${n===1?"":"s"}`;

// ---- Detail sheets (same layout wherever they are opened from) ----
const SH = `<style>
  .sh-head{display:flex;gap:14px;align-items:center;margin:4px 0 18px}
  .sh-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
  .sh-stats div{background:var(--bg-3);border:1px solid var(--rule);border-radius:var(--r-sm);padding:12px}
  .sh-stats .big{font-size:34px;display:block}
  .sh-group{margin-top:22px}.sh-gh{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .sh-item{padding:12px 0;border-top:1px solid var(--rule)}
  .sh-item b{font-weight:700}.sh-item .meta{margin-top:2px}
  .sh-done{color:var(--moving);font-size:13px;margin-top:4px}
  .sh-note{color:var(--wait);font-size:13px;margin-top:4px}
</style>`;
function itemLines(rs, show){
  return rs.map(r=>`<div class="sh-item"><b>${show==="client"?clientName(r):r.product}</b>${show==="product"?` <span class="meta">· ${clientName(r)}</span>`:""}
    ${r.done?`<div class="sh-done">Done so far: ${r.done}</div>`:""}${r.state==="waiting"?`<div class="sh-note">"${r.blocker}"</div>`:""}
    ${r.next?`<div class="meta">Next: ${r.next}</div>`:""}</div>`).join("");
}
function groupedByState(rs, show){
  return Object.keys(STATE).map(k=>{const g=rs.filter(r=>r.state===k);return g.length?`<div class="sh-group"><div class="sh-gh"><span class="chip c-${k}">${STATE[k].label}</span><span class="count">${g.length}</span></div>${itemLines(g,show)}</div>`:""}).join("");
}
// Iteration Log entries for a set of Tracker rows, newest first.
function iterationsHTML(rs){
  const ids = new Set(rs.map(r=>r.id.toUpperCase())), its = ITERATIONS.filter(it=>ids.has(it.id));
  return `<div class="sh-group"><div class="sh-gh"><b>Iterations</b><span class="count">${its.length}</span></div>${its.length
    ? its.slice(0,12).map(it=>`<div class="sh-item"><b>${it.what||it.type||"Update"}</b> <span class="meta">· ${it.row.product} · ${clientName(it.row)}</span>
        <div class="meta">${[it.date,it.version,it.type,it.by&&"asked by "+it.by,it.status].filter(Boolean).join(" · ")}</div></div>`).join("")
    : `<p class="meta">None logged yet in the Iteration Log tab.</p>`}</div>`;
}
function followUpsHTML(rs){
  const ids = new Set(rs.map(r=>r.id.toUpperCase())), fs_ = FOLLOWUPS.filter(f=>ids.has(f.id));
  if (!fs_.length) return "";
  return `<div class="sh-group"><div class="sh-gh"><b>Billing follow-ups</b><span class="count">${fs_.length}</span></div>${fs_.map(f=>`<div class="sh-item"><b>${clientName(f.row)}${f.month?" · "+f.month:""}</b> <span class="meta">${f.status}</span>
    <div class="meta">${[f.owner&&"Chased by "+f.owner,f.last&&"last on "+f.last].filter(Boolean).join(", ")}</div>${f.note?`<div class="meta">${f.note}</div>`:""}</div>`).join("")}</div>`;
}
function personSheet(lead){
  lead = esc(lead); const rs = ROWS.filter(r=>r.lead===lead), d=rs.filter(r=>r.state==="delivered").length, p=rs.filter(r=>["building","testing"].includes(r.state)).length;
  openSheet(`${SH}<div class="label">Developer profile</div><div class="sh-head"><span class="avatar lg">${initials(lead)}</span><div><div class="title">${lead}</div>
    <div class="meta">${plural(new Set(rs.map(r=>r.product)).size,"product")} · ${plural(new Set(rs.map(r=>r.client)).size,"client")}</div></div></div>${stateBar(rs)}
    ${(s=>`<div class="sh-stats"><div><span class="big" style="color:var(--moving)">${s.productsLive}/${s.products}</span><span class="meta">Products live</span></div><div><span class="big">${s.live}/${s.deployments}</span><span class="meta">Client deployments live</span></div><div><span class="big" style="color:var(--wait)">${s.waiting}</span><span class="meta">Waiting on client</span></div></div>`)(prodSummary(rs))}
    ${groupedByState(rs,"product")}${iterationsHTML(rs)}<p style="margin-top:20px">${src(SRC_A+", rows where Lead developer = "+lead)}</p>`);
}
function productSheet(product){
  product = esc(product); const rs = ROWS.filter(r=>r.product===product), leads=[...new Set(rs.map(r=>r.lead).filter(Boolean))];
  openSheet(`${SH}<div class="label">Product</div><div class="sh-head"><div><div class="title">${product}</div>
    <div class="meta">${plural(rs.length,"client")} · ${leads.length?"Led by "+leads.join(", "):"Owner not set"}</div></div></div>${stateBar(rs)}
    <div class="sh-stats"><div><span class="big" style="color:var(--moving)">${rs.filter(r=>r.state==="delivered").length}</span><span class="meta">Clients live</span></div><div><span class="big">${rs.filter(r=>["building","testing"].includes(r.state)).length}</span><span class="meta">Clients in progress</span></div><div><span class="big" style="color:var(--wait)">${rs.filter(r=>r.state==="waiting").length}</span><span class="meta">Clients waiting</span></div></div>
    ${groupedByState(rs,"client")}${iterationsHTML(rs)}${followUpsHTML(rs)}<p style="margin-top:20px">${src(SRC_A)}</p>`);
}


// ---- North Star with its breakdown. Always shown with the denominator and how complete the sheet is. ----
const NS_PARTS = [["delivered","Live"],["building","Building"],["testing","Testing"],["waiting","Waiting on client"],["planned","Planned"],["notset","Status not filled"]];
function nsBreakdownHTML(){
  return `<div class="ns-bd">
    <div class="bar" style="height:10px">${NS_PARTS.map(([k])=>COUNT[k]?`<span class="f-${k}" style="width:${COUNT[k]/NS.total*100}%"></span>`:"").join("")}</div>
    <div class="ns-keys">${NS_PARTS.map(([k,l])=>`<span><i class="dot f-${k}"></i>${l} <b class="num">${COUNT[k]}</b></span>`).join("")}</div>
    <p class="meta">${NS.inMotion} of ${NS.total} active rows are live or being built (${COUNT.delivered} live + ${COUNT.building+COUNT.testing} building or testing). ${COUNT.paused} paused rows are left out. Blank statuses count against the number.</p>
  </div>`;
}
function completenessHTML(){
  return `<div class="cmp">${COMPLETENESS.map(c=>`<div class="cmp-row"><span>${c.label}</span><span class="bar"><span class="f-delivered" style="width:${c.pct}%"></span></span><span class="num meta">${c.n}/${c.of}</span></div>`).join("")}</div>`;
}
function nsSheet(){
  openSheet(`${SH}<div class="label">North Star · Work in motion</div><div class="title" style="margin:6px 0 4px">${NS.pct}% <span class="meta">(${NS.inMotion} of ${NS.total})</span></div>
    <p class="meta" style="margin-bottom:16px">Provisional. This number becomes reliable only when the sheet is complete.</p>
    ${nsBreakdownHTML()}<div class="label" style="margin:24px 0 10px">How complete the sheet is</div>${completenessHTML()}
    <p style="margin-top:18px">${src(SRC_A)}</p>`);
}

// ---- Boot: draw the shell once, then load the feed, render the page, and refresh on a timer and on tab focus. ----
// Clicks are delegated through data attributes so no sheet text is ever placed inside inline JavaScript.
document.addEventListener("click", e => {
  const p = e.target.closest("[data-product]"), m = e.target.closest("[data-person]");
  if (p) productSheet(p.dataset.product); else if (m) personSheet(m.dataset.person);
});
document.addEventListener("keydown", e => {
  if (e.key!=="Enter" && e.key!==" ") return;
  const el = e.target.closest("[data-product],[data-person]"); if (!el) return;
  e.preventDefault(); el.click();
});
function setNote(html){ const n=document.getElementById("live-note"); if (n) n.innerHTML = html; }
function boot(page){
  shell();
  const app = document.getElementById("app");
  app.innerHTML = `<p class="meta" style="padding:60px 0;text-align:center">Loading live data from the sheets…</p>`;
  let busy = false;
  async function refresh(){
    if (busy) return; busy = true;
    try {
      await loadFeed();
      page();
      setNote(`Live from the ${SRC_A} and ${SRC_B}. Data as of ${FEED_AT.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}, refreshes every minute.${FEED_ERRORS.length?" Warning: "+FEED_ERRORS.map(esc).join("; "):""}`);
    } catch (err) {
      if (!ROWS.length) app.innerHTML = `<div class="panel" style="padding:28px;margin:40px 0;text-align:center"><div class="title">Could not load the sheets</div>
        <p class="meta" style="margin:8px 0 16px">${esc(err.message)}</p><button class="link" onclick="location.reload()">Try again</button></div>`;
      else setNote(`Showing data from ${FEED_AT.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}. Latest refresh failed: ${esc(err.message)}`);
    } finally { busy = false; }
  }
  refresh();
  setInterval(refresh, ((window.PMB_CONFIG||{}).refreshSeconds||60)*1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
