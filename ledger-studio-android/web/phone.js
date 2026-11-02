/* ===== Ledger Studio · phone layer =====
   Only active inside the Android app, where window.LedgerNative exists. The native side records GPS points
   while you drive (it starts and stops on its own); this file turns those points into trips with the same
   detector and rules as everything else, and adds what a web page can't do: permissions, "use my location",
   address lookup, saving files and keeping receipt photos. In a browser every function here is a no-op. */
const NATIVE = window.LedgerNative || null;
const N = { state: {}, perms: {}, cbs: {}, syncing: false, lastSync: 0, deferT: null };

function nativeCall(fn, ...args) { try { return NATIVE ? NATIVE[fn](...args.map(String)) : null; } catch (e) { return null; } }
function nativeJSON(fn, ...args) { const r = nativeCall(fn, ...args); try { return r ? JSON.parse(r) : {}; } catch (e) { return {}; } }
function nativeRefresh() { if (!NATIVE) return; N.state = nativeJSON('state'); N.perms = nativeJSON('perms'); }

/* events from Android: window.__ledgerEvt(type, json) */
window.__ledgerEvt = (type, json) => {
  let d = {}; try { d = JSON.parse(json); } catch (e) { }
  if (type === 'track') { N.state = d; if (!d.running) syncTrips(); phoneRefreshUI(); }
  else if (type === 'perms') { N.perms = d; phoneRefreshUI(); }
  else if (type === 'ms') msDone(d);
  else if (type === 'saved') toast(d.ok ? `Saved ${d.name} to ${d.where}.` : d.cancelled ? 'Save cancelled.' : 'Not saved: ' + (d.msg || 'unknown error'));
  else if (N.cbs[type]) { const cb = N.cbs[type]; delete N.cbs[type]; cb(d); }
};
/* Android back button: close a sheet, then go back to Home, then leave the app */
window.__ledgerBack = () => {
  const sh = document.getElementById('sheet');
  if (sh && !sh.hidden) { closeSheet(); return true; }
  if (U.tab !== 'home') { setTab('home'); return true; }
  return false;
};

/* ---------- GPS points → trips ---------- */
async function syncTrips(quiet) {
  if (!NATIVE || !S.loaded || N.syncing) return 0;
  N.syncing = true;
  try {
    nativeRefresh();
    const cur = +S.settings.gpsCursor || 0;
    let pts = []; try { pts = JSON.parse(nativeCall('points', cur) || '[]'); } catch (e) { pts = []; }
    N.lastSync = Date.now();
    if (pts.length < 2) return 0;
    pts.sort((a, b) => a.t - b.t);
    const found = detectTrips(pts, detectOpts()), lastT = pts[pts.length - 1].t, now = Date.now();
    const have = new Set(S.trips.map(t => t.id)), add = [];
    let cursor = cur, waiting = false;
    found.forEach((t, i) => {
      const endT = Date.parse(t.end.t), trailing = i === found.length - 1 && endT >= lastT - 1000;
      /* the last trip may still be going (or you may drive on after a short stop): wait until you've been parked 5 min */
      if (trailing && (N.state.running || now - endT < 5 * 60e3)) { waiting = true; return; }
      cursor = Math.max(cursor, endT);
      const id = 'gps_' + Date.parse(t.start.t);
      if (have.has(id)) return;
      add.push(classifyTrip({ ...t, id, schema: 1, date: ymd(t.start.t), source: 'phone', jobIds: [] }, S));
    });
    if (waiting) { clearTimeout(N.deferT); N.deferT = setTimeout(() => syncTrips(true), 5.5 * 60e3); }
    if (cursor !== cur) { S.settings.gpsCursor = cursor; await Store.putSettings(); nativeCall('prune', cursor - 3 * 86400e3); }
    if (add.length) {
      S.trips.push(...add); await Store.putMany('trips', add); render();
      const rv = add.filter(t => t.cls === 'review').length;
      if (!quiet || add.length) toast(`${add.length} new trip${add.length > 1 ? 's' : ''} from your phone` + (rv ? `, ${rv} to review.` : '.'));
    }
    return add.length;
  } finally { N.syncing = false; }
}

/* When places or jobs change, look again at the GPS points still on the phone (the last few days), so a stop at
   a new place — a school drop-off — splits trips that were already made. Trips you classified yourself stay as they are. */
async function redetectRecent() {
  if (!NATIVE || !S.loaded) return 0;
  const cur = +S.settings.gpsCursor || 0; if (!cur) return 0;
  let pts = []; try { pts = JSON.parse(nativeCall('points', 0) || '[]'); } catch (e) { return 0; }
  pts = pts.filter(q => q.t <= cur).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return 0;
  const first = pts[0].t, inWin = (t) => Date.parse(t.start.t) > first && Date.parse(t.end.t) <= cur; /* the first piece may be half a trip: leave it */
  const old = S.trips.filter(t => t.source === 'phone' && t.start.t && inWin(t)), locked = old.filter(t => t.locked), loose = old.filter(t => !t.locked);
  const overlaps = (t) => locked.some(L => Date.parse(t.start.t) < Date.parse(L.end.t) && Date.parse(t.end.t) > Date.parse(L.start.t));
  const fresh = detectTrips(pts, detectOpts()).filter(t => inWin(t) && !overlaps(t))
    .map(t => classifyTrip({ ...t, id: 'gps_' + Date.parse(t.start.t), schema: 1, date: ymd(t.start.t), source: 'phone', jobIds: [] }, S));
  const sig = (arr) => arr.map(t => t.id + ':' + t.miles).sort().join('|');
  if (sig(loose) === sig(fresh)) return 0;
  const gone = new Set(loose.map(t => t.id)), keepIds = new Set(fresh.map(t => t.id));
  S.trips = S.trips.filter(t => !gone.has(t.id)).concat(fresh);
  for (const id of gone) if (!keepIds.has(id)) await Store.del('trips', id);
  await Store.putMany('trips', fresh);
  return fresh.length;
}

/* ---------- tracking status card (Trips tab, Drive sheet) ---------- */
const PERM_STEPS = [
  ['location', 'Location', 'Allow while using the app.'],
  ['background', 'Location all the time', 'Lets drives be logged with the app closed. Android shows a settings page: pick "Allow all the time".'],
  ['activity', 'Physical activity', 'Lets the phone notice when you start driving, so tracking starts by itself.'],
  ['notifications', 'Notifications', 'Shows "Recording a drive" while a trip is logged, with a Stop button.'],
  ['battery', 'Battery: Unrestricted', 'Samsung puts background apps to sleep; without this, drives can be missed.']
];
function permsMissing() { return PERM_STEPS.filter(([k]) => N.perms[k] === false).length; }
function trackStatusText() {
  const st = N.state || {};
  if (st.mode === 'off') return ['Tracking is off', 'c-personal'];
  if (st.running) return [`Recording a drive since ${tm(new Date(+st.since).toISOString())}`, 'c-ok'];
  if (permsMissing()) return ['Tracking needs permissions', 'c-review'];
  return ['Waiting for your next drive', 'c-business'];
}
function phoneTrackCard() {
  const st = N.state || {}, [txt, pill] = trackStatusText(), miss = permsMissing();
  return `<div class="track-card"><div class="radar">${ic('gps')}</div><div style="display:grid;gap:8px;min-width:0">
    <div><span class="pill ${pill}">${esc(txt)}</span></div>
    <div class="note">Tracking starts by itself when the phone notices you're driving and stops a couple of minutes after you park. Trips appear here, already filed by job and route rules.</div>
    <div class="seg" id="trkMode" role="group" aria-label="Tracking"><button type="button" data-trkmode="auto" aria-pressed="${st.mode !== 'off'}">Automatic</button><button type="button" data-trkmode="off" aria-pressed="${st.mode === 'off'}">Off</button></div>
    <div class="btns">${st.running ? `<button class="chip-btn" data-act="drive-stop">${ic('x')}Stop this drive</button>` : `<button class="chip-btn plum" data-act="drive-start">${ic('drive')}Start a drive now</button>`}
      <button class="chip-btn${miss ? ' plum' : ''}" data-act="perm-sheet">${ic('setup')}${miss ? `Setup: ${miss} step${miss > 1 ? 's' : ''} left` : 'Setup checklist'}</button>
      <button class="chip-btn" data-act="sync-now">${ic('trips')}Check for new trips</button></div></div></div>`;
}
function openPermSheet() {
  nativeRefresh();
  const row = ([k, title, why]) => `<div class="row static" style="grid-template-columns:auto 1fr auto"><div class="when rank">${N.perms[k] ? ic('check') : '·'}</div>
    <div class="main"><div class="title">${esc(title)}</div><div class="sub">${esc(why)}</div></div>
    ${N.perms[k] ? '<span class="pill c-ok">Done</span>' : `<button class="chip-btn plum" data-perm="${k}">Allow</button>`}</div>`;
  openSheet('Tracking setup', `<div class="form" id="permSheet"><div class="list">${PERM_STEPS.map(row).join('')}</div>
    <div class="why">Do them top to bottom. If Android stops asking, use App settings and turn them on there.</div>
    <div class="btns"><button class="btn ghost" data-perm="settings">App settings</button><button class="btn ghost" data-act="trk-log">Tracking log</button></div></div>`);
}
function openTrackLog() {
  const log = nativeCall('log') || '(empty)';
  openSheet('Tracking log', `<div class="form"><div class="why">What the phone did, newest last. Useful if a drive was missed.</div><pre style="max-height:50vh;overflow:auto">${esc(log)}</pre></div>`);
}
function phoneRefreshUI() {
  if (!NATIVE) return;
  if (document.getElementById('permSheet')) openPermSheet();
  if (U.tab === 'trips' || U.tab === 'home') render();
}

/* ---------- "use my location" and address lookup ---------- */
function nativeAsk(fn, evt, arg, ms = 20000) {
  return new Promise((res) => { N.cbs[evt] = res; nativeCall(fn, ...(arg != null ? [arg] : [])); setTimeout(() => { if (N.cbs[evt] === res) { delete N.cbs[evt]; res({ error: 'No answer from the phone.' }); } }, ms); });
}
/* adds "Use my location" / "Find address" buttons under a coordinate field. set(lat, lon) fills the form. */
function phoneLocButtons(id, addrSel) {
  if (!NATIVE) return '';
  return `<div class="btns" data-locfor="${id}"><button type="button" class="chip-btn" data-here="${id}">${ic('gps')}Use my location</button>${addrSel ? `<button type="button" class="chip-btn" data-geo="${id}" data-addr="${addrSel}">${ic('pin')}Find the address</button>` : ''}</div>`;
}
async function phoneLocClick(btn, set) {
  if (btn.dataset.here) {
    btn.disabled = true; toast('Finding your location…');
    const d = await nativeAsk('here', 'here'); btn.disabled = false;
    if (d.error) return toast(d.error);
    set(+d.lat.toFixed(6), +d.lon.toFixed(6)); toast(`Location set (±${Math.round((d.acc || 0) * 3.28)} ft).`);
  } else if (btn.dataset.geo) {
    const q = (document.querySelector(btn.dataset.addr) || {}).value || '';
    if (!q.trim()) return toast('Type the address first.');
    btn.disabled = true; toast('Looking up the address…');
    const d = await nativeAsk('geocode', 'geocode', q.trim()); btn.disabled = false;
    if (d.error || !(d.results || []).length) return toast(d.error || 'Address not found. Add the city and "FL".');
    const r = d.results[0]; set(+r.lat.toFixed(6), +r.lon.toFixed(6)); toast('Found: ' + r.label);
  }
}

/* ---------- saving files and receipts ---------- */
function phoneSave(name, text, mime) {
  if (!NATIVE) return false;
  const bytes = new TextEncoder().encode(text), id = nativeCall('saveBegin', name, mime, 'pick');
  for (let i = 0; i < bytes.length; i += 48000) { let s = ''; const part = bytes.subarray(i, i + 48000); for (let k = 0; k < part.length; k++) s += String.fromCharCode(part[k]); nativeCall('saveChunk', id, btoa(s)); }
  nativeCall('saveEnd', id);
  return true;
}
/* photos are shrunk to ≤1600 px JPEG (a few hundred KB) and kept in the app's own storage */
async function phoneReceipt(file, txId) {
  if (!NATIVE) return null;
  let b64, type = file.type || 'application/octet-stream', ext = 'bin';
  if (type.startsWith('image/')) {
    const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    b64 = c.toDataURL('image/jpeg', 0.72).split(',')[1]; type = 'image/jpeg'; ext = 'jpg';
  } else {
    if (file.size > 8e6) throw new Error('The file is over 8 MB.');
    b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    ext = type === 'application/pdf' ? 'pdf' : 'bin';
  }
  const url = nativeCall('putReceipt', `${txId}.${ext}`, b64);
  if (!url) throw new Error('The phone could not store the file.');
  return { file: `${txId}.${ext}`, url, type };
}

/* keep trips fresh: when the app comes back to the screen */
document.addEventListener('visibilitychange', () => { if (NATIVE && document.visibilityState === 'visible') { nativeRefresh(); syncTrips(true); phoneRefreshUI(); } });

/* ---------- OneDrive work (Integration Spec §5–6): read-only, through the phone ----------
   Sign-in: Microsoft's MSAL, the same app registration as Crew Studio, permission Files.Read only.
   The phone reads GAIA/Jobs/<job_id>/job.json (only job_id, company, status, wo.address) and field/<job_id>.txt
   (only the centre of the points); everything else in job.json stays in OneDrive. Each job becomes a job site. */
const OD = { busy: false };
const OD_DONE = ['cancelled', 'paid'];
function odStatus() { const s = NATIVE ? nativeJSON('msStatus') : {}; return { connected: !!s.signedIn, account: s.account || '' }; }
async function checkOneDriveJobs(opts = {}) {
  if (!NATIVE || OD.busy) return;
  if (!odStatus().connected) { if (!opts.quiet) openOneDrive(); return; }
  OD.busy = true;
  if (!opts.quiet) toast('Checking OneDrive for new work…');
  try {
    const known = opts.all ? {} : (S.settings.odKnown || {});
    const r = await nativeAsk('odJobs', 'odjobs', JSON.stringify({ known, all: !!opts.all }), 10 * 60e3);
    if (r.error) {
      const msg = r.code === 'signin' ? 'Sign in to OneDrive again (Places → OneDrive).' : r.code === 'offline' ? 'No signal: OneDrive will be checked next time.' : r.code === 'nofolder' ? 'There is no GAIA/Jobs folder in this OneDrive.' : 'OneDrive: ' + r.error;
      if (!opts.quiet || r.code === 'signin') toast(msg);
      return;
    }
    const next = { ...known }, rows = [];
    let waiting = 0, located = 0;
    for (const it of r.items || []) {
      if (it.etag == null) { waiting++; continue; } /* no job.json yet: it is still being made */
      const k = next[it.name] = { ...(next[it.name] || {}), j: it.etag };
      if (it.job) { k.code = it.job.code; k.status = it.job.status; }
      if (it.pEtag) k.p = it.pEtag;
      const code = k.code || it.name, ex = S.jobs.find(j => j.code === code);
      if (!it.job && !it.center) continue;
      if (!it.job && !ex) continue; /* points for a job you deleted here: leave it deleted */
      const row = { ...(it.job || { code }) };
      if (it.center) { row.pointsN = it.center.spcN; row.pointsE = it.center.spcE; located++; }
      rows.push(row);
      k.wantPoints = !OD_DONE.includes(k.status || '');
    }
    for (const name of Object.keys(next)) if (next[name].wantPoints === undefined) next[name].wantPoints = !OD_DONE.includes(next[name].status || '');
    const res = await applyJobRecords(rows, { source: 'onedrive', reimburse: S.settings.reimburse || {} });
    S.settings.odKnown = next; S.settings.odLast = new Date().toISOString(); S.settings.odCount = (r.items || []).length;
    await Store.putSettings();
    const n = res.changed ? await reclassify() : 0;
    render(); if (document.getElementById('odSheet')) openOneDrive();
    const parts = [];
    if (res.added) parts.push(`${res.added} new job${res.added > 1 ? 's' : ''}`);
    if (res.updated) parts.push(`${res.updated} updated`);
    if (located) parts.push(`${located} placed from field points`);
    if (res.noCoords) parts.push(`${res.noCoords} without a location (open the job and add it)`);
    if (waiting) parts.push(`${waiting} folder${waiting > 1 ? 's' : ''} without a job.json yet`);
    if (parts.length || !opts.quiet) toast((parts.length ? parts.join(', ') : 'No new work') + ' from OneDrive.' + (n ? ` ${n} trips re-filed.` : ''));
  } finally { OD.busy = false; }
}
async function msDone(d) {
  if (d.ok) {
    toast('OneDrive connected' + (d.account ? ` (${d.account})` : '') + '. Checking for work…');
    if (document.getElementById('odSheet')) openOneDrive();
    await checkOneDriveJobs({ all: !S.settings.odLast });
  } else {
    if (d.signedOut) toast('Signed out of OneDrive. Job sites stay in Ledger.');
    else if (d.cancelled) toast('Sign-in cancelled.');
    else toast(d.code === 'offline' ? 'No signal. Try again when you have internet.' : 'Sign-in failed: ' + (d.error || 'unknown error'));
    if (document.getElementById('odSheet')) openOneDrive();
  }
}
function openOneDrive() {
  const s = S.settings, st = odStatus();
  const last = s.odLast ? `Last checked ${dlab(s.odLast.slice(0, 10), { month: 'short', day: 'numeric' })} at ${tm(s.odLast)} · ${s.odCount || 0} job folders` : 'Not checked yet';
  const odJobs = S.jobs.filter(j => j.source === 'onedrive'), fromPts = odJobs.filter(j => j.coordFrom === 'points').length;
  const paying = Object.keys(s.reimburse || {}).filter(k => s.reimburse[k]);
  openSheet('OneDrive work', `<div class="form" id="odSheet">
    ${NATIVE ? '' : `<div class="why">OneDrive is read by the Android app. Here you can import <b>ledger-jobs.json</b> instead.</div>`}
    <div class="row static" style="grid-template-columns:auto 1fr"><div class="when rank">${ic('files')}</div><div class="main">
      <div class="title">${st.connected ? 'Connected' + (st.account ? ' · ' + esc(st.account) : '') : 'Not connected'}</div>
      <div class="sub">${st.connected ? esc(last) + ` · ${odJobs.length} job sites, ${fromPts} placed from field points` : 'Reads GAIA/Jobs: each job\'s job.json (job number, company, status, address) and the centre of its field points. Read-only.'}</div></div></div>
    <div class="why">Survey jobs are your own contract work (1099): the miles are deductible, and the company that hires you is the client. ${paying.length ? `Paying your mileage: <b>${paying.map(esc).join(', ')}</b> (their jobs count as employer jobs).` : 'If a company pays your mileage, mark it in Setup → Companies.'}</div>
    ${NATIVE ? (st.connected
      ? `<div class="btns"><button class="btn" data-act="od-check">${ic('trips')}Check for new work</button><button class="btn ghost" data-act="od-all">Re-read all jobs</button><button class="btn danger" data-act="od-off">Sign out</button></div>`
      : `<div class="btns"><button class="btn" data-act="od-connect">${ic('check')}Connect OneDrive</button></div>
    <div class="why">Microsoft's sign-in page opens once; after that the app renews access by itself. Ledger Studio asks only to <b>read</b> files.</div>`) : ''}
    <div class="btns"><button class="btn ghost" data-act="imp-jobs">${ic('up')}Import ledger-jobs.json instead</button></div></div>`);
}
function odAction(act) {
  if (act === 'od-sheet') return openOneDrive();
  if (act === 'od-check') { closeSheet(); return checkOneDriveJobs(); }
  if (act === 'od-all') { closeSheet(); return checkOneDriveJobs({ all: true }); }
  if (act === 'od-off') return nativeCall('msSignOut');
  if (act === 'od-connect') { nativeCall('msSignIn'); toast('Opening Microsoft sign-in…'); }
}

/* ---------- pull down to check for new trips and work ---------- */
async function refreshFromPhone() { await syncTrips(); if (odStatus().connected) await checkOneDriveJobs(); else toast(N.state.running ? 'A drive is being recorded; it appears after you park.' : 'Up to date.'); }
(function pullToRefresh() {
  if (!NATIVE) return;
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true'); document.body.append(ind);
  let y0 = null, ready = false;
  addEventListener('touchstart', (e) => { const sh = document.getElementById('sheet'); y0 = scrollY <= 0 && (!sh || sh.hidden) && e.touches.length === 1 && !(e.target && e.target.closest && e.target.closest('.swipe')) ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy < 12) return;
    ready = dy > 90; ind.classList.add('on'); ind.style.transform = `translate(-50%, ${Math.min(dy, 140) * 0.6}px)`;
    ind.textContent = ready ? 'Release to check for new trips and work' : 'Pull to check for new trips and work';
  }, { passive: true });
  addEventListener('touchend', () => { if (y0 == null) return; y0 = null; ind.classList.remove('on'); ind.style.transform = ''; if (ready) { ready = false; refreshFromPhone(); } }, { passive: true });
})();
/* back to the app after a while: check OneDrive again (at most every 15 minutes) */
document.addEventListener('visibilitychange', () => {
  if (NATIVE && document.visibilityState === 'visible' && (!S.settings.odLast || Date.now() - Date.parse(S.settings.odLast) > 15 * 60e3) && odStatus().connected) checkOneDriveJobs({ quiet: true });
});
