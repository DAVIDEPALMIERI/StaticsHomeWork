'use strict';
/* =====================================================================
   HW4 Statistics — Welford's recurrences & sampling mean/variance
   Vanilla JS + Canvas 2D. No chart libraries.
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COL = {
  ink: '#16202a', soft: '#5b6670', grid: '#e6dfcf', rule: '#cfc4ad', card: '#fbf8f1',
  red: '#c0392b', blue: '#1d4f91', green: '#2e7d57', gold: '#b8860b'
};
const N_OPTIONS = [2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000];
const N_DEFAULT = [2, 5, 10, 30, 100, 300, 1000];
const LEDGER_ROWS = 24, LEDGER_COLS = 60;

const S = {
  seed: 'welford-26', m: 2000, ns: [...N_DEFAULT], preset: 'mix',
  pmf: null, mom: null, cdf: null, res: null, tok: 0
};

/* ======================= RNG ======================= */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rngFor = tag => mulberry32(hashSeed(S.seed + '|' + tag));

/* ======================= math ======================= */
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/* ---- Welford: the 3-line core used everywhere ---- */
function wInit() { return { n: 0, avg: 0, ss: 0 }; }
function wPush(s, x) {            // = absorb() of section 02
  s.n++;
  const gap = x - s.avg;
  s.avg += gap / s.n;
  s.ss  += gap * (x - s.avg);
  return gap;
}
const wVar = s => (s.n > 1 ? s.ss / (s.n - 1) : NaN);
function wMerge(a, b) {           // centre-shift merge of two states (section 04)
  const n = a.n + b.n; if (!n) return wInit();
  const D = b.avg - a.avg;
  return { n, avg: a.avg + D * b.n / n, ss: a.ss + b.ss + D * D * a.n * b.n / n };
}

/* ======================= score distribution ======================= */
function binom10(p) {
  const out = [];
  let c = 1;
  for (let j = 0; j <= 10; j++) { out.push(c * Math.pow(p, j) * Math.pow(1 - p, 10 - j)); c = c * (10 - j) / (j + 1); }
  return out;
}
const PRESETS = {
  mix:     { label: 'Hardened vs exposed', note: '70% of systems hardened (scores ~ Bin(10, 0.15)), 30% exposed (~ Bin(10, 0.8)). Bimodal and skewed.',
             pmf: () => { const a = binom10(0.15), b = binom10(0.8); return a.map((v, j) => 0.7 * v + 0.3 * b[j]); } },
  uniform: { label: 'Uniform 0–10', note: 'Every score equally likely: no information about the target.', pmf: () => Array(11).fill(1 / 11) },
  binom:   { label: 'Binomial(10, 0.35)', note: '10 independent checks per system, each passed with probability 0.35. Bell-shaped.', pmf: () => binom10(0.35) },
  decay:   { label: 'Mostly repelled', note: 'p_j ∝ 0.6^j: high scores become geometrically rarer.', pmf: () => { const w = [...Array(11)].map((_, j) => Math.pow(0.6, j)); const s = w.reduce((a, b) => a + b); return w.map(v => v / s); } },
  jackpot: { label: 'Rare jackpot', note: 'Almost always 0–2, but 3% of attempts hit a full compromise (10). Heavy right tail, large μ₄.',
             pmf: () => [0.45, 0.25, 0.12, 0.06, 0.03, 0.02, 0.01, 0.01, 0.01, 0.01, 0.03] }
};
function setPmf(p) {
  const s = p.reduce((a, b) => a + b, 0);
  S.pmf = p.map(v => v / s);
  let mu = 0; S.pmf.forEach((q, j) => mu += j * q);
  let m2 = 0, m3 = 0, m4 = 0;
  S.pmf.forEach((q, j) => { const d = j - mu; m2 += d * d * q; m3 += d * d * d * q; m4 += d * d * d * d * q; });
  S.mom = { mu, s2: m2, sd: Math.sqrt(m2), m4, skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3 };
  S.cdf = []; let c = 0; S.pmf.forEach(q => { c += q; S.cdf.push(c); }); S.cdf[10] = 1;
}
function sampler(rng) {
  const cdf = S.cdf;
  return () => { const u = rng(); let j = 0; while (u > cdf[j]) j++; return j; };
}
const varS2 = n => (S.mom.m4 - (n - 3) / (n - 1) * S.mom.s2 * S.mom.s2) / n;

/* ======================= formatting ======================= */
function fmt(v) {
  if (v === 0) return '0';
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e5) return v.toLocaleString('en-US');
  if (a >= 1e5) return v.toExponential(2).replace('e+', 'e');
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  if (a >= 1) return v.toFixed(3);
  if (a >= 0.001) return (+v.toPrecision(3)).toString();
  return v.toExponential(1);
}
const f4 = v => (isFinite(v) ? v.toFixed(4) : '–');
const pct = v => (100 * v).toFixed(1) + '%';
const nfmt = n => n.toLocaleString('en-US');
const status = t => { $('#status').textContent = t; };

/* ======================= canvas helpers ======================= */
function cv(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  const dpr = window.devicePixelRatio || 1, r = el.getBoundingClientRect();
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
  const ctx = el.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function scale(d0, d1, r0, r1, log) {
  if (log) { const a = Math.log10(d0), b = Math.log10(d1); return v => r0 + (Math.log10(v) - a) / (b - a) * (r1 - r0); }
  return v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
}
function niceTicks(a, b, k = 5) {
  if (!(b > a)) return [a];
  const raw = (b - a) / k, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
  const st = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag, t = [];
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) t.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
  return t;
}
function logTicks(a, b) {
  const t = [];
  for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.floor(Math.log10(b) + 1e-9); e++) t.push(Math.pow(10, e));
  return t;
}
function axes(ctx, box, xd, yd, o = {}) {
  const X = scale(xd[0], xd[1], box.x, box.x + box.w, o.logx), Y = scale(yd[0], yd[1], box.y + box.h, box.y, o.logy);
  const xt = o.xticks || (o.logx ? logTicks(xd[0], xd[1]) : niceTicks(xd[0], xd[1], o.nx || 6));
  const yt = o.yticks || (o.logy ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1], o.ny || 5));
  ctx.save();
  ctx.fillStyle = COL.card; ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.lineWidth = 1; ctx.strokeStyle = COL.grid; ctx.beginPath();
  for (const x of xt) { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); }
  for (const y of yt) { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py); }
  ctx.stroke();
  ctx.strokeStyle = COL.ink; ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.fillStyle = COL.soft;
  if (!o.noX) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of xt) ctx.fillText((o.fx || fmt)(x), X(x), box.y + box.h + 4); }
  if (!o.noY) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const y of yt) ctx.fillText((o.fy || fmt)(y), box.x - 5, Y(y)); }
  ctx.fillStyle = COL.ink; ctx.font = '11px "IBM Plex Mono", monospace';
  if (o.xlabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(o.xlabel, box.x + box.w, box.y + box.h + 18); }
  if (o.ylabel) {
    ctx.save(); ctx.translate(box.x - (o.ylabelOff || 46), box.y + box.h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
  }
  ctx.restore();
  return { X, Y, box };
}
function clip(ctx, box) { ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip(); }
function legend(ctx, x, y, items) {
  ctx.save();
  const cw = ctx.canvas.width / (window.devicePixelRatio || 1);
  ctx.font = (cw < 480 ? '10px' : '11px') + ' "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
  const wmax = Math.max(...items.map(it => ctx.measureText(it.label).width)) + 32;
  x = Math.max(8, Math.min(x, cw - wmax - 6));
  ctx.fillStyle = 'rgba(251,248,241,.92)'; ctx.strokeStyle = COL.rule;
  ctx.fillRect(x - 6, y - 10, wmax + 8, items.length * 16 + 4); ctx.strokeRect(x - 6.5, y - 10.5, wmax + 8, items.length * 16 + 4);
  let yy = y;
  for (const it of items) {
    ctx.strokeStyle = it.col; ctx.fillStyle = it.col; ctx.lineWidth = it.lw || 2; ctx.setLineDash(it.dash || []);
    if (it.dot) { ctx.beginPath(); ctx.arc(x + 8, yy, 3.5, 0, 7); it.hollow ? ctx.stroke() : ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 16, yy); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.fillText(it.label, x + 22, yy);
    yy += 16;
  }
  ctx.restore();
}
function hline(ctx, A, y, col, dash = [6, 4], lw = 1.5) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath();
  ctx.moveTo(A.box.x, A.Y(y)); ctx.lineTo(A.box.x + A.box.w, A.Y(y)); ctx.stroke(); ctx.restore();
}
function vline(ctx, A, x, col, dash = [6, 4], lw = 1.5) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath();
  ctx.moveTo(A.X(x), A.box.y); ctx.lineTo(A.X(x), A.box.y + A.box.h); ctx.stroke(); ctx.restore();
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* ======================= 02 · code tabs ======================= */
function bindCodeTabs() {
  $$('#codeTabs button').forEach(b => b.addEventListener('click', () => {
    $$('#codeTabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#code-js').hidden = b.dataset.v !== 'js'; $('#code-py').hidden = b.dataset.v !== 'py';
  }));
}

/* ======================= 03 · tracer ======================= */
const TR = { st: null, xs: [], ms: [], vs: [], rows: [], rng: null, draw: null, timer: null, MAX: 200 };
function trReset() {
  clearInterval(TR.timer); TR.timer = null; $('#trPlay').textContent = 'Auto-play';
  TR.st = wInit(); TR.xs = []; TR.ms = []; TR.vs = []; TR.rows = [];
  TR.draw = sampler(rngFor('tracer'));
  trRender();
}
function trStep() {
  if (TR.xs.length >= TR.MAX) { trStop(); return; }
  const x = TR.draw(), oldM = TR.st.avg, delta = wPush(TR.st, x);
  TR.xs.push(x); TR.ms.push(TR.st.avg); TR.vs.push(wVar(TR.st));
  // textbook check: two passes over all stored scores
  const k = TR.xs.length, mean2 = TR.xs.reduce((a, b) => a + b, 0) / k;
  const var2 = k > 1 ? TR.xs.reduce((a, b) => a + (b - mean2) * (b - mean2), 0) / (k - 1) : NaN;
  TR.rows.push({ k, x, oldM, delta, M: TR.st.avg, SS: TR.st.ss, s2: wVar(TR.st), mean2, var2 });
  trRender();
}
function trStop() { clearInterval(TR.timer); TR.timer = null; $('#trPlay').textContent = 'Auto-play'; }
function trRender() {
  const rows = TR.rows.slice(-8).reverse();
  let t = '<thead><tr><th>k</th><th>xₖ</th><th>δ = xₖ−Mₖ₋₁</th><th>Mₖ</th><th>SSₖ</th><th>sₖ²</th><th class="th">two-pass x̄</th><th class="th">two-pass s²</th></tr></thead><tbody>';
  if (!rows.length) t += '<tr><td colspan="8" class="th">press “Attack next system” — state: k = 0, M₀ = 0, SS₀ = 0</td></tr>';
  rows.forEach((r, i) => {
    const ok = Math.abs(r.M - r.mean2) < 1e-9 && (r.k < 2 || Math.abs(r.s2 - r.var2) < 1e-9);
    t += `<tr class="${i === 0 ? 'cur' : ''}"><td>${r.k}</td><td>${r.x}</td><td>${fmt(r.delta)}</td><td>${f4(r.M)}</td><td>${f4(r.SS)}</td><td>${r.k > 1 ? f4(r.s2) : '–'}</td>` +
      `<td class="th">${f4(r.mean2)}</td><td class="th">${r.k > 1 ? f4(r.var2) : '–'} <span class="${ok ? 'cmp-good' : 'cmp-bad'}">${ok ? '✓' : '✗'}</span></td></tr>`;
  });
  $('#trTable').innerHTML = t + '</tbody>';
  const k = TR.xs.length;
  $('#trInfo').textContent = k ? `k = ${k} · Mₖ = ${f4(TR.st.avg)} (μ = ${f4(S.mom.mu)}) · sₖ² = ${k > 1 ? f4(wVar(TR.st)) : '–'} (σ² = ${f4(S.mom.s2)})` : `up to ${TR.MAX} systems`;
  drawTrace();
}
function drawTrace() {
  const { ctx, w, h } = cv('cvTrace');
  const K = Math.max(20, TR.xs.length), L = 46;
  const gap = 26, hh = (h - 10 - 30 - gap) / 2;
  const b1 = { x: L, y: 8, w: w - L - 10, h: hh }, b2 = { x: L, y: 8 + hh + gap, w: w - L - 10, h: hh };
  const A1 = axes(ctx, b1, [0, K], [0, 10], { noX: true, yticks: [0, 2, 4, 6, 8, 10], ylabel: 'Mₖ', ylabelOff: 40 });
  let vmax = S.mom.s2 * 2.2; TR.vs.forEach(v => { if (isFinite(v)) vmax = Math.max(vmax, v * 1.05); });
  const A2 = axes(ctx, b2, [0, K], [0, vmax], { xlabel: 'k = systems attacked', nx: w < 500 ? 4 : 6, ny: 3, ylabel: 'sₖ²', ylabelOff: 40 });
  // scores as ticks on the mean panel
  clip(ctx, b1);
  ctx.fillStyle = COL.red; ctx.globalAlpha = 0.25;
  TR.xs.forEach((x, i) => { ctx.beginPath(); ctx.arc(A1.X(i + 1), A1.Y(x), 2.2, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  hline(ctx, A1, S.mom.mu, COL.ink);
  ctx.strokeStyle = COL.blue; ctx.lineWidth = 2; ctx.beginPath();
  TR.ms.forEach((v, i) => { i ? ctx.lineTo(A1.X(i + 1), A1.Y(v)) : ctx.moveTo(A1.X(i + 1), A1.Y(v)); }); ctx.stroke();
  ctx.restore();
  clip(ctx, b2);
  hline(ctx, A2, S.mom.s2, COL.ink);
  ctx.strokeStyle = COL.green; ctx.lineWidth = 2; ctx.beginPath(); let st = false;
  TR.vs.forEach((v, i) => { if (!isFinite(v)) return; st ? ctx.lineTo(A2.X(i + 1), A2.Y(v)) : ctx.moveTo(A2.X(i + 1), A2.Y(v)); st = true; }); ctx.stroke();
  ctx.restore();
  legend(ctx, b1.x + b1.w - 190, b1.y + 14, [
    { col: COL.blue, label: 'running mean Mₖ' }, { col: COL.red, label: 'score xₖ', dot: true }, { col: COL.ink, label: 'μ', dash: [6, 4], lw: 1.5 }
  ]);
  legend(ctx, b2.x + b2.w - 190, b2.y + 14, [{ col: COL.green, label: 'running sₖ²' }, { col: COL.ink, label: 'σ²', dash: [6, 4], lw: 1.5 }]);
}

/* ======================= 04 · merging sensors ======================= */
function drawMerge() {
  const K = +$('#sens').value; $('#sensOut').textContent = K;
  const r = rngFor('merge'), draw = sampler(r), N = 600, xs = [];
  const sensors = [...Array(K)].map(() => wInit()), single = wInit();
  for (let i = 0; i < N; i++) {
    const x = draw(); xs.push(x);
    wPush(sensors[Math.floor(r() * K)], x); wPush(single, x);
  }
  const merged = sensors.reduce((acc, st) => wMerge(acc, st), wInit());
  const m2 = xs.reduce((a, b) => a + b, 0) / N, v2 = xs.reduce((a, b) => a + (b - m2) ** 2, 0) / (N - 1);
  const row = (name, st, cls = '') => `<tr class="${cls}"><td>${name}</td><td>${st.n}</td><td>${f4(st.avg)}</td><td>${f4(st.ss)}</td><td>${st.n > 1 ? f4(st.ss / (st.n - 1)) : '–'}</td></tr>`;
  let t = '<thead><tr><th>state</th><th>n</th><th>avg</th><th>ss</th><th>s²</th></tr></thead><tbody>';
  sensors.forEach((st, i) => { t += row(`sensor ${i + 1}`, st); });
  t += row(`merged (${K} states)`, merged, 'cur') + row('one stream, absorb()', single) +
    `<tr><td class="th">two-pass on all 600 scores</td><td class="th">${N}</td><td class="th">${f4(m2)}</td><td class="th">${f4(v2 * (N - 1))}</td><td class="th">${f4(v2)}</td></tr></tbody>`;
  $('#mergeTable').innerHTML = t;
  const err = Math.max(Math.abs(merged.avg - m2), Math.abs(merged.ss / (N - 1) - v2));
  $('#mergeNote').textContent = `Merging only the ${K} summaries (3 numbers each) reproduces the mean and variance of all 600 raw scores: largest difference ${err.toExponential(1)}, i.e. rounding error. The sensors never exchange raw data, which also keeps the logs private.`;
}

/* ======================= 05 · pmf ======================= */
let pmfBox = null;
function renderPresets() {
  $('#presets').innerHTML = Object.entries(PRESETS).map(([k, v]) => `<button data-k="${k}" class="${S.preset === k ? 'on' : ''}">${v.label}</button>`).join('') +
    `<button data-k="custom" class="${S.preset === 'custom' ? 'on' : ''}" ${S.preset === 'custom' ? '' : 'disabled style="opacity:.5"'}>Custom (drawn)</button>`;
  $$('#presets button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.k === 'custom') return;
    S.preset = b.dataset.k; setPmf(PRESETS[S.preset].pmf()); onPmfChange(true);
  }));
}
function drawPmf() {
  const { ctx, w, h } = cv('cvPmf');
  const box = { x: 42, y: 10, w: w - 52, h: h - 44 };
  const ymax = Math.max(0.3, Math.ceil(Math.max(...S.pmf) * 10 + 0.5) / 10);
  const A = axes(ctx, box, [-0.5, 10.5], [0, ymax], { xticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fx: v => String(v), ny: 4, xlabel: 'score' });
  pmfBox = { box, ymax, A };
  const bw = box.w / 11;
  S.pmf.forEach((q, j) => {
    const x0 = A.X(j - 0.5) + 3, y = A.Y(q);
    ctx.fillStyle = COL.red; ctx.globalAlpha = 0.75; ctx.fillRect(x0, y, bw - 6, A.Y(0) - y); ctx.globalAlpha = 1;
    ctx.fillStyle = COL.ink; ctx.font = '9.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (bw > 22) ctx.fillText(q.toFixed(2).replace(/^0/, ''), A.X(j), y - 2);
  });
  vline(ctx, A, S.mom.mu, COL.ink, [5, 4], 1.5);
  ctx.save(); ctx.strokeStyle = COL.blue; ctx.lineWidth = 3; ctx.beginPath();
  const yb = box.y + 12; ctx.moveTo(A.X(S.mom.mu - S.mom.sd), yb); ctx.lineTo(A.X(S.mom.mu + S.mom.sd), yb); ctx.stroke(); ctx.restore();
  ctx.fillStyle = COL.blue; ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('μ ± σ', Math.min(A.X(S.mom.mu + S.mom.sd) + 6, box.x + box.w - 40), yb);
}
function renderMoments() {
  const M = S.mom;
  $('#momRow').innerHTML = [['μ', M.mu], ['σ²', M.s2], ['σ', M.sd], ['μ₄', M.m4], ['skewness', M.skew], ['excess kurt.', M.kurt]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${f4(v)}</dd></div>`).join('');
  $('#pmfNote').textContent = (S.preset === 'custom' ? 'Custom distribution drawn by hand.' : PRESETS[S.preset].note) +
    ' The experiment re-runs automatically when the distribution changes.';
}
function bindPmfDrag() {
  const el = $('#cvPmf'); let dragging = false, last = -1;
  const apply = ev => {
    if (!pmfBox) return;
    const r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, { box, ymax } = pmfBox;
    const j = Math.floor((x - box.x) / (box.w / 11)); if (j < 0 || j > 10) return;
    const v = Math.max(0, Math.min(0.95, (box.y + box.h - y) / box.h * ymax));
    const p = [...S.pmf], others = 1 - p[j];
    p[j] = v;
    for (let i = 0; i <= 10; i++) if (i !== j) p[i] = others > 1e-9 ? S.pmf[i] * (1 - v) / others : (1 - v) / 10;
    S.preset = 'custom'; setPmf(p); last = j;
    renderPresets(); renderMoments(); drawPmf();
  };
  el.addEventListener('pointerdown', ev => { dragging = true; el.setPointerCapture(ev.pointerId); apply(ev); });
  el.addEventListener('pointermove', ev => { if (dragging) apply(ev); });
  const end = () => { if (!dragging) return; dragging = false; if (last >= 0) onPmfChange(false); last = -1; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function onPmfChange(full) {
  if (full) renderPresets();
  renderMoments(); drawPmf(); trReset(); drawMerge(); drawKurt(); drawBudget(); schedule();
}

/* ======================= 06 · experiment ======================= */
function renderChips() {
  $('#nchips').innerHTML = N_OPTIONS.map(n => `<label><input type="checkbox" value="${n}" ${S.ns.includes(n) ? 'checked' : ''}>${nfmt(n)}</label>`).join('');
  $$('#nchips input').forEach(i => i.addEventListener('change', () => {
    const sel = $$('#nchips input').filter(x => x.checked).map(x => +x.value);
    if (sel.length < 2) { i.checked = true; return; }
    S.ns = sel; schedule();
  }));
}
function updateCost() {
  const draws = S.m * S.ns.reduce((a, b) => a + b, 0);
  $('#cost').textContent = `≈ ${(draws / 1e6).toFixed(1)} M scores · ${S.ns.length} values of n`;
}
async function runExperiment() {
  const tok = ++S.tok, t0 = performance.now(), m = S.m, ns = [...S.ns].sort((a, b) => a - b), nL = ns[ns.length - 1];
  document.body.classList.add('busy');
  const out = [], ledger = new Uint8Array(LEDGER_ROWS * LEDGER_COLS), ledgerStats = [];
  let work = 0;
  for (const n of ns) {
    const draw = sampler(rngFor('exp|' + n));
    const means = new Float64Array(m), vars = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const st = wInit();
      for (let i = 0; i < n; i++) {
        const x = draw();
        if (n === nL && j < LEDGER_ROWS && i < LEDGER_COLS) ledger[j * LEDGER_COLS + i] = x;
        wPush(st, x);
      }
      means[j] = st.avg; vars[j] = st.ss / (n - 1);
      if (n === nL && j < LEDGER_ROWS) ledgerStats.push([st.avg, st.ss / (n - 1)]);
      work += n;
      if (work > 3e6) {
        work = 0; status(`simulating n = ${nfmt(n)} … hacker ${nfmt(j + 1)}/${nfmt(m)}`);
        await tick(); if (tok !== S.tok) return;
      }
    }
    // across hackers: Welford again
    const A = wInit(), B = wInit(); let under = 0;
    for (let j = 0; j < m; j++) {
      wPush(A, means[j]); wPush(B, vars[j]);
      if (vars[j] < S.mom.s2) under++;
    }
    out.push({ n, means, vars, avgM: A.avg, sdM: Math.sqrt(wVar(A)), avgV: B.avg, sdV: Math.sqrt(wVar(B)),
      avgB: B.avg * (n - 1) / n, under: under / m });
  }
  if (tok !== S.tok) return;
  S.res = { m, ns, out, ledger, ledgerStats, nL, mom: { ...S.mom }, label: S.preset === 'custom' ? 'custom pmf' : PRESETS[S.preset].label };
  drawAll();
  document.body.classList.remove('busy');
  status(`done in ${Math.round(performance.now() - t0)} ms · seed “${S.seed}”`);
}
function drawLedger() {
  const R = S.res; if (!R) return;
  const { ctx, w, h } = cv('cvLedger');
  const cols = Math.min(LEDGER_COLS, R.nL, w < 600 ? 30 : LEDGER_COLS), rows = LEDGER_ROWS;
  $('#ledgerTitle').textContent = `Score ledger: first ${rows} hackers × first ${cols} systems (n = ${nfmt(R.nL)}), colour = score 0–10`;
  const L = 34, Rw = w < 500 ? 96 : 150, T = 18, B = 8;
  const gw = w - L - Rw - 8, gh = h - T - B, cw = gw / cols, ch = gh / rows;
  const shade = v => { // 0 → paper, 10 → red
    const t = v / 10, a = [244, 240, 230], b = [192, 57, 43];
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    ctx.fillStyle = shade(R.ledger[r * LEDGER_COLS + c]);
    ctx.fillRect(L + c * cw + 0.5, T + r * ch + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1));
  }
  ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = COL.soft; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
  ctx.fillText(`systems 1…${cols}${R.nL > cols ? ' (of ' + nfmt(R.nL) + ')' : ''} →`, L, T - 4);
  ctx.textAlign = 'left'; ctx.fillText(w < 500 ? 'x̄ · s²' : `x̄ · s² over all ${nfmt(R.nL)}`, L + gw + 10, T - 4);
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    const yy = T + r * ch + ch / 2;
    ctx.fillStyle = COL.soft; ctx.textAlign = 'right';
    if (r % 2 === 0) ctx.fillText('H' + String(r + 1).padStart(2, '0'), L - 4, yy);
    const [mm, vv] = R.ledgerStats[r]; ctx.fillStyle = COL.ink; ctx.textAlign = 'left';
    ctx.fillText(`${mm.toFixed(2)} · ${vv.toFixed(2)}`, L + gw + 10, yy);
  }
}
function drawAvgTable() {
  const R = S.res, M = R.mom;
  let t = '<thead><tr><th>n</th><th>avg x̄</th><th>± SE</th><th class="th">μ</th><th>avg s²</th><th>± SE</th><th class="th">σ²</th>' +
    '<th>sd(x̄)</th><th class="th">σ/√n</th><th>sd(s²)</th><th class="th">theory</th><th>hackers with s² &lt; σ²</th></tr></thead><tbody>';
  for (const o of R.out) {
    const seM = o.sdM / Math.sqrt(R.m), seV = o.sdV / Math.sqrt(R.m);
    const okM = Math.abs(o.avgM - M.mu) <= 3 * seM, okV = Math.abs(o.avgV - M.s2) <= 3 * seV;
    t += `<tr><td>${nfmt(o.n)}</td><td class="${okM ? 'cmp-good' : 'cmp-bad'}">${f4(o.avgM)}</td><td>${f4(seM)}</td><td class="th">${f4(M.mu)}</td>` +
      `<td class="${okV ? 'cmp-good' : 'cmp-bad'}">${f4(o.avgV)}</td><td>${f4(seV)}</td><td class="th">${f4(M.s2)}</td>` +
      `<td>${f4(o.sdM)}</td><td class="th">${f4(M.sd / Math.sqrt(o.n))}</td><td>${f4(o.sdV)}</td><td class="th">${f4(Math.sqrt(varS2(o.n)))}</td><td>${pct(o.under)}</td></tr>`;
  }
  $('#avgTable').innerHTML = t + '</tbody>';
}
function drawAvgCharts() {
  const R = S.res, M = R.mom, ns = R.ns, x0 = Math.max(1, ns[0] / 1.5), x1 = ns[ns.length - 1] * 1.5;
  // means
  {
    const { ctx, w, h } = cv('cvAvgMean'), box = { x: 56, y: 10, w: w - 66, h: h - 50 };
    let lo = M.mu, hi = M.mu;
    R.out.forEach(o => { const e = 2 * o.sdM / Math.sqrt(R.m); lo = Math.min(lo, o.avgM - e); hi = Math.max(hi, o.avgM + e); });
    const pad = Math.max((hi - lo) * 0.25, 0.02);
    const A = axes(ctx, box, [x0, x1], [lo - pad, hi + pad], { logx: true, xlabel: 'n (systems per hacker)', ny: 4, fy: v => v.toFixed(3) });
    clip(ctx, box); hline(ctx, A, M.mu, COL.ink);
    R.out.forEach(o => {
      const e = 2 * o.sdM / Math.sqrt(R.m), x = A.X(o.n);
      ctx.strokeStyle = COL.blue; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, A.Y(o.avgM - e)); ctx.lineTo(x, A.Y(o.avgM + e)); ctx.stroke();
      ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(x, A.Y(o.avgM), 4, 0, 7); ctx.fill();
    });
    ctx.restore();
    legend(ctx, box.x + box.w - 200, box.y + 14, [{ col: COL.blue, label: 'avg of x̄ (± 2 SE)', dot: true }, { col: COL.ink, label: 'μ', dash: [6, 4], lw: 1.5 }]);
  }
  // variances
  {
    const { ctx, w, h } = cv('cvAvgVar'), box = { x: 56, y: 10, w: w - 66, h: h - 50 };
    let lo = M.s2 * (ns[0] - 1) / ns[0], hi = M.s2;
    R.out.forEach(o => { const e = 2 * o.sdV / Math.sqrt(R.m); lo = Math.min(lo, o.avgB, o.avgV - e); hi = Math.max(hi, o.avgV + e); });
    const pad = (hi - lo) * 0.12 || 0.1;
    const A = axes(ctx, box, [x0, x1], [Math.max(0, lo - pad), hi + pad], { logx: true, xlabel: 'n (systems per hacker)', ny: 4 });
    clip(ctx, box); hline(ctx, A, M.s2, COL.ink);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const n = x0 * Math.pow(x1 / x0, i / 120), y = n >= 1 ? M.s2 * (n - 1) / n : 0; i ? ctx.lineTo(A.X(n), A.Y(y)) : ctx.moveTo(A.X(n), A.Y(y)); }
    ctx.stroke(); ctx.setLineDash([]);
    R.out.forEach(o => {
      const e = 2 * o.sdV / Math.sqrt(R.m), x = A.X(o.n);
      ctx.strokeStyle = COL.green; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, A.Y(o.avgV - e)); ctx.lineTo(x, A.Y(o.avgV + e)); ctx.stroke();
      ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(x, A.Y(o.avgV), 4, 0, 7); ctx.fill();
      ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, A.Y(o.avgB), 4, 0, 7); ctx.stroke();
    });
    ctx.restore();
    legend(ctx, box.x + box.w - 220, box.y + box.h - 52, [
      { col: COL.green, label: 'avg of s² = SS/(n−1)', dot: true },
      { col: COL.gold, label: 'avg of SS/n (biased)', dot: true, hollow: true },
      { col: COL.ink, label: 'σ²', dash: [6, 4], lw: 1.5 }
    ]);
  }
}
function drawSpread() {
  const R = S.res, M = R.mom, ns = R.ns, x0 = Math.max(1, ns[0] / 1.5), x1 = ns[ns.length - 1] * 1.5;
  const { ctx, w, h } = cv('cvSpread'), box = { x: 66, y: 12, w: w - 80, h: h - 56 };
  const thM = n => M.sd / Math.sqrt(n), thV = n => Math.sqrt(Math.max(varS2(Math.max(n, 2)), 1e-12));
  let lo = Infinity, hi = 0;
  R.out.forEach(o => { lo = Math.min(lo, o.sdM, o.sdV); hi = Math.max(hi, o.sdM, o.sdV); });
  lo = Math.min(lo, thM(x1)); hi = Math.max(hi, thV(Math.max(2, x0)));
  const yd = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
  const A = axes(ctx, box, [x0, x1], yd, { logx: true, logy: true, xlabel: 'n (systems per hacker)', ylabel: 'sd across hackers', ylabelOff: 58 });
  clip(ctx, box);
  [[thM, COL.blue], [thV, COL.green]].forEach(([f, c]) => {
    ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const n = Math.max(2, x0 * Math.pow(x1 / x0, i / 120)), y = f(n); i ? ctx.lineTo(A.X(n), A.Y(y)) : ctx.moveTo(A.X(n), A.Y(y)); }
    ctx.stroke(); ctx.setLineDash([]);
  });
  R.out.forEach(o => {
    ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(A.X(o.n), A.Y(o.sdM), 4, 0, 7); ctx.fill();
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.rect(A.X(o.n) - 3.5, A.Y(o.sdV) - 3.5, 7, 7); ctx.fill();
  });
  ctx.restore();
  legend(ctx, box.x + box.w - 250, box.y + 14, [
    { col: COL.green, label: 'sd of s² (simulated)', dot: true }, { col: COL.green, label: '√Var(s²) theory', dash: [6, 4], lw: 1.5 },
    { col: COL.blue, label: 'sd of x̄ (simulated)', dot: true }, { col: COL.blue, label: 'σ/√n theory', dash: [6, 4], lw: 1.5 }
  ]);
  const slope = key => {
    const pts = R.out.filter(o => o.n >= 10).map(o => [Math.log10(o.n), Math.log10(o[key])]);
    if (pts.length < 2) return NaN;
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let nu = 0, de = 0; pts.forEach(([x, y]) => { nu += (x - mx) * (y - my); de += (x - mx) ** 2; }); return nu / de;
  };
  $('#spreadNote').textContent = `fitted log-log slopes (n ≥ 10): sd(x̄) ${slope('sdM').toFixed(3)} · sd(s²) ${slope('sdV').toFixed(3)} · theory −0.5 for both`;
}
function pickHistNs(ns) {
  if (ns.length <= 4) return ns;
  const idx = [0, Math.round((ns.length - 1) / 3), Math.round(2 * (ns.length - 1) / 3), ns.length - 1];
  return [...new Set(idx)].map(i => ns[i]);
}
function latticeHist(vals, lo, hi, unit, target = 34) {
  const raw = (hi - lo) / target, k = Math.max(1, Math.ceil(raw / unit - 1e-9)), bw = k * unit;
  const start = (Math.floor(lo / unit + 1e-9) - 0.5) * unit;
  const G = Math.max(1, Math.ceil((hi - start) / bw)), cnt = new Float64Array(G);
  let inside = 0;
  for (let i = 0; i < vals.length; i++) { const g = Math.floor((vals[i] - start) / bw + 1e-9); if (g >= 0 && g < G) { cnt[g]++; inside++; } }
  return { start, bw, G, d: [...cnt].map(c => c / (vals.length * bw)) };
}
function drawHists() {
  const R = S.res, M = R.mom, sel = pickHistNs(R.ns);
  $('#histMeans').innerHTML = sel.map((n, i) => `<div class="figure"><div class="fig-title">x̄ · n = ${nfmt(n)}</div><canvas id="hm${i}"></canvas></div>`).join('');
  $('#histVars').innerHTML = sel.map((n, i) => `<div class="figure"><div class="fig-title">s² · n = ${nfmt(n)}</div><canvas id="hv${i}"></canvas></div>`).join('');
  sel.forEach((n, i) => {
    const o = R.out.find(q => q.n === n);
    // means
    {
      const { ctx, w, h } = cv('hm' + i), box = { x: 8, y: 6, w: w - 16, h: h - 26 };
      const sd = M.sd / Math.sqrt(n), lo = Math.max(0, M.mu - 4.2 * sd), hi = Math.min(10, M.mu + 4.2 * sd);
      const H = latticeHist(o.means, lo, hi, 1 / n);
      const xs = [H.start, H.start + H.G * H.bw];
      let ymax = phi(0) / sd; H.d.forEach(v => { ymax = Math.max(ymax, v); });
      const A = axes(ctx, box, xs, [0, ymax * 1.1], { noY: true, yticks: [], nx: 3 });
      clip(ctx, box);
      ctx.fillStyle = COL.blue; ctx.globalAlpha = 0.5;
      H.d.forEach((v, g) => { if (v > 0) { const a = A.X(H.start + g * H.bw), b = A.X(H.start + (g + 1) * H.bw); ctx.fillRect(a, A.Y(v), Math.max(1, b - a - (b - a > 4 ? 1 : 0)), A.Y(0) - A.Y(v)); } });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]); ctx.beginPath();
      for (let k = 0; k <= 160; k++) { const x = xs[0] + (xs[1] - xs[0]) * k / 160, y = phi((x - M.mu) / sd) / sd; k ? ctx.lineTo(A.X(x), A.Y(y)) : ctx.moveTo(A.X(x), A.Y(y)); }
      ctx.stroke(); ctx.setLineDash([]);
      vline(ctx, A, M.mu, COL.red, [], 1.5);
      ctx.restore();
    }
    // variances
    {
      const { ctx, w, h } = cv('hv' + i), box = { x: 8, y: 6, w: w - 16, h: h - 26 };
      const sorted = Float64Array.from(o.vars).sort(), q995 = sorted[Math.floor(0.995 * (sorted.length - 1))];
      const hi = Math.max(q995, M.s2 * 1.3), lo = n < 30 ? 0 : Math.max(0, sorted[Math.floor(0.002 * (sorted.length - 1))]);
      const H = latticeHist(o.vars, lo, hi, n <= 30 ? 1 / (n * (n - 1)) : 1e-9);
      const xs = [Math.max(H.start, n < 30 ? -H.bw / 2 : H.start), H.start + H.G * H.bw];
      let ymax = 0; H.d.forEach(v => { ymax = Math.max(ymax, v); });
      const A = axes(ctx, box, xs, [0, ymax * 1.1 || 1], { noY: true, yticks: [], nx: 3 });
      clip(ctx, box);
      ctx.fillStyle = COL.green; ctx.globalAlpha = 0.5;
      H.d.forEach((v, g) => { if (v > 0) { const a = A.X(H.start + g * H.bw), b = A.X(H.start + (g + 1) * H.bw); ctx.fillRect(a, A.Y(v), Math.max(1, b - a - (b - a > 4 ? 1 : 0)), A.Y(0) - A.Y(v)); } });
      ctx.globalAlpha = 1;
      vline(ctx, A, M.s2, COL.red, [], 1.5);
      vline(ctx, A, o.avgV, COL.ink, [3, 3], 1.2);
      ctx.restore();
      const above = o.vars.reduce((a, v) => a + (v > M.s2 ? 1 : 0), 0) / o.vars.length;
      ctx.fillStyle = COL.soft; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(`${pct(1 - above)} below σ²`, box.x + box.w - 4, box.y + 4);
    }
  });
}
function momentsOf(p) {
  let mu = 0; p.forEach((q, j) => mu += j * q);
  let m2 = 0, m4 = 0; p.forEach((q, j) => { const d = j - mu; m2 += d * d * q; m4 += d ** 4 * q; });
  return { mu, s2: m2, m4 };
}
const relSdS2 = (mm, n) => Math.sqrt(Math.max((mm.m4 - (n - 3) / (n - 1) * mm.s2 * mm.s2) / n, 0)) / mm.s2;
function lawList() {
  const cols = [COL.red, COL.blue, COL.green, COL.gold, COL.ink];
  const L = Object.entries(PRESETS).map(([k, v], i) => ({ key: k, label: v.label, mm: momentsOf(v.pmf()), col: cols[i] }));
  if (S.preset === 'custom') L.push({ key: 'custom', label: 'Custom (drawn)', mm: momentsOf(S.pmf), col: '#8e44ad' });
  return L;
}
function drawKurt() {
  const { ctx, w, h } = cv('cvKurt'), box = { x: 60, y: 10, w: w - 72, h: h - 50 }, L = lawList();
  const x0 = 2, x1 = 2000;
  let lo = Infinity, hi = 0;
  L.forEach(l => { lo = Math.min(lo, relSdS2(l.mm, x1)); hi = Math.max(hi, relSdS2(l.mm, x0)); });
  const yd = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
  const A = axes(ctx, box, [x0, x1], yd, { logx: true, logy: true, xlabel: 'n (systems per hacker)', ylabel: 'sd(s²) / σ²', ylabelOff: 52,
    fy: v => (v >= 1 ? (v * 100).toFixed(0) + '%' : (+(v * 100).toPrecision(2)) + '%') });
  clip(ctx, box);
  L.forEach(l => {
    const cur = l.key === S.preset;
    ctx.strokeStyle = l.col; ctx.lineWidth = cur ? 3.2 : 1.4; ctx.globalAlpha = cur ? 1 : 0.75; ctx.beginPath();
    for (let i = 0; i <= 150; i++) { const n = x0 * Math.pow(x1 / x0, i / 150), y = relSdS2(l.mm, n); i ? ctx.lineTo(A.X(n), A.Y(y)) : ctx.moveTo(A.X(n), A.Y(y)); }
    ctx.stroke(); ctx.globalAlpha = 1;
  });
  ctx.restore();
  legend(ctx, box.x + box.w - 250, box.y + 14, L.map(l => ({ col: l.col, lw: l.key === S.preset ? 3.2 : 1.4,
    label: `${l.label} (κ=${(l.mm.m4 / (l.mm.s2 * l.mm.s2)).toFixed(2)})${l.key === S.preset ? ' ◀' : ''}` })));
}
function nForMean(mm, a) { return Math.max(2, Math.ceil(mm.s2 / (a * a))); }
function nForVar(mm, r) {
  let lo = 2, hi = 2;
  while (relSdS2(mm, hi) > r && hi < 1e9) hi *= 2;
  if (relSdS2(mm, lo) <= r) return lo;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; relSdS2(mm, mid) > r ? lo = mid : hi = mid; }
  return hi;
}
function drawBudget() {
  const a = +$('#tm').value, r = +$('#tv').value;
  $('#tmOut').textContent = a.toFixed(2); $('#tvOut').textContent = Math.round(r * 100) + '%';
  const L = lawList();
  let t = '<thead><tr><th>score law</th><th>σ²</th><th>kurtosis μ₄/σ⁴</th><th>n for sd(x̄) ≤ ' + a.toFixed(2) + '</th><th>n for sd(s²) ≤ ' + Math.round(r * 100) + '% σ²</th></tr></thead><tbody>';
  L.forEach(l => {
    t += `<tr class="${l.key === S.preset ? 'cur' : ''}"><td>${l.label}${l.key === S.preset ? ' ◀' : ''}</td><td>${f4(l.mm.s2)}</td><td>${(l.mm.m4 / (l.mm.s2 * l.mm.s2)).toFixed(2)}</td>` +
      `<td>${nfmt(nForMean(l.mm, a))}</td><td>${nfmt(nForVar(l.mm, r))}</td></tr>`;
  });
  $('#budgetTable').innerHTML = t + '</tbody>';
  $('#budgetNote').textContent = 'n for the mean uses Var(x̄) = σ²/n, so it depends on σ² (an absolute target in score points). n for the variance uses the exact Var(s²): it is a relative target, so it depends only on the kurtosis.';
}
function fillAnswers() {
  const R = S.res, M = R.mom, set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const first = R.out[0], last = R.out[R.out.length - 1];
  set('a-dist', R.label); set('a-m', nfmt(R.m)); set('a-seed', S.seed);
  set('a-mu', f4(M.mu)); set('a-s2', f4(M.s2));
  const gaps = R.out.map(o => Math.abs(o.avgM - M.mu) / (o.sdM / Math.sqrt(R.m)));
  set('a-gapm', Math.max(...gaps).toFixed(2));
  set('a-nmin', nfmt(first.n)); set('a-vmin', f4(first.avgV)); set('a-nmin2', nfmt(first.n));
  set('a-bias', f4(M.s2 * (first.n - 1) / first.n)); set('a-bmin', f4(first.avgB));
  const mid = R.out.find(o => o.n >= 10) || first;
  set('a-n3', nfmt(mid.n)); set('a-under', pct(mid.under));
  set('a-n1', nfmt(first.n)); set('a-n2', nfmt(last.n));
  set('a-sdm1', f4(first.sdM)); set('a-sdm2', f4(last.sdM));
  set('a-thm1', f4(M.sd / Math.sqrt(first.n))); set('a-thm2', f4(M.sd / Math.sqrt(last.n)));
  set('a-sdv1', f4(first.sdV)); set('a-sdv2', f4(last.sdV));
  const mm = { mu: M.mu, s2: M.s2, m4: M.m4 };
  set('a-nm', nfmt(nForMean(mm, +$('#tm').value))); set('a-nv', nfmt(nForVar(mm, +$('#tv').value)));
}
function drawAll() {
  if (!S.res) return;
  drawLedger(); drawAvgTable(); drawAvgCharts(); drawSpread(); drawHists(); fillAnswers();
}

/* ======================= orchestration ======================= */
let schedT;
function schedule() { clearTimeout(schedT); updateCost(); schedT = setTimeout(runExperiment, 250); }
function bind() {
  bindCodeTabs(); bindPmfDrag();
  $('#trStep').addEventListener('click', () => { trStop(); trStep(); });
  $('#trReset').addEventListener('click', trReset);
  $('#trPlay').addEventListener('click', () => {
    if (TR.timer) { trStop(); return; }
    if (TR.xs.length >= TR.MAX) trReset();
    $('#trPlay').textContent = 'Pause';
    TR.timer = setInterval(() => { trStep(); if (TR.xs.length >= TR.MAX) trStop(); }, 90);
  });
  $('#sens').addEventListener('input', drawMerge);
  $('#tm').addEventListener('input', () => { drawBudget(); if (S.res) fillAnswers(); });
  $('#tv').addEventListener('input', () => { drawBudget(); if (S.res) fillAnswers(); });
  $('#m').addEventListener('change', () => { S.m = +$('#m').value; schedule(); });
  $('#seed').addEventListener('change', () => { S.seed = $('#seed').value.trim() || 'seed'; trReset(); drawMerge(); schedule(); });
  $('#reseed').addEventListener('click', () => { $('#seed').value = Math.random().toString(36).slice(2, 8); S.seed = $('#seed').value; trReset(); drawMerge(); schedule(); });
  $('#run').addEventListener('click', runExperiment);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawPmf(); drawTrace(); drawKurt(); drawAll(); }, 150); });
  const links = $$('#toc a');
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => obs.observe(s));
}
function init() {
  setPmf(PRESETS[S.preset].pmf());
  renderPresets(); renderChips(); bind();
  renderMoments(); drawPmf(); trReset(); drawMerge(); drawKurt(); drawBudget(); updateCost(); runExperiment();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawPmf(); drawTrace(); drawKurt(); drawAll(); });
}
document.addEventListener('DOMContentLoaded', init);
