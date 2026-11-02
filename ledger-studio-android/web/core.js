/* ===== Ledger Studio core (pure logic; ports 1:1 to the Android app) ===== */
const FT_PER_MI = 5280, USFT = 1200 / 3937;
function hav(a, b) { // a,b = [lat,lon] → miles
  const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.min(1, Math.sqrt(s)));
}
const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ymd = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* --- NAD83 Florida West (FIPS 0902), Transverse Mercator, US survey feet --- */
const FLW = { a: 6378137, f: 1 / 298.257222101, k0: 0.999941177, lat0: 24 + 20 / 60, lon0: -82, FE: 200000, FN: 0 };
function _tmM(phi, e2, a) { const e4 = e2 * e2, e6 = e4 * e2; return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi)); }
function llToSpc(lat, lon) {
  const { a, f, k0, FE, FN } = FLW, e2 = f * (2 - f), ep2 = e2 / (1 - e2), r = Math.PI / 180;
  const phi = lat * r, lam = (lon - FLW.lon0) * r, N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = lam * Math.cos(phi);
  const M = _tmM(phi, e2, a), M0 = _tmM(FLW.lat0 * r, e2, a);
  const x = FE + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
  const y = FN + k0 * (M - M0 + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { N: y / USFT, E: x / USFT };
}
function spcToLl(Nft, Eft) {
  const { a, f, k0, FE, FN } = FLW, e2 = f * (2 - f), ep2 = e2 / (1 - e2), r = Math.PI / 180;
  const x = Eft * USFT - FE, y = Nft * USFT - FN;
  const M = _tmM(FLW.lat0 * r, e2, a) + y / k0, e4 = e2 * e2, e6 = e4 * e2;
  const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, s = Math.sin(p1), N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = FLW.lon0 * r + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return { lat: lat / r, lon: lon / r };
}

/* --- trip detection from a GPS stream: stops = dwell ≥ minStop inside stopRadius,
       or a short dwell (≥ minStopAtPlace, e.g. a school drop-off) inside a saved place or job --- */
function detectTrips(pts, o = {}) {
  const R = (o.stopRadiusFt || 300) / FT_PER_MI, minStop = (o.minStopSec || 300) * 1000, minAt = (o.minStopAtPlaceSec || 60) * 1000, minMi = o.minTripMi ?? 0.2, n = pts.length;
  const places = o.places || [], pr = o.shortStopRadiusFt || 250; /* quick stops count only near the saved spot, so a red light down the road does not split a trip */
  if (n < 2) return [];
  const P = (p) => [p.lat, p.lon], stops = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && hav(P(pts[i]), P(pts[j])) < R) j++;
    const dur = pts[j - 1].t - pts[i].t;
    if (dur >= minStop || (dur >= minAt && places.length && nearestPlace(pts[i], places, pr))) { stops.push([i, j - 1]); i = j; } else i++;
  }
  const segs = [];
  if (!stops.length) segs.push([0, n - 1]);
  else {
    if (stops[0][0] > 0) segs.push([0, stops[0][0]]);
    for (let k = 0; k < stops.length - 1; k++) segs.push([stops[k][1], stops[k + 1][0]]);
    const last = stops[stops.length - 1][1]; if (last < n - 1) segs.push([last, n - 1]);
  }
  const trips = [];
  for (const [a, b] of segs) {
    let mi = 0; for (let k = a + 1; k <= b; k++) mi += hav(P(pts[k - 1]), P(pts[k]));
    if (mi < minMi) continue;
    const step = Math.max(1, Math.ceil((b - a + 1) / 40)), path = []; /* ≤ ~40 points per trip keeps a year of trips small */
    for (let k = a; k <= b; k += step) path.push([+pts[k].lat.toFixed(5), +pts[k].lon.toFixed(5)]);
    path.push([+pts[b].lat.toFixed(5), +pts[b].lon.toFixed(5)]);
    trips.push({ start: { t: new Date(pts[a].t).toISOString(), lat: pts[a].lat, lon: pts[a].lon }, end: { t: new Date(pts[b].t).toISOString(), lat: pts[b].lat, lon: pts[b].lon }, miles: +mi.toFixed(1), path });
  }
  return trips;
}

/* --- classification: 1) job sites, 2) trip rules between saved places, 3) review --- */
const RULE_CLS = { commute: 'Commute', personal: 'Personal', business: 'Business' };
function placesOf(S) {
  const s = S.settings, L = [];
  if (s.home && s.home.lat != null) L.push({ key: 'home', label: s.home.label || 'Home', lat: s.home.lat, lon: s.home.lon });
  for (const p of s.places || []) if (p.lat != null) L.push({ key: p.id, label: p.label, lat: p.lat, lon: p.lon, place: p });
  for (const j of S.jobs) if (j.lat != null) L.push({ key: 'job:' + j.id, label: j.code, sub: j.address, lat: j.lat, lon: j.lon, job: j });
  return L;
}
function placeLabel(S, key) {
  if (key === 'home') return (S.settings.home && S.settings.home.label) || 'Home';
  const p = (S.settings.places || []).find(x => x.id === key); return p ? p.label : 'Deleted place';
}
function matchRule(a, b, rules) {
  if (!a || !b || a === b) return null;
  for (const r of rules || []) { if (r.a === a && r.b === b) return r; if (r.both && r.a === b && r.b === a) return r; }
  return null;
}
function sameRoute(r, a, b, both) { return (r.a === a && r.b === b) || ((r.both || both) && r.a === b && r.b === a); }
/* older books kept one "regular work location": turn it into a saved place + a two-way commute rule */
function migrateSettings(s) {
  let ch = false;
  if (!Array.isArray(s.places)) { s.places = []; ch = true; }
  if (!Array.isArray(s.rules)) { s.rules = []; ch = true; }
  if (s.office && s.office.lat != null) {
    if (!s.places.some(p => p.id === 'pl_office')) {
      s.places.push({ id: 'pl_office', label: s.office.label || 'Work location', lat: s.office.lat, lon: s.office.lon, address: '' });
      s.rules.push({ id: 'rule_office', a: 'home', b: 'pl_office', both: true, cls: 'commute', purpose: '' });
    }
    s.office = null; ch = true;
  }
  return ch;
}
function nearestPlace(p, places, rFt) {
  let best = null;
  for (const pl of places) { const d = hav([p.lat, p.lon], [pl.lat, pl.lon]) * FT_PER_MI; if (d <= rFt && (!best || d < best.d)) best = { ...pl, d }; }
  return best;
}
function classifyTrip(t, S) {
  const s = S.settings, pl = placesOf(S), r = s.radiusFt || 600;
  const a = nearestPlace(t.start, pl, r), b = nearestPlace(t.end, pl, r);
  t.start.place = a ? a.key : null; t.start.label = a ? a.label : 'Unlisted stop';
  t.end.place = b ? b.key : null; t.end.label = b ? b.label : 'Unlisted stop';
  if (t.locked) return t;
  const jobs = [a, b].filter(x => x && x.job).map(x => x.job);
  const own = jobs.filter(j => j.billTo !== 'employer'), emp = jobs.filter(j => j.billTo === 'employer');
  const keys = [a && a.key, b && b.key];
  t.jobIds = [...new Set(jobs.map(j => j.id))]; t.ruleId = null;
  if (own.length) {
    t.cls = 'business'; t.purpose = 'Boundary survey – ' + [...new Set(own.map(j => j.code))].join(' → ');
    t.reason = keys.includes('home') && !s.homeOffice
      ? 'Job site you bill. Home ↔ job trips count as business when home is your main place of business or you have a regular work location (Rev. Rul. 99-7).'
      : 'Rule 1: the trip starts or ends at a job site you bill.';
  } else if (emp.length) {
    t.cls = 'employer'; t.purpose = 'Company job – ' + [...new Set(emp.map(j => j.code))].join(' → ');
    t.reason = 'Rule 1: job billed by your employer. The company reimburses it; it is not a deduction on your Schedule C.';
  } else {
    const rule = matchRule(keys[0], keys[1], s.rules);
    if (rule) {
      t.cls = rule.cls; t.ruleId = rule.id;
      t.purpose = rule.purpose || `${RULE_CLS[rule.cls]} · ${a.label} → ${b.label}`;
      t.reason = `Trip rule: ${placeLabel(S, rule.a)} ${rule.both ? '⇄' : '→'} ${placeLabel(S, rule.b)}.`;
    } else { t.cls = 'review'; t.purpose = ''; t.reason = 'No job site and no trip rule for this route. Swipe to classify, or save the route as a rule.'; }
  }
  return t;
}

/* --- a simulated GPS day (road-like L-shaped legs at ~32 mph, dwell at each stop) --- */
function simulateDay(stops, startISO, seed = 7) {
  let rnd = seed; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const pts = []; let t = Date.parse(startISO);
  const jit = (v, ft) => v + (rand() - 0.5) * 2 * ft / 364000;
  const push = (lat, lon) => pts.push({ lat: jit(lat, 12), lon: jit(lon, 12), t });
  for (let k = 0; k < stops.length; k++) {
    const s = stops[k];
    for (let m = 0; m <= (s.dwell || 0); m++) { push(s.lat, s.lon); t += 60000; }
    const nx = stops[k + 1]; if (!nx) break;
    const corner = rand() > 0.5 ? [s.lat, nx.lon] : [nx.lat, s.lon];
    for (const [A, B] of [[[s.lat, s.lon], corner], [corner, [nx.lat, nx.lon]]]) {
      const d = hav(A, B), n = Math.max(1, Math.ceil(d / 0.25));
      for (let q = 1; q <= n; q++) { t += (d / n) / 32 * 3600000; push(A[0] + (B[0] - A[0]) * q / n, A[1] + (B[1] - A[1]) * q / n); }
    }
  }
  return pts;
}

/* --- money & taxes --- */
const LINES = {
  '1': 'Gross receipts', 'transfer': 'Not income (transfer, refund, card payment)', '8': 'Advertising', '9': 'Car & truck', 'tolls': 'Parking & tolls (business)', '10': 'Commissions & fees', '11': 'Contract labor',
  '13': 'Depreciation / Sec. 179', '15': 'Insurance (not health)', '16b': 'Interest', '17': 'Legal & professional', '18': 'Office expense',
  '20a': 'Rent – vehicles & equipment', '20b': 'Rent – other property', '21': 'Repairs & maintenance', '22': 'Supplies', '23': 'Taxes & licenses',
  '24a': 'Travel', '24b': 'Meals (50% deductible)', '25': 'Utilities & phone', '27a': 'Other (software, dues, training)',
  'vehicle': 'Vehicle costs (covered by mileage rate)', 'personal': 'Personal – not deductible'
};
const EXPENSE_LINES = ['22', '27a', '25', '15', 'tolls', '24b', '18', '21', '17', '23', '24a', '8', '10', '11', '13', '16b', '20a', '20b', 'vehicle', 'personal'];
const BRACKETS = {
  single: { std: 16100, b: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]] },
  mfj: { std: 32200, b: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]] }
};
function incomeTax(ti, filing) { let tax = 0, lo = 0; for (const [hi, r] of BRACKETS[filing].b) { if (ti <= lo) break; tax += (Math.min(ti, hi) - lo) * r; lo = hi; } return tax; }
function rateOn(date, rates) { let c = 0; for (const r of [...rates].sort((x, y) => x.from.localeCompare(y.from))) if (r.from <= date) c = r.cents; return c; }
function tripDeduction(t, s) { return t.cls === 'business' ? t.miles * rateOn(t.date, s.rates) / 100 : 0; }

function books(S, year, upTo) { // upTo: 'YYYY-MM-DD' inclusive, optional
  const s = S.settings, inR = (d) => d && d.startsWith(String(year)) && (!upTo || d <= upTo);
  const lines = {}; let income = 0;
  for (const x of S.txns) { if (!inR(x.date)) continue; if (x.kind === 'income') { if ((x.line || '1') === '1') income += x.amount; } else lines[x.line] = (lines[x.line] || 0) + x.amount; }
  const miles = { business: 0, commute: 0, other: 0, employer: 0, review: 0 }; let mileDed = 0;
  for (const t of S.trips) { if (!inR(t.date)) continue; const k = t.cls === 'personal' ? 'other' : t.cls; miles[k] = (miles[k] || 0) + t.miles; mileDed += tripDeduction(t, s); }
  const ded = {};
  for (const [k, v] of Object.entries(lines)) { if (k === 'vehicle' || k === 'personal' || k === 'tolls') continue; ded[k] = k === '24b' ? v * 0.5 : v; }
  ded['9'] = mileDed + (lines.tolls || 0);
  const expenses = Object.values(ded).reduce((a, b) => a + b, 0), net = income - expenses;
  return { income, lines, ded, expenses, net, miles, mileDed };
}
function taxOn(net, s) {
  const filing = s.filing || 'single', w2 = +s.w2Wages || 0, base = +s.ssWageBase || 184500;
  const seBase = Math.max(0, net) * 0.9235, se = seBase < 400 ? 0 : Math.min(seBase, Math.max(0, base - w2)) * 0.124 + seBase * 0.029;
  const half = se / 2, std = BRACKETS[filing].std;
  const tiBefore = Math.max(0, w2 + net - half - std), qbi = Math.max(0, Math.min((net - half) * 0.2, tiBefore * 0.2));
  const incWith = incomeTax(Math.max(0, tiBefore - qbi), filing), incWithout = incomeTax(Math.max(0, w2 - std), filing);
  const inc = Math.max(0, incWith - incWithout);
  return { se, inc, qbi, total: se + inc };
}
function quarters(year) {
  return [
    { q: 'Q1', from: `${year}-01-01`, to: `${year}-03-31`, due: `${year}-04-15` },
    { q: 'Q2', from: `${year}-04-01`, to: `${year}-05-31`, due: `${year}-06-15` },
    { q: 'Q3', from: `${year}-06-01`, to: `${year}-08-31`, due: `${year}-09-15` },
    { q: 'Q4', from: `${year}-09-01`, to: `${year}-12-31`, due: `${year + 1}-01-15` }];
}
function quarterly(S, year) { let prev = 0; return quarters(year).map(Q => { const cum = taxOn(books(S, year, Q.to).net, S.settings).total; const amt = Math.max(0, cum - prev); prev = Math.max(prev, cum); return { ...Q, amt }; }); }

/* --- CSV --- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (rows) => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
function normDate(s) {
  s = (s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return null;
}
const RULES = [
  [/shell|exxon|mobil|wawa|racetrac|chevron|bp\b|sunoco|marathon|circle k|speedway|7-eleven|murphy/i, 'vehicle'],
  [/sunpass|toll|parking|epass|park mobile|parkmobile/i, 'tolls'],
  [/home depot|lowe'?s|ace hardware|harbor freight|forestry suppl|ben meadows/i, '22'],
  [/verizon|t-mobile|tmobile|at&t|att\b|spectrum|comcast|xfinity|frontier/i, '25'],
  [/autodesk|adobe|microsoft|google|anthropic|claude|dropbox|carlson|trimble|stonex|microsurvey|esri/i, '27a'],
  [/insurance|geico|progressive|state farm|hiscox|next insurance/i, '15'],
  [/staples|office depot|usps|fedex|ups store/i, '18'],
  [/restaurant|cafe|grill|pizza|burger|subway|chick-fil|mcdonald|starbucks|dunkin|taco|diner/i, '24b'],
  [/sunbiz|division of corporations|license|dbpr|county tax/i, '23']
];
function guessLine(payee) { for (const [re, l] of RULES) if (re.test(payee || '')) return l; return null; }
/* deposits that are not business income: own transfers, card payments, refunds */
const TRANSFER_RE = /transfer|xfer|payment thank|autopay|online pay|mobile pay|card pay|epay|refund|return|reversal|adjustment|from sav|from chk/i;
/* merchant memory: "home depot #123" and "HOME DEPOT 4410" are the same merchant */
function payeeKey(p) { return (p || '').toLowerCase().replace(/\b(pos|debit|purchase|card|visa|mc|sq|tst|pp|ach|recurring)\b\*?/g, ' ').replace(/[#*]?\d[\d\-\/]*/g, ' ').replace(/[^a-z&' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' '); }
const memoKey = (kind, payee) => { const k = payeeKey(payee); return k ? kind + '|' + k : ''; };
/* a saved "home depot" also matches "home depot port charlotte": try 3, then 2, then 1 words */
function memoFind(memo, kind, payee) { const w = payeeKey(payee).split(' ').filter(Boolean); for (let n = w.length; n >= 1; n--) { const v = memo[kind + '|' + w.slice(0, n).join(' ')]; if (v) return v; } return null; }
function csvToTxns(text, fileName, memo = {}) {
  const rows = parseCSV(text); if (rows.length < 1) return { txns: [], error: 'The file has no rows.' };
  const h = rows[0].map(x => x.trim().toLowerCase());
  const find = (...names) => h.findIndex(x => names.some(n => x === n || x.includes(n)));
  let iD = find('transaction date', 'posted date', 'post date', 'date'), iP = find('description', 'payee', 'merchant', 'name', 'memo'), iA = find('amount'), iDb = find('debit', 'withdrawal'), iCr = find('credit', 'deposit'), body = rows.slice(1);
  if (iD < 0 && normDate(rows[0][0]) && rows[0].length >= 5) { iD = 0; iA = 1; iP = 4; iDb = iCr = -1; body = rows; } /* Wells Fargo style: no header row */
  if (iD < 0 || iP < 0 || (iA < 0 && iDb < 0 && iCr < 0)) return { txns: [], error: 'Could not find Date, Description and Amount (or Debit/Credit) columns.' };
  const num = (s) => { s = (s || '').replace(/[$,\s]/g, ''); if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1); const v = parseFloat(s); return isNaN(v) ? 0 : v; };
  const out = [], seen = {};
  for (const r of body) {
    const date = normDate(r[iD]); if (!date) continue;
    let amt = iA >= 0 ? num(r[iA]) : (num(r[iCr]) - Math.abs(num(r[iDb])));
    if (!amt) continue;
    const payee = (r[iP] || '').replace(/\s+/g, ' ').trim(), kind = amt > 0 ? 'income' : 'expense', known = memoFind(memo, kind, payee);
    const line = known || (kind === 'income' ? (TRANSFER_RE.test(payee) ? 'transfer' : '1') : (guessLine(payee) || '27a'));
    const base = `csv|${date}|${amt.toFixed(2)}|${payee.toLowerCase()}`, nth = seen[base] = (seen[base] || 0) + 1; /* two equal charges on one day stay two */
    out.push({ id: uid('tx'), schema: 1, date, kind, amount: Math.abs(+amt.toFixed(2)), payee, line, memo: '', jobId: null, source: 'csv:' + fileName, externalId: nth > 1 ? base + '|' + nth : base, status: known ? 'ok' : 'review', autoFiled: !!known });
  }
  return { txns: out };
}

/* --- GAIA jobs (Integration Spec §3, §5): the WO number is the job code; its prefix says which company pays --- */
const COMPANY_PREFIX = [[/^B-/i, 'M.E. Land Surveying, Inc.'], [/^O-/i, 'OnlineLand Surveyors, Inc.'], [/^\d{4}\.\d{4}$/, 'LandMark'], [/^\d{6}$/, 'Target']];
function companyFor(code) { for (const [re, n] of COMPANY_PREFIX) if (re.test(String(code || '').trim())) return n; return ''; }
/* One job site from a job record (the fields picked from a job.json, or a ledger-jobs.json row). Only code, address,
   client, coordinates and status are kept — nothing else from the record. ex = the job already in Ledger, if any. */
function jobSite(ex, r, o = {}) {
  const code = String(r.code || r.job_id || r.job || r.jobNumber || '').trim(); if (!code) return null;
  let lat = r.lat ?? r.latitude ?? null, lon = r.lon ?? r.lng ?? r.longitude ?? null, from = lat != null && lon != null ? 'latlon' : null;
  const N = r.spcN ?? r.northing ?? r.N, E = r.spcE ?? r.easting ?? r.E;
  if (!from && N != null && E != null && isFinite(+N) && isFinite(+E) && +N > 1e5 && +E > 1e5) { const p = spcToLl(+N, +E); lat = +p.lat.toFixed(6); lon = +p.lon.toFixed(6); from = 'spc'; }
  const j = ex ? { ...ex } : { id: 'job_' + code.replace(/[^A-Za-z0-9.-]/g, '_'), schema: 1, billTo: 'own', status: 'active', lat: null, lon: null };
  const address = String(r.address || '').trim() || j.address || '';
  if (from) { j.lat = +lat; j.lon = +lon; j.coordFrom = from; }
  else if (ex && address !== (ex.address || '') && ex.coordFrom === 'geocode') { j.lat = null; j.lon = null; j.coordFrom = null; } /* moved: look it up again */
  j.code = code; j.address = address;
  j.client = String(r.client || r.company || '').trim() || j.client || companyFor(code);
  if (o.billTo) j.billTo = o.billTo; else if (r.billTo === 'employer' || r.billTo === 'own') j.billTo = r.billTo;
  if (r.status) j.jobStatus = String(r.status);
  if (o.source) { j.source = o.source; j.externalId = o.source + '|' + code; }
  return j;
}

if (typeof module !== 'undefined') module.exports = { hav, llToSpc, spcToLl, detectTrips, classifyTrip, simulateDay, books, taxOn, quarterly, csvToTxns, uid, ymd, rateOn, placesOf, matchRule, migrateSettings, payeeKey, memoKey, memoFind, companyFor, jobSite };
