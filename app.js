// UI layer. All chain logic lives in lib/scan.js; this file only renders.
// Nothing here can sign or send a transaction: there is no wallet code at all.

import { CHAINS, explorerAddressUrl } from './chains.js';
import { TIP_ADDRESS, TIP_ENS, PRICE_API } from './config.js';
import { loadRegistry, scanChain, analyzeFinding, outSymbol, outDecimals, amountsMatch, heldToken, holdingLabel, makeClient } from './lib/scan.js';
import { resolveNames, normalizeName } from './lib/ens.js';
import { checkAddress, isAddress, toChecksumAddress, formatUnits, parseFraction } from './lib/evm.js';
import qrcode from './lib/vendor/qrcode.mjs';

const MAX_ADDRESSES = 100;
const SIM_CONCURRENCY = 3;
const MAX_FILE_BYTES = 2_000_000;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const chainName = (id) => (CHAINS[id] ? CHAINS[id].name : `Chain ${id}`);
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

let registry = { entries: [], files: [] };
let running = false;

/* ------------------------------------------------------------ bootstrap */

init();

async function init() {
  document.addEventListener('click', onCopyClick);
  setInterval(tickCountdowns, 60000);
  $('#form').addEventListener('submit', onSubmit);
  const ta = $('#addresses');
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); $('#form').requestSubmit(); }
  });
  ta.addEventListener('input', () => { autosize(ta); showInputError(''); scheduleStatus(); });
  // Batch input: upload a .csv/.txt, or drop it on the search bar
  $('#upload').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) loadList(f);
  });
  const form = $('#form');
  const hasFiles = (ev) => ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
  form.addEventListener('dragover', (ev) => { if (hasFiles(ev)) { ev.preventDefault(); form.classList.add('dragging'); } });
  form.addEventListener('dragleave', (ev) => { if (!form.contains(ev.relatedTarget)) form.classList.remove('dragging'); });
  form.addEventListener('drop', (ev) => {
    form.classList.remove('dragging');
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) { ev.preventDefault(); loadList(f); }
  });
  renderTip();
  try {
    registry = await loadRegistry('data/');
  } catch {
    registry = { entries: [], files: [], skipped: [], usedSample: false };
  }
  renderRegistryInfo();
  loadStats();
  $('#submit').disabled = registry.entries.length === 0;
  const q = new URLSearchParams(location.search).get('address');
  if (q) { ta.value = q; autosize(ta); updateStatus(); $('#form').requestSubmit(); }
}

// Fallback for browsers without CSS field-sizing
function autosize(ta) {
  if (CSS.supports && CSS.supports('field-sizing', 'content')) return;
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight}px`;
}

function renderRegistryInfo() {
  const { entries, skipped } = registry;
  if (skipped && skipped.length) console.warn('Skipped registry entries', skipped);
  const chains = [...new Set(entries.map((e) => e.chainId))];
  const openPaths = entries.filter((e) => (e.status || 'open') === 'open').length;
  $('#stat-paths').textContent = openPaths ? num(openPaths) : '—';
  $('#stat-chains').textContent = chains.length ? num(chains.length) : '—';
  const SHORT = { 1: 'Ethereum', 137: 'Polygon', 42161: 'Arbitrum', 10: 'Optimism', 8453: 'Base', 56: 'BNB', 43114: 'Avalanche', 100: 'Gnosis' };
  $('#stat-chains-desc').textContent = chains.length ? `${listJoin(chains.map((id) => SHORT[id] || chainName(id)))}.` : '';
  $('#routes-count').textContent = num(entries.length);

  const byChain = groupBy(entries, (e) => e.chainId);
  $('#routes').innerHTML = entries.length
    ? [...byChain].map(([cid, list]) => `
      <div>
        <h3>${esc(chainName(cid))}</h3>
        <ul>${list.map((e) => `<li><span>${esc(e.name)}</span><span>${esc(e.project || '')}</span></li>`).join('')}</ul>
      </div>`).join('')
    : '<p class="fine">The migration list could not be loaded.</p>';
}

async function loadStats() {
  try {
    const res = await fetch('data/stats.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const s = await res.json();
    if (typeof s.unmigratedUsd === 'number') $('#stat-usd').textContent = usdCompact(s.unmigratedUsd);
    if (typeof s.rejected === 'number') $('#stat-rejected').textContent = num(s.rejected);
    if (s.asOf) {
      $('#foot-meta').textContent = `Not investment advice. Prices from DefiLlama. Headline figures as of ${s.asOf}${s.ethBlock ? ` (Ethereum block ${num(s.ethBlock)})` : ''}.`;
      $('#stat-usd').title = s.method || '';
    }
  } catch {
    $('#stat-usd').closest('.stat').hidden = true;
  }
}

/* ------------------------------------------------------------- tip jar */

/** A compact coffee strip above the footer; stays hidden until TIP_ADDRESS is set in config.js. */
function renderTip() {
  const addr = TIP_ADDRESS && isAddress(TIP_ADDRESS) ? toChecksumAddress(TIP_ADDRESS) : null;
  if (!addr) return;
  const el = $('#tip');
  el.innerHTML = `
    <a class="coffee-qr" href="ethereum:${esc(addr)}" aria-label="Open the coffee fund address in a wallet app">${qrSvg(addr)}</a>
    <div class="coffee-body">
      <p class="coffee-title">Found something you forgot about? Buy me a coffee.</p>
      <p class="coffee-sub">Free, no wallet connection, no fee skimmed. Any EVM chain, any token.</p>
      <p class="coffee-addr">${TIP_ENS ? `<span class="coffee-ens">${esc(TIP_ENS)}</span> ` : ''}<span class="mono" id="tip-addr">${esc(addr)}</span>
        <button type="button" class="copy" data-copy="${esc(addr)}">Copy</button></p>
    </div>`;
  el.hidden = false;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  }
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><path d="${d}" fill="#0b0d13"/></svg>`;
}

/* ------------------------------------------------------------- input */

const ADDRESS_RE = /(^|[^0-9a-zA-Z])(0x[0-9a-fA-F]{40})(?![0-9a-zA-Z])/g;
const NEAR_RE = /(^|[^0-9a-zA-Z])(0x(?:[0-9a-fA-F]{20,39}|[0-9a-fA-F]{41,50}))(?![0-9a-zA-Z])/g;
// Anything ending in .eth; a URL or query prefix (app.ens.domains/foo.eth, ?id=foo.eth) is cut off
const NAME_RE = /(^|[\s,;"'(])([^\s,;"'()]+\.eth)(?=$|[\s,;"'.):])/gi;

/**
 * Pull every EVM address out of free text: one per line, comma lists, a spreadsheet column,
 * explorer URLs, a CSV export. Text sharing a line with exactly one address becomes its label
 * ("Cold wallet: 0x…"). Labels never leave the browser.
 */
function parseAddresses(text) {
  const valid = [];
  const labels = new Map();
  const skipped = [];
  const seen = new Set();
  const names = []; // ENS names, resolved when the check starts: [{ name, label }]
  const badNames = [];
  const seenNames = new Set();
  let dupes = 0;
  for (const line of text.split(/\r?\n/)) {
    const found = [...line.matchAll(ADDRESS_RE)].map((m) => m[2]);
    const raw = [...line.matchAll(NAME_RE)].map((m) => m[2]);
    // Free text on a line is a label only when the line holds exactly one address or name;
    // "a.eth, 0x…" or "0x…, 0x…" are lists, not labels
    const single = found.length + raw.length === 1;
    for (const a of found) {
      if (checkAddress(a) === 'bad-checksum') { skipped.push(a); continue; }
      const cs = toChecksumAddress(a);
      if (seen.has(cs)) { dupes++; continue; }
      seen.add(cs);
      valid.push(cs);
      const label = single ? cleanLabel(line.replace(a, ' ')) : '';
      if (label) labels.set(cs, label);
    }
    for (const r of raw) {
      const name = normalizeName(r.split(/[/=?#@]/).pop());
      if (!name) { badNames.push(r); continue; }
      if (seenNames.has(name)) { dupes++; continue; }
      seenNames.add(name);
      const rest = single ? cleanLabel(line.replace(r, ' ')) : '';
      names.push({ name, label: rest ? `${rest} (${name})` : name });
    }
  }
  const near = [...text.matchAll(NEAR_RE)].map((m) => m[2]);
  return { valid, labels, skipped, dupes, near, names, badNames, empty: !text.trim() };
}

/** "  Cold wallet:  " -> "Cold wallet"; drops URLs, numbers and other non-labels */
function cleanLabel(rest) {
  const t = rest.replace(/\S*(?:https?:\/\/|www\.)\S*/gi, ' ').replace(/["'`]/g, ' ').replace(/[\s,;|:=\t]+/g, ' ').trim();
  if (!t || t.length > 40 || /\/|https?|www\./i.test(t) || !/[a-z]/i.test(t)) return '';
  return t;
}

function batchNotes(p) {
  const out = [];
  if (p.dupes) out.push(`${plural(p.dupes, 'duplicate')} removed`);
  if (p.skipped.length) out.push(`${num(p.skipped.length)} skipped because the checksum doesn't match (${p.skipped.slice(0, 2).map(short).join(', ')}${p.skipped.length > 2 ? '…' : ''})`);
  if (p.valid.length && p.near.length) out.push(`${num(p.near.length)} ignored, not a full address`);
  if (p.badNames.length) out.push(`${num(p.badNames.length)} ENS ${p.badNames.length === 1 ? 'name' : 'names'} with emoji or accents skipped (not supported yet)`);
  return out;
}

function noAddressError(p) {
  if (p.empty) return 'Paste at least one wallet address to check.';
  if (p.skipped.length) return `${short(p.skipped[0])} has a mixed-case checksum that doesn't match — there may be a typo.`;
  if (p.badNames.length) return `ENS names with emoji or accents (like ${p.badNames[0]}) aren't supported yet. Paste the 0x address instead.`;
  if (p.near.length) return `"${p.near[0].length > 50 ? `${p.near[0].slice(0, 50)}…` : p.near[0]}" isn't a full EVM address (0x followed by 40 hex characters).`;
  return 'No EVM address found. Paste addresses that start with 0x followed by 40 hex characters.';
}

let statusTimer;
function scheduleStatus() { clearTimeout(statusTimer); statusTimer = setTimeout(updateStatus, 120); }

/** One quiet line under the search bar once a list is pasted: how many will be checked, what was dropped */
function updateStatus() {
  const el = $('#addr-status');
  const p = parseAddresses($('#addresses').value);
  const n = p.valid.length + p.names.length;
  if (n > MAX_ADDRESSES) {
    el.dataset.tone = 'bad';
    el.innerHTML = `<b>${num(n)}</b> addresses. The limit is ${MAX_ADDRESSES} per check, so split the list.`;
    el.hidden = false;
    return;
  }
  delete el.dataset.tone;
  const notes = batchNotes(p);
  if (n < 2 && !notes.length && !p.names.length) { el.hidden = true; return; }
  const parts = [];
  if (p.valid.length) parts.push(`<b>${num(p.valid.length)}</b> ${p.valid.length === 1 ? 'address' : 'addresses'}`);
  if (p.names.length) parts.push(`<b>${num(p.names.length)}</b> ENS ${p.names.length === 1 ? 'name' : 'names'}`);
  el.innerHTML = `${parts.length ? `${parts.join(' and ')} ready to check` : ''}${notes.length ? `<span class="muted">${n ? ' · ' : ''}${esc(notes.join(' · '))}</span>` : ''}`;
  el.hidden = false;
}

/** A dropped or uploaded .csv/.txt: keep only the addresses (with labels), one per line */
async function loadList(file) {
  const ta = $('#addresses');
  if (file.size > MAX_FILE_BYTES) return showInputError(`${file.name} is over 2 MB. Paste the addresses instead, or split the file.`);
  let text;
  try { text = await file.text(); } catch { return showInputError(`Couldn't read ${file.name}.`); }
  const p = parseAddresses(text);
  if (!p.valid.length && !p.skipped.length && !p.names.length) return showInputError(`No EVM addresses or ENS names found in ${file.name}.`);
  showInputError('');
  ta.value = [
    ...p.valid.map((a) => (p.labels.has(a) ? `${p.labels.get(a)}: ${a}` : a)),
    ...p.names.map((n) => (n.label !== n.name ? `${n.label.replace(` (${n.name})`, '')}: ${n.name}` : n.name)),
    ...p.skipped,
  ].join('\n');
  autosize(ta);
  updateStatus();
  // What the file had that the tidy list no longer shows (shown until the list is edited)
  const dropped = batchNotes({ ...p, skipped: [] });
  if (dropped.length) {
    const el = $('#addr-status');
    el.insertAdjacentHTML('beforeend', `<span class="muted"> · in the file: ${esc(dropped.join(' · '))}</span>`);
    el.hidden = false;
  }
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
  toast(`Loaded ${plural(p.valid.length + p.names.length, 'address', 'addresses')} from ${file.name}`);
}

function showInputError(msg) {
  const el = $('#input-error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function onSubmit(ev) {
  ev.preventDefault();
  if (running) return;
  const parsed = parseAddresses($('#addresses').value);
  const count = parsed.valid.length + parsed.names.length;
  if (!count) return showInputError(noAddressError(parsed));
  if (count > MAX_ADDRESSES) return showInputError(`That's ${num(count)} addresses. You can check up to ${MAX_ADDRESSES} at once, so split the list.`);
  showInputError('');
  running = true;
  const btn = $('#submit');
  btn.disabled = true;
  btn.dataset.busy = 'true';
  btn.textContent = parsed.names.length ? 'Resolving' : 'Checking';
  try {
    const users = [...parsed.valid];
    const labels = new Map(parsed.labels);
    if (parsed.names.length) {
      let res;
      try { res = await resolveNames(makeClient(1), parsed.names.map((n) => n.name)); }
      catch (e) { res = parsed.names.map((n) => ({ name: n.name, address: null, error: e.message })); }
      const failed = [];
      res.forEach((r, i) => {
        if (!r.address) { failed.push(r); return; }
        if (!users.includes(r.address)) users.push(r.address);
        if (!labels.has(r.address)) labels.set(r.address, parsed.names[i].label);
      });
      if (failed.length) {
        const why = failed.find((f) => f.error && f.error !== 'unsupported name');
        showInputError(`${listJoin(failed.map((f) => f.name))} ${failed.length === 1 ? "doesn't" : "don't"} resolve to an address${why ? ` (${why.error})` : ''}${users.length ? ', so it was skipped' : ''}.`);
      }
      if (!users.length) return;
      btn.textContent = 'Checking';
    }
    await runScan(users, labels);
  } finally {
    running = false;
    btn.disabled = false;
    btn.dataset.busy = 'false';
    btn.textContent = 'Check';
  }
}

/* -------------------------------------------------------------- scan */

let lastScan = null; // for the CSV and calendar downloads
let currentLabels = new Map();

async function runScan(users, labels = new Map()) {
  currentLabels = labels;
  calByCard.clear();
  const byChain = groupBy(registry.entries, (e) => e.chainId);
  const chainIds = [...byChain.keys()];
  const multi = users.length > 1;
  const showHead = multi || labels.has(users[0]);

  $('#progress').hidden = false;
  $('#progress-note').textContent = '';
  $('#chain-list').innerHTML = chainIds.map((id) => `
    <li id="chain-${id}" class="chain" data-state="pending">
      <span class="dot" aria-hidden="true"></span>
      <span>${esc(chainName(id))}</span>
      <span class="chain-state">waiting</span>
    </li>`).join('');

  const results = $('#results');
  results.innerHTML = `
    <div class="summary" id="summary">
      <h2>Checking ${multi ? plural(users.length, 'address', 'addresses') : esc(labels.get(users[0]) || short(users[0]))}…</h2>
      <p>Reading balances for ${plural(registry.entries.length, 'migration path')} on ${plural(chainIds.length, 'chain')}.</p>
    </div>
    ${users.map((u) => `
      <section class="addr-group" id="addr-${u}" aria-label="Results for ${esc(labels.get(u) || u)}"${multi ? ' hidden' : ''}>
        ${showHead ? `<header class="addr-head">${labels.has(u) ? `<span class="addr-label">${esc(labels.get(u))}</span>` : ''}<span class="mono">${esc(u)}</span><span class="addr-count"></span></header>` : ''}
        <div class="cards"></div>
      </section>`).join('')}`;

  const all = [];
  // The results render below the stats row; bring them into view so the user watches them resolve
  $('#progress').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });

  const failedChains = [];
  const unsupportedSim = new Set();

  await Promise.all(chainIds.map(async (chainId) => {
    const entries = byChain.get(chainId);
    setChain(chainId, 'scanning', 'reading balances');
    const scan = await scanChain(chainId, entries, users);
    if (!scan.ok) {
      failedChains.push(chainId);
      setChain(chainId, 'error', "couldn't check", scan.error);
      return;
    }
    const n = scan.findings.length;
    if (!n) {
      setChain(chainId, 'done', scan.unknown ? `done · ${scan.unknown} unreadable` : 'nothing held');
      return;
    }
    for (const f of scan.findings) insertCard(f, pendingCard(f));
    let done = 0;
    setChain(chainId, 'simulating', `simulating 0/${n}`);
    await mapLimit(scan.findings, SIM_CONCURRENCY, async (f) => {
      let r;
      try { r = await analyzeFinding(f, scan); }
      catch (e) { r = { ...f, status: 'sim-unavailable', sim: { supported: true, ok: false, error: e.message, calls: [] } }; }
      if (r.status === 'sim-unavailable') unsupportedSim.add(chainId);
      all.push(r);
      insertCard(f, resultCard(r, null), true);
      done++;
      setChain(chainId, done === n ? 'done' : 'simulating', done === n ? `found ${n}` : `simulating ${done}/${n}`);
      if (done === n) document.getElementById(`chain-${chainId}`)?.setAttribute('data-found', 'true');
    });
  }));

  // Prices last, in one request, then re-render with USD values
  const prices = await fetchPrices(all);
  for (const r of all) insertCard(r, resultCard(r, prices));

  const checkedLine = `Checked ${plural(registry.entries.length, 'migration path')} on ${plural(chainIds.length - failedChains.length, 'chain')}${failedChains.length ? ` — ${listJoin(failedChains.map(chainName))} couldn't be checked, try again later` : ''}.`;
  if (!multi) {
    if (!all.length) {
      document.getElementById(`addr-${users[0]}`).querySelector('.cards').innerHTML = `
        <div class="empty">
          <p><strong>Nothing to migrate.</strong></p>
          <p>${checkedLine}</p>
        </div>`;
    }
  } else {
    // Addresses with something to migrate first, most valuable first; the rest fold into one line
    const tally = new Map(users.map((u) => [u, { n: 0, usd: 0 }]));
    for (const r of all) {
      const t = tally.get(r.user);
      t.n++;
      if (r.status === 'ready') t.usd += usdFor(r, prices).usd || 0;
    }
    const found = users.filter((u) => tally.get(u).n)
      .sort((a, b) => tally.get(b).usd - tally.get(a).usd || tally.get(b).n - tally.get(a).n);
    for (const u of found) {
      const sec = document.getElementById(`addr-${u}`);
      const t = tally.get(u);
      sec.querySelector('.addr-count').textContent = `${plural(t.n, 'migration')}${t.usd > 0 ? ` · about ${usdCompact(t.usd, true)} ready` : ''}`;
      sec.hidden = false;
      results.appendChild(sec);
    }
    const empty = users.filter((u) => !tally.get(u).n);
    for (const u of empty) document.getElementById(`addr-${u}`).remove();
    if (empty.length) {
      results.insertAdjacentHTML('beforeend', `
        <details class="empty empty-list">
          <summary><strong>Nothing to migrate in ${found.length ? '' : 'any of '}${plural(empty.length, 'address', 'addresses')}.</strong> <span class="link">Show ${empty.length === 1 ? 'it' : 'them'} <span class="arrow" aria-hidden="true">→</span></span></summary>
          <ul class="addr-list">${empty.map((u) => `<li>${labels.has(u) ? `<span class="addr-label">${esc(labels.get(u))}</span>` : ''}<span class="mono">${esc(u)}</span></li>`).join('')}</ul>
          <p class="fine">${checkedLine}</p>
        </details>`);
    }
  }
  lastScan = { all, users, labels, prices };

  renderSummary(all, users, prices);
  collapseChains(chainIds, failedChains, all);

  const notes = [];
  if (failedChains.length) notes.push(`Couldn't reach ${listJoin(failedChains.map(chainName))} (the RPC didn't answer or refused). Results there are incomplete.`);
  if (unsupportedSim.size) notes.push(`${listJoin([...unsupportedSim].map(chainName))} couldn't be simulated through public RPCs, so those results aren't marked ready.`);
  $('#progress-note').textContent = notes.join(' ');
}

function renderSummary(all, users, prices) {
  const el = $('#summary');
  const ready = all.filter((r) => r.status === 'ready');
  if (!all.length) {
    el.innerHTML = `
      <h2>No old tokens to migrate${users.length > 1 ? ` in ${plural(users.length, 'address', 'addresses')}` : ''}.</h2>
      <p>None of the ${plural(registry.entries.length, 'migration path')} we track found a balance. That's the good outcome.</p>`;
    return;
  }
  // Only what can actually be migrated now counts toward the headline figure
  const total = ready.reduce((a, r) => a + (usdFor(r, prices).usd || 0), 0);
  const noun = all.length === 1 ? 'old token to migrate' : 'old tokens to migrate';
  const locked = all.filter((r) => r.status === 'locked').length;
  const blocked = all.length - ready.length - locked;
  const parts = [];
  if (ready.length) parts.push(`${num(ready.length)} can be migrated by you right now`);
  if (locked) parts.push(`${num(locked)} unlock${locked === 1 ? 's' : ''} later (the date is on the card)`);
  if (blocked) parts.push(`${num(blocked)} need${blocked === 1 ? 's' : ''} a closer look`);
  if (users.length > 1) {
    const holders = new Set(all.map((r) => r.user)).size;
    el.innerHTML = `
    <h2>Old tokens in ${num(holders)} of ${plural(users.length, 'address', 'addresses')}${total > 0 ? `, ${total < 0.01 ? '' : 'about '}<span class="count" data-to="${total}">${usdCompact(total, true)}</span> ready to migrate` : ''}.</h2>
    <p>${num(all.length)} found: ${parts.join('; ')}. Sorted by value; each one has step-by-step instructions.</p>
    <p class="summary-actions">${ready.length ? shareLink(total) : ''}<button type="button" class="btn-soft" data-csv>${ICON.download}Download results (CSV)</button>${calendarAllButton(all)}</p>`;
    if (ready.length) celebrate(el);
    return;
  }
  el.innerHTML = `
    <h2>${num(all.length)} ${noun} found${total > 0 ? `, ${total < 0.01 ? '' : 'about '}<span class="count" data-to="${total}">${usdCompact(total, true)}</span> ${ready.length === all.length ? 'in total' : 'ready to migrate'}` : ''}.</h2>
    <p>${ready.length === all.length
      ? `${all.length === 1 ? 'It can' : all.length === 2 ? 'Both can' : `All ${num(all.length)} can`} be migrated by you right now.`
      : `${parts.join('; ')}.`}
      Each one below has step-by-step instructions.</p>
    ${ready.length ? `<p class="summary-actions">${shareLink(total)}</p>` : ''}
`;
  if (ready.length) celebrate(el);
}

/* -------------------------------------------------------------- share */

/** "~$13.6K": rounded so a shared post can't be matched to one wallet's exact balance */
function roundUsd(v) {
  const trim = (x) => x.replace(/\.0$/, '');
  if (v >= 1e6) return `$${trim((v / 1e6).toFixed(1))}M`;
  if (v >= 1e3) return `$${trim((v / 1e3).toFixed(v >= 1e5 ? 0 : 1))}K`;
  return `$${Math.round(v / 10) * 10}`;
}

/** A pre-filled post for X. No address and no token list, only a rounded total. */
function shareLink(total) {
  const found = total >= 100 ? `Found ~${roundUsd(total)} in old tokens` : 'Found old tokens';
  const text = `${found} I could still migrate through the official contracts.\n\nFree, read-only, no wallet connection:`;
  const href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://oldtokencheck.com/?s=share')}`;
  return `<a class="btn-soft" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ICON.share}Share on X</a>`;
}

/* ------------------------------------------------------------- found! */

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The one authored moment: the total counts up, a light passes over the card, and a small
 *  handful of coins pops out of the number. Runs once per scan, only when something is Ready. */
function celebrate(card) {
  // In a background tab animation frames are paused: play the moment when the user comes back
  if (document.hidden) {
    document.addEventListener('visibilitychange', function onShow() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onShow);
      celebrate(card);
    });
    return;
  }
  const r = card.getBoundingClientRect();
  const offscreen = r.top < 0 || r.bottom > innerHeight;
  if (offscreen) card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  if (offscreen && !reducedMotion()) { setTimeout(() => playCelebration(card), 450); return; }
  playCelebration(card);
}

function playCelebration(card) {
  card.classList.remove('found');
  void card.offsetWidth; // restart the glint if a second scan finds something too
  card.classList.add('found');
  if (reducedMotion()) return;
  const count = card.querySelector('.count');
  const origin = count || card.querySelector('h2');
  if (!count) { burst(origin); return; }
  const to = Number(count.dataset.to);
  const final = usdCompact(to, true);
  const t0 = performance.now();
  const dur = 1100;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    count.textContent = final;
    burst(count);
  };
  const tick = (now) => {
    if (finished) return;
    const t = Math.min(1, (now - t0) / dur);
    count.textContent = usdCompact(to * easeOut(t), true);
    if (t < 1) requestAnimationFrame(tick);
    else finish();
  };
  // Never leave a placeholder number behind, even if animation frames stop mid-count
  setTimeout(finish, dur + 400);
  count.textContent = usdCompact(0, true);
  requestAnimationFrame(tick);
}

function burst(el) {
  const r = el.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const colors = ['#5eead4', '#2dd4bf', '#f2f4f7', '#f3b75f'];
  const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    const size = 6 + Math.random() * 6;
    p.style.width = p.style.height = `${size}px`;
    p.style.left = `${x0}px`;
    p.style.top = `${y0}px`;
    p.style.background = colors[i % colors.length];
    layer.appendChild(p);
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.9;
    const dist = 60 + Math.random() * 110;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    p.animate([
      { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 90}px)) scale(0.6)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), 1800);
}

/** After a scan, one quiet line replaces the per-chain chips; chains that failed keep their chip. */
function collapseChains(chainIds, failedChains, all) {
  const found = chainIds.filter((id) => all.some((r) => r.entry.chainId === id));
  const ok = chainIds.length - failedChains.length;
  const line = document.createElement('li');
  line.className = 'chain-summary';
  line.textContent = `${plural(ok, 'chain')} checked${found.length ? ` · found on ${listJoin(found.map(chainName))}` : ' · nothing found'}`;
  const list = $('#chain-list');
  for (const li of [...list.children]) if (li.dataset.state !== 'error') li.remove();
  list.prepend(line);
}

function setChain(chainId, state, text, title) {
  const li = document.getElementById(`chain-${chainId}`);
  if (!li) return;
  li.dataset.state = state;
  li.querySelector('.chain-state').textContent = text;
  if (title) li.title = title;
}

function cardId(f) { return `card-${f.user}-${f.entry.id}${f.rowKey ? `-${String(f.rowKey).replace(/[^\w-]/g, '_')}` : ''}`; }

function insertCard(f, html, animate = false) {
  const existing = document.getElementById(cardId(f));
  const sec = document.getElementById(`addr-${f.user}`);
  if (existing) {
    const wasOpen = existing.querySelector('details.steps-wrap')?.open;
    existing.outerHTML = html;
    const now = document.getElementById(cardId(f));
    if (animate) now.classList.add('is-new');
    if (wasOpen) { const d = now.querySelector('details.steps-wrap'); if (d) d.open = true; }
    return;
  }
  sec.hidden = false;
  sec.querySelector('.cards').insertAdjacentHTML('beforeend', html);
}

/* ------------------------------------------------------------- prices */

async function fetchPrices(results) {
  const prices = new Map();
  if (!PRICE_API || !results.length) return prices;
  const keys = new Set();
  for (const r of results) {
    const slug = CHAINS[r.entry.chainId]?.llama;
    if (!slug) continue;
    for (const a of outputsOf(r)) if (a.token) keys.add(`${slug}:${a.token}`.toLowerCase());
  }
  if (!keys.size) return prices;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(PRICE_API + [...keys].join(','), { signal: ctl.signal });
    clearTimeout(t);
    const data = await res.json();
    for (const [k, v] of Object.entries(data.coins || {})) {
      if (typeof v.price === 'number' && (v.confidence == null || v.confidence >= 0.5)) prices.set(k.toLowerCase(), v.price);
    }
  } catch { /* USD is optional */ }
  return prices;
}

/** What the user receives: simulated outputs when we have them, else the ratio-based expectation. */
function outputsOf(r) {
  if (r.receivedAll && r.receivedAll.length) return r.receivedAll;
  const e = r.entry;
  if (r.expected == null) return [];
  return [{ token: e.newToken ? e.newToken.address : null, symbol: outSymbol(e), decimals: outDecimals(e), amount: r.expected, primary: true, approx: true }];
}

function usdFor(r, prices) {
  if (!prices || !prices.size) return { usd: null, partial: false };
  const slug = CHAINS[r.entry.chainId]?.llama;
  let usd = 0, priced = 0, partial = false;
  for (const a of outputsOf(r)) {
    const p = a.token && slug ? prices.get(`${slug}:${a.token}`.toLowerCase()) : undefined;
    if (p == null) { partial = true; continue; }
    usd += toFloat(a.amount, a.decimals) * p;
    priced++;
  }
  return { usd: priced ? usd : null, partial: partial && priced > 0 };
}

/* ------------------------------------------------------------- cards */

const ICON = {
  check: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5.5M12 7.8v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  clock: '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  download: '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M12 4.5v10m0 0l-4-4m4 4l4-4M5 18.5h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M12 14.5v-10m0 0l-4 4m4-4l4 4M5.5 13.5v4A1.5 1.5 0 007 19h10a1.5 1.5 0 001.5-1.5v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendar: '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><rect x="4.5" y="5.5" width="15" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 10h15M9 3.5v4M15 3.5v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function pendingCard(f) {
  const e = f.entry;
  const held = heldToken(e);
  return `
    <article class="card" id="${esc(cardId(f))}" data-status="pending" aria-busy="true">
      <div class="card-top">
        <div class="card-amount"><strong>${esc(fmtAmount(f.balance, held.decimals))} ${esc(held.symbol)}</strong>${e.holding ? `<span class="usd">${esc(holdingLabel(e, shortVars(f.vars)))}</span>` : ''}</div>
        <span class="pill" data-tone="pending">Simulating…</span>
      </div>
      <p class="card-meta"><b>${esc(e.name)}</b><span class="sep">·</span>${esc(chainName(e.chainId))}${e.project ? `<span class="sep">·</span>${esc(e.project)}` : ''}</p>
    </article>`;
}

const STATUS = {
  ready: { tone: 'good', label: 'Ready to migrate' },
  'reserve-low': { tone: 'bad', label: 'Limited payout' },
  'sim-failed': { tone: 'bad', label: 'Simulation failed' },
  'sim-no-output': { tone: 'warn', label: 'Nothing received' },
  'sim-unavailable': { tone: 'warn', label: "Couldn't simulate" },
  'sim-mismatch': { tone: 'warn', label: 'Amount differs' },
  'check-failed': { tone: 'bad', label: 'Paused or closed' },
  'build-error': { tone: 'bad', label: 'Data error' },
  locked: { tone: 'later', label: 'Unlocks later' },
};

const METHOD_LABEL = {
  simulateV1: 'eth_simulateV1',
  override: 'eth_call with a state override',
};

function explorerLink(chainId, addr, text) {
  const url = explorerAddressUrl(chainId, addr);
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="mono">${esc(text || addr)}</a>`;
}

function copyBtn(value) {
  return `<button type="button" class="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(value)}">Copy</button>`;
}

function note(level, html) {
  const icon = level === 'good' ? ICON.check : level === 'info' ? ICON.info : level === 'clock' || level === 'later' ? ICON.clock : ICON.warn;
  const lvl = level === 'clock' ? 'warn' : level;
  return `<li class="note" data-level="${esc(lvl)}">${icon}<span>${html}</span></li>`;
}

function resultCard(r, prices) {
  const e = r.entry;
  const chain = CHAINS[e.chainId];
  const blockedByProtocol = e.status === 'blocked' && r.status !== 'ready' && r.status !== 'locked';
  const st = blockedByProtocol ? { tone: 'warn', label: 'Blocked for now' }
    : r.status === 'locked' ? { tone: 'later', label: `Unlocks ${fmtDate(r.lockedUntil)}` }
      : STATUS[r.status] || { tone: 'warn', label: r.status };
  const held = heldToken(e);
  const label = e.holding ? holdingLabel(e, shortVars(r.vars)) : '';
  const sym = outSymbol(e);
  const dec = outDecimals(e);
  const ready = r.status === 'ready';
  const outs = outputsOf(r);
  const simOk = !!(r.sim && r.sim.ok && r.receivedAll && r.receivedAll.length);

  // headline amount: what you'd receive
  const lead = outs[0];
  const { usd, partial } = usdFor(r, prices);
  const newAmt = lead ? `${lead.approx ? '~' : ''}${esc(fmtAmount(lead.amount, lead.decimals))} ${esc(lead.symbol)}` : '';
  const oldAmt = `${esc(fmtAmount(r.balance, held.decimals))} ${esc(held.symbol)}`;
  const headline = lead
    ? `${ready && held !== e.newToken ? `<strong class="roll"><span class="roll-old" aria-hidden="true">${oldAmt}</span><span class="roll-new">${newAmt}</span></strong>` : `<strong>${newAmt}</strong>`}${outs.length > 1 ? `<span class="plus">+ ${esc(outs.slice(1).map((o) => o.symbol).join(', '))}</span>` : ''}${usd != null ? `<span class="usd">${usd > 0 && usd < 0.01 ? '' : '≈ '}${esc(usdCompact(usd, true))}${partial ? '+' : ''}</span>` : ''}`
    : `<strong>${oldAmt}</strong>`;

  const meta = `<b>${esc(e.oldToken.symbol)} → ${esc(e.newToken ? e.newToken.symbol : sym)}</b><span class="sep">·</span>${esc(chain.name)}<span class="sep">·</span>${e.holding ? 'you have' : 'you hold'} ${oldAmt}${label ? ` ${esc(label)}` : ''}<span class="sep">·</span>migrator`;
  const monoLine = `<p class="card-mono">${explorerLink(e.chainId, e.migrator)}</p>`;

  // notes: verification first, then registry warnings, then deadline
  const notes = [];
  const blockUrl = `${chain.explorer}/block/${r.simBlock}`;
  const gotText = (r.receivedAll || []).map((g) => `${esc(fmtAmount(g.amount, g.decimals))} ${esc(g.symbol)}`).join(', ');
  const stepsText = (r.steps || []).map((s) => esc(s.fnName)).join(' → ');
  if (ready) {
    const match = amountsMatch(r.received, r.expected);
    notes.push(note('good', `Simulated from your address at <a href="${esc(blockUrl)}" target="_blank" rel="noopener noreferrer">block <span class="num">${esc(num(r.simBlock))}</span></a> with your full balance: ${stepsText} succeeded and you'd receive ${gotText}.${match ? '' : ` That differs slightly from the ${esc(rateText(e.ratio))} ratio; the simulated amount is what counts.`} <span class="muted">Checked with ${esc(METHOD_LABEL[r.method] || 'a simulation')}.</span>`));
  } else if (r.status === 'locked') {
    notes.push(note('later', `Locked until <strong>${esc(fmtDate(r.lockedUntil, true))}</strong> (${esc(timeLeft(r.lockedUntil * 1000 - Date.now()))} from now). We simulated the full exit from your address as if it were that day: ${stepsText} succeeded and you'd receive ${gotText} at today's rate. <span class="muted">Checked with ${esc(METHOD_LABEL[r.method] || 'a simulation')} at a pinned future time.</span>${calendarActions(r, 'unlock')}`));
  } else if (r.status === 'reserve-low') {
    notes.push(note('danger', `The payout contract ${explorerLink(e.chainId, r.reserve.holder, short(r.reserve.holder))} holds only ${esc(fmtAmount(r.reserve.amount, dec))} ${esc(sym)}, less than the ${esc(fmtAmount(r.expected, dec))} ${esc(sym)} your balance would convert to. ${simOk ? `The simulation still returned ${gotText}.` : r.sim && r.sim.calls && r.sim.calls.some((c) => !c.ok) ? `The simulation failed: <span class="mono">${esc((r.sim.calls.find((c) => !c.ok) || {}).error || '')}</span>.` : ''} Consider migrating part of your balance, and expect a failed transaction to cost gas.`));
  } else if (r.status === 'sim-mismatch') {
    notes.push(note('warn', `The simulation succeeded, but your ${esc(sym)} balance only went up by ${esc(fmtAmount(r.received, dec))} instead of the expected ${esc(fmtAmount(r.expected, dec))}. The terms may have changed — <strong>check the official announcement before migrating</strong>.`));
  } else if (r.status === 'sim-failed') {
    const bad = r.sim.calls.findIndex((c) => !c.ok);
    const step = r.steps[bad];
    notes.push(note('danger', `The simulation${r.lockedUntil ? ` (run as if it were ${esc(fmtDate(r.lockedUntil))}, when your lock ends)` : ''} failed at step ${bad + 1} (${esc(step ? step.fnName : '?')}): <span class="mono">${esc(r.sim.calls[bad] ? r.sim.calls[bad].error : '')}</span>. A real transaction would most likely fail and waste gas.${blockedByProtocol ? '' : ' The migration may be paused or closed.'}`));
  } else if (r.status === 'sim-unavailable') {
    notes.push(note('warn', `We couldn't simulate this on ${esc(chain.name)}: its public RPCs support neither <code>eth_simulateV1</code> nor state overrides${r.sim && r.sim.error ? ` (${esc(r.sim.error)})` : ''}. <strong>This result is unverified</strong> — confirm on the official site first.`));
  } else if (r.status === 'sim-no-output') {
    notes.push(note('warn', `Every simulated call succeeded, but your address didn't receive ${esc(sym)}. The migration may need an extra step, such as a claim after a waiting period. Read the official instructions first.`));
  } else if (r.status === 'check-failed') {
    const sc = r.statusCheck;
    notes.push(note('danger', `Status check <span class="mono">${esc(sc.signature)}</span> ${sc.ok ? `returned <span class="mono">${esc(short(sc.returned || ''))}</span>, not the expected value` : `couldn't be read (${esc(sc.error)})`}. The migration may be paused or closed.`));
  } else if (r.status === 'build-error') {
    notes.push(note('danger', `This registry entry couldn't be turned into transactions (${esc(r.error)}), so there are no steps to show.`));
  }
  const order = { danger: 0, warn: 1, info: 2 };
  const warnings = (Array.isArray(e.warnings) ? e.warnings : []).filter((w) => w && w.text)
    .filter((w) => !(r.status === 'reserve-low' && w.level === 'danger'))
    .sort((a, b) => (order[a.level] ?? 1) - (order[b.level] ?? 1));
  for (const w of warnings) notes.push(note(order[w.level] != null ? w.level : 'warn', esc(w.text)));
  if (r.sweptExtra) {
    const w = r.vars && typeof r.vars.wallet === 'bigint' ? `${esc(fmtAmount(r.vars.wallet, e.oldToken.decimals))} ` : '';
    notes.push(note('info', `The same transactions also convert the ${w}${esc(e.oldToken.symbol)} already in your wallet, for another ${esc(fmtAmount(r.sweptExtra, dec))} ${esc(sym)}. That part has its own card, so it isn't counted twice.`));
  }
  const waitAt = (r.steps || []).findIndex((s) => s.waitSeconds >= 86400);
  if (waitAt > 0 && r.status !== 'locked') {
    const w = r.steps[waitAt];
    notes.push(note('later', `This takes time: after <span class="mono">${esc(r.steps[waitAt - 1].fnName)}</span> the contract makes you wait ${esc(humanDuration(w.waitSeconds))} before <span class="mono">${esc(w.fnName)}</span>. The simulation already fast-forwarded through that wait.`));
  }
  if (e.deadline) notes.push(deadlineNote(r, simOk));

  // action line
  const nTx = (r.steps || []).length;
  const official = safeUrl(e.officialUi);
  const officialLink = official ? `<span class="sep">·</span>Official app: <a href="${esc(official)}" target="_blank" rel="noopener noreferrer">${esc(official.replace(/^https:\/\//, '').replace(/\/$/, ''))}</a>` : '';
  let action;
  if (!r.steps) {
    action = `<p class="card-action"><span class="muted">No steps available.</span>${officialLink}</p>`;
  } else {
    const txs = nTx === 1 ? 'one transaction' : `${num(nTx)} transactions`;
    const lead = ready
      ? `You can migrate this with ${txs}.`
      : r.status === 'locked'
        ? `After ${esc(fmtDate(r.lockedUntil))}, you can migrate this with ${txs}.`
      : r.status === 'reserve-low'
        ? `Migrating is possible, but payout is limited.`
        : `<span class="muted">Not verified — only proceed after checking the official announcement.</span>`;
    action = `
      <details class="steps-wrap"${ready ? '' : ''}>
        <summary aria-label="Show the step-by-step instructions">
          <span class="card-action">${lead} <span class="link">How to migrate on ${esc(chain.explorerName)} <span class="arrow" aria-hidden="true">→</span></span></span>
        </summary>
        <div class="steps-body">
          ${howToHtml(r, chain)}
          <h4 class="sub-h">Contracts involved</h4>
          ${contractsHtml(r)}
          ${sourcesHtml(e)}
        </div>
      </details>
      ${officialLink ? `<p class="card-action official-line">${officialLink.replace('<span class="sep">·</span>', '')}</p>` : ''}`;
  }

  return `
    <article class="card" id="${esc(cardId(r))}" data-status="${esc(r.status)}">
      <div class="card-top">
        <div class="card-amount">${headline}</div>
        <span class="pill" data-tone="${st.tone}">${esc(st.label)}</span>
      </div>
      <p class="card-meta">${meta}</p>
      ${monoLine}
      ${notes.length ? `<ul class="notes">${notes.join('')}</ul>` : ''}
      <hr class="card-rule">
      ${action}
    </article>`;
}

function contractsHtml(r) {
  const e = r.entry;
  const contracts = [
    { role: `Old token · ${e.oldToken.symbol}`, addr: e.oldToken.address },
    e.newToken ? { role: `New token · ${e.newToken.symbol}`, addr: e.newToken.address } : null,
    { role: 'Official migrator', addr: e.migrator },
  ].filter(Boolean);
  for (const s of r.steps || []) {
    if (!contracts.some((c) => c.addr.toLowerCase() === s.to.toLowerCase())) contracts.push({ role: s.contractLabel ? `${s.contractLabel}` : `Step contract · ${s.fnName}`, addr: s.to });
  }
  if (r.reserve && r.reserve.holder && !contracts.some((c) => c.addr.toLowerCase() === r.reserve.holder.toLowerCase())) {
    contracts.push({ role: 'Pays out from', addr: r.reserve.holder });
  }
  return `<ul class="contracts">${contracts.map((c) => `
    <li><span class="c-role">${esc(c.role)}</span><span class="c-addr">${explorerLink(e.chainId, c.addr)} ${copyBtn(c.addr)}</span></li>`).join('')}
  </ul>`;
}

function sourcesHtml(e) {
  const sources = (e.sources || []).map(safeUrl).filter(Boolean);
  const v = e.verification;
  if (!sources.length && !v) return '';
  return `
    <h4 class="sub-h">Sources and listing check</h4>
    ${sources.length ? `<ul class="sources">${sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https:\/\//, ''))}</a></li>`).join('')}</ul>` : ''}
    ${v && v.simulatedAt ? `<p class="fine">Before listing, this migration was simulated from a real holder at block ${esc(num(v.simulatedAt))}.</p>` : ''}`;
}

/** num/den as a short decimal string, e.g. "1 MKR = 22,800 SKY" */
function rateText(ratio) {
  try {
    const n = parseFraction(ratio.num), d = parseFraction(ratio.den);
    const scaled = (n.n * d.d * 10n ** 18n) / (n.d * d.n);
    return formatUnits(scaled, 18, scaled >= 10n ** 18n ? 4 : 8);
  } catch { return `${ratio.num}/${ratio.den}`; }
}

/** A full timestamp is used as-is; a bare date means the START of that day (UTC). Some deadlines
 *  are enforced on-chain at 00:00 UTC, so ending the countdown later would mislead. */
function deadlineMs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return NaN;
  return /T\d{2}:\d{2}/.test(String(iso)) ? Date.parse(iso) : Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function deadlineNote(r, simOk) {
  const end = deadlineMs(r.entry.deadline);
  if (!Number.isFinite(end)) return '';
  const txt = fmtDate(end / 1000, true);
  const ms = end - Date.now();
  if (ms < 0) {
    return note(simOk ? 'warn' : 'danger', simOk
      ? `The official deadline (${esc(txt)}) has passed, but the contract still works. It could close at any time.`
      : `The official deadline (${esc(txt)}) has passed.`);
  }
  return `<li class="note countdown" data-level="warn" data-deadline="${end}">${ICON.clock}<span>Official deadline <strong>${esc(txt)}</strong> — <strong class="cd-left">${esc(timeLeft(ms))}</strong> left.${calendarActions(r, 'deadline')}</span></li>`;
}

function timeLeft(ms) {
  const days = Math.floor(ms / 86400e3);
  const hours = Math.floor((ms % 86400e3) / 3600e3);
  return days > 0 ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(hours, 'hour');
}

function howToHtml(r, chain) {
  const e = r.entry;
  const items = r.steps.map((s, i) => {
    const proxy = r.proxies && r.proxies[s.to];
    const url = explorerAddressUrl(e.chainId, s.to, proxy ? '#writeProxyContract' : '#writeContract');
    const tab = proxy ? 'Contract → Write as Proxy' : 'Contract → Write Contract';
    const sym = s.tokenSymbol || e.oldToken.symbol;
    const title = s.title ? esc(s.title)
      : s.kind === 'approve'
        ? `Approve ${s.spenderIsMigrator ? 'the official migrator' : 'the listed contract'} to use your ${esc(sym)}`
        : `Migrate: call <span class="mono">${esc(s.fnName)}</span>`;
    const fields = s.fields.map((f, k) => `
      <div class="field">
        <div class="f-label">
          <span class="mono">${esc(f.label)}</span>
          <span class="f-type">${esc(f.type)} · field ${k + 1}</span>
        </div>
        <div class="f-val"><code>${esc(f.value)}</code>${copyBtn(f.value)}</div>
        ${f.raw && f.decimals != null
          ? `<p class="f-hint">= ${esc(formatUnits(BigInt(f.value), f.decimals, f.decimals))} ${esc(f.symbol || '')}. Raw units with ${esc(f.decimals)} decimals — paste exactly as shown, don't convert.</p>`
          : f.hint ? `<p class="f-hint">${esc(f.hint)}</p>` : ''}
      </div>`).join('');
    const valueRow = s.value ? `<p class="fine">Also enter ${esc(formatUnits(BigInt(s.value), 18, 18))} ${esc(chain.native)} in the <span class="mono">payableAmount</span> field.</p>` : '';
    const spenderWarn = s.kind === 'approve' && !s.spenderIsMigrator
      ? `<p class="fine warn-text">Note: this approval goes to ${esc(short(s.fields[0].value))}, listed under "Contracts involved" — not to the migrator itself.</p>` : '';
    return `
      <li class="step">
        <h4>${title}</h4>
        <ol class="step-list">
          ${s.waitSeconds ? `<li><strong>Wait at least ${esc(humanDuration(s.waitSeconds))}</strong> after the previous step confirms (the contract's waiting period), then continue.</li>` : ''}
          <li>Open <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">the ${esc(s.contractLabel || (s.kind === 'approve' ? `${sym} token` : 'migrator'))} contract on ${esc(chain.explorerName)}</a> (${esc(tab)}).${i === 0 ? ` Press <strong>Connect to Web3</strong> and make sure your wallet is on ${esc(chain.name)}.` : ''}</li>
          <li>Check the address in the URL is <span class="mono">${esc(s.to)}</span> ${copyBtn(s.to)}</li>
          <li>${s.fields.length
            ? `Expand <strong class="mono">${esc(s.fnName)}</strong> and fill in, in order:
              <div class="fields">${fields}</div>
              <p class="fine">${esc(chain.explorerName)} may label fields differently (for example <span class="mono">_spender</span> or <span class="mono">value</span>); go by the field order.</p>`
            : `Expand <strong class="mono">${esc(s.fnName)}</strong>. It has <strong>no fields to fill in</strong> — leave any <span class="mono">payableAmount</span> field empty or 0.`}
            ${valueRow}${spenderWarn}
          </li>
          <li>Press <strong>Write</strong>. In your wallet's confirmation, check that you're interacting with <strong class="mono">${esc(short(s.to))}</strong>${s.kind === 'approve' ? ` and approving <strong class="mono">${esc(short(s.fields[0].value))}</strong>` : ''}, then confirm. Wait for it to confirm before the next step.</li>
        </ol>
      </li>`;
  }).join('');
  const got = outputsOf(r);
  const hasAmountField = r.steps.some((s) => s.fields.some((f) => f.raw));
  const done = `
    <li class="step">
      <h4>Check you received ${esc(listJoin(got.map((g) => g.symbol)))}</h4>
      <ol class="step-list">
        ${got.map((g) => `<li><strong>${g.approx ? 'About ' : ''}${esc(formatUnits(g.amount, g.decimals))} ${esc(g.symbol)}</strong>${g.token ? ` — token contract <span class="mono">${esc(g.token)}</span> ${copyBtn(g.token)}` : ''}</li>`).join('')}
      </ol>
      <p class="fine">If your wallet doesn't show it, add the token manually with the contract address above. ${hasAmountField ? 'The amounts above are your full balance at the time of this check. If your balance changes, use the same new amount in both the approve and the migrate step.' : 'This migration handles your whole current balance in one go.'}</p>
    </li>`;
  const when = r.lockedUntil ? `<p class="fine when">These steps only work after your lock ends on <strong>${esc(fmtDate(r.lockedUntil, true))}</strong>. Before that, the first step fails.</p>` : '';
  return `${when}<ol class="steps">${items}${done}</ol>`;
}

function tickCountdowns() {
  for (const el of document.querySelectorAll('.countdown[data-deadline]')) {
    const ms = Number(el.dataset.deadline) - Date.now();
    const out = el.querySelector('.cd-left');
    if (out) out.textContent = ms <= 0 ? '0 hours' : timeLeft(ms);
  }
}

/* ------------------------------------------------------------- copy */

async function onCopyClick(ev) {
  if (ev.target.closest('button[data-csv]')) return downloadCsv();
  const ics = ev.target.closest('button[data-ics]');
  if (ics) return downloadIcs(ics.dataset.ics);
  const btn = ev.target.closest('button[data-copy]');
  if (!btn) return;
  const value = btn.dataset.copy;
  const label = btn.textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(value); ok = true; } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.className = 'sr-only';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (!ok) {
    const code = btn.parentElement && btn.parentElement.querySelector('code, .tip-addr');
    const target = code || document.getElementById('tip-addr');
    if (target) { const range = document.createRange(); range.selectNodeContents(target); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  }
  btn.textContent = ok ? 'Copied' : 'Select and copy';
  btn.classList.toggle('copied', ok);
  toast(ok ? 'Copied to clipboard' : "Couldn't copy — the text is selected, copy it manually");
  setTimeout(() => { btn.textContent = label; btn.classList.remove('copied'); }, 1600);
}

/* ----------------------------------------------------------- calendar */
//
// Unlock dates and deadlines as calendar events. The .ics file is built in the browser and names
// the full address (it stays on your device). The Google Calendar link goes to Google, so it only
// carries the last four characters of the address.

const calByCard = new Map(); // "<card id>|<kind>" -> event, filled as cards render

function resultEvent(r, kind) {
  const e = r.entry;
  const held = heldToken(e);
  const what = `${fmtAmount(r.balance, held.decimals)} ${held.symbol}${e.holding ? ` ${holdingLabel(e, shortVars(r.vars))}` : ''}`;
  const where = e.project || chainName(e.chainId);
  if (kind === 'unlock') {
    const t = Number(r.lockedUntil);
    return { kind, group: `unlock:${t}:${e.id}`, start: t, end: t + 3600, when: t, alarms: ['PT0S', '-P1D'],
      title: `Unlocks: ${what} → ${outSymbol(e)}`, groupTitle: `Unlocks: ${e.oldToken.symbol} → ${outSymbol(e)} (${where})`, what, user: r.user, entry: e };
  }
  const end = Math.floor(deadlineMs(e.deadline) / 1000);
  return { kind, group: `deadline:${end}:${where}`, start: end - 7200, end, when: end, alarms: ['-P7D', '-P1D'],
    title: `Deadline: ${e.name}`, groupTitle: `Deadline: ${where}`, what, user: r.user, entry: e };
}

/** Events for every result with a date still ahead */
function resultEvents(r) {
  const out = [];
  if (r.status === 'locked' && r.lockedUntil) out.push(resultEvent(r, 'unlock'));
  if (r.entry.deadline && deadlineMs(r.entry.deadline) > Date.now()) out.push(resultEvent(r, 'deadline'));
  return out;
}

function eventText(list, full) {
  const first = list[0];
  const when = fmtDate(first.when, true);
  const intro = first.kind === 'unlock'
    ? `Unlocks ${when}. From then you can migrate it through the official contracts.`
    : `Official deadline ${when}. Migrate before then; afterwards it may no longer be possible.`;
  const lines = list.map((ev) => {
    const label = full && currentLabels.get(ev.user);
    return `- ${ev.what} on ${chainName(ev.entry.chainId)}, wallet ${full ? ev.user : `ending ${ev.user.slice(-4)}`}${label ? ` (${label})` : ''}`;
  });
  const users = [...new Set(list.map((ev) => ev.user))];
  const link = full ? `https://oldtokencheck.com/?address=${users.join(',')}` : 'https://oldtokencheck.com';
  return `${intro}\n\n${lines.join('\n')}\n\nStep-by-step instructions: ${link}`;
}

const icsTime = (unix) => new Date(unix * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding: at most 75 octets per line, continuations start with a space */
function icsFold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch;
    len += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Stable per event and wallet set, so importing the file again updates instead of duplicating */
function icsUid(key) {
  let h = 0x811c9dc5;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `otc-${h.toString(16)}-${key.length}@oldtokencheck.com`;
}

function icsCalendar(groups) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Old Token Check//oldtokencheck.com//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const list of groups) {
    const first = list[0];
    const title = list.length === 1 ? first.title : `${first.groupTitle}, ${list.length} positions`;
    const users = [...new Set(list.map((ev) => ev.user))].sort();
    lines.push('BEGIN:VEVENT', `UID:${icsUid(`${first.group}|${users.join(',')}|${list.length === 1 ? first.entry.id : ''}`)}`,
      `DTSTAMP:${icsTime(Date.now() / 1000)}`, `DTSTART:${icsTime(first.start)}`, `DTEND:${icsTime(first.end)}`,
      `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(eventText(list, true))}`, `URL:https://oldtokencheck.com/?address=${users.join(',')}`);
    for (const a of first.alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, `TRIGGER:${a}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

/** The two calendar actions under an unlock or deadline note */
function calendarActions(r, kind) {
  const ev = resultEvent(r, kind);
  if (!Number.isFinite(ev.when) || ev.when * 1000 <= Date.now()) return '';
  const key = `${cardId(r)}|${kind}`;
  calByCard.set(key, ev);
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${icsTime(ev.start)}/${icsTime(ev.end)}&details=${encodeURIComponent(eventText([ev], false))}`;
  return `<span class="note-actions">${ICON.calendar}<button type="button" class="text-btn" data-ics="${esc(key)}">Add to calendar</button><span class="sep" aria-hidden="true">·</span><a href="${esc(google)}" target="_blank" rel="noopener noreferrer">Google Calendar</a></span>`;
}

/** One-file download for a single card ("<card>|<kind>") or, with "all", every date in the scan */
function downloadIcs(key) {
  let groups;
  let name;
  if (key === 'all') {
    if (!lastScan) return;
    const byGroup = groupBy(lastScan.all.flatMap(resultEvents), (ev) => ev.group);
    groups = [...byGroup.values()].sort((a, b) => a[0].start - b[0].start);
    name = 'old-token-check-dates.ics';
  } else {
    const ev = calByCard.get(key);
    if (!ev) return;
    groups = [[ev]];
    name = `${ev.kind}-${ev.entry.oldToken.symbol.toLowerCase()}-${new Date(ev.when * 1000).toISOString().slice(0, 10)}.ics`;
  }
  if (!groups.length) return;
  downloadFile(icsCalendar(groups), 'text/calendar;charset=utf-8', name);
  toast(groups.length === 1 ? 'Calendar file downloaded. Open it to add the event.' : `Calendar file with ${plural(groups.length, 'event')} downloaded`);
}

function calendarAllButton(all) {
  const n = new Set(all.flatMap(resultEvents).map((ev) => ev.group)).size;
  return n ? `<button type="button" class="btn-soft" data-ics="all">${ICON.calendar}Add ${plural(n, 'date')} to calendar</button>` : '';
}

function downloadFile(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* -------------------------------------------------------------- CSV */

/** Every result as a spreadsheet row; built in the browser, nothing is uploaded */
function downloadCsv() {
  if (!lastScan) return;
  const { all, users, labels, prices } = lastScan;
  const order = new Map(users.map((u, i) => [u, i]));
  const plain = (raw, dec) => formatUnits(BigInt(raw), dec, dec).replace(/,/g, '');
  const statusText = (r) => (r.status === 'locked' ? `Unlocks ${new Date(r.lockedUntil * 1000).toISOString().slice(0, 10)}`
    : r.entry.status === 'blocked' && r.status !== 'ready' ? 'Blocked for now' : (STATUS[r.status] || { label: r.status }).label);
  const rows = [['label', 'address', 'chain', 'migration', 'project', 'status', 'amount', 'token', 'held in', 'you receive', 'receive token', 'also receive', 'usd', 'unlocks (UTC)', 'deadline', 'migrator']];
  for (const r of [...all].sort((a, b) => order.get(a.user) - order.get(b.user))) {
    const e = r.entry;
    const held = heldToken(e);
    const outs = outputsOf(r);
    const { usd } = usdFor(r, prices);
    rows.push([
      labels.get(r.user) || '', r.user, chainName(e.chainId), e.name, e.project || '', statusText(r),
      plain(r.balance, held.decimals), held.symbol, e.holding ? holdingLabel(e, r.vars) : 'wallet',
      outs[0] ? plain(outs[0].amount, outs[0].decimals) : '', outs[0] ? outs[0].symbol : '',
      outs.slice(1).map((o) => `${plain(o.amount, o.decimals)} ${o.symbol}`).join('; '),
      usd != null ? usd.toFixed(2) : '', r.lockedUntil ? new Date(r.lockedUntil * 1000).toISOString().replace('.000Z', 'Z') : '',
      e.deadline || '', e.migrator,
    ]);
  }
  // Quote every cell; neutralize spreadsheet formulas in text that came from outside (labels, token symbols)
  const cell = (v) => {
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csv = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  downloadFile(`\ufeff${csv}`, 'text/csv;charset=utf-8', `old-token-check-${new Date().toISOString().slice(0, 10)}.csv`);
  toast(`Downloaded ${plural(all.length, 'row')}`);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ------------------------------------------------------------ formatting */

/** Holding variables for labels: addresses shortened */
function shortVars(vars) {
  if (!vars) return {};
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, isAddress(String(v)) ? short(String(v)) : v]));
}

/** unix seconds -> "Feb 10, 2028" (UTC); withTime adds "14:05 UTC" */
function fmtDate(unix, withTime = false) {
  const d = new Date(Number(unix) * 1000);
  const day = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return withTime ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : day;
}

function humanDuration(sec) {
  const s = Number(sec);
  if (s >= 86400) return plural(Math.round(s / 86400), 'day');
  if (s >= 3600) return plural(Math.round(s / 3600), 'hour');
  if (s >= 60) return plural(Math.round(s / 60), 'minute');
  return plural(s, 'second');
}

function toFloat(raw, decimals) {
  const s = formatUnits(BigInt(raw), decimals, Math.min(decimals, 12)).replace(/,/g, '');
  return Number(s.startsWith('<') ? 0 : s);
}

/** Amounts read like the reference: 2 decimals for big numbers, more for small ones. */
function fmtAmount(raw, decimals) {
  const v = toFloat(raw, decimals);
  if (v === 0 && BigInt(raw) > 0n) return '< 0.0001';
  const maxFrac = v >= 1000 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 4 : 6;
  return v.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

function usdCompact(v, exactBelow100k = false) {
  if (v > 0 && v < 0.01) return '< $0.01';
  if (exactBelow100k && v < 100000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 2 : 0 })}`;
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, u] of units) if (v >= n) return `$${(v / n).toLocaleString('en-US', { maximumFractionDigits: 1 })}${u}`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------ utils */

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  });
  await Promise.all(workers);
}
