/* ===== Ledger Studio UI ===== */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v, d = 0) => (v < 0 ? '−' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v || 0));
const mi = (v) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const tm = (iso) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
const dlab = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', o);
const today = () => ymd(new Date());
let YEAR = new Date().getFullYear(); /* the tax year on screen; switch in the header */

const ICON = {
  home: '<path d="M3.5 11L12 4.5 20.5 11"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5h4v5"/>',
  trips: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.6 16.6C10 14 8.6 10.4 12 10s4.4-1.4 4.6-2.6"/>',
  jobs: '<path d="M6 21V4"/><path d="M6 4h11l-2.4 3.3L17 10.6H6"/><path d="M3 21h6"/>',
  books: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5"/><path d="M9 8h7M9 11.5h7"/>',
  taxes: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 16L16 8"/><circle cx="8.6" cy="8.6" r="1.5"/><circle cx="15.4" cy="15.4" r="1.5"/>',
  drive: '<path d="M4 15.5l1.6-5.2A2 2 0 0 1 7.5 8.9h9a2 2 0 0 1 1.9 1.4l1.6 5.2V18H4z"/><circle cx="7.6" cy="15" r="1.2"/><circle cx="16.4" cy="15" r="1.2"/><path d="M6 18v2M18 18v2M5.2 12.4h13.6"/>',
  pin: '<path d="M12 21s-6.2-5.4-6.2-10.2a6.2 6.2 0 0 1 12.4 0C18.2 15.6 12 21 12 21z"/><path d="M12 7.8v5.4M9.3 10.5h5.4"/>',
  receipt: '<path d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  income: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.8v10.4M14.9 9.3c-.6-.8-1.6-1.2-2.9-1.2-1.7 0-2.9.8-2.9 2s1.2 1.7 2.9 2 2.9.8 2.9 2-1.2 2-2.9 2c-1.3 0-2.4-.5-3-1.3"/>',
  files: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 10.5v5.5M9.6 13.8L12 16.2l2.4-2.4"/>',
  links: '<path d="M9 7.5V3.5M15 7.5V3.5"/><path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v4"/>',
  setup: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  later: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8.5 3.5v2.8L12 12l-3.5 5.7v2.8M15.5 3.5v2.8L12 12l3.5 5.7v2.8"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  up: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5"/><path d="M5 19h14"/>',
  down: '<path d="M12 5v11M7.5 11.5L12 16l4.5-4.5"/><path d="M5 19h14"/>',
  reports: '<path d="M4 20h16"/><path d="M5.5 20v-6M10 20V9M14.5 20v-8.5M19 20V5.5"/>',
  gps: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5"/>'
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const DEFAULTS = {
  schema: 1, businessName: '', home: { label: 'Home', lat: null, lon: null }, places: [], rules: [], payeeRules: {}, homeOffice: true, radiusFt: 600,
  rates: [{ from: '2025-01-01', cents: 70 }, { from: '2026-01-01', cents: 72.5 }], filing: 'single', w2Wages: 0, ssWageBase: 184500, paid: {},
  vehicle: { name: '', inService: '', odoStart: null, odoEnd: null }, autoClassify: true
};
const S = { settings: structuredClone(DEFAULTS), jobs: [], trips: [], txns: [], loaded: false };
const U = { tab: 'home', tripFilter: 'all', bookSeg: 'expense', rep: 'ytd', snoozed: new Set() };
const CLS = { business: 'Business', personal: 'Personal', commute: 'Commute', employer: 'Employer job', review: 'To review' };

/* ---------- storage: claude.ai db when available, else this device ---------- */
const BASE = 'ls/main', LKEY = 'ledger_studio_v1';
const clean = (o) => JSON.parse(JSON.stringify(o));
const Store = {
  mode: 'memory', db: null,
  async init() {
    let p = null; try { if (window.claude && window.claude.use) p = window.claude.use('db'); } catch (e) { }
    const db = p ? await Promise.race([p, new Promise(r => setTimeout(() => r('late'), 2500))]) : null;
    if (db && db !== 'late') { this.db = db; this.mode = 'cloud'; return; }
    this.useDevice();
    if (db === 'late') p.then(async (d) => { if (d) { this.db = d; this.mode = 'cloud'; await loadInto(); render(); } }).catch(() => { });
  },
  useDevice() { try { localStorage.setItem('ls_t', '1'); localStorage.removeItem('ls_t'); this.mode = 'device'; } catch (e) { this.mode = 'memory'; } },
  async load() {
    if (this.mode === 'cloud') {
      const [st, ...cs] = await Promise.all([this.db.doc(BASE + '/meta/settings').get(), ...['jobs', 'trips', 'txns'].map(c => this.db.collection(`${BASE}/${c}`).get())]);
      const [jobs, trips, txns] = cs.map(q => q.docs.map(d => ({ ...d.data(), id: d.id })));
      return { settings: st.exists ? st.data() : null, jobs, trips, txns };
    }
    if (this.mode === 'device') { try { return JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch (e) { return null; } }
    return null;
  },
  local() { if (this.mode !== 'device') return; try { localStorage.setItem(LKEY, JSON.stringify({ settings: S.settings, jobs: S.jobs, trips: S.trips, txns: S.txns })); } catch (e) { toast('This device is out of storage space.'); } },
  async put(coll, rec) { rec.updated = new Date().toISOString(); if (this.mode === 'cloud') { try { await this.db.doc(`${BASE}/${coll}/${rec.id}`).set(clean(rec)); } catch (e) { toast('Not saved: ' + (e.message || e.code)); } } else this.local(); },
  async putMany(coll, recs) { if (this.mode !== 'cloud') { recs.forEach(r => r.updated = new Date().toISOString()); return this.local(); } for (let i = 0; i < recs.length; i += 15) await Promise.all(recs.slice(i, i + 15).map(r => this.put(coll, r))); },
  async del(coll, id) { if (this.mode === 'cloud') { try { await this.db.doc(`${BASE}/${coll}/${id}`).delete(); } catch (e) { toast('Not deleted: ' + (e.message || e.code)); } } else this.local(); },
  async delMany(coll, ids) { if (this.mode !== 'cloud') return this.local(); for (let i = 0; i < ids.length; i += 15) await Promise.all(ids.slice(i, i + 15).map(id => this.del(coll, id))); },
  async putSettings() { if (this.mode === 'cloud') { try { await this.db.doc(BASE + '/meta/settings').set(clean(S.settings)); } catch (e) { toast('Settings not saved: ' + (e.message || e.code)); } } else this.local(); }
};
async function loadInto() {
  let d = null; try { d = await Store.load(); } catch (e) { toast('Could not open your books: ' + (e.message || e.code)); }
  if (d) { S.settings = { ...structuredClone(DEFAULTS), ...(d.settings || {}) }; S.jobs = d.jobs || []; S.trips = d.trips || []; S.txns = d.txns || []; }
  if (migrateSettings(S.settings) && d && d.settings) Store.putSettings();
  if (!S.settings.migCats && d) { /* old Schedule-C-line values → categories (review items get a fresh guess) */
    const ch = [];
    for (const x of S.txns) { if (CAT[x.line]) continue; x.line = x.status === 'review' && x.kind === 'expense' ? (guessLine(x.payee) || catOf(x.line, x.kind)) : catOf(x.line, x.kind); ch.push(x); }
    const pr = S.settings.payeeRules || {}; for (const k of Object.keys(pr)) pr[k] = catOf(pr[k], k.split('|')[0]);
    S.settings.migCats = true; Store.putSettings(); if (ch.length) Store.putMany('txns', ch);
  }
  S.loaded = true; showStore();
}
function showStore() {
  const el = $('#store'), m = Store.mode;
  el.className = 'store' + (m === 'cloud' ? ' cloud' : '');
  el.querySelector('span').textContent = m === 'cloud' ? 'Synced to your account' : m === 'device' ? (NATIVE ? 'Saved on this phone' : 'Saved on this device') : 'Not saved (private window)';
  $('#bizName').textContent = S.settings.businessName || 'Ledger Studio';
  const ys = new Set([new Date().getFullYear(), YEAR]); for (const x of [...S.trips, ...S.txns]) if (x.date) ys.add(+x.date.slice(0, 4));
  $('#yearPick').innerHTML = [...ys].filter(Boolean).sort((p, q) => q - p).map(y => `<option value="${y}"${y === YEAR ? ' selected' : ''}>${y}</option>`).join('');
  $('#sub').textContent = S.settings.businessName ? 'Ledger Studio · ' + YEAR : 'Mileage · Books · Taxes ' + YEAR;
}

/* ---------- shell: tabs, rails, sheet, toast ---------- */
const TABS = [['home', 'Home'], ['trips', 'Trips'], ['jobs', 'Places'], ['books', 'Books'], ['reports', 'Reports'], ['taxes', 'Taxes']];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${U.tab === k}">${ic(k)}<span>${l}</span></button>`).join('');
}
function renderRails() {
  const t = (id, icn, label, main) => `<button class="tool${main ? ' main' : ''}" data-tool="${id}" title="${label}">${ic(icn)}<span>${label}</span></button>`;
  $('#railSec').innerHTML = t('files', 'files', 'Files') + t('links', 'links', 'Links') + t('setup', 'setup', 'Setup');
  $('#railPri').innerHTML = t('drive', 'drive', 'Drive', true) + t('trip', 'pin', 'Trip') + t('expense', 'receipt', 'Expense') + t('income', 'income', 'Income');
}
function setTab(k) { if (U.tab === k) return; U.tab = k; renderTabs(); render(); tabJoin(true); scrollTo({ top: 0 }); }
let toastT;
function toast(msg) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); } el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3200); }
function openSheet(title, html, onMount) { $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; onMount && onMount($('#sheetBody')); const f = $('#sheetBody input:not([type=hidden]), #sheetBody select'); if (f && matchMedia('(min-width:760px)').matches) f.focus(); }
function closeSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; }
$('#sheetX').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

/* ---------- derived ---------- */
const yr = (d) => d && d.startsWith(String(YEAR));
const isClosed = (d) => !!d && (S.settings.closedYears || []).map(String).includes(String(d).slice(0, 4));
const closedNote = (d) => `<div class="banner"><span><b>${String(d).slice(0, 4)} is closed</b> because you filed it. Reopen it in Taxes to change anything.</span></div>`;
const shutToast = () => toast('That year is closed. Reopen it in Taxes first.');
const jobById = (id) => S.jobs.find(j => j.id === id);
const hasSample = () => S.settings.sample || S.jobs.some(x => x.sample) || S.trips.some(x => x.sample) || S.txns.some(x => x.sample);
function reviewTrips() { return S.trips.filter(t => t.cls === 'review' && !U.snoozed.has(t.id)).sort((a, b) => (b.start.t || '').localeCompare(a.start.t || '')); }
function reviewTxns() { return S.txns.filter(t => t.status === 'review' && !U.snoozed.has(t.id)).sort((a, b) => b.date.localeCompare(a.date)); }

/* ---------- views ---------- */
function render() {
  const ws = $('#ws');
  if (!S.loaded) { ws.innerHTML = '<div class="empty">Opening your books…</div>'; return; }
  ws.innerHTML = ({ home: vHome, trips: vTrips, jobs: vJobs, books: vBooks, reports: vReports, taxes: vTaxes })[U.tab]();
  requestAnimationFrame(() => tabJoin(false));
}
function sampleBanner() {
  return hasSample() ? `<div class="banner"><span><b>Sample data.</b> These trips, jobs and receipts are examples so you can see how it works.</span><button class="chip-btn" data-act="clear-sample">${ic('x')}Clear sample data</button></div>` : '';
}
function setupBanner() {
  const s = S.settings;
  if (s.home && s.home.lat != null) return '';
  return `<div class="banner"><span><b>Set your home base</b> so trips can be matched to home, your saved places and job sites.</span><button class="chip-btn plum" data-tool="setup">${ic('setup')}Open setup</button></div>`;
}
/* last month's statement isn't in yet (only once you've started importing statements) */
function stmtBanner() {
  const t = today(), last = addMonths(t.slice(0, 7) + '-01', -1).slice(0, 7), q = dataQuality(S, +last.slice(0, 4), t);
  if (!S.txns.some(x => String(x.source || '').startsWith('csv:')) || !q.missingMonths.includes(last)) return '';
  return `<div class="banner"><span><b>${dlab(last + '-15', { month: 'long' })} statement</b> isn't imported yet. Download the CSV from your bank and bring it in; known merchants and company pay file themselves.</span><button class="chip-btn plum" data-act="imp-csv">${ic('up')}Import statement</button></div>`;
}
function vHome() {
  const s = S.settings, b = books(S, YEAR), tx = taxOn(b.net, s), q = quarterly(S, YEAR), t = today();
  const next = q.find(Q => Q.due >= t) || q[q.length - 1], paidNext = +(s.paid || {})[next.q] || 0;
  const rate = b.income > 0 ? tx.total / b.income : 0;
  const rt = reviewTrips(), rx = reviewTxns();
  const recent = [...S.trips].filter(x => yr(x.date)).sort((a, b) => (b.start.t || '').localeCompare(a.start.t || '')).slice(0, 4);
  return `<div class="view">
    ${sampleBanner()}${setupBanner()}${stmtBanner()}${NATIVE && permsMissing() ? `<div class="banner"><span><b>Finish tracking setup</b> so drives are logged on their own.</span><button class="chip-btn plum" data-act="perm-sheet">${ic('setup')}${permsMissing()} step${permsMissing() > 1 ? 's' : ''} left</button></div>` : ''}
    <section class="stats">
      <div class="stat hero"><span class="k">Business miles ${YEAR}</span><span class="v">${mi(b.miles.business)}</span><span class="s">${money(b.mileDed)} deduction at the IRS rate</span></div>
      <div class="stat"><span class="k">Net profit</span><span class="v">${money(b.net)}</span><span class="s">${money(b.income)} income − ${money(b.expenses)} deductions</span></div>
      <div class="stat"><span class="k">Set aside for taxes</span><span class="v">${money(tx.total)}</span><span class="s">About ${Math.round(rate * 100)}% of what you collect</span></div>
      <div class="stat"><span class="k">Next estimated payment</span><span class="v">${money(Math.max(0, next.amt - paidNext))}</span><span class="s">${next.q} due ${dlab(next.due, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
    </section>
    <section>
      <div class="sec-head"><h2>To review</h2><span class="muted num">${rt.length + rx.length} item${rt.length + rx.length === 1 ? '' : 's'}</span></div>
      ${rt.length + rx.length ? `<div class="list">${rt.slice(0, 5).map(swipeCard).join('')}${rx.slice(0, 5).map(txReviewCard).join('')}</div>
        ${rx.length > 5 ? `<div class="btns" style="margin-top:8px"><button class="chip-btn" data-act="books-review">${rx.length - 5} more transactions to review</button></div>` : ''}
        <p class="note">Swipe a trip right for business or left for personal, or use the buttons.</p>` : `<div class="empty">${ic('check')}<span>Everything is classified.</span></div>`}
    </section>
    <section>
      <div class="sec-head"><h2>Latest trips</h2><button class="chip-btn" data-go="trips">All trips</button></div>
      ${recent.length ? `<div class="list">${recent.map(tripRow).join('')}</div>` : `<div class="empty">No trips yet. Tap <b>Drive</b> to import a GPS track or simulate a day.</div>`}
    </section></div>`;
}
function swipeCard(t) {
  const ded = t.miles * rateOn(t.date, S.settings.rates) / 100;
  return `<div class="swipe-wrap"><div class="swipe-bg"><span class="l">← Personal</span><span class="r">Business →</span></div>
    <div class="swipe" data-swipe="${t.id}">
      <div><div class="title" style="font-weight:600;color:var(--ink)">${esc(t.start.label)} <span style="color:var(--gold)">→</span> ${esc(t.end.label)}</div>
      <div class="sub muted" style="font-size:12.5px">${dlab(t.date)} · ${tm(t.start.t)}–${tm(t.end.t)} · <span class="num">${mi(t.miles)} mi</span> · worth ${money(ded, 2)} if business</div></div>
      <div class="acts"><button class="chip-btn ok" data-cls="business" data-id="${t.id}">${ic('check')}Business</button><button class="chip-btn" data-cls="personal" data-id="${t.id}">${ic('x')}Personal</button><button class="chip-btn" data-snooze="${t.id}">${ic('later')}Later</button><button class="chip-btn" data-trip="${t.id}">Details</button></div>
    </div></div>`;
}
function txReviewCard(x) {
  return `<div class="swipe"><div><div style="font-weight:600;color:var(--ink)">${esc(x.payee)} <span class="num" style="float:right">${x.kind === 'income' ? '+' : ''}${money(x.amount, 2)}</span></div>
    <div class="muted" style="font-size:12.5px">${dlab(x.date)} · imported · filed as <b>${esc(LINES[x.line] || x.line)}</b></div></div>
    <div class="acts"><button class="chip-btn ok" data-txok="${x.id}">${ic('check')}Looks right</button><button class="chip-btn" data-tx="${x.id}">Change</button><button class="chip-btn" data-snooze="${x.id}">${ic('later')}Later</button></div></div>`;
}
function tripRow(t) {
  const ded = tripDeduction(t, S.settings);
  return `<button class="row" data-trip="${t.id}"><div class="when">${tm(t.start.t) || '—'}<small>${tm(t.end.t)}</small></div>
    <div class="main"><div class="title">${esc(t.start.label)}<span class="arrow">→</span>${esc(t.end.label)}</div>
    <div class="sub">${t.purpose ? esc(t.purpose) + ' · ' : ''}<span class="pill c-${t.cls}">${CLS[t.cls]}</span></div></div>
    <div class="amt">${mi(t.miles)} mi${ded ? `<small>${money(ded, 2)}</small>` : ''}</div></button>`;
}
function vTrips() {
  const b = books(S, YEAR), list = S.trips.filter(t => yr(t.date));
  const counts = { all: list.length }; for (const t of list) counts[t.cls] = (counts[t.cls] || 0) + 1;
  const f = U.tripFilter, shown = list.filter(t => f === 'all' || t.cls === f).sort((a, b) => (b.start.t || b.date).localeCompare(a.start.t || a.date));
  const byDay = {}; for (const t of shown) (byDay[t.date] ||= []).push(t);
  const s = S.settings, odo = s.vehicle || {};
  return `<div class="view">
    ${NATIVE ? phoneTrackCard() : `<div class="track-card"><div class="radar">${ic('gps')}</div><div><b style="color:var(--ink)">Automatic trip detection</b>
      <div class="note">On Android this runs in the background: GPS logs your drives and job-site geofences (${s.radiusFt || 600} ft) fill in where you went, when, and why. Here you can run the same detector on a GPS track file or on a simulated day.</div>
      <div class="btns" style="margin-top:8px"><button class="chip-btn plum" data-act="sim">${ic('drive')}Simulate today</button><button class="chip-btn" data-act="imp-gpx">${ic('up')}Import GPS track (.gpx)</button><button class="chip-btn" data-tool="trip">${ic('pin')}Add a trip by hand</button></div></div></div>`}
    <section class="two">
      <div class="card"><h3 style="margin-bottom:10px">Schedule C · Part IV vehicle miles</h3><dl class="kv">
        <dt>Business</dt><dd>${mi(b.miles.business)} mi</dd><dt>Commuting</dt><dd>${mi(b.miles.commute)} mi</dd>
        <dt>Other (personal)</dt><dd>${mi(b.miles.other)} mi</dd><dt class="muted">Employer jobs (reimbursed)</dt><dd class="muted">${mi(b.miles.employer)} mi</dd>
        <dt class="muted">Still to review</dt><dd class="muted">${mi(b.miles.review)} mi</dd>
        <dt class="tot">Mileage deduction</dt><dd class="tot">${money(b.mileDed, 2)}</dd></dl></div>
      <div class="card"><h3 style="margin-bottom:10px">Vehicle record</h3><dl class="kv">
        <dt>Vehicle</dt><dd>${esc(odo.name || '—')}</dd><dt>Placed in service</dt><dd>${odo.inService ? dlab(odo.inService, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</dd>
        <dt>Odometer Jan 1</dt><dd>${odo.odoStart != null ? (+odo.odoStart).toLocaleString() : '—'}</dd><dt>Odometer Dec 31</dt><dd>${odo.odoEnd != null ? (+odo.odoEnd).toLocaleString() : '—'}</dd></dl>
        <p class="note" style="margin:8px 0 0">The IRS asks for these with the miles. Fill them in Setup.</p></div>
    </section>
    <section>
      <div class="chips" role="group" aria-label="Filter trips">${['all', 'review', 'business', 'personal', 'employer', 'commute'].map(k => `<button class="chip" data-tf="${k}" aria-pressed="${f === k}">${k === 'all' ? 'All' : CLS[k]}<span class="n">${counts[k] || 0}</span></button>`).join('')}</div>
      <div class="list" style="margin-top:10px">${Object.keys(byDay).length ? Object.entries(byDay).map(([d, ts]) => {
        const bm = ts.filter(t => t.cls === 'business').reduce((a, t) => a + t.miles, 0);
        return `<div class="day"><span>${dlab(d)}</span><span class="num">${mi(bm)} business mi</span></div>${ts.map(tripRow).join('')}`;
      }).join('') : '<div class="empty">No trips in this filter.</div>'}</div>
    </section></div>`;
}
function ruleRoute(r) { return `${esc(placeLabel(S, r.a))}<span class="arrow">${r.both ? '⇄' : '→'}</span>${esc(placeLabel(S, r.b))}`; }
function vJobs() {
  const rows = [...S.jobs].sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.code.localeCompare(b.code));
  const s = S.settings, rules = s.rules || [], places = s.places || [], yt = S.trips.filter(t => yr(t.date));
  const sum = (ts) => ts.reduce((a, t) => a + t.miles, 0);
  const jobT = yt.filter(t => (t.jobIds || []).length), revT = yt.filter(t => t.cls === 'review');
  const llTxt = (p) => p.lat != null ? `${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : '<b style="color:var(--bad)">no coordinates</b>';
  const usedBy = (id) => rules.filter(r => r.a === id || r.b === id).length;
  const homeP = { id: 'home', label: (s.home && s.home.label) || 'Home', lat: s.home && s.home.lat, lon: s.home && s.home.lon };
  return `<div class="view">
    <section>
      <div class="sec-head"><h2>Trip rules</h2><button class="chip-btn plum" data-act="new-rule">${ic('trips')}Add rule</button></div>
      <p class="note" style="margin:-4px 0 10px">Checked in this order. A trip you classify by hand keeps your choice.</p>
      <div class="list">
        <div class="row static"><div class="when rank">1</div><div class="main"><div class="title">Starts or ends at a job site</div><div class="sub"><span class="pill c-business">Business</span> jobs you bill · <span class="pill c-employer">Employer job</span> company jobs</div></div><div class="amt">${mi(sum(jobT))} mi<small style="color:var(--muted)">${jobT.length} trip${jobT.length === 1 ? '' : 's'}</small></div></div>
        ${rules.map((r, i) => { const tr = yt.filter(t => t.ruleId === r.id);
          return `<button class="row" data-rule="${r.id}"><div class="when rank">${i + 2}</div><div class="main"><div class="title">${ruleRoute(r)}</div><div class="sub"><span class="pill c-${r.cls}">${CLS[r.cls]}</span> ${r.both ? 'both directions' : 'one way only'}${r.purpose ? ' · ' + esc(r.purpose) : ''}</div></div><div class="amt">${mi(sum(tr))} mi<small style="color:var(--muted)">${tr.length} trip${tr.length === 1 ? '' : 's'}</small></div></button>`; }).join('')}
        <div class="row static"><div class="when rank">${rules.length + 2}</div><div class="main"><div class="title">Anything else</div><div class="sub"><span class="pill c-review">To review</span> swipe it; save the route as a rule if it repeats</div></div><div class="amt">${mi(sum(revT))} mi<small style="color:var(--muted)">${revT.length} trip${revT.length === 1 ? '' : 's'}</small></div></div>
      </div>
    </section>
    <section>
      <div class="sec-head"><h2>Saved places</h2><button class="chip-btn" data-act="new-place">${ic('pin')}Add place</button></div>
      <div class="list">${[homeP, ...places].map(p => `<button class="row" data-place="${p.id}"><div class="when rank">${ic(p.id === 'home' ? 'home' : 'pin')}</div><div class="main"><div class="title">${esc(p.label)}</div><div class="sub num">${llTxt(p)}${p.address ? ' · ' + esc(p.address) : ''}</div></div><div class="amt" style="font-size:13px;color:var(--muted)">${usedBy(p.id)} rule${usedBy(p.id) === 1 ? '' : 's'}</div></button>`).join('')}</div>
    </section>
    <section>
    <div class="sec-head"><h2>Job sites</h2><div class="btns"><button class="chip-btn plum" data-act="new-job">${ic('pin')}Add job</button>${NATIVE ? `<button class="chip-btn" data-act="${odStatus().connected ? 'od-check' : 'od-sheet'}">${ic('files')}${odStatus().connected ? 'Check for new work' : 'Connect OneDrive'}</button>` : ''}<button class="chip-btn" data-act="${NATIVE ? 'od-sheet' : 'imp-jobs'}">${ic('up')}${NATIVE ? 'OneDrive & import' : 'Import ledger-jobs.json'}</button></div></div>
    <p class="note" style="margin:-4px 0 10px">Every job is a geofence. Trips that start or end inside one are filed as business with the job number. Jobs billed by your employer are kept apart because the company reimburses them.</p>
    ${rows.length ? `<div class="list">${rows.map(j => {
      const tr = S.trips.filter(t => (t.jobIds || []).includes(j.id)), m = tr.reduce((a, t) => a + t.miles, 0), inc = S.txns.filter(x => x.jobId === j.id && x.kind === 'income').reduce((a, x) => a + x.amount, 0);
      return `<button class="row" data-job="${j.id}"><div class="when" style="text-align:left">${esc(j.code)}</div>
        <div class="main"><div class="title">${esc(j.address || 'No address')}</div><div class="sub"><span class="pill ${j.billTo === 'employer' ? 'c-employer' : 'c-business'}">${j.billTo === 'employer' ? 'Employer' : 'My business'}</span> ${esc(j.client || '')}${j.jobStatus && j.jobStatus !== 'ordered' ? ' · ' + esc(j.jobStatus.replace('_', ' ')) : ''}${j.source === 'onedrive' ? ' · OneDrive' : ''}${j.lat == null ? ' · <b style="color:var(--bad)">no coordinates</b>' : ''}</div></div>
        <div class="amt">${mi(m)} mi<small style="color:var(--muted)">${inc ? money(inc) + ' billed' : tr.length + ' trips'}</small></div></button>`;
    }).join('')}</div>` : `<div class="empty">No jobs yet. Add one, or import the jobs list from Survey Studio.</div>`}
    </section>
  </div>`;
}
function vBooks() {
  const seg = U.bookSeg, list = S.txns.filter(x => yr(x.date));
  const shown = list.filter(x => seg === 'review' || seg === 'review-list' ? x.status === 'review' : x.kind === seg).sort((a, b) => b.date.localeCompare(a.date));
  const b = books(S, YEAR), lines = Object.entries(b.lines).filter(([k]) => k !== 'personal').sort((a, c) => c[1] - a[1]), max = Math.max(1, ...lines.map(l => l[1]));
  const byMonth = {}; for (const x of shown) (byMonth[x.date.slice(0, 7)] ||= []).push(x);
  return `<div class="view">
    <section class="stats">
      <div class="stat"><span class="k">Income ${YEAR}</span><span class="v">${money(b.income)}</span><span class="s">${list.filter(x => x.kind === 'income' && CAT[catOf(x.line, 'income')].line === '1').length} payments</span></div>
      <div class="stat"><span class="k">Deductible expenses</span><span class="v">${money(b.expenses - b.ded['9'] + (b.lines.tolls || 0))}</span><span class="s">Plus ${money(b.mileDed)} mileage</span></div>
    </section>
    ${lines.length ? `<section class="card"><h3 style="margin-bottom:12px">Spending by category</h3><div class="bars">${lines.map(([k, v]) => `<div class="bar"><span>${esc(LINES[k] || k)} <span class="muted">${CAT[k] && CAT[k].line ? '· line ' + CAT[k].line : '· not deducted'}</span></span><span class="track"><span class="fill" style="width:${(v / max * 100).toFixed(1)}%;${k === 'vehicle' ? 'background:#cfc4b4' : ''}"></span></span><span class="v">${money(v, 2)}</span></div>`).join('')}</div></section>` : ''}
    <section>
      <div class="sec-head"><div class="chips" role="group" aria-label="Show">${[['expense', 'Expenses'], ['income', 'Income'], ['review', 'To review']].map(([k, l]) => `<button class="chip" data-bs="${k}" aria-pressed="${seg === k || (k === 'review' && seg === 'review-list')}">${l}<span class="n">${k === 'review' ? list.filter(x => x.status === 'review').length : list.filter(x => x.kind === k).length}</span></button>`).join('')}</div>
        <div class="btns"><button class="chip-btn" data-act="imp-csv">${ic('up')}Import statement (.csv)</button></div></div>
      ${seg === 'review' && shown.length ? reviewGroups(shown) : `<div class="list">${Object.keys(byMonth).length ? Object.entries(byMonth).map(([m, xs]) => `<div class="day"><span>${dlab(m + '-15', { month: 'long', year: 'numeric' })}</span><span class="num">${money(xs.reduce((a, x) => a + x.amount, 0), 2)}</span></div>${xs.map(txRow).join('')}`).join('') : '<div class="empty">Nothing here yet. Use <b>Expense</b> or <b>Income</b> on the toolbar, or import a bank or card statement.</div>'}</div>`}
    </section>${merchantRules()}</div>`;
}
function merchantRules() {
  const pr = Object.entries(S.settings.payeeRules || {}).sort((p, q) => p[0].split('|')[1].localeCompare(q[0].split('|')[1]));
  return `<section><div class="sec-head"><h2>Merchant rules</h2><span class="muted num">${pr.length}</span></div>
    ${pr.length ? `<div class="list">${pr.map(([k, l]) => { const [kind, name] = k.split('|'); return `<div class="row mrule"><div class="when rank">${kind === 'income' ? '+' : '−'}</div><div class="main"><div class="title cap">${esc(name)}</div><div class="sub">${esc(LINES[l] || l)}</div></div><button class="chip-btn" data-unrule="${esc(k)}" aria-label="Delete rule for ${esc(name)}">${ic('x')}Delete</button></div>`; }).join('')}</div>` : ''}
    <p class="note">${pr.length ? 'Delete one to review that merchant again on the next upload.' : 'None yet.'} A rule is saved when you tap <b>Looks right</b> on an imported transaction or save one with <b>Always file this merchant this way</b>. After that, the same merchant is filed on every upload without asking.</p></section>`;
}
/* To review, one row per merchant: file all of them in one tap (and remember the merchant for next time) */
function groupsOf(list) {
  const g = new Map();
  for (const x of list) { const k = x.kind + '|' + (payeeKey(x.payee) || x.payee.toLowerCase()); (g.get(k) || g.set(k, []).get(k)).push(x); }
  return [...g.entries()].map(([key, xs]) => {
    const votes = {}; for (const x of xs) votes[x.line] = (votes[x.line] || 0) + 1;
    const line = Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
    return { key, xs, line, by: xs.some(x => x.classifiedBy === 'file') ? 'Atlas' : 'guess', total: xs.reduce((s, x) => s + x.amount, 0) };
  }).sort((p, q) => q.xs.length - p.xs.length || q.total - p.total);
}
function reviewGroups(list) {
  const gs = groupsOf(list);
  return `<p class="note" style="margin:0 0 8px">${list.length} transactions from ${gs.length} merchants. <b>File all</b> files every one of them and remembers the merchant, so next month's statement files it by itself.</p>
    <div class="list">${gs.map((g, i) => `<div class="row static grp-row">
      <div class="when rank">${g.xs.length}</div>
      <div class="main"><div class="title">${esc(g.xs[0].payee)}</div><div class="sub">${g.xs[0].kind === 'income' ? 'Money in' : 'Money out'} · ${money(g.total, 2)} · ${g.by === 'Atlas' ? 'Atlas says' : 'best guess'}: <b>${esc(LINES[g.line] || g.line)}</b></div></div>
      <div class="btns gbtns"><button class="chip-btn ok" data-gfile="${i}">${ic('check')}File all</button><button class="chip-btn" data-gchange="${i}">Change</button></div></div>`).join('')}</div>`;
}
async function fileGroup(i, line) {
  if (isClosed(YEAR + '-01-01')) return shutToast();
  const g = groupsOf(S.txns.filter(x => yr(x.date) && x.status === 'review'))[i]; if (!g) return;
  const ln = line || g.line;
  for (const x of g.xs) { x.line = ln; x.status = 'ok'; }
  await Store.putMany('txns', g.xs);
  const n = await rememberPayee(g.xs[0].kind, g.xs[0].payee, ln);
  render(); toast(`${g.xs.length + n} filed as ${LINES[ln] || ln}. “${g.xs[0].payee}” will be filed by itself from now on.`);
}
function changeGroup(i) {
  const g = groupsOf(S.txns.filter(x => yr(x.date) && x.status === 'review'))[i]; if (!g) return;
  const opts = catOptions(g.xs[0].kind, g.line);
  openSheet(g.xs[0].payee, `<div class="form"><div class="why">${g.xs.length} transaction${g.xs.length > 1 ? 's' : ''}, ${money(g.total, 2)}. All of them, and this merchant from now on, will be filed as:</div>
    <label class="fld">Category<select id="gLine">${opts}</select></label>
    <div class="why" id="gNote" ${LINE_NOTE[g.line] ? '' : 'hidden'}>${esc(LINE_NOTE[g.line] || '')}</div>
    <div class="btns"><button class="btn" id="gSave">${ic('check')}File all ${g.xs.length}</button><button class="btn ghost" id="gOne">Look at them one by one</button></div></div>`, (root) => {
    $('#gLine', root).onchange = (e) => { const n = LINE_NOTE[e.target.value]; $('#gNote', root).hidden = !n; $('#gNote', root).textContent = n || ''; };
    $('#gSave', root).onclick = () => { const ln = $('#gLine', root).value; closeSheet(); fileGroup(i, ln); };
    $('#gOne', root).onclick = () => { closeSheet(); U.bookSeg = 'review-list'; render(); };
  });
}
function txRow(x) {
  const j = x.jobId && jobById(x.jobId);
  return `<button class="row" data-tx="${x.id}"><div class="when">${dlab(x.date, { month: 'short', day: 'numeric' })}</div>
    <div class="main"><div class="title">${esc(x.payee || '(no payee)')}</div><div class="sub">${esc(LINES[x.line] || x.line)}${j ? ' · ' + esc(j.code) : ''}${x.receipt ? ' · receipt' : ''}${x.status === 'review' ? ' · <span class="pill c-review">Review</span>' : ''}</div></div>
    <div class="amt ${x.kind === 'income' && x.line !== 'transfer' ? 'inc' : ''}">${x.kind === 'income' ? '+' : ''}${money(x.amount, 2)}</div></button>`;
}
function vTaxes() {
  const s = S.settings, b = books(S, YEAR), tx = taxOn(b.net, s), q = quarterly(S, YEAR), t = today(), paid = s.paid || {};
  const order = ['1', '9', '15', '17', '18', '21', '22', '23', '24a', '24b', '25', '27a'];
  const rows = order.filter(k => k === '1' || k === '9' || b.ded[k]).map(k => {
    const name = k === '9' ? 'Car & truck (mileage + tolls)' : k === '24b' ? 'Deductible meals (50%)' : SCHED_C[k];
    const v = k === '1' ? b.income : b.ded[k];
    return `<tr><td><span class="ln">${k}</span>${esc(name)}</td><td class="r">${money(v, 2)}</td></tr>`;
  }).join('');
  const totPaid = q.reduce((a, Q) => a + (+paid[Q.q] || 0), 0);
  const closed = isClosed(YEAR + '-01-01'), past = YEAR < +t.slice(0, 4);
  return `<div class="view">
    ${closed ? `<div class="banner"><span><b>${YEAR} is closed.</b> Nothing in it can change: imports skip its rows and trips stay as filed.</span><button class="chip-btn" data-act="reopen-year">Reopen ${YEAR}</button></div>` : dqBlock(YEAR, 'Before you file ' + YEAR)}
    <section class="stats">
      <div class="stat hero"><span class="k">Estimated federal tax on your business ${YEAR}</span><span class="v">${money(tx.total)}</span><span class="s">Self-employment ${money(tx.se)} · added income tax ${money(tx.inc)}</span></div>
      <div class="stat"><span class="k">Paid so far</span><span class="v">${money(totPaid)}</span><span class="s">${totPaid >= tx.total ? 'Covered so far' : money(tx.total - totPaid) + ' still to pay'}</span></div>
    </section>
    <section>
      <div class="sec-head"><h2>Quarterly estimates (Form 1040-ES)</h2><span class="muted">Based on what you earned in each period</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Quarter</th><th>Income period</th><th>Due</th><th class="r">Estimate</th><th class="r">Paid</th><th></th></tr></thead><tbody>
      ${q.map(Q => { const p = +paid[Q.q] || 0, st = p >= Q.amt - 0.5 && Q.amt > 0 ? ['c-ok', 'Paid'] : Q.due < t ? (Q.amt > 0 ? ['c-review', 'Past due'] : ['c-personal', 'None due']) : Q.from > t ? ['c-personal', 'Upcoming'] : ['c-business', 'Open'];
        return `<tr><td><b>${Q.q}</b></td><td>${dlab(Q.from, { month: 'short', day: 'numeric' })} – ${dlab(Q.to, { month: 'short', day: 'numeric' })}</td><td>${dlab(Q.due, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td class="r">${money(Q.amt)}</td><td class="r"><input class="paid" id="paid-${Q.q}" data-paid="${Q.q}" inputmode="decimal" value="${p || ''}" placeholder="0" aria-label="${Q.q} amount paid"></td><td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="note">Florida has no state income tax, so these are federal only. Pay at IRS Direct Pay or EFTPS. Extra withholding from a W-2 job also counts toward these.</p>
    </section>
    <section class="two">
      <div><h2 style="margin-bottom:10px">Schedule C summary</h2><div class="tbl-wrap"><table><tbody>${rows}
        <tr class="dim"><td><span class="ln">28</span>Total expenses</td><td class="r">${money(b.expenses, 2)}</td></tr>
        <tr class="total"><td><span class="ln">31</span>Net profit</td><td class="r">${money(b.net, 2)}</td></tr></tbody></table></div>
        <p class="note">Fuel, repairs and insurance on the vehicle are covered by the standard mileage rate, so they are not listed again. Meals count at 50%.</p></div>
      <div class="card"><h3 style="margin-bottom:10px">How the estimate is figured</h3><dl class="kv">
        <dt>Net profit</dt><dd>${money(b.net)}</dd>
        <dt>Self-employment tax (15.3% × 92.35%)</dt><dd>${money(tx.se)}</dd>
        <dt>Half of SE tax deducted</dt><dd>−${money(tx.se / 2)}</dd>
        <dt>Qualified business income deduction (20%)</dt><dd>−${money(tx.qbi)}</dd>
        <dt>W-2 wages entered</dt><dd>${money(+s.w2Wages || 0)}</dd>
        <dt>Filing status · standard deduction</dt><dd>${s.filing === 'mfj' ? 'Joint' : 'Single'} · ${money(BRACKETS[s.filing || 'single'].std)}</dd>
        <dt>Income tax added by the business</dt><dd>${money(tx.inc)}</dd>
        <dt class="tot">Total to set aside</dt><dd class="tot">${money(tx.total)}</dd></dl>
        <div class="btns" style="margin-top:12px"><button class="chip-btn" data-tool="setup">${ic('setup')}Edit tax profile</button></div></div>
    </section>
    <section><div class="sec-head"><h2>Hand-off for filing</h2></div>
      <div class="btns"><button class="btn" data-exp="mileage">${ic('down')}Mileage log (.csv)</button><button class="btn ghost" data-exp="schedc">${ic('down')}Schedule C summary (.csv)</button><button class="btn ghost" data-exp="txns">${ic('down')}All transactions (.csv)</button>${past && !closed ? `<button class="btn ghost" data-act="close-year">${ic('check')}Close ${YEAR} (after you file)</button>` : ''}</div>
      <p class="note">${YEAR} figures: 2026 brackets and standard deduction from IRS Rev. Proc. 2025-32, Social Security wage base ${money(+s.ssWageBase || 184500)}, mileage rate from your Setup table. A simplified estimate, not tax advice; have a CPA or tax software check the return.</p></section>
  </div>`;
}

/* ---------- reports: P&L against the period before, money by company, profit per job, merchants ---------- */
const catShort = (k) => String(LINES[k] || k).replace(/\s*\(.*\)\s*$/, '');
function repKinds() {
  const cy = +today().slice(0, 4), k = [['month', 'This month'], ['last-month', 'Last month'], ['quarter', 'This quarter'], ['ytd', 'Year to date'], ['last-year', String(cy - 1)]];
  if (YEAR !== cy && YEAR !== cy - 1) k.push(['year', String(YEAR)]);
  return k;
}
function repPeriod() { if (!repKinds().some(k => k[0] === U.rep)) U.rep = 'ytd'; return periodRange(U.rep, today(), YEAR); }
function incomeBy(from, to) {
  const o = {};
  for (const x of S.txns) if (x.kind === 'income' && x.date >= from && x.date <= to) { const k = catOf(x.line, 'income'); if (CAT[k].line) o[k] = (o[k] || 0) + x.amount; }
  return o;
}
function plReport(P) {
  const A = booksRange(S, P.from, P.to), B = booksRange(S, P.prev.from, P.prev.to), iA = incomeBy(P.from, P.to), iB = incomeBy(P.prev.from, P.prev.to);
  const ded = (L, k) => (L[k] || 0) * (k === 'meals' ? 0.5 : 1), rows = [{ h: 'Income' }];
  for (const k of [...new Set([...Object.keys(iA), ...Object.keys(iB)])]) rows.push({ ln: '1', name: catShort(k), a: iA[k] || 0, b: iB[k] || 0 });
  rows.push({ t: 'Total income', a: A.income, b: B.income }, { h: 'Deductions' }, { ln: '9', name: 'Car & truck', a: A.ded['9'] || 0, b: B.ded['9'] || 0 });
  const ek = [...new Set([...Object.keys(A.lines), ...Object.keys(B.lines)])].filter(k => CAT[k] && CAT[k].line && CAT[k].line !== '9').sort((p, q) => ded(A.lines, q) - ded(A.lines, p) || ded(B.lines, q) - ded(B.lines, p));
  for (const k of ek) rows.push({ ln: CAT[k].line, name: catShort(k), a: ded(A.lines, k), b: ded(B.lines, k) });
  rows.push({ t: 'Total deductions', a: A.expenses, b: B.expenses }, { t: 'Net profit', a: A.net, b: B.net });
  return { A, B, rows };
}
function chg(a, b) {
  const d = a - b;
  if (Math.abs(d) < 0.5) return '<span class="muted">—</span>';
  return (d > 0 ? '+' : '−') + money(Math.abs(d)) + (Math.abs(b) >= 1 && Math.abs(d / b) < 10 ? ` <small class="muted">${d > 0 ? '+' : '−'}${Math.round(Math.abs(d / b) * 100)}%</small>` : '');
}
/* monthly income vs deductions; a one-month period shows the six months up to it */
function monthSeries(P) {
  let m = P.from.slice(0, 7) + '-01', wide = false;
  if (addMonths(m, 2) > P.to) { m = addMonths(P.to.slice(0, 7) + '-01', -5); wide = true; }
  const out = [];
  for (; m <= P.to; m = addMonths(m, 1)) { const e = monthEnd(m) < P.to ? monthEnd(m) : P.to, r = booksRange(S, m, e); out.push({ m, inc: r.income, exp: r.expenses }); }
  return { out, wide };
}
function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
const kMoney = (v) => v >= 1000 ? '$' + (v / 1000).toLocaleString('en-US', { maximumFractionDigits: v >= 10000 ? 0 : 1 }) + 'k' : '$' + Math.round(v);
function monthChart(ser) {
  const W = Math.round(Math.min(640, Math.max(320, (innerWidth || 640) - 70))), H = W < 480 ? 190 : 210, L = 46, R = 8, T = 10, B = 26, n = ser.length, gw = (W - L - R) / n, bw = Math.max(6, Math.min(22, gw * 0.3));
  const max = niceMax(Math.max(...ser.map(s => Math.max(s.inc, s.exp)))), y = (v) => T + (H - T - B) * (1 - v / max);
  const bar = (x, v, cls) => { const h = Math.max(0, y(0) - y(v)); if (h < 0.5) return ''; const r = Math.min(4, h, bw / 2), t = y(v);
    return `<path class="${cls}" d="M${x} ${y(0)}V${t + r}Q${x} ${t} ${x + r} ${t}H${x + bw - r}Q${x + bw} ${t} ${x + bw} ${t + r}V${y(0)}Z"/>`; };
  const grid = [0, 0.5, 1].map(f => `<line class="g" x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}"/><text class="yl" x="${L - 6}" y="${y(max * f) + 4}">${kMoney(max * f)}</text>`).join('');
  const groups = ser.map((s, i) => { const cx = L + gw * i + gw / 2, x1 = cx - bw - 1, x2 = cx + 1;
    return `<g class="mon" data-mon="${i}"><rect class="hit" x="${L + gw * i}" y="${T}" width="${gw}" height="${H - T}"/>${bar(x1, s.inc, 'inc')}${bar(x2, s.exp, 'exp')}
      <text class="xl" x="${cx}" y="${H - 8}">${dlab(s.m.slice(0, 7) + '-15', { month: 'short' })}</text><title>${dlab(s.m.slice(0, 7) + '-15', { month: 'long', year: 'numeric' })}: income ${money(s.inc)}, deductions ${money(s.exp)}</title></g>`; }).join('');
  return `<svg class="mchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and deductions by month">${grid}${groups}<line class="base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
}
function dqNotes(year) {
  const q = dataQuality(S, year, today()), out = [], ml = (k) => dlab(k + '-15', { month: 'short' });
  if (q.txReview) out.push(`${q.txReview} transaction${q.txReview === 1 ? '' : 's'} still to review <button class="chip-btn" data-act="books-review">Review</button>`);
  if (q.tripReview) out.push(`${q.tripReview} trip${q.tripReview === 1 ? '' : 's'} still to classify <button class="chip-btn" data-go="home">Classify</button>`);
  if (q.noStatements) out.push(`No bank statement imported for ${year} yet <button class="chip-btn" data-act="imp-csv">${ic('up')}Import</button>`);
  else if (q.missingMonths.length) out.push(`No statement rows for ${q.missingMonths.map(ml).join(', ')} <button class="chip-btn" data-act="imp-csv">${ic('up')}Import</button>`);
  if (q.jobsNoLoc) out.push(`${q.jobsNoLoc} job${q.jobsNoLoc === 1 ? '' : 's'} without a location, so trips there can't be matched <button class="chip-btn" data-go="jobs">Places</button>`);
  return out;
}
function dqBlock(year, title) {
  const n = dqNotes(year);
  return n.length ? `<div class="dq"><b>${title}</b><ul>${n.map(x => `<li>${x}</li>`).join('')}</ul></div>` : '';
}
function vReports() {
  const P = repPeriod(), { A, rows } = plReport(P), ms = monthSeries(P), cm = companyMoney(S, P.from, P.to), jp = jobProfit(S, P.from, P.to), mt = merchantTop(S, P.from, P.to, 10);
  const span = `${dlab(P.from, { month: 'short', day: 'numeric', year: 'numeric' })} – ${dlab(P.to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const mtMax = Math.max(1, ...mt.map(x => x.total)), jpShown = jp.slice(0, 40);
  return `<div class="view">
    <div class="sec-head"><div class="chips" role="group" aria-label="Period">${repKinds().map(([k, l]) => `<button class="chip" data-rep="${k}" aria-pressed="${U.rep === k}">${l}</button>`).join('')}</div>
      <div class="btns"><button class="chip-btn" data-exp="pl">${ic('down')}P&amp;L (.csv)</button></div></div>
    <p class="note" style="margin-top:-6px">${span} · compared with ${esc(P.prev.label.toLowerCase())}</p>
    ${dqBlock(+P.to.slice(0, 4), 'Not final yet')}
    <section class="stats">
      <div class="stat hero"><span class="k">Net profit</span><span class="v">${money(A.net)}</span><span class="s">${money(A.income)} income − ${money(A.expenses)} deductions</span></div>
      <div class="stat"><span class="k">Business miles</span><span class="v">${mi(A.miles.business + (A.miles.employer || 0))}</span><span class="s">${money(A.mileDed)} at the IRS rate</span></div>
    </section>
    <section><div class="sec-head"><h2>Profit &amp; loss</h2></div>
      <div class="tbl-wrap"><table class="pl"><thead><tr><th>Category</th><th class="r">${esc(P.label)}</th><th class="r">${esc(P.prev.label)}</th><th class="r">Change</th></tr></thead><tbody>
      ${rows.map(r => r.h ? `<tr class="hd"><td colspan="4">${r.h}</td></tr>` : r.t ? `<tr class="total"><td>${r.t}</td><td class="r">${money(r.a)}</td><td class="r">${money(r.b)}</td><td class="r">${chg(r.a, r.b)}</td></tr>`
        : `<tr><td><span class="ln">${r.ln}</span>${esc(r.name)}</td><td class="r">${money(r.a)}</td><td class="r">${money(r.b)}</td><td class="r">${chg(r.a, r.b)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">Car &amp; truck is your business miles × the IRS rate plus parking and tolls; fuel and repairs are covered by that rate. Meals count at 50%.</p></section>
    <section class="card"><div class="sec-head" style="margin-bottom:6px"><h3>By month${ms.wide ? ' (last 6 months)' : ''}</h3>
      <div class="legend"><span><i class="sw inc"></i>Income</span><span><i class="sw exp"></i>Deductions</span></div></div>
      ${monthChart(ms.out)}<div class="mtip muted" id="mTip">Tap a month for its figures.</div></section>
    <section><div class="sec-head"><h2>Survey companies</h2><button class="chip-btn" data-tool="setup">${ic('setup')}Pay per job</button></div>
      ${cm.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Company</th><th class="r">Earned</th><th class="r">Paid</th><th class="r">Owed</th></tr></thead><tbody>
        ${cm.rows.map(r => `<tr><td>${esc(r.company)}<br><small class="muted">${r.jobs} job${r.jobs === 1 ? '' : 's'} × ${r.rate != null ? money(r.rate) : 'no pay set'}</small></td><td class="r">${r.earned != null ? money(r.earned) : '—'}</td><td class="r">${money(r.paid)}<br><small class="muted">${r.deposits} deposit${r.deposits === 1 ? '' : 's'}</small></td><td class="r">${r.diff == null ? '—' : Math.abs(r.diff) < 0.5 ? '<span class="muted">even</span>' : r.diff > 0 ? `<b>${money(r.diff)}</b><br><small class="muted">not paid yet</small>` : `${money(-r.diff)}<br><small class="muted">paid more</small>`}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">No survey jobs or company deposits in this period.</div>`}
      <p class="note">An estimate: earned = jobs you drove to × pay per job, paid = the company's deposits on your statements. A payment for the last jobs can land in the next period.${cm.unassigned ? ` ${money(cm.unassigned)} of survey deposits couldn't be matched to a company; add its bank text in Setup → Companies.` : ''}</p></section>
    <section><div class="sec-head"><h2>Profit per job</h2><span class="muted num">${jp.length} job${jp.length === 1 ? '' : 's'}</span></div>
      ${jp.length ? `<div class="tbl-wrap"><table><thead><tr><th>Job</th><th class="r">Miles</th><th class="r">Pay</th><th class="r">Costs</th><th class="r">Profit</th></tr></thead><tbody>
        ${jpShown.map(r => `<tr><td><button class="lnk" data-job="${r.id}">${esc(r.code)}</button><br><small class="muted">${esc(r.company)}${r.first ? ' · ' + dlab(r.first, { month: 'short', day: 'numeric' }) : ''}</small></td><td class="r">${mi(r.miles)}</td><td class="r">${r.pay != null ? money(r.pay) : '—'}</td><td class="r">${money(r.car + r.spent)}${r.spent ? `<br><small class="muted">car ${money(r.car)}</small>` : ''}</td><td class="r">${r.profit != null ? `<b>${money(r.profit)}</b>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>${jp.length > jpShown.length ? `<p class="note">Showing the latest ${jpShown.length}; the P&amp;L export has every job.</p>` : ''}` : `<div class="empty">No drives to survey jobs in this period.</div>`}
      <p class="note">Costs = the job's miles × the IRS rate (a trip to two jobs is shared) plus expenses linked to the job.</p></section>
    <section class="card"><h3 style="margin-bottom:12px">Top merchants</h3>
      ${mt.length ? `<div class="bars">${mt.map(x => `<div class="bar"><span>${esc(x.name)} <span class="muted">· ${esc(catShort(x.cat))}</span></span><span class="track"><span class="fill" style="width:${(x.total / mtMax * 100).toFixed(1)}%"></span></span><span class="v">${money(x.total)}</span></div>`).join('')}</div>`
        : `<div class="empty">No deductible spending in this period.</div>`}</section>
  </div>`;
}
function monthTip(i) {
  const P = repPeriod(), s = monthSeries(P).out[i], el = $('#mTip'); if (!s || !el) return;
  $$('.mchart .mon').forEach(g => g.classList.toggle('on', g.dataset.mon === String(i)));
  el.innerHTML = `<b>${dlab(s.m.slice(0, 7) + '-15', { month: 'long', year: 'numeric' })}</b> · income ${money(s.inc)} · deductions ${money(s.exp)} · net ${money(s.inc - s.exp)}`;
}
function plCSV() {
  const P = repPeriod(), { rows } = plReport(P), jp = jobProfit(S, P.from, P.to), cm = companyMoney(S, P.from, P.to);
  const out = [['Profit & loss', `${P.from} to ${P.to}`, `${P.prev.from} to ${P.prev.to}`, 'Change'], ['Line', 'Category', P.label, P.prev.label, 'Change ($)']];
  for (const r of rows) if (r.h) out.push([], [r.h]); else out.push([r.ln || '', r.t || r.name, r.a.toFixed(2), r.b.toFixed(2), (r.a - r.b).toFixed(2)]);
  out.push([], ['Survey companies (estimate)'], ['Company', 'Pay per job', 'Jobs', 'Earned', 'Paid', 'Difference']);
  for (const r of cm.rows) out.push([r.company, r.rate ?? '', r.jobs, r.earned != null ? r.earned.toFixed(2) : '', r.paid.toFixed(2), r.diff != null ? r.diff.toFixed(2) : '']);
  out.push([], ['Profit per job'], ['Job', 'Company', 'First day', 'Miles', 'Pay', 'Car (IRS rate)', 'Spent', 'Profit']);
  for (const r of jp) out.push([r.code, r.company, r.first || '', r.miles.toFixed(1), r.pay ?? '', r.car.toFixed(2), r.spent.toFixed(2), r.profit != null ? r.profit.toFixed(2) : '']);
  const n = dqNotes(+P.to.slice(0, 4)).map(x => x.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '').trim());
  if (n.length) { out.push([], ['Not final yet']); for (const x of n) out.push([x]); }
  return saveFile(`profit-and-loss-${P.from}-to-${P.to}.csv`, toCSV(out), 'text/csv');
}

/* ---------- trip sheet ---------- */
function mapSVG(t) {
  const P = (t.path && t.path.length > 1) ? t.path : [];
  if (!P.length) return `<div class="why">Entered by hand, so there is no GPS path for this trip.</div>`;
  const pts = [...P]; const rF = (S.settings.radiusFt || 600) / 364000;
  const places = placesOf(S).filter(p => p.key === t.start.place || p.key === t.end.place);
  for (const p of places) pts.push([p.lat + rF, p.lon + rF], [p.lat - rF, p.lon - rF]);
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity; for (const [a, o] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, o); lo1 = Math.max(lo1, o); }
  const c = Math.cos((la0 + la1) / 2 * Math.PI / 180), W = 600, H = 300, pad = 36;
  const sx = (W - 2 * pad) / Math.max(1e-6, (lo1 - lo0) * c), sy = (H - 2 * pad) / Math.max(1e-6, la1 - la0), k = Math.min(sx, sy);
  const ox = (W - (lo1 - lo0) * c * k) / 2, oy = (H - (la1 - la0) * k) / 2;
  const X = (o) => (ox + (o - lo0) * c * k).toFixed(1), Y = (a) => (H - oy - (a - la0) * k).toFixed(1);
  let grid = ''; for (let i = 1; i < 6; i++) grid += `M${i * W / 6} 0V${H}`; for (let i = 1; i < 3; i++) grid += `M0 ${i * H / 3}H${W}`;
  const circ = places.map(p => `<circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${(rF * k).toFixed(1)}" fill="${p.job ? '#3b1d52' : '#b48a2e'}" fill-opacity=".08" stroke="${p.job ? '#3b1d52' : '#b48a2e'}" stroke-opacity=".5" stroke-dasharray="4 3"/><text x="${X(p.lon)}" y="${(+Y(p.lat) - rF * k - 5).toFixed(1)}" text-anchor="middle" font-family="Roboto Condensed, Arial Narrow, sans-serif" font-size="12" fill="#2a1239">${esc(p.label)}</text>`).join('');
  const d = P.map((p, i) => (i ? 'L' : 'M') + X(p[1]) + ' ' + Y(p[0])).join('');
  const a = P[0], z = P[P.length - 1];
  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Route map"><path d="${grid}" stroke="#6a4d1c" stroke-opacity=".12" stroke-width=".8"/>${circ}
    <path d="${d}" fill="none" stroke="#ecd38a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#3b1d52" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(a[1])}" cy="${Y(a[0])}" r="6" fill="#23794a" stroke="#fff" stroke-width="2"/><circle cx="${X(z[1])}" cy="${Y(z[0])}" r="6" fill="#b48a2e" stroke="#fff" stroke-width="2"/></svg>`;
}
function jobOptions(sel, emptyLabel = 'No job') { return `<option value="">${emptyLabel}</option>` + S.jobs.map(j => `<option value="${j.id}"${j.id === sel ? ' selected' : ''}>${esc(j.code)} · ${esc(j.address || '')}</option>`).join(''); }
function openTrip(id) {
  const isNew = !id, t = isNew ? { id: uid('trip'), schema: 1, date: today(), start: { t: null, label: S.settings.home.label || 'Home', place: 'home' }, end: { t: null, label: '', place: null }, miles: 0, cls: 'business', purpose: '', jobIds: [], source: 'manual', locked: true, path: [], reason: 'Entered by hand.' } : structuredClone(S.trips.find(x => x.id === id));
  if (!t) return;
  let cls = t.cls;
  openSheet(isNew ? 'Add a trip' : 'Trip · ' + dlab(t.date), `<div class="form">
    ${!isNew && isClosed(t.date) ? closedNote(t.date) : ''}${isNew ? '' : mapSVG(t)}
    ${isNew ? `<div class="f2"><label class="fld">Date<input type="date" id="tDate" value="${t.date}"></label><label class="fld">Miles<input id="tMiles" inputmode="decimal" value=""></label></div>
      <div class="f2"><label class="fld">From<input id="tFrom" value="${esc(t.start.label)}"></label><label class="fld">To<input id="tTo" placeholder="Job site or address"></label></div>
      <div class="f2"><label class="fld">Depart<input type="time" id="tDep"></label><label class="fld">Arrive<input type="time" id="tArr"></label></div>` :
      `<div class="timeline"><span class="dot" style="background:var(--ok)"></span><span><b>${esc(t.start.label)}</b></span><span class="num">${tm(t.start.t)}</span>
        <span class="dot" style="background:var(--gold)"></span><span><b>${esc(t.end.label)}</b></span><span class="num">${tm(t.end.t)}</span></div>
        <label class="fld">Miles<input id="tMiles" inputmode="decimal" value="${t.miles}"></label>`}
    <div class="pick"><span class="lbl">Classify as</span><div class="seg" id="tCls">${['business', 'personal', 'employer', 'commute'].map(k => `<button type="button" data-v="${k}" aria-pressed="${cls === k}">${CLS[k]}</button>`).join('')}</div></div>
    <label class="fld">Job<select id="tJob">${jobOptions((t.jobIds || [])[0])}</select></label>
    <label class="fld">Purpose<input id="tPurp" value="${esc(t.purpose || '')}" placeholder="Boundary survey – job number"></label>
    ${t.reason ? `<div class="why">${esc(t.reason)}</div>` : ''}
    ${rememberBlock(t, isNew)}
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="tSave">${ic('check')}Save</button><button class="btn ghost" id="tCancel">Cancel</button></div>${isNew ? '' : '<button class="btn danger" id="tDel">Delete trip</button>'}</div>
  </div>`, (root) => {
    $('#tCls', root).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; cls = b.dataset.v; $$('#tCls button', root).forEach(x => x.setAttribute('aria-pressed', x === b)); };
    $('#tCancel', root).onclick = closeSheet;
    const remBox = $('#tRem', root); if (remBox) remBox.onchange = () => { $('#tRemMore', root).hidden = !remBox.checked; };
    $('#tJob', root).onchange = (e) => { const j = jobById(e.target.value); if (j && !$('#tPurp', root).value) $('#tPurp', root).value = 'Boundary survey – ' + j.code; if (j && j.billTo === 'employer') { cls = 'employer'; $$('#tCls button', root).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === 'employer')); } };
    $('#tSave', root).onclick = async () => {
      if (isClosed(t.date) || (isNew && isClosed($('#tDate', root).value))) return shutToast();
      const m = parseFloat($('#tMiles', root).value); if (!(m > 0)) { toast('Enter the miles for this trip.'); return; }
      t.miles = +m.toFixed(1); t.cls = cls; t.purpose = $('#tPurp', root).value.trim(); const jv = $('#tJob', root).value; t.jobIds = jv ? [jv] : [];
      if (isNew) {
        t.date = $('#tDate', root).value || today(); t.start.label = $('#tFrom', root).value.trim() || 'Start'; t.end.label = $('#tTo', root).value.trim() || (jobById(jv)?.code ?? 'Destination');
        const dep = $('#tDep', root).value, arr = $('#tArr', root).value; t.start.t = dep ? new Date(t.date + 'T' + dep).toISOString() : null; t.end.t = arr ? new Date(t.date + 'T' + arr).toISOString() : null;
      } else { t.locked = true; t.reason = 'Classified by you.'; }
      if (t.cls === 'business' && !t.purpose) { toast('Add a business purpose. The IRS log needs one.'); return; }
      let ruleMsg = '';
      if (remBox && remBox.checked) { ruleMsg = ruleFromTrip(t, root); if (!ruleMsg) return; }
      const i = S.trips.findIndex(x => x.id === t.id); if (i >= 0) S.trips[i] = t; else S.trips.push(t);
      if (ruleMsg) { await Store.put('trips', t); return saveRulesAndRefile(ruleMsg); }
      closeSheet(); render(); await Store.put('trips', t); toast(isNew ? 'Trip added.' : 'Trip saved.');
    };
    const del = $('#tDel', root); if (del) del.onclick = async () => {
      if (isClosed(t.date)) return shutToast();
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      S.trips = S.trips.filter(x => x.id !== t.id); closeSheet(); render(); await Store.del('trips', t.id); toast('Trip deleted.');
    };
  });
}
function rememberBlock(t, isNew) {
  if (isNew || t.start.lat == null || (t.jobIds || []).length) return '';
  const cur = t.ruleId && (S.settings.rules || []).find(r => r.id === t.ruleId);
  if (cur) return `<div class="btns"><button class="chip-btn" data-rule="${cur.id}">${ic('trips')}Edit the rule for this route</button></div>`;
  const nm = (k, what) => `<label class="fld">Name the ${what} (unlisted stop)<input id="tN${k}" placeholder="Child's school"></label>`;
  return `<div class="remember">
    <label class="check"><input type="checkbox" id="tRem"><span>Always file this route this way<small>Saves a trip rule, so later trips on this route are filed for you.</small></span></label>
    <div class="form" id="tRemMore" hidden>
      ${t.start.place ? '' : nm('A', 'start')}${t.end.place ? '' : nm('B', 'end')}
      <label class="check"><input type="checkbox" id="tBoth" checked><span>Also the return trip<small>${esc(t.end.label)} → ${esc(t.start.label)}</small></span></label>
    </div></div>`;
}
function ruleFromTrip(t, root) {
  if (!RULE_CLS[t.cls]) { toast('Pick Commute, Personal or Business to save this route as a rule.'); return null; }
  if (t.start.place && t.start.place === t.end.place) { toast('This trip starts and ends at the same place, so it cannot be a route rule.'); return null; }
  const nA = t.start.place ? null : ($('#tNA', root).value || '').trim(), nB = t.end.place ? null : ($('#tNB', root).value || '').trim();
  if (nA === '' || nB === '') { toast('Name the unlisted stop so the rule can recognize it next time.'); return null; }
  if (!t.start.place && !t.end.place && hav([t.start.lat, t.start.lon], [t.end.lat, t.end.lon]) * FT_PER_MI < (S.settings.radiusFt || 600)) { toast('This trip starts and ends at the same spot, so it cannot be a route rule.'); return null; }
  const both = $('#tBoth', root).checked;
  const mk = (pt, label) => { const p = { id: uid('pl'), label, lat: +pt.lat.toFixed(6), lon: +pt.lon.toFixed(6), address: '' }; S.settings.places.push(p); pt.place = p.id; pt.label = label; return p.id; };
  const a = t.start.place || mk(t.start, nA), b = t.end.place || mk(t.end, nB);
  if (!t.purpose) t.purpose = `${RULE_CLS[t.cls]} · ${t.start.label} → ${t.end.label}`;
  const dup = S.settings.rules.find(x => sameRoute(x, a, b, both));
  if (dup) { t.ruleId = dup.id; return 'Trip saved. A rule for this route already exists.'; }
  const custom = t.cls === 'business' || !/^(Personal|Commute ·|Business ·)/.test(t.purpose);
  const rule = { id: uid('rule'), a, b, both, cls: t.cls, purpose: custom ? t.purpose : '' };
  S.settings.rules.push(rule); t.ruleId = rule.id;
  return `Rule saved: ${placeLabel(S, a)} ${both ? '⇄' : '→'} ${placeLabel(S, b)}.`;
}
async function setTripClass(id, cls) {
  const t = S.trips.find(x => x.id === id); if (!t) return;
  if (isClosed(t.date)) return shutToast();
  t.cls = cls; t.locked = true; t.reason = 'Classified by you.';
  if (cls === 'personal') t.purpose = 'Personal';
  if (cls === 'business' && !t.purpose) { render(); openTrip(id); toast('Add the business purpose, then save.'); return; }
  render(); await Store.put('trips', t); toast(cls === 'business' ? `Business: ${mi(t.miles)} mi, ${money(tripDeduction(t, S.settings), 2)}` : 'Marked personal.');
}

/* ---------- job sheet ---------- */
function openJob(id) {
  const isNew = !id, j = isNew ? { id: uid('job'), schema: 1, code: '', address: '', client: '', billTo: 'own', lat: null, lon: null, source: 'manual', status: 'active' } : structuredClone(jobById(id));
  let bill = j.billTo || 'own';
  const spc = j.lat != null ? llToSpc(j.lat, j.lon) : null;
  openSheet(isNew ? 'Add a job site' : 'Job ' + j.code, `<div class="form">
    <div class="f2"><label class="fld">Job number<input id="jCode" value="${esc(j.code)}" placeholder="B-177xxx"></label><label class="fld">Client<input id="jClient" value="${esc(j.client || '')}"></label></div>
    <label class="fld">Address<input id="jAddr" value="${esc(j.address || '')}" placeholder="Street, city"></label>
    <div class="pick"><span class="lbl">Who bills this job</span><div class="seg" id="jBill"><button type="button" data-v="own" aria-pressed="${bill === 'own'}">My business (deductible)</button><button type="button" data-v="employer" aria-pressed="${bill === 'employer'}">My employer (reimbursed)</button></div></div>
    <h3>Location</h3>
    <div class="f2"><label class="fld">Latitude<input id="jLat" inputmode="decimal" value="${j.lat ?? ''}" placeholder="26.9298"></label><label class="fld">Longitude<input id="jLon" inputmode="decimal" value="${j.lon ?? ''}" placeholder="-82.0454"></label></div>${phoneLocButtons('jLat', '#jAddr')}
    <div class="f2"><label class="fld">Or FL West SPC northing (US ft)<input id="jN" inputmode="decimal" value="${spc ? spc.N.toFixed(2) : ''}"></label><label class="fld">Easting (US ft)<input id="jE" inputmode="decimal" value="${spc ? spc.E.toFixed(2) : ''}"></label></div>
    <div class="why">Paste "lat, lon" from Google Maps into Latitude, or type a State Plane point from the survey (NAD83 Florida West, US survey feet). The other pair fills in when you leave the field.</div>
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="jSave">${ic('check')}Save</button><button class="btn ghost" id="jCancel">Cancel</button></div>${isNew ? '' : '<button class="btn danger" id="jDel">Delete job</button>'}</div></div>`, (root) => {
    $('#jBill', root).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; bill = b.dataset.v; $$('#jBill button', root).forEach(x => x.setAttribute('aria-pressed', x === b)); };
    $('#jCancel', root).onclick = closeSheet;
    const lat = $('#jLat', root), lon = $('#jLon', root), N = $('#jN', root), E = $('#jE', root);
    lat.addEventListener('change', () => { const m = lat.value.match(/(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)/); if (m) { lat.value = m[1]; lon.value = m[2]; } fromLL(); });
    lon.addEventListener('change', fromLL);
    function fromLL() { const a = parseFloat(lat.value), o = parseFloat(lon.value); if (isFinite(a) && isFinite(o)) { const p = llToSpc(a, o); N.value = p.N.toFixed(2); E.value = p.E.toFixed(2); } }
    const fromSPC = () => { const n = parseFloat(N.value), e = parseFloat(E.value); if (isFinite(n) && isFinite(e)) { const p = spcToLl(n, e); lat.value = p.lat.toFixed(6); lon.value = p.lon.toFixed(6); } };
    N.addEventListener('change', fromSPC); E.addEventListener('change', fromSPC);
    $('#jSave', root).onclick = async () => {
      j.code = $('#jCode', root).value.trim(); if (!j.code) { toast('Enter the job number.'); return; }
      j.address = $('#jAddr', root).value.trim(); j.client = $('#jClient', root).value.trim(); j.billTo = bill;
      const a = parseFloat(lat.value), o = parseFloat(lon.value), was = [j.lat, j.lon]; j.lat = isFinite(a) ? a : null; j.lon = isFinite(o) ? o : null;
      if (j.lat !== was[0] || j.lon !== was[1]) j.coordFrom = j.lat != null ? 'manual' : null; /* set by hand: field points and lookups won't move it */
      if (j.lat != null && (j.lat < 24 || j.lat > 31.5 || j.lon > -79 || j.lon < -88)) { toast('Those coordinates are outside Florida. Check the sign on longitude.'); return; }
      const i = S.jobs.findIndex(x => x.id === j.id); if (i >= 0) S.jobs[i] = j; else S.jobs.push(j);
      closeSheet(); await Store.put('jobs', j); const n = await reclassify(); render(); toast('Job saved.' + (n ? ` ${n} trip${n > 1 ? 's' : ''} re-filed.` : ''));
    };
    const del = $('#jDel', root); if (del) del.onclick = async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      S.jobs = S.jobs.filter(x => x.id !== j.id); closeSheet(); await Store.del('jobs', j.id); await reclassify(); render(); toast('Job deleted.');
    };
  });
}
async function reclassify() {
  if (!S.settings.autoClassify) return 0;
  const redone = NATIVE ? await redetectRecent() : 0;
  const changed = [];
  for (const t of S.trips) { if (t.source === 'manual' || t.start.lat == null || isClosed(t.date)) continue; const before = JSON.stringify([t.cls, t.purpose, t.start.label, t.end.label]); classifyTrip(t, S); if (JSON.stringify([t.cls, t.purpose, t.start.label, t.end.label]) !== before) changed.push(t); }
  if (changed.length) await Store.putMany('trips', changed);
  return changed.length + redone;
}

/* ---------- saved places & trip rules ---------- */
const parseLL = (v) => { const m = (v || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null]; };
const offFlorida = (a, o) => a < 24 || a > 31.5 || o > -79 || o < -88;
const LL_HELP = 'In Google Maps, press and hold the spot, then tap the coordinates to copy them and paste here.';
async function saveRulesAndRefile(msg) {
  closeSheet(); await Store.putSettings(); const n = await reclassify(); render();
  toast(msg + (n ? ` ${n} trip${n > 1 ? 's' : ''} re-filed.` : ''));
}
function openPlace(id) {
  const s = S.settings, isHome = id === 'home', isNew = !id;
  const p = isHome ? { id: 'home', label: (s.home && s.home.label) || 'Home', lat: s.home && s.home.lat, lon: s.home && s.home.lon, address: (s.home && s.home.address) || '' }
    : isNew ? { id: uid('pl'), label: '', lat: null, lon: null, address: '' } : structuredClone((s.places || []).find(x => x.id === id));
  if (!p) return;
  const used = (s.rules || []).filter(r => r.a === p.id || r.b === p.id);
  openSheet(isNew ? 'Add a place' : p.label, `<div class="form">
    <label class="fld">Name<input id="pLabel" value="${esc(p.label)}" placeholder="Child's school"></label>
    <label class="fld">Address (for your reference)<input id="pAddr" value="${esc(p.address || '')}"></label>
    <label class="fld">Lat, lon<input id="pLL" value="${p.lat != null ? p.lat + ', ' + p.lon : ''}" placeholder="26.97000, -82.07000"></label>${phoneLocButtons('pLL', '#pAddr')}
    <div class="why">${LL_HELP} Trips that start or stop within ${s.radiusFt || 600} ft count as this place; a stop of one minute is enough here, so quick drop-offs split the trip.</div>
    ${used.length ? `<div class="why">Used by: ${used.map(r => ruleRoute(r).replace(/<[^>]+>/g, ' ')).join('; ')}</div>` : ''}
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="pSave">${ic('check')}Save</button><button class="btn ghost" id="pCancel">Cancel</button></div>${isNew || isHome ? '' : '<button class="btn danger" id="pDel">Delete place</button>'}</div></div>`, (root) => {
    $('#pCancel', root).onclick = closeSheet;
    $('#pSave', root).onclick = async () => {
      const label = $('#pLabel', root).value.trim(); if (!label) { toast('Give the place a name.'); return; }
      const [a, o] = parseLL($('#pLL', root).value); if (a == null) { toast('Paste the coordinates as "lat, lon".'); return; }
      if (offFlorida(a, o)) { toast('Those coordinates are outside Florida. Check the minus sign on longitude.'); return; }
      const rec = { ...p, label, address: $('#pAddr', root).value.trim(), lat: a, lon: o };
      if (isHome) S.settings.home = { label, lat: a, lon: o, address: rec.address };
      else { const L = S.settings.places, i = L.findIndex(x => x.id === rec.id); if (i >= 0) L[i] = rec; else L.push(rec); }
      showStore(); await saveRulesAndRefile(isNew ? 'Place added.' : 'Place saved.');
    };
    const del = $('#pDel', root); if (del) del.onclick = async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = used.length ? `Tap again: also deletes ${used.length} rule${used.length > 1 ? 's' : ''}` : 'Tap again to delete'; return; }
      S.settings.places = S.settings.places.filter(x => x.id !== p.id); S.settings.rules = S.settings.rules.filter(r => r.a !== p.id && r.b !== p.id);
      await saveRulesAndRefile('Place deleted.');
    };
  });
}
function placeOptions(sel) {
  const s = S.settings, opts = [['home', (s.home && s.home.label) || 'Home'], ...(s.places || []).map(p => [p.id, p.label])];
  return opts.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('') + `<option value="__new"${sel === '__new' ? ' selected' : ''}>+ New place…</option>`;
}
function openRule(id) {
  const s = S.settings, isNew = !id;
  const r = isNew ? { id: uid('rule'), a: 'home', b: (s.places || [])[0] ? s.places[0].id : '__new', both: true, cls: 'commute', purpose: '' } : structuredClone((s.rules || []).find(x => x.id === id));
  if (!r) return;
  let cls = r.cls;
  const newFields = (k, show) => `<div class="f2" id="rNew${k}" ${show ? '' : 'hidden'}><label class="fld">New place name<input id="rN${k}L" placeholder="${k === 'A' ? 'Home' : "Child's school"}"></label><label class="fld">Lat, lon<input id="rN${k}P" placeholder="26.97000, -82.07000"></label></div>`;
  openSheet(isNew ? 'Add a trip rule' : 'Trip rule', `<div class="form">
    <div class="f2"><label class="fld">From<select id="rA">${placeOptions(r.a)}</select></label><label class="fld">To<select id="rB">${placeOptions(r.b)}</select></label></div>
    ${newFields('A', r.a === '__new')}${newFields('B', r.b === '__new')}
    <label class="check"><input type="checkbox" id="rBoth" ${r.both ? 'checked' : ''}><span>Also the return trip (To → From)<small>One rule covers going and coming back.</small></span></label>
    <div class="pick"><span class="lbl">Classify as</span><div class="seg" id="rCls">${Object.keys(RULE_CLS).map(k => `<button type="button" data-v="${k}" aria-pressed="${cls === k}">${RULE_CLS[k]}</button>`).join('')}</div></div>
    <label class="fld">Purpose in the mileage log (optional)<input id="rPurp" value="${esc(r.purpose || '')}" placeholder="School drop-off"></label>
    <div class="why">Job sites always win: a trip that starts or ends at a job is Business even on this route. Commute and Personal miles are not deductible; Schedule C Part IV lists them on separate lines.</div>
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="rSave">${ic('check')}Save</button><button class="btn ghost" id="rCancel">Cancel</button></div>${isNew ? '' : '<button class="btn danger" id="rDel">Delete rule</button>'}</div></div>`, (root) => {
    $('#rCls', root).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; cls = b.dataset.v; $$('#rCls button', root).forEach(x => x.setAttribute('aria-pressed', x === b)); };
    $('#rA', root).onchange = (e) => { $('#rNewA', root).hidden = e.target.value !== '__new'; };
    $('#rB', root).onchange = (e) => { $('#rNewB', root).hidden = e.target.value !== '__new'; };
    $('#rCancel', root).onclick = closeSheet;
    $('#rSave', root).onclick = async () => {
      const add = [], end = (k) => {
        const v = $('#r' + k, root).value; if (v !== '__new') return v;
        const label = $(`#rN${k}L`, root).value.trim(), [a, o] = parseLL($(`#rN${k}P`, root).value);
        if (!label || a == null) { toast('Name the new place and paste its "lat, lon".'); return null; }
        if (offFlorida(a, o)) { toast('Those coordinates are outside Florida. Check the minus sign on longitude.'); return null; }
        const p = { id: uid('pl'), label, lat: a, lon: o, address: '' }; add.push(p); return p.id;
      };
      const a = end('A'); if (!a) return; const b = end('B'); if (!b) return;
      if (a === b) { toast('From and To must be different places.'); return; }
      const both = $('#rBoth', root).checked, purpose = $('#rPurp', root).value.trim();
      if (cls === 'business' && !purpose) { toast('Business routes need a purpose for the IRS log.'); return; }
      const dup = (S.settings.rules || []).find(x => x.id !== r.id && sameRoute(x, a, b, both));
      if (dup) { toast(`There is already a rule for this route (${placeLabel(S, dup.a)} → ${placeLabel(S, dup.b)}). Edit that one.`); return; }
      S.settings.places.push(...add);
      const rec = { id: r.id, a, b, both, cls, purpose }, L = S.settings.rules, i = L.findIndex(x => x.id === r.id);
      if (i >= 0) L[i] = rec; else L.push(rec);
      await saveRulesAndRefile(isNew ? 'Rule added.' : 'Rule saved.');
    };
    const del = $('#rDel', root); if (del) del.onclick = async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      S.settings.rules = S.settings.rules.filter(x => x.id !== r.id); await saveRulesAndRefile('Rule deleted.');
    };
  });
}

/* ---------- transaction sheet ---------- */
let assetsCap; async function getAssets() { if (assetsCap === undefined) { try { assetsCap = window.claude && window.claude.use ? await window.claude.use('assets') : null; } catch (e) { assetsCap = null; } } return assetsCap; }
async function rememberPayee(kind, payee, line, exceptId) {
  const key = memoKey(kind, payee); if (!key) return 0;
  S.settings.payeeRules = { ...(S.settings.payeeRules || {}), [key]: line };
  const one = { [key]: line }, upd = S.txns.filter(t => t.id !== exceptId && t.status === 'review' && t.kind === kind && !isClosed(t.date) && memoFind(one, kind, t.payee));
  for (const t of upd) { t.line = line; t.status = 'ok'; t.autoFiled = true; }
  await Store.putSettings(); if (upd.length) await Store.putMany('txns', upd);
  return upd.length;
}
const LINE_NOTE = {
  'survey-pay': 'Pay from the survey companies for your jobs. Put the job number in Job when you know it.',
  transfer: 'Money in that you did not earn: your own transfer, a card payment, a refund. It stays in the list but is not counted as income.',
  vehicle: 'You use the standard mileage rate, which already covers fuel, repairs, car insurance and depreciation. Keep the receipt, but it is not deducted again.',
  tolls: 'Business parking and tolls are deductible on top of the mileage rate (line 9).',
  meals: 'Business meals are 50% deductible. Write who you met and why in the note.',
  phone: 'For a phone used for both, enter only the business share.',
  tools: 'Items up to $2,500 each are deducted in full as supplies. Something bigger may need depreciation: ask your tax preparer.',
  'safety-gear': 'Only gear you wouldn\'t wear off the job: safety vests, hard hats, work boots used for fieldwork.',
  training: 'Courses that build skills for the work you do now count. Courses that qualify you for a new profession (like the PSM license) usually don\'t: ask your tax preparer.',
  travel: 'Only trips that keep you away from home overnight for work. Day trips are mileage.',
  personal: 'Kept for your records only. Not on Schedule C.'
};
/* the category picker: what you'll use most first, with the Schedule C line it lands on */
function catOptions(kind, sel) {
  const cur = catOf(sel, kind);
  return (kind === 'income' ? INCOME_CATS : EXPENSE_CATS).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(CAT[k].name)}${CAT[k].line ? ' · line ' + CAT[k].line : ''}</option>`).join('');
}
function openTx(id, kind) {
  const isNew = !id, x = isNew ? { id: uid('tx'), schema: 1, date: today(), kind: kind || 'expense', amount: 0, payee: '', line: kind === 'income' ? 'survey-pay' : 'field-supplies', memo: '', jobId: null, source: 'manual', externalId: null, status: 'ok' } : structuredClone(S.txns.find(t => t.id === id));
  let k = x.kind, file = null;
  const lineOpts = catOptions;
  openSheet(isNew ? (k === 'income' ? 'Add income' : 'Add an expense') : (k === 'income' ? 'Income' : 'Expense'), `<div class="form">${!isNew && isClosed(x.date) ? closedNote(x.date) : ''}
    <div class="seg" id="xKind"><button type="button" data-v="expense" aria-pressed="${k === 'expense'}">Expense</button><button type="button" data-v="income" aria-pressed="${k === 'income'}">Income</button></div>
    <div class="f2"><label class="fld">Amount ($)<input id="xAmt" inputmode="decimal" value="${x.amount || ''}" placeholder="0.00"></label><label class="fld">Date<input type="date" id="xDate" value="${x.date}"></label></div>
    <label class="fld">${k === 'income' ? 'From (client)' : 'Paid to'}<input id="xPayee" value="${esc(x.payee)}" list="payees"></label>
    <datalist id="payees">${[...new Set(S.txns.map(t => t.payee))].slice(0, 40).map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <label class="fld" id="xLineWrap">Category<select id="xLine">${lineOpts(k, x.line)}</select></label>
    <div class="why" id="xNote" ${LINE_NOTE[x.line] ? '' : 'hidden'}>${esc(LINE_NOTE[x.line] || '')}</div>
    <label class="check"><input type="checkbox" id="xRem" ${x.source && x.source.startsWith('csv') ? 'checked' : ''}><span>Always file this merchant this way<small>Your next statement uploads file it for you.</small></span></label>
    <label class="fld">Job<select id="xJob">${jobOptions(x.jobId)}</select></label>
    <label class="fld">Note<input id="xMemo" value="${esc(x.memo || '')}" placeholder="Who, what, why"></label>
    <label class="fld">Receipt photo<input type="file" id="xFile" accept="image/*,application/pdf"></label>
    ${x.receipt ? `<div>${x.receipt.type === 'application/pdf' ? `<a href="${esc(x.receipt.url)}" target="_blank" rel="noopener">Open receipt (PDF)</a>` : `<img class="receipt-thumb" src="${esc(x.receipt.url)}" alt="Receipt">`}</div>` : ''}
    ${x.source && x.source !== 'manual' ? `<div class="why">Imported from ${esc(x.source.replace(/^csv:/, 'statement '))}.</div>` : ''}
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="xSave">${ic('check')}Save</button><button class="btn ghost" id="xCancel">Cancel</button></div>${isNew ? '' : '<button class="btn danger" id="xDel">Delete</button>'}</div></div>`, (root) => {
    $('#xKind', root).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; k = b.dataset.v; $$('#xKind button', root).forEach(z => z.setAttribute('aria-pressed', z === b)); $('#xLine', root).innerHTML = lineOpts(k, k === 'income' ? 'survey-pay' : 'field-supplies'); $('#xLine', root).onchange({ target: $('#xLine', root) }); };
    $('#xLine', root).onchange = (e) => { const n = LINE_NOTE[e.target.value]; $('#xNote', root).hidden = !n; $('#xNote', root).textContent = n || ''; };
    $('#xPayee', root).onchange = (e) => { { const g = memoFind(S.settings.payeeRules || {}, k, e.target.value) || (k === 'expense' ? guessLine(e.target.value) : null); if (g) { $('#xLine', root).value = g; $('#xLine', root).onchange({ target: $('#xLine', root) }); } } };
    $('#xFile', root).onchange = (e) => { file = e.target.files[0] || null; };
    $('#xCancel', root).onclick = closeSheet;
    $('#xSave', root).onclick = async () => {
      if ((!isNew && isClosed(x.date)) || isClosed($('#xDate', root).value)) return shutToast();
      const remember = $('#xRem', root).checked;
      const a = parseFloat(($('#xAmt', root).value || '').replace(/[$,]/g, '')); if (!(a > 0)) { toast('Enter an amount.'); return; }
      x.amount = +a.toFixed(2); x.kind = k; x.date = $('#xDate', root).value || today(); x.payee = $('#xPayee', root).value.trim(); x.line = $('#xLine', root).value;
      x.jobId = $('#xJob', root).value || null; x.memo = $('#xMemo', root).value.trim(); x.status = 'ok';
      if (file) {
        const as = await getAssets();
        if (as) { try { toast('Uploading receipt…'); const r = await as.upload(file); x.receipt = { assetId: r.id, url: r.url, type: r.contentType || file.type }; } catch (e) { toast('Receipt not uploaded: ' + (e.message || e.code)); } }
        else if (NATIVE) { try { x.receipt = await phoneReceipt(file, x.id); } catch (e) { toast('Receipt not kept: ' + e.message); } }
        else toast('Receipt photos are kept in the app on your phone. This page cannot keep the file.');
      }
      const i = S.txns.findIndex(t => t.id === x.id); if (i >= 0) S.txns[i] = x; else S.txns.push(x);
      closeSheet(); render(); await Store.put('txns', x);
      const n = remember ? await rememberPayee(x.kind, x.payee, x.line, x.id) : 0; if (n) render();
      toast((isNew ? (k === 'income' ? 'Income added.' : 'Expense added.') : 'Saved.') + (n ? ` ${n} more from this merchant filed the same way.` : ''));
    };
    const del = $('#xDel', root); if (del) del.onclick = async () => {
      if (isClosed(x.date)) return shutToast();
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      S.txns = S.txns.filter(t => t.id !== x.id); closeSheet(); render(); await Store.del('txns', x.id); toast('Deleted.');
    };
  });
}

/* ---------- setup sheet ---------- */
function openSetup() {
  const s = structuredClone(S.settings); s.vehicle ||= {};
  let homeOffice = !!s.homeOffice, filing = s.filing || 'single';
  const rateRows = () => s.rates.map((r, i) => `<div class="f2"><label class="fld">From date<input type="date" data-rf="${i}" value="${r.from}"></label><label class="fld">Cents per mile<input inputmode="decimal" data-rc="${i}" value="${r.cents}"></label></div>`).join('');
  openSheet('Setup', `<div class="form">
    <label class="fld">Business name (your DBA)<input id="sName" value="${esc(s.businessName || '')}"></label>
    <h3>Home base</h3>
    <div class="f2"><label class="fld">Label<input id="sHL" value="${esc(s.home.label || 'Home')}"></label><label class="fld">Lat, lon<input id="sHP" value="${s.home.lat != null ? s.home.lat + ', ' + s.home.lon : ''}" placeholder="27.0000, -82.1000"></label></div>${phoneLocButtons('sHP')}
    <div class="pick"><span class="lbl">Is home your main place of business?</span><div class="seg" id="sHO"><button type="button" data-v="1" aria-pressed="${homeOffice}">Yes, home office</button><button type="button" data-v="0" aria-pressed="${!homeOffice}">No</button></div></div>
    <h3>Commute & personal routes</h3>
    <div class="why">School runs, a spouse's work, a company yard: save them as places and add trip rules on the Places tab. <button class="chip-btn" data-act="rules-tab" style="margin-top:6px">${ic('jobs')}Open trip rules</button></div>
    <label class="fld">Job-site geofence radius (ft)<input id="sR" inputmode="numeric" value="${s.radiusFt || 600}"></label>
    <h3>IRS standard mileage rate</h3><div id="sRates" class="form">${rateRows()}</div>
    <div class="btns"><button class="chip-btn" id="sAddRate">Add a rate change</button></div>
    <div class="why">2026 started at 72.5¢ (IRS Notice 2026-10). When the IRS announces a change, add a row with the date it starts. Trips use the rate in force on their date.</div>
    <h3>Tax profile</h3>
    <div class="seg" id="sFil"><button type="button" data-v="single" aria-pressed="${filing === 'single'}">Single</button><button type="button" data-v="mfj" aria-pressed="${filing === 'mfj'}">Married filing jointly</button></div>
    <div class="f2"><label class="fld">W-2 wages this year ($)<input id="sW2" inputmode="decimal" value="${s.w2Wages || ''}"></label><label class="fld">Social Security wage base ($)<input id="sSS" inputmode="decimal" value="${s.ssWageBase || 184500}"></label></div>
    <h3>Vehicle</h3>
    <div class="f2"><label class="fld">Vehicle<input id="sVN" value="${esc(s.vehicle.name || '')}" placeholder="2021 pickup"></label><label class="fld">Placed in service<input type="date" id="sVS" value="${s.vehicle.inService || ''}"></label></div>
    <div class="f2"><label class="fld">Odometer Jan 1<input id="sVO1" inputmode="numeric" value="${s.vehicle.odoStart ?? ''}"></label><label class="fld">Odometer Dec 31<input id="sVO2" inputmode="numeric" value="${s.vehicle.odoEnd ?? ''}"></label></div>
    <h3>Companies</h3>
    <div class="why">Survey jobs are your own contract work (1099), so their miles are deductible. Tick a company only if it pays your mileage: its jobs then count as employer jobs.</div>
    <div class="list">${companiesOf(S).map((name, i) => `<div class="co-row"><label class="check"><input type="checkbox" data-company="${esc(name)}" ${(s.reimburse || {})[name] ? 'checked' : ''}><span>${esc(name)}<small>Pays my mileage</small></span></label>
      <div class="f2"><label class="fld">Pay per job ($)<input data-corate="${esc(name)}" inputmode="decimal" value="${rateOf(S, name) ?? ''}" placeholder="none"></label><label class="fld">Bank text<input data-cokey="${esc(name)}" value="${esc((s.companyKeys || {})[name] || '')}" placeholder="${esc(companyKeys(name)[0] || '')}"></label></div></div>`).join('')}</div>
    <div class="why">Pay per job feeds Reports (earned vs paid, profit per job). Bank text is how the company's deposits read on your statement, comma separated, when the name alone isn't found; deposits that match are filed as survey pay without asking.</div>
    <h3>Jobs from OneDrive</h3>
    <div class="why">Survey jobs come from GAIA/Jobs. <button class="chip-btn" data-act="od-sheet" style="margin-top:6px">${ic('files')}OneDrive work</button></div>
    <h3>Data</h3>
    <div class="why">${Store.mode === 'cloud' ? 'Saved to your Claude account and visible only to you.' : Store.mode === 'device' ? (NATIVE ? 'Saved on this phone only. Make a backup each month (Files → Backup) and keep it in OneDrive.' : 'Saved in this browser only.') : 'This window cannot save. Open the page normally to keep data.'} Use Files → Backup to keep a copy.</div>
    <div class="btns" style="justify-content:space-between"><div class="btns"><button class="btn" id="sSave">${ic('check')}Save</button><button class="btn ghost" id="sCancel">Cancel</button></div>${hasSample() ? '<button class="btn danger" data-act="clear-sample">Clear sample data</button>' : ''}</div></div>`, (root) => {
    const segset = (sel, fn) => $(sel, root).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; fn(b.dataset.v); $$(sel + ' button', root).forEach(z => z.setAttribute('aria-pressed', z === b)); };
    segset('#sHO', v => homeOffice = v === '1'); segset('#sFil', v => filing = v);
    const readRates = () => { $$('[data-rf]', root).forEach(el => s.rates[+el.dataset.rf].from = el.value); $$('[data-rc]', root).forEach(el => s.rates[+el.dataset.rc].cents = parseFloat(el.value) || 0); };
    $('#sAddRate', root).onclick = () => { readRates(); s.rates.push({ from: today(), cents: s.rates[s.rates.length - 1]?.cents || 72.5 }); $('#sRates', root).innerHTML = rateRows(); };
    $('#sCancel', root).onclick = closeSheet;
    const ll = (v) => { const m = (v || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : [null, null]; };
    $('#sSave', root).onclick = async () => {
      readRates();
      s.businessName = $('#sName', root).value.trim();
      const [ha, ho] = ll($('#sHP', root).value); s.home = { ...s.home, label: $('#sHL', root).value.trim() || 'Home', lat: ha, lon: ho };
      s.homeOffice = homeOffice; s.filing = filing; s.radiusFt = Math.max(100, parseInt($('#sR', root).value) || 600);
      s.w2Wages = parseFloat($('#sW2', root).value) || 0; s.ssWageBase = parseFloat($('#sSS', root).value) || 184500;
      const num = (v) => v === '' ? null : parseFloat(v);
      const reimb = {}; $$('[data-company]', root).forEach(cb => { if (cb.checked) reimb[cb.dataset.company] = true; });
      const billingChanged = JSON.stringify(reimb) !== JSON.stringify(s.reimburse || {}); s.reimburse = reimb;
      const cr = {}, ck = {}; $$('[data-corate]', root).forEach(el => { const v = el.value.replace(/[$,\s]/g, ''); if (v !== '' && !isNaN(+v)) cr[el.dataset.corate] = +v; else if (v === '' && DEFAULT_RATES[el.dataset.corate] != null) cr[el.dataset.corate] = ''; });
      $$('[data-cokey]', root).forEach(el => { const v = el.value.trim(); if (v) ck[el.dataset.cokey] = v; }); s.companyRates = cr; s.companyKeys = ck;
      s.vehicle = { name: $('#sVN', root).value.trim(), inService: $('#sVS', root).value, odoStart: num($('#sVO1', root).value), odoEnd: num($('#sVO2', root).value) };
      s.rates = s.rates.filter(r => r.from && r.cents > 0).sort((a, b) => a.from.localeCompare(b.from));
      S.settings = s; closeSheet(); showStore(); await Store.putSettings();
      const n = (billingChanged ? await applyCompanyBilling() : 0) + await reclassify(); render(); toast('Setup saved.' + (n ? ` ${n} trip${n > 1 ? 's' : ''} re-filed.` : ''));
    };
  });
}

/* ---------- drive: simulate / GPX ---------- */
function openDrive() {
  if (NATIVE) { nativeRefresh(); return openSheet('Drive', `<div class="form">${phoneTrackCard()}
    <h3>Testing</h3><div class="btns"><button class="btn ghost" data-act="sim">${ic('drive')}Simulate a day</button><button class="btn ghost" data-act="imp-gpx">${ic('up')}Import a GPS track (.gpx)</button><button class="btn ghost" data-tool="trip">${ic('pin')}Add a trip by hand</button></div></div>`); }
  openSheet('Drive', `<div class="form">
    <div class="track-card"><div class="radar">${ic('gps')}</div><div><b style="color:var(--ink)">Background tracking lives in the Android app</b><div class="note">The phone app records GPS while you drive, splits the day at every stop longer than 5 minutes, and matches each stop to home, your work location or a job geofence. A web page cannot read GPS in the background, so this preview runs the same steps on a track file or a simulated day.</div></div></div>
    <div class="btns"><button class="btn" data-act="sim">${ic('drive')}Simulate today's route</button><button class="btn ghost" data-act="imp-gpx">${ic('up')}Import a GPS track (.gpx)</button><button class="btn ghost" data-tool="trip">${ic('pin')}Add a trip by hand</button></div>
    <p class="note">Any GPS logger app that exports GPX works for testing, including FieldGenius track logs and Google Maps exports converted to GPX.</p></div>`);
}
async function simulate() {
  const s = S.settings;
  if (!s.home || s.home.lat == null) { closeSheet(); toast('Set your home base in Setup first.'); return openSetup(); }
  const own = S.jobs.filter(j => j.lat != null && j.billTo !== 'employer');
  if (!own.length) { closeSheet(); toast('Add a job with coordinates first.'); return openJob(); }
  const d = new Date(), seed = d.getDate() * 31 + S.trips.length;
  const pick = [own[seed % own.length], own[(seed + 1) % own.length]].filter((j, i, a) => a.indexOf(j) === i);
  const H = { lat: s.home.lat, lon: s.home.lon }, errand = { lat: s.home.lat + 0.011, lon: s.home.lon + 0.018 };
  const drop = (s.places || []).filter(p => p.lat != null).slice(0, 1).map(p => ({ lat: p.lat, lon: p.lon, dwell: 2 }));
  const stops = [{ ...H, dwell: 5 }, ...drop, ...pick.map(j => ({ lat: j.lat, lon: j.lon, dwell: 55 })), { ...errand, dwell: 20 }, { ...H, dwell: 3 }];
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 7, 30).toISOString();
  const found = detectTrips(simulateDay(stops, start, seed + 13), detectOpts());
  const day = today(); const old = S.trips.filter(t => t.source === 'sim' && t.date === day);
  for (const t of old) await Store.del('trips', t.id);
  S.trips = S.trips.filter(t => !(t.source === 'sim' && t.date === day));
  const add = found.map(t => classifyTrip({ ...t, id: uid('trip'), schema: 1, date: ymd(t.start.t), source: 'sim', sample: true, jobIds: [] }, S));
  S.trips.push(...add); closeSheet(); U.tab = 'trips'; U.tripFilter = 'all'; renderTabs(); render(); tabJoin(true);
  await Store.putMany('trips', add);
  const cnt = {}; for (const t of add) cnt[t.cls] = (cnt[t.cls] || 0) + 1;
  toast(`Detected ${add.length} trips: ` + Object.entries(cnt).map(([k, v]) => `${v} ${CLS[k].toLowerCase()}`).join(', ') + '.');
}
const detectOpts = () => ({ places: placesOf(S), shortStopRadiusFt: 250 });
function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'), out = [];
  for (const p of doc.querySelectorAll('trkpt, rtept')) { const t = p.querySelector('time'); const ms = t ? Date.parse(t.textContent) : NaN; if (!isNaN(ms)) out.push({ lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'), t: ms }); }
  return out.sort((a, b) => a.t - b.t);
}

/* ---------- files: import / export ---------- */
function pick(accept, cb) { const f = $('#filePick'); f.value = ''; f.accept = accept; f.onchange = async () => { const file = f.files[0]; if (!file) return; try { await cb(await file.text(), file.name); } catch (e) { toast('Could not read ' + file.name + ': ' + e.message); } }; f.click(); }
function openFiles() {
  openSheet('Files', `<div class="form">
    <h3>Bring data in</h3>
    <div class="list">
      <button class="row" data-act="imp-gpx"><div class="when">${ic('gps')}</div><div class="main"><div class="title">GPS track (.gpx)</div><div class="sub">Finds the trips, stops and miles, then files them by job.</div></div><div></div></button>
      <button class="row" data-act="imp-csv"><div class="when">${ic('books')}</div><div class="main"><div class="title">Bank or card statement (.csv)</div><div class="sub">The CSV download from most banks and cards. Already-imported rows are skipped, so overlapping months are safe.</div></div><div></div></button>
      <button class="row" data-act="imp-jobs"><div class="when">${ic('jobs')}</div><div class="main"><div class="title">Survey Studio jobs (.json)</div><div class="sub">Job number, address and lat/lon or FL West SPC N/E.</div></div><div></div></button>
      <button class="row" data-act="imp-backup"><div class="when">${ic('files')}</div><div class="main"><div class="title">Restore a backup (.json)</div><div class="sub">Merges by record id. Nothing is deleted.</div></div><div></div></button>
    </div>${recentImports()}
    <h3>Take data out</h3>
    <div class="btns"><button class="btn" data-exp="mileage">${ic('down')}Mileage log</button><button class="btn ghost" data-exp="schedc">${ic('down')}Schedule C</button><button class="btn ghost" data-exp="txns">${ic('down')}Transactions</button><button class="btn ghost" data-exp="backup">${ic('down')}Backup (.json)</button></div></div>`);
}
function recentImports() {
  const L = (S.settings.imports || []).slice(0, 6); if (!L.length) return '';
  return `<h3>Recent statement imports</h3><div class="list">${L.map(x => {
    const shut = isClosed(x.from) || isClosed(x.to);
    return `<div class="row static"><div class="when">${new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div><div class="main"><div class="title">${esc(x.file)}</div><div class="sub">${x.added.length} added${x.updated.length ? `, ${x.updated.length} updated` : ''} · ${x.from ? dlab(x.from, { month: 'short', day: 'numeric' }) + ' – ' + dlab(x.to, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div></div>${shut ? '<span class="muted" style="font-size:12px">Year closed</span>' : `<button class="chip-btn" data-undo="${x.id}">${ic('x')}Undo</button>`}</div>`; }).join('')}</div>
    <p class="note">Undo removes the rows that import added, even ones you filed since, and puts back the rows it changed. Merchant rules you saved stay.</p>`;
}
async function importGPX(text, name) {
  const pts = parseGPX(text); if (pts.length < 2) { toast('No timed track points in ' + name + '.'); return; }
  const found = detectTrips(pts, detectOpts()), have = new Set(S.trips.map(t => t.start.t));
  const add = found.filter(t => !have.has(t.start.t)).map(t => classifyTrip({ ...t, id: uid('trip'), schema: 1, date: ymd(t.start.t), source: 'gpx:' + name, jobIds: [] }, S));
  S.trips.push(...add); closeSheet(); U.tab = 'trips'; U.tripFilter = 'all'; renderTabs(); render(); tabJoin(true); await Store.putMany('trips', add);
  toast(`${add.length} trips found in ${name}${found.length - add.length ? `, ${found.length - add.length} already here` : ''}.`);
}
async function importCSV(text, name) {
  const r = csvToTxns(text, name, S.settings.payeeRules || {}, { companies: companiesOf(S), keys: S.settings.companyKeys || {} }); if (r.error) { toast(r.error); return; }
  /* index what's already here by date + amount, so a classified copy of a statement updates rows instead of adding twins */
  const idx = new Map(); for (const t of S.txns) { const k = t.date + '|' + t.amount.toFixed(2); (idx.get(k) || idx.set(k, []).get(k)).push(t); }
  const add = [], upd = [], before = []; let skip = 0, shut = 0;
  for (const t of r.txns) {
    if (isClosed(t.date)) { shut++; continue; }
    const j = t.jobCode && S.jobs.find(x => x.code === t.jobCode); if (j) t.jobId = j.id; delete t.jobCode;
    const ex = (idx.get(t.date + '|' + t.amount.toFixed(2)) || []).find(x => sameTxn(x, t));
    if (!ex) { add.push(t); continue; }
    if (t.classifiedBy === 'file' && ex.status === 'review') { /* the helper sorted it: take its line, note and job */
      before.push({ id: ex.id, before: { line: ex.line, status: ex.status, classifiedBy: ex.classifiedBy || null, memo: ex.memo || '', jobId: ex.jobId || null } });
      ex.line = t.line; ex.status = t.status; ex.classifiedBy = 'file'; if (t.memo && !ex.memo) ex.memo = t.memo; if (t.jobId && !ex.jobId) ex.jobId = t.jobId; upd.push(ex);
    } else skip++;
  }
  S.txns.push(...add);
  if (add.length || upd.length) {
    const ds = r.txns.map(t => t.date).sort();
    S.settings.imports = [{ id: uid('imp'), file: name, at: new Date().toISOString(), added: add.map(t => t.id), updated: before, from: ds[0], to: ds[ds.length - 1], rows: r.txns.length }, ...(S.settings.imports || [])].slice(0, 20);
  }
  closeSheet(); U.tab = 'books'; U.bookSeg = 'review'; renderTabs(); render(); tabJoin(true);
  await Store.putMany('txns', [...add, ...upd]); if (add.length || upd.length) await Store.putSettings();
  const all = [...add, ...upd], filed = all.filter(t => t.status === 'ok').length, rev = all.filter(t => t.status === 'review').length, co = all.filter(t => t.classifiedBy === 'company').length;
  toast(`${add.length} new` + (upd.length ? `, ${upd.length} updated` : '') + `: ${filed} filed${co ? ` (${co} company pay)` : ''}, ${rev} to review` + (skip ? `, ${skip} already here` : '') + (shut ? `, ${shut} in a closed year skipped` : '') + (all.length ? '. Undo it in Files.' : '.'));
}
/* take one statement import back out: delete the rows it added, put back what it changed */
async function undoImport(id) {
  const L = (S.settings.imports || []).find(x => x.id === id); if (!L) return;
  const gone = new Set(L.added), kept = [];
  const rm = S.txns.filter(t => gone.has(t.id)); S.txns = S.txns.filter(t => !gone.has(t.id));
  for (const u of L.updated) { const t = S.txns.find(x => x.id === u.id); if (!t) continue; Object.assign(t, u.before); if (!u.before.classifiedBy) delete t.classifiedBy; if (!u.before.jobId) delete t.jobId; kept.push(t); }
  S.settings.imports = S.settings.imports.filter(x => x.id !== id);
  await Store.delMany('txns', rm.map(t => t.id));
  await Store.putMany('txns', kept); await Store.putSettings();
  closeSheet(); render(); toast(`Import of ${L.file} undone: ${rm.length} removed${kept.length ? `, ${kept.length} put back` : ''}.`);
}
/* close a tax year after filing: its trips and transactions stop changing (imports skip it, nothing is re-filed) */
async function closeYear(on) {
  const ys = new Set((S.settings.closedYears || []).map(String));
  if (on) {
    const q = dataQuality(S, YEAR, today()), open = q.txReview + q.tripReview;
    const b = $('[data-act="close-year"]'); if (open && b && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `${open} still to review. Tap again to close anyway`; return; }
    ys.add(String(YEAR));
  } else ys.delete(String(YEAR));
  S.settings.closedYears = [...ys].sort(); render(); await Store.putSettings();
  toast(on ? `${YEAR} closed. Make a backup now (Files → Backup) and keep it with your return.` : `${YEAR} reopened.`);
}
/* survey jobs: own contract work unless the company pays the mileage; trips filed as employer for own jobs → business */
async function applyCompanyBilling() {
  const rb = S.settings.reimburse || {}, jobs = [];
  for (const j of S.jobs) if (SURVEY_SOURCES.includes(j.source)) { const want = rb[j.client] ? 'employer' : 'own'; if (j.billTo !== want) { j.billTo = want; jobs.push(j); } }
  if (jobs.length) await Store.putMany('jobs', jobs);
  const fixed = refileOwnJobTrips(S);
  if (fixed.length) await Store.putMany('trips', fixed);
  return fixed.length;
}
/* Job records → job sites, from OneDrive job.json picks or a ledger-jobs.json file. Without coordinates, the phone looks the address up. */
async function applyJobRecords(rows, o) {
  const out = []; let added = 0, updated = 0, noCoords = 0;
  for (const r of rows) {
    const code = String(r.code || r.job_id || r.job || r.jobNumber || '').trim(); if (!code) continue;
    const ex = S.jobs.find(j => j.code === code), j = jobSite(ex, r, o); if (!j) continue;
    if (j.lat == null && j.address && NATIVE) {
      const g = await nativeAsk('geocode', 'geocode', j.address);
      const hit = (g.results || [])[0];
      if (hit && hit.lat > 24 && hit.lat < 31.5 && hit.lon < -79 && hit.lon > -88) { j.lat = +hit.lat.toFixed(6); j.lon = +hit.lon.toFixed(6); j.coordFrom = 'geocode'; }
    }
    if (j.lat == null && j.jobStatus !== 'cancelled') noCoords++;
    if (ex && JSON.stringify(ex) === JSON.stringify(j)) continue;
    if (ex) { Object.assign(ex, j); out.push(ex); updated++; } else { S.jobs.push(j); out.push(j); added++; }
  }
  if (out.length) await Store.putMany('jobs', out);
  return { added, updated, noCoords, changed: out.length };
}
async function importJobs(text, name) {
  const d = JSON.parse(text), list = Array.isArray(d) ? d : (d.jobs || []);
  if (!list.length) { toast('No jobs found. Expected {"format":"ledger-jobs","jobs":[…]}.'); return; }
  closeSheet(); toast(`Reading ${list.length} jobs…`);
  const res = await applyJobRecords(list, { source: 'ledger-jobs', reimburse: S.settings.reimburse || {} }); /* survey jobs are own contract work */
  const n = res.changed ? await reclassify() : 0; U.tab = 'jobs'; renderTabs(); render(); tabJoin(true);
  toast(`${res.added} new, ${res.updated} updated from ${name}.` + (res.noCoords ? ` ${res.noCoords} without a location.` : '') + (n ? ` ${n} trips re-filed.` : ''));
}
async function importBackup(text) {
  const d = JSON.parse(text); if (d.format !== 'ledger-studio-backup') { toast('This is not a Ledger Studio backup.'); return; }
  const merge = (coll, arr) => { const m = new Map(S[coll].map(x => [x.id, x])); for (const x of arr || []) m.set(x.id, x); S[coll] = [...m.values()]; return arr || []; };
  if (d.settings) { S.settings = { ...S.settings, ...d.settings }; await Store.putSettings(); }
  for (const c of ['jobs', 'trips', 'txns']) await Store.putMany(c, merge(c, d[c]));
  closeSheet(); showStore(); render(); toast('Backup restored.');
}
let dlCap; async function getDownloads() { if (dlCap === undefined) { try { dlCap = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dlCap = null; } } return dlCap; }
async function saveFile(name, text, mime) {
  if (phoneSave(name, text, mime)) return;
  const dl = await getDownloads();
  if (dl) { try { await dl.save({ filename: name, data: new Blob([text], { type: mime }) }); toast('Saved ' + name); return; } catch (e) { if (e && e.code === 'declined') return toast('Save cancelled.'); } }
  openSheet(name, `<div class="form"><div class="why">Copy this text into a file named <b>${esc(name)}</b>.</div><label class="fld">Contents<textarea id="expText" readonly>${esc(text)}</textarea></label><div class="btns"><button class="btn" id="expCopy">Copy</button></div></div>`, (root) => {
    $('#expCopy', root).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch (e) { const t = $('#expText', root); t.focus(); t.select(); toast('Press Ctrl+C to copy.'); } };
  });
}
function exportData(kind) {
  const s = S.settings, y = YEAR, b = books(S, y);
  if (kind === 'mileage') {
    const rows = [['Date', 'Depart', 'Arrive', 'From', 'To', 'Business purpose', 'Job', 'Miles', 'Class', 'Rate (¢/mi)', 'Deduction ($)', 'Source']];
    for (const t of S.trips.filter(t => yr(t.date)).sort((a, c) => (a.start.t || a.date).localeCompare(c.start.t || c.date)))
      rows.push([t.date, tm(t.start.t), tm(t.end.t), t.start.label, t.end.label, t.purpose || '', (t.jobIds || []).map(id => jobById(id)?.code).filter(Boolean).join(' '), t.miles.toFixed(1), CLS[t.cls], rateOn(t.date, s.rates), tripDeduction(t, s).toFixed(2), t.source]);
    rows.push([], ['Totals ' + y], ['Business miles', b.miles.business.toFixed(1)], ['Commuting miles', b.miles.commute.toFixed(1)], ['Other (personal) miles', b.miles.other.toFixed(1)], ['Employer-job miles (reimbursed, not deducted)', b.miles.employer.toFixed(1)], ['Mileage deduction ($)', b.mileDed.toFixed(2)],
      ['Vehicle', s.vehicle?.name || ''], ['Placed in service', s.vehicle?.inService || ''], ['Odometer Jan 1', s.vehicle?.odoStart ?? ''], ['Odometer Dec 31', s.vehicle?.odoEnd ?? '']);
    return saveFile(`mileage-log-${y}.csv`, toCSV(rows), 'text/csv');
  }
  if (kind === 'pl') return plCSV();
  if (kind === 'schedc') {
    const rows = [['Schedule C line', 'Description', 'Amount ($)'], ['1', 'Gross receipts', b.income.toFixed(2)]];
    for (const [k, v] of Object.entries(b.ded).sort()) rows.push([k, k === '9' ? 'Car & truck (standard mileage + parking/tolls)' : SCHED_C[k], v.toFixed(2)]);
    rows.push([], ['By category', '', '']);
    for (const [k, v] of Object.entries(b.lines).sort((p, q) => q[1] - p[1])) rows.push([CAT[k].line || '—', CAT[k].name, v.toFixed(2)]);
    const dq = dqNotes(y).map(x => x.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '').trim());
    rows.push(['28', 'Total expenses', b.expenses.toFixed(2)], ['31', 'Net profit', b.net.toFixed(2)], [], ['Part IV', 'Business miles', b.miles.business.toFixed(1)], ['Part IV', 'Commuting miles', b.miles.commute.toFixed(1)], ['Part IV', 'Other miles', b.miles.other.toFixed(1)]);
    if (dq.length) { rows.push([], ['Not final yet', '', '']); for (const x of dq) rows.push(['', x, '']); }
    return saveFile(`schedule-c-summary-${y}.csv`, toCSV(rows), 'text/csv');
  }
  if (kind === 'txns') {
    const rows = [['Date', 'Type', 'Payee', 'Schedule C line', 'Category', 'Amount ($)', 'Job', 'Note', 'Receipt', 'Source']];
    for (const x of S.txns.filter(x => yr(x.date)).sort((a, c) => a.date.localeCompare(c.date))) rows.push([x.date, x.kind, x.payee, CAT[catOf(x.line, x.kind)].line || '—', CAT[catOf(x.line, x.kind)].name, x.amount.toFixed(2), jobById(x.jobId)?.code || '', x.memo || '', x.receipt ? 'yes' : '', x.source]);
    return saveFile(`transactions-${y}.csv`, toCSV(rows), 'text/csv');
  }
  const backup = { format: 'ledger-studio-backup', version: 1, exported: new Date().toISOString(), settings: S.settings, jobs: S.jobs, trips: S.trips, txns: S.txns };
  return saveFile(`ledger-studio-backup-${today()}.json`, JSON.stringify(backup, null, 1), 'application/json');
}

/* ---------- connections (integration foundation) ---------- */
const CONNECTORS = [
  { name: 'Phone GPS', kind: 'Trips', status: NATIVE ? 'On this phone' : 'Android app', st: NATIVE ? 'c-ok' : 'c-business', what: 'Background location with geofences around home, your saved places and every active job. Produces the same Trip records you see here.' },
  { name: 'OneDrive · GAIA/Jobs', kind: 'Jobs', status: NATIVE ? (odStatus().connected ? 'Connected' : 'Ready to connect') : 'In the Android app', st: NATIVE && odStatus().connected ? 'c-ok' : 'c-business', what: 'Read-only. From each job folder: job.json (job number, company, status, address) and the centre of field/<job_id>.txt for the position. Buyer, seller and agent details are never read into Ledger. Checks when the app opens and when you pull down.', act: 'od-sheet', actLabel: 'Open' },
  { name: 'ledger-jobs.json', kind: 'Jobs', status: 'Import ready', st: 'c-ok', what: 'The jobs file Atlas builds from all job.json (format ledger-jobs). Use it when OneDrive is not connected.', act: 'imp-jobs' },
  { name: 'Surveyor Studio (field app)', kind: 'Jobs · Trips', status: 'Planned', st: 'c-personal', what: "The day's work orders and route feed job sites in the morning; arrival and departure times come back with the field data." },
  { name: 'Bank & card statements', kind: 'Transactions', status: 'Import ready', st: 'c-ok', what: 'CSV download from your bank or card, any time. Merchants you have confirmed are filed automatically; transfers and card payments are kept out of income. Rows are matched by date, amount and description, so overlapping uploads (or a later live feed) never duplicate them.', act: 'imp-csv' },
  { name: 'Live bank feed', kind: 'Transactions', status: 'Later', st: 'c-personal', what: 'An aggregator such as Plaid would deliver the same Transaction shape with source "bank:<institution>". Needs a small server to hold its keys and a monthly fee, so it waits.' },
  { name: 'Tax hand-off', kind: 'Reports', status: 'CSV ready', st: 'c-ok', what: 'Mileage log, Schedule C summary and transactions as CSV for a CPA or tax software.' },
  { name: 'Address lookup', kind: 'Jobs', status: 'Planned', st: 'c-personal', what: 'Turn a street address into coordinates when a job has none (Census or Google geocoder from the app).' }
];
function openLinks() {
  openSheet('Links to other apps', `<div class="form"><p class="note" style="margin:0">Every source writes the same three record types, so a new link only needs an adapter. Records keep <code>source</code> and <code>externalId</code> to avoid duplicates.</p>
    <div class="conn">${CONNECTORS.map(c => `<div class="card"><div class="top"><b>${esc(c.name)}</b><span class="pill ${c.st}">${esc(c.status)}</span></div><div class="muted" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-family:var(--f-data)">${esc(c.kind)}</div><div style="font-size:13.5px">${esc(c.what)}</div>${c.act ? `<div><button class="chip-btn" data-act="${c.act}">${ic('up')}${c.actLabel || 'Import now'}</button></div>` : ''}</div>`).join('')}</div>
    <h3>Record shapes (v1)</h3>
    <pre>Job   { id, code, address, client, billTo: own|employer,
        lat, lon, source, externalId }
Trip  { id, date, start{t,lat,lon,place,label}, end{…},
        miles, cls, purpose, jobIds[], ruleId, path[], source, locked }
Place { id, label, lat, lon, address }      ("home" is built in)
Rule  { id, a, b (place ids), both, purpose,
        cls: commute|personal|business }   job sites always win
Txn   { id, date, kind: income|expense, amount, payee,
        line (Schedule C), jobId, receipt{assetId,url},
        source: manual|csv:file|bank:inst, externalId, status }
MerchantRule  "expense|home depot" → "22"   (first 1–3 words)
Adapter { id, kind, pull(since) → records[], push?(records) }</pre>
    <h3>Survey Studio jobs file</h3>
    <pre>{ "format": "ledger-jobs", "version": 1,
  "jobs": [ { "code": "B-177027", "address": "…",
    "spcN": 943729.35, "spcE": 639875.62, "billTo": "own" } ] }</pre></div>`);
}

/* ---------- clear sample ---------- */
async function clearSample() {
  const tr = S.trips.filter(x => x.sample), jb = S.jobs.filter(x => x.sample), tx = S.txns.filter(x => x.sample);
  S.trips = S.trips.filter(x => !x.sample); S.jobs = S.jobs.filter(x => !x.sample); S.txns = S.txns.filter(x => !x.sample);
  const places = (S.settings.places || []).filter(p => !p.sample), ids = new Set(['home', ...places.map(p => p.id)]);
  const rules = (S.settings.rules || []).filter(r => !r.sample && ids.has(r.a) && ids.has(r.b));
  if (S.settings.sample) S.settings = { ...structuredClone(DEFAULTS), rates: S.settings.rates, places, rules };
  else { S.settings.places = places; S.settings.rules = rules; }
  await Store.putSettings();
  closeSheet(); showStore(); render();
  for (const [c, arr] of [['trips', tr], ['jobs', jb], ['txns', tx]]) for (const x of arr) await Store.del(c, x.id);
  toast('Sample data cleared. Start with Setup.');
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-tab],[data-tool],[data-act],[data-go],[data-trip],[data-job],[data-rule],[data-place],[data-unrule],[data-gfile],[data-gchange],[data-trkmode],[data-perm],[data-here],[data-geo],[data-tx],[data-cls],[data-snooze],[data-txok],[data-tf],[data-bs],[data-exp],[data-rep],[data-mon],[data-undo]');
  if (!el || el.closest('.swipe.drag')) return;
  const d = el.dataset;
  if (d.tab) return setTab(d.tab);
  if (d.go) return setTab(d.go);
  if (d.tf) { U.tripFilter = d.tf; return render(); }
  if (d.bs) { U.bookSeg = d.bs; return render(); }
  if (d.rep) { U.rep = d.rep; return render(); }
  if (d.mon) return monthTip(+d.mon);
  if (d.undo) return undoImport(d.undo);
  if (d.cls) return setTripClass(d.id, d.cls);
  if (d.trip) return openTrip(d.trip);
  if (d.job) return openJob(d.job);
  if (d.here || d.geo) return phoneLocClick(el, (la, lo) => {
    const f = d.here || d.geo;
    if (f === 'jLat') { $('#jLat').value = la; $('#jLon').value = lo; $('#jLon').dispatchEvent(new Event('change')); }
    else $('#' + f).value = `${la}, ${lo}`;
  });
  if (d.trkmode) { nativeCall('setMode', d.trkmode); nativeRefresh(); phoneRefreshUI(); if (document.getElementById('sheet').hidden === false && $('#trkMode', $('#sheetBody'))) openDrive(); return toast(d.trkmode === 'off' ? 'Tracking is off.' : 'Automatic tracking is on.'); }
  if (d.perm) return nativeCall('ask', d.perm);
  if (d.gfile) return fileGroup(+d.gfile);
  if (d.gchange) return changeGroup(+d.gchange);
  if (d.rule) return openRule(d.rule);
  if (d.place) return openPlace(d.place);
  if (d.tx) return openTx(d.tx);
  if (d.snooze) { U.snoozed.add(d.snooze); render(); return toast('Moved to later. It stays in the lists.'); }
  if (d.txok) { const x = S.txns.find(t => t.id === d.txok); if (x && isClosed(x.date)) return shutToast(); if (x) { x.status = 'ok'; render(); await Store.put('txns', x); const n = await rememberPayee(x.kind, x.payee, x.line, x.id); render(); toast(`Filed. Future uploads file “${x.payee}” as ${LINES[x.line]}.` + (n ? ` ${n} more filed now.` : '')); } return; }
  if (d.unrule) { const r = { ...(S.settings.payeeRules || {}) }; delete r[d.unrule]; S.settings.payeeRules = r; render(); await Store.putSettings(); return toast('Merchant rule deleted.'); }
  if (d.exp) return exportData(d.exp);
  const t = d.tool || d.act;
  ({
    drive: openDrive, trip: () => openTrip(null), expense: () => openTx(null, 'expense'), income: () => openTx(null, 'income'), files: openFiles, links: openLinks, setup: openSetup,
    sim: simulate, 'imp-gpx': () => pick('.gpx,application/gpx+xml,application/xml', importGPX), 'imp-csv': () => pick('.csv,text/csv', importCSV),
    'imp-jobs': () => pick('.json,application/json', importJobs), 'imp-backup': () => pick('.json,application/json', importBackup), 'new-job': () => openJob(null), 'new-rule': () => openRule(null), 'new-place': () => openPlace(null),
    'rules-tab': () => { closeSheet(); setTab('jobs'); },
    'drive-start': () => { nativeCall('startDrive'); closeSheet(); toast('Recording this drive.'); setTimeout(() => { nativeRefresh(); phoneRefreshUI(); }, 800); },
    'drive-stop': () => { nativeCall('stopDrive'); closeSheet(); toast('Drive stopped. It will appear in a few minutes.'); setTimeout(() => { nativeRefresh(); phoneRefreshUI(); }, 800); },
    'od-sheet': () => odAction('od-sheet'), 'od-check': () => odAction('od-check'), 'od-all': () => odAction('od-all'), 'od-open': () => odAction('od-open'), 'od-off': () => odAction('od-off'), 'od-connect': () => odAction('od-connect'),
    'close-year': () => closeYear(true), 'reopen-year': () => closeYear(false),
    'perm-sheet': openPermSheet, 'trk-log': openTrackLog, 'sync-now': async () => { const n = await syncTrips(); if (!n) toast(N.state.running ? 'A drive is being recorded; it appears after you park.' : 'No new trips yet.'); }, 'books-review': () => { U.bookSeg = 'review'; setTab('books'); }, 'clear-sample': clearSample
  })[t]?.();
});
document.addEventListener('change', async (e) => {
  const q = e.target.dataset && e.target.dataset.paid; if (!q) return;
  S.settings.paid = { ...(S.settings.paid || {}), [q]: parseFloat(e.target.value.replace(/[$,]/g, '')) || 0 };
  render(); await Store.putSettings(); toast(q + ' payment saved.');
});
/* swipe to classify */
let sw = null;
document.addEventListener('pointerdown', (e) => { const c = e.target.closest('.swipe[data-swipe]'); if (!c || e.target.closest('button')) return; sw = { c, x: e.clientX, y: e.clientY, dx: 0, on: false, id: e.pointerId }; });
document.addEventListener('pointermove', (e) => {
  if (!sw || e.pointerId !== sw.id) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { sw.on = true; sw.c.classList.add('drag'); try { sw.c.setPointerCapture(e.pointerId); } catch (_) { } } else if (Math.abs(dy) > 10) { sw = null; return; } else return; }
  sw.dx = dx; sw.c.style.transform = `translateX(${dx}px)`; sw.c.parentElement.dataset.dir = dx > 0 ? 'r' : 'l';
});
const swEnd = () => {
  if (!sw) return; const { c, dx, on } = sw; sw = null; if (!on) return;
  c.classList.remove('drag');
  if (Math.abs(dx) > 90) { c.style.transform = `translateX(${dx > 0 ? 120 : -120}%)`; setTimeout(() => setTripClass(c.dataset.swipe, dx > 0 ? 'business' : 'personal'), 180); }
  else { c.style.transform = ''; delete c.parentElement.dataset.dir; }
};
document.addEventListener('pointerup', swEnd); document.addEventListener('pointercancel', swEnd);

/* ---------- old-map background + tab join (style kit) ---------- */
function mapBG(W, H, rose) {
  const sep = '#6a4d1c', gold = '#9a7424', plum = '#3b1d52', o = [], R = (x) => x.toFixed(1);
  let d = ''; const st = 88; for (let x = (W % st) / 2; x <= W; x += st) d += `M${R(x)} 0V${H}`; for (let y = (H % st) / 2; y <= H; y += st) d += `M0 ${R(y)}H${W}`;
  o.push(`<path d="${d}" stroke="${sep}" stroke-opacity=".12" stroke-width=".7" fill="none"/>`);
  let t = ''; for (let x = (W % st) / 2; x <= W; x += st) for (let y = (H % st) / 2; y <= H; y += st) t += `M${R(x - 3)} ${R(y)}h6M${R(x)} ${R(y - 3)}v6`;
  o.push(`<path d="${t}" stroke="${sep}" stroke-opacity=".28" stroke-width=".8"/>`);
  const roses = [rose || [W - 46, 40, 34], [Math.min(150, W * 0.14), H - 40, 40]];
  for (const [cx, cy, r] of roses) {
    let a1 = '', a2 = ''; const L = Math.hypot(W, H) * 1.3;
    for (let k = 0; k < 32; k++) { const a = k * Math.PI / 16, c = Math.cos(a), s = Math.sin(a), seg = `M${R(cx + c * r * 1.08)} ${R(cy + s * r * 1.08)}L${R(cx + c * L)} ${R(cy + s * L)}`; if (k % 4 === 0) a1 += seg; else a2 += seg; }
    o.push(`<path d="${a1}" stroke="${gold}" stroke-opacity=".26" stroke-width=".8"/><path d="${a2}" stroke="${plum}" stroke-opacity=".11" stroke-width=".6" stroke-dasharray="7 5"/>`);
  }
  const blob = (cx, cy, rx, ry, k0, n, ph) => { let out = ''; for (let k = 0; k < n; k++) { const sc = 1 + k * 0.17, P = []; for (let i = 0; i < 72; i++) { const a = i / 72 * 2 * Math.PI, f = 1 + 0.13 * Math.sin(3 * a + ph) + 0.07 * Math.sin(5 * a + ph * 1.7 + k * 0.25) + 0.04 * Math.sin(8 * a + k); P.push([cx + Math.cos(a) * rx * sc * f, cy + Math.sin(a) * ry * sc * f]); } let p = `M${R((P[71][0] + P[0][0]) / 2)} ${R((P[71][1] + P[0][1]) / 2)}`; for (let i = 0; i < 72; i++) { const q = P[i], nx = P[(i + 1) % 72]; p += `Q${R(q[0])} ${R(q[1])} ${R((q[0] + nx[0]) / 2)} ${R((q[1] + nx[1]) / 2)}`; } out += `<path d="${p}Z" fill="none" stroke="${sep}" stroke-opacity="${(k + k0) % 4 === 0 ? .2 : .1}" stroke-width="${(k + k0) % 4 === 0 ? 1 : .7}"/>`; } return out; };
  o.push(blob(W * 0.3, -H * 0.02, W * 0.16, H * 0.07, 0, 9, 0.7), blob(W * 0.86, H * 1.02, W * 0.13, H * 0.1, 2, 8, 2.1), blob(-W * 0.02, H * 0.52, W * 0.06, H * 0.14, 1, 7, 4.2));
  for (const [cx, cy, r] of roses) {
    let ticks = ''; for (let k = 0; k < 64; k++) { const a = k * Math.PI / 32, r1 = r * (k % 8 === 0 ? .74 : k % 2 ? .86 : .8); ticks += `M${R(cx + Math.cos(a) * r1)} ${R(cy + Math.sin(a) * r1)}L${R(cx + Math.cos(a) * r * .92)} ${R(cy + Math.sin(a) * r * .92)}`; }
    const star = (rr, rin, n, rot) => { let p = ''; for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, q = k % 2 ? rin : rr; p += (k ? 'L' : 'M') + R(cx + Math.cos(a) * q) + ' ' + R(cy + Math.sin(a) * q); } return p + 'Z'; };
    o.push(`<g fill="none" stroke="${gold}"><circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" stroke-opacity=".42" stroke-width="1"/><circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r * .92)}" stroke-opacity=".3" stroke-width=".6"/><path d="${ticks}" stroke-opacity=".4" stroke-width=".7"/></g>
      <path d="${star(r * .66, r * .16, 4, Math.PI / 4)}" fill="${gold}" fill-opacity=".1" stroke="${gold}" stroke-opacity=".38" stroke-width=".8"/>
      <path d="${star(r * .78, r * .13, 4, -Math.PI / 2)}" fill="${plum}" fill-opacity=".1" stroke="${plum}" stroke-opacity=".32" stroke-width=".8"/>
      <circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r * .07)}" fill="${gold}" fill-opacity=".45"/>
      <text x="${R(cx)}" y="${R(cy - r * 1.02)}" text-anchor="middle" font-family="Marcellus SC, Georgia, serif" font-size="${R(r * .26)}" fill="${plum}" fill-opacity=".38">N</text>`);
  }
  let nb = ''; const inset = 5, gap = 4; for (let x = inset; x < W - inset; x += 40) if (Math.round((x - inset) / 40) % 2 === 0) nb += `M${x} ${inset + gap / 2}h20M${x} ${H - inset - gap / 2}h20`; for (let y = inset; y < H - inset; y += 40) if (Math.round((y - inset) / 40) % 2 === 0) nb += `M${inset + gap / 2} ${y}v20M${W - inset - gap / 2} ${y}v20`;
  o.push(`<rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${sep}" stroke-opacity=".28" stroke-width=".8"/><rect x="${inset + gap}" y="${inset + gap}" width="${W - 2 * (inset + gap)}" height="${H - 2 * (inset + gap)}" fill="none" stroke="${sep}" stroke-opacity=".22" stroke-width=".6"/><path d="${nb}" stroke="${sep}" stroke-opacity=".3" stroke-width="${gap}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}
let mapKey = '';
function paintMap() { const W = Math.round(innerWidth), H = Math.round(innerHeight), k = W + 'x' + H; if (k === mapKey || !W || !H) return; mapKey = k; $('#mapbg').style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(mapBG(W, H, null))}")`; }
function tabJoin(animate) {
  const svg = $('#tabJoin'), t = $(`.tab[data-tab="${U.tab}"]`); if (!svg) return;
  if (!t) { svg.innerHTML = ''; return; }
  const ar = $('#app').getBoundingClientRect(), tr = t.getBoundingClientRect(), nr = $('.tabs').getBoundingClientRect(), wr = $('#ws').getBoundingClientRect();
  const x0 = Math.max(tr.left, nr.left + 2) - ar.left, x1 = Math.min(tr.right, nr.right - 2) - ar.left;
  if (x1 - x0 < 24) { svg.innerHTML = ''; return; }
  const top = tr.top - ar.top - 2, base = wr.top - ar.top + 1, f = Math.max(4, Math.min(11, base - (tr.bottom - ar.top) + 2)), Rr = Math.min(16, (tr.bottom - tr.top) / 2, (x1 - x0) / 2);
  const P = n => n.toFixed(1);
  const outline = `M${P(x0 - f)} ${P(base)}A${f} ${f} 0 0 0 ${P(x0)} ${P(base - f)}L${P(x0)} ${P(top + Rr)}A${P(Rr)} ${P(Rr)} 0 0 1 ${P(x0 + Rr)} ${P(top)}L${P(x1 - Rr)} ${P(top)}A${P(Rr)} ${P(Rr)} 0 0 1 ${P(x1)} ${P(top + Rr)}L${P(x1)} ${P(base - f)}A${f} ${f} 0 0 0 ${P(x1 + f)} ${P(base)}`;
  svg.innerHTML = `<defs><linearGradient id="tjF" gradientUnits="userSpaceOnUse" x1="0" y1="${P(top)}" x2="0" y2="${P(base)}"><stop offset="0" stop-color="#4f2a6e"/><stop offset=".55" stop-color="#3b1d52"/><stop offset="1" stop-color="#2c133e"/></linearGradient>
    <linearGradient id="tjG" gradientUnits="userSpaceOnUse" x1="${P(x0 - f)}" y1="0" x2="${P(x1 + f)}" y2="0"><stop offset="0" stop-color="#b4862a"/><stop offset=".25" stop-color="#f7e8b2"/><stop offset=".5" stop-color="#a0741f"/><stop offset=".75" stop-color="#f5e3a4"/><stop offset="1" stop-color="#b4862a"/></linearGradient>
    <filter id="tjS" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#2a1239" flood-opacity=".28"/></filter></defs>
    <g${animate ? ' class="rise"' : ''} style="--tjx:${P((x0 + x1) / 2)}px;--tjy:${P(base)}px"><path d="${outline}Z" fill="url(#tjF)" filter="url(#tjS)"/><path d="${outline}" fill="none" stroke="url(#tjG)" stroke-width="1.6"/><path d="M${P(x0 + 6)} ${P(top + 1.6)}H${P(x1 - 6)}" stroke="#ecd38a" stroke-opacity=".35" stroke-width="1"/></g>`;
}
addEventListener('resize', () => { paintMap(); tabJoin(false); });
$('#tabs').addEventListener('scroll', () => tabJoin(false), { passive: true });
if (document.fonts) document.fonts.ready.then(() => tabJoin(false));

/* ---------- boot ---------- */
(async function boot() {
  paintMap(); renderTabs(); renderRails(); render(); tabJoin(false);
  await Store.init(); await loadInto();
  if (!S.settings.migOwnJobs) { const n = await applyCompanyBilling(); S.settings.migOwnJobs = true; await Store.putSettings(); if (n) setTimeout(() => toast(`${n} survey-job trip${n > 1 ? 's' : ''} re-filed as business (contract work).`), 1500); }
  render();
  if (NATIVE) { nativeRefresh(); render(); await syncTrips(true); if (odStatus().connected) checkOneDriveJobs({ quiet: true }); }
})();
$('#yearPick').addEventListener('change', (e) => { YEAR = +e.target.value; showStore(); render(); tabJoin(false); });
