/* Checks for the trip, rule and tax logic. Run: node web/core.test.js  (the cloud build runs it before building the app) */
const C = require('./core.js');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const HOME = { lat: 26.9842, lon: -82.0995 }, SCHOOL = { lat: 26.9700, lon: -82.0700 }, WIFE = { lat: 26.9560, lon: -82.0560 }, JOB = { lat: 26.918, lon: -82.079 };
const S = {
  settings: { home: { label: 'Home', ...HOME }, radiusFt: 600, homeOffice: true, rates: [{ from: '2026-01-01', cents: 72.5 }], filing: 'single', w2Wages: 0, ssWageBase: 184500,
    places: [{ id: 'pl_school', label: 'School', ...SCHOOL }, { id: 'pl_wife', label: 'Wife', ...WIFE }],
    rules: [{ id: 'r1', a: 'home', b: 'pl_school', both: true, cls: 'commute' }, { id: 'r2', a: 'home', b: 'pl_wife', both: true, cls: 'commute' }, { id: 'r3', a: 'pl_wife', b: 'pl_school', both: true, cls: 'commute' }] },
  jobs: [{ id: 'j1', code: 'S-101', ...JOB }, { id: 'j2', code: 'C-1', lat: 27.044, lon: -82.235, billTo: 'employer' }], trips: [], txns: []
};
const opt = { places: C.placesOf(S), shortStopRadiusFt: 250 };
const run = (pts) => C.detectTrips(pts, opt).map(t => C.classifyTrip(t, S));

/* simple road day: points every 5 s */
function day(build) {
  let t = Date.parse('2026-10-30T07:00:00-04:00'); const pts = [];
  const wait = (p, min) => { for (let i = 0; i < min * 12; i++) { pts.push({ lat: p.lat, lon: p.lon, t }); t += 5000; } };
  const drive = (a, b, mph = 32) => { const d = C.hav([a.lat, a.lon], [b.lat, b.lon]), n = Math.max(2, Math.ceil(d / 0.05)); for (let q = 1; q <= n; q++) { t += (d / n) / mph * 3600e3; pts.push({ lat: a.lat + (b.lat - a.lat) * q / n, lon: a.lon + (b.lon - a.lon) * q / n, t }); } };
  build(wait, drive); return pts;
}

/* 1. school run then a job */
let tr = run(day((w, d) => { w(HOME, 5); d(HOME, WIFE); w(WIFE, 2); d(WIFE, SCHOOL); w(SCHOOL, 1.5); d(SCHOOL, HOME); w(HOME, 30); d(HOME, JOB); w(JOB, 60); d(JOB, HOME); w(HOME, 5); }));
ok(tr.length === 5, `school run + job day gives 5 trips (got ${tr.length})`);
ok(tr.slice(0, 3).every(t => t.cls === 'commute'), 'home → wife → school → home are commute by rules');
ok(tr[3].cls === 'business' && tr[4].cls === 'business', 'home ↔ job are business');

/* 2. red light 400 ft from the school must not split a business trip */
const LIGHT = { lat: SCHOOL.lat + 0.0011, lon: SCHOOL.lon };
tr = run(day((w, d) => { w(HOME, 5); d(HOME, LIGHT); w(LIGHT, 1.5); d(LIGHT, JOB); w(JOB, 10); }));
ok(tr.length === 1 && tr[0].cls === 'business', `red light near a saved place keeps one business trip (got ${tr.map(t => t.cls)})`);

/* 3. employer jobs are not deductible */
tr = run(day((w, d) => { w(HOME, 5); d(HOME, S.jobs[1]); w(S.jobs[1], 30); }));
ok(tr[0].cls === 'employer', 'employer job trip is filed as Employer job');

/* 4. one-way rule does not cover the return */
const S2 = JSON.parse(JSON.stringify(S)); S2.settings.rules = [{ id: 'g', a: 'home', b: 'pl_school', both: false, cls: 'personal' }];
ok(C.matchRule('home', 'pl_school', S2.settings.rules) && !C.matchRule('pl_school', 'home', S2.settings.rules), 'one-way rule matches only its direction');

/* 5. State Plane round trip (FL West, US ft) */
const p = C.llToSpc(26.93, -82.05), q = C.spcToLl(p.N, p.E);
ok(near(q.lat, 26.93, 1e-8) && near(q.lon, -82.05, 1e-8), 'FL West SPC ↔ lat/lon round trip');

/* 6. taxes: transfers are not income; mileage at the dated rate */
const B = { settings: { rates: [{ from: '2026-01-01', cents: 72.5 }, { from: '2026-07-01', cents: 76 }] }, txns: [
  { date: '2026-03-01', kind: 'income', amount: 1000, line: '1' }, { date: '2026-03-02', kind: 'income', amount: 500, line: 'transfer' },
  { date: '2026-03-03', kind: 'expense', amount: 100, line: '24b' }, { date: '2026-03-04', kind: 'expense', amount: 60, line: 'vehicle' }],
  trips: [{ date: '2026-02-01', miles: 10, cls: 'business' }, { date: '2026-08-01', miles: 10, cls: 'business' }, { date: '2026-08-02', miles: 10, cls: 'commute' }] };
const bk = C.books(B, 2026);
ok(bk.income === 1000, 'transfer deposit is not counted as income');
ok(near(bk.mileDed, 14.85, 0.001), 'mileage uses the rate in force on each date (7.25 + 7.60)');
ok(near(bk.expenses, 14.85 + 50, 0.001), 'meals at 50%, fuel not deducted on top of the mileage rate');

/* 7. bank CSV: duplicates kept apart, merchant memory, Wells Fargo layout */
const csv = 'Transaction Date,Post Date,Description,Category,Type,Amount\n10/02/2026,10/03/2026,HOME DEPOT #123,,Sale,-38.47\n10/02/2026,10/03/2026,HOME DEPOT #123,,Sale,-38.47\n10/05/2026,10/05/2026,Payment Thank You-Mobile,,Payment,500.00\n';
const r = C.csvToTxns(csv, 'x.csv', { 'expense|home depot': '22' });
ok(r.txns.length === 3 && r.txns[0].externalId !== r.txns[1].externalId, 'two equal charges on one day stay two');
ok(r.txns[0].status === 'ok' && r.txns[0].line === '22', 'remembered merchant is filed without review');
ok(r.txns[2].line === 'transfer', 'card payment is marked not income');
ok(C.memoFind({ 'expense|home depot': '22' }, 'expense', 'HOME DEPOT 4410 PORT CHARLOTTE') === '22', 'merchant memory ignores store number and city');
ok(C.csvToTxns('"10/07/2026","-52.10","*","","SHELL OIL 57444"\n', 'wf.csv').txns[0].amount === 52.1, 'Wells Fargo file without a header row');

/* 8. GAIA jobs: company from the WO prefix; survey jobs are own contract work; position from the field points */
ok(C.companyFor('B-177608') === 'M.E. Land Surveying, Inc.' && C.companyFor('O-155343') === 'OnlineLand Surveyors, Inc.' && C.companyFor('2610.0193') === 'LandMark' && C.companyFor('123456') === 'Target' && C.companyFor('X-1') === '', 'company from the job number prefix (§3)');
const ctr = C.llToSpc(27.0442, -82.2359);
let js = C.jobSite(null, { code: 'B-177608', address: '4245 Avanti Circle, North Port, FL 34287', company: 'M.E. Land Surveying, Inc.', status: 'ordered', buyer: 'Jane Doe' }, { source: 'onedrive' });
ok(js.billTo === 'own' && js.client === 'M.E. Land Surveying, Inc.' && js.lat == null, 'job.json job: own contract work, client = company, no position yet (address lookup next)');
ok(!('buyer' in js) && !JSON.stringify(js).includes('Jane'), 'nothing but the picked fields is kept');
const geo = { ...js, lat: 27.05, lon: -82.24, coordFrom: 'geocode' };
const withPts = C.jobSite(geo, { code: 'B-177608', pointsN: ctr.N, pointsE: ctr.E }, { source: 'onedrive' });
ok(withPts.coordFrom === 'points' && near(withPts.lat, 27.0442, 1e-6) && near(withPts.lon, -82.2359, 1e-6) && withPts.address === js.address, 'points file appears → position moves to the centre of the points');
ok(C.jobSite(withPts, { code: 'B-177608', address: '9 Other Rd' }, { source: 'onedrive' }).coordFrom === 'points', 'later job.json changes keep the points position');
ok(C.jobSite({ ...geo, coordFrom: 'manual' }, { code: 'B-177608', pointsN: ctr.N, pointsE: ctr.E }, { source: 'onedrive' }).lat === 27.05, 'a location set by hand is kept');
ok(C.jobSite(geo, { code: 'B-177608', address: '9 Other Rd' }, { source: 'onedrive' }).lat == null, 'changed address is looked up again');
ok(C.jobSite(null, { code: 'O-155343', address: '1 Main St', billTo: 'employer' }, { source: 'ledger-jobs' }).billTo === 'own', 'ledger-jobs.json "employer" rows are own contract work too');
ok(C.jobSite(null, { code: 'O-155343', address: '1 Main St' }, { source: 'onedrive', reimburse: { 'OnlineLand Surveyors, Inc.': true } }).billTo === 'employer', 'a company marked as paying the mileage makes its jobs Employer jobs');
const SJ = { settings: S.settings, jobs: [{ id: 'job_B-1', code: 'B-1', lat: JOB.lat, lon: JOB.lon, source: 'onedrive', billTo: 'own' }], trips: [
  { id: 't1', cls: 'employer', locked: true, source: 'phone', jobIds: ['job_B-1'], start: { lat: HOME.lat, lon: HOME.lon }, end: { lat: JOB.lat, lon: JOB.lon }, miles: 5 },
  { id: 't2', cls: 'employer', source: 'manual', jobIds: ['job_B-1'], start: { label: 'Home' }, end: { label: 'B-1' }, miles: 7 },
  { id: 't3', cls: 'personal', source: 'phone', jobIds: [], start: {}, end: {}, miles: 2 }] };
const fixed = C.refileOwnJobTrips(SJ);
ok(fixed.length === 2 && SJ.trips[0].cls === 'business' && SJ.trips[1].cls === 'business' && SJ.trips[1].purpose === 'Boundary survey – B-1' && SJ.trips[2].cls === 'personal', 'trips filed as Employer job for own survey jobs are re-filed as business');

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
