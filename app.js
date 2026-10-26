'use strict';
/* =====================================================================
   Breach Ledger — HW3 Statistics (LLN & CLT on a penetration process)
   Vanilla JS + Canvas 2D. No chart libraries.
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const COL = {
  ink: '#16202a', soft: '#5b6670', grid: '#e6dfcf', rule: '#cfc4ad', card: '#fbf8f1',
  off: '#e7dfcd', empty: '#f3eee3', total: '#c0392b', avg: '#1d4f91', norm: '#2e7d57', gold: '#b8860b'
};
const Q = [
  { key: 'total', name: 'Total score',      sym: 'Sₙ',    col: COL.total, c: n => 1 },
  { key: 'avg',   name: 'Average score',    sym: 'Sₙ/n',  col: COL.avg,   c: n => 1 / n },
  { key: 'norm',  name: 'Normalized total', sym: 'Sₙ/√n', col: COL.norm,  c: n => 1 / Math.sqrt(n) }
];
const PATH_NS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const CLT_NS = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800, 1200, 2000, 3000, 5000];
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = {
  model: 'bern', p: 0.3, m: 1000, nmax: 10000, seed: 'sapienza-26', cltModel: 'rad',
  tokMain: 0, tokClt: 0, data: null, clt: null, paths: null
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
function hashSeed(str) { // FNV-1a
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rngFor = tag => mulberry32(hashSeed(S.seed + '|' + tag));

/* ======================= math ======================= */
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function erf(x) { // Abramowitz & Stegun 7.1.26
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

function logGrid(a, b, k) {
  const s = new Set();
  for (let i = 0; i < k; i++) s.add(Math.round(a * Math.pow(b / a, i / (k - 1))));
  return [...s].sort((x, y) => x - y);
}
const uniqSort = arr => [...new Set(arr)].sort((x, y) => x - y);

/* moments of y = c*arr[i] + d */
function moments(arr, c = 1, d = 0) {
  const m = arr.length;
  let s1 = 0;
  for (let i = 0; i < m; i++) s1 += c * arr[i] + d;
  const mu = s1 / m;
  let s2 = 0, s3 = 0, s4 = 0;
  for (let i = 0; i < m; i++) {
    const e = c * arr[i] + d - mu, e2 = e * e;
    s2 += e2; s3 += e2 * e; s4 += e2 * e2;
  }
  const v = s2 / (m - 1), vb = s2 / m;
  return { mean: mu, var: v, sd: Math.sqrt(v), skew: (s3 / m) / Math.pow(vb, 1.5), kurt: (s4 / m) / (vb * vb) - 3 };
}

/* ======================= model ======================= */
function makeModel(type, p) {
  if (type === 'rad') return { type: 'rad', p: 0.5, lo: -1, hi: 1, mu: 0, v: 1, sd: 1, h: 2, rho: 1, label: 'Rademacher ±1' };
  const q = 1 - p;
  return { type: 'bern', p, lo: 0, hi: 1, mu: p, v: p * q, sd: Math.sqrt(p * q), h: 1, rho: p * q * (p * p + q * q), label: `Bernoulli(p = ${p.toFixed(2)})` };
}
const model = () => makeModel(S.model, S.p);
const origin = (M, n) => (M.type === 'rad' ? -n : 0);

/* ======================= formatting ======================= */
function fmt(v) {
  if (v === 0) return '0';
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(1).replace('e+', 'e');
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return (+v.toFixed(1)).toString();
  if (a >= 1) return (+v.toFixed(2)).toString();
  if (a >= 0.001) return (+v.toPrecision(3)).toString();
  return v.toExponential(1);
}
const pct = v => (100 * v).toFixed(1) + '%';
const nfmt = n => n.toLocaleString('en-US');
function status(t) { $('#status').textContent = t; }

/* ======================= simulation ======================= */
const tick = () => new Promise(r => setTimeout(r, 0));

/* m trajectories up to max(cps); records S_k at every checkpoint k in cps (sorted, unique). */
async function simFinals(M, m, cps, rng, onProg, alive) {
  const nmax = cps[cps.length - 1];
  const out = cps.map(() => new Int32Array(m));
  const p = M.p, lo = M.lo, hi = M.hi;
  let work = 0;
  for (let j = 0; j < m; j++) {
    let s = 0, c = 0;
    for (let i = 1; i <= nmax; i++) {
      s += rng() < p ? hi : lo;
      if (i === cps[c]) { out[c][j] = s; c++; }
    }
    work += nmax;
    if (work > 4e6) {
      work = 0;
      if (onProg) onProg((j + 1) / m);
      await tick();
      if (alive && !alive()) return null;
    }
  }
  return out;
}

/* Histogram aligned on the lattice of attainable values.
   Values plotted are x = c*S + d; S = o + h*j, j = number of successes in 0..n.
   Returns bins with empirical density d and exact Binomial density t. */
function latticeHist(Sarr, lo, hi, n, M, c, d = 0, target = 56) {
  const o = origin(M, n), h = M.h, w = c * h;
  const jlo = Math.max(0, Math.ceil(((lo - d) / c - o) / h - 1e-9));
  const jhi = Math.min(n, Math.floor(((hi - d) / c - o) / h + 1e-9));
  if (jhi < jlo) return { bins: [], x0: lo, x1: hi };
  const L = jhi - jlo + 1, k = Math.max(1, Math.ceil(L / target)), G = Math.ceil(L / k);
  const cnt = new Float64Array(G), th = new Float64Array(G), m = Sarr.length;
  for (let i = 0; i < m; i++) {
    const j = Math.round((Sarr[i] - o) / h);
    if (j >= jlo && j <= jhi) cnt[((j - jlo) / k) | 0]++;
  }
  const ln = lgamma(n + 1), lp = Math.log(M.p), lq = Math.log(1 - M.p);
  for (let j = jlo; j <= jhi; j++) {
    const l = ln - lgamma(j + 1) - lgamma(n - j + 1) + j * lp + (n - j) * lq;
    if (l > -700) th[((j - jlo) / k) | 0] += Math.exp(l);
  }
  const bins = [];
  for (let g = 0; g < G; g++) {
    const ja = jlo + g * k, nb = Math.min(k, jhi - ja + 1);
    const x0 = c * (o + h * ja) + d - w / 2, wd = nb * w;
    bins.push({ x0, x1: x0 + wd, d: cnt[g] / (m * wd), t: th[g] / wd });
  }
  return { bins, x0: bins[0].x0, x1: bins[G - 1].x1 };
}

/* ======================= canvas helpers ======================= */
function cv(id) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  const dpr = window.devicePixelRatio || 1;
  const r = el.getBoundingClientRect();
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
  const ctx = el.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function scale(d0, d1, r0, r1, log) {
  if (log) { const a = Math.log10(d0), b = Math.log10(d1); return v => r0 + (Math.log10(v) - a) / (b - a) * (r1 - r0); }
  return v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
}
function niceTicks(a, b, k = 5) {
  if (!(b > a)) return [a];
  const raw = (b - a) / k, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
  const st = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const t = [];
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) t.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
  return t;
}
function logTicks(a, b) {
  const t = [];
  for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.floor(Math.log10(b) + 1e-9); e++) t.push(Math.pow(10, e));
  return t;
}
function axes(ctx, box, xd, yd, o = {}) {
  const X = scale(xd[0], xd[1], box.x, box.x + box.w, o.logx);
  const Y = scale(yd[0], yd[1], box.y + box.h, box.y, o.logy);
  const xt = o.xticks || (o.logx ? logTicks(xd[0], xd[1]) : niceTicks(xd[0], xd[1], o.nx || 6));
  const yt = o.yticks || (o.logy ? logTicks(yd[0], yd[1]) : niceTicks(yd[0], yd[1], o.ny || 5));
  ctx.save();
  ctx.fillStyle = COL.card; ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.lineWidth = 1; ctx.strokeStyle = COL.grid; ctx.beginPath();
  for (const x of xt) { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); }
  for (const y of yt) { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py); }
  ctx.stroke();
  ctx.strokeStyle = COL.ink;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.fillStyle = COL.soft;
  if (!o.noX) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of xt) ctx.fillText((o.fx || fmt)(x), X(x), box.y + box.h + 4); }
  if (!o.noY) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const y of yt) ctx.fillText((o.fy || fmt)(y), box.x - 5, Y(y)); }
  ctx.fillStyle = COL.ink; ctx.font = '11px "IBM Plex Mono", monospace';
  if (o.xlabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(o.xlabel, box.x + box.w, box.y + box.h + 18); }
  if (o.ylabel) {
    ctx.save(); ctx.translate(box.x - (o.ylabelOff || 48), box.y + box.h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, 0); ctx.restore();
  }
  ctx.restore();
  return { X, Y, box };
}
function clip(ctx, box) { ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip(); }
function legend(ctx, x, y, items) {
  ctx.save();
  ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
  const wmax = Math.max(...items.map(it => ctx.measureText(it.label).width)) + 32;
  ctx.fillStyle = 'rgba(251,248,241,.92)'; ctx.strokeStyle = COL.rule;
  ctx.fillRect(x - 6, y - 10, wmax + 8, items.length * 16 + 4);
  ctx.strokeRect(x - 6.5, y - 10.5, wmax + 8, items.length * 16 + 4);
  let yy = y;
  for (const it of items) {
    ctx.strokeStyle = it.col; ctx.fillStyle = it.col; ctx.lineWidth = it.lw || 2; ctx.setLineDash(it.dash || []);
    if (it.box) { ctx.globalAlpha = 0.55; ctx.fillRect(x, yy - 5, 16, 10); ctx.globalAlpha = 1; }
    else if (it.dot) { ctx.beginPath(); ctx.arc(x + 8, yy, 3.5, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 16, yy); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.fillText(it.label, x + 22, yy);
    yy += 16;
  }
  ctx.restore();
}
function drawBars(ctx, A, bins, col, alpha = 0.55) {
  ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = alpha;
  const y0 = A.Y(0);
  for (const b of bins) {
    if (b.d <= 0) continue;
    const x0 = A.X(b.x0), x1 = A.X(b.x1), y = A.Y(b.d), gap = x1 - x0 > 5 ? 1 : 0;
    ctx.fillRect(x0, y, Math.max(1, x1 - x0 - gap), y0 - y);
  }
  ctx.restore();
}
function drawTheoStep(ctx, A, bins, col = COL.ink, lw = 1.3) {
  if (!bins.length) return;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  ctx.moveTo(A.X(bins[0].x0), A.Y(0));
  for (const b of bins) { const y = A.Y(b.t); ctx.lineTo(A.X(b.x0), y); ctx.lineTo(A.X(b.x1), y); }
  ctx.lineTo(A.X(bins[bins.length - 1].x1), A.Y(0));
  ctx.stroke(); ctx.restore();
}
function curve(ctx, A, f, a, b, steps, col, lw = 2, dash = []) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const x = a + (b - a) * i / steps, y = f(x);
    i ? ctx.lineTo(A.X(x), A.Y(y)) : ctx.moveTo(A.X(x), A.Y(y));
  }
  ctx.stroke(); ctx.restore();
}
const RAF = {};
function animate(key, dur, fn) {
  cancelAnimationFrame(RAF[key]);
  if (REDUCED || dur <= 0) { fn(1); return; }
  const t0 = performance.now();
  const step = t => { const f = Math.min(1, (t - t0) / dur); fn(f); if (f < 1) RAF[key] = requestAnimationFrame(step); };
  RAF[key] = requestAnimationFrame(step);
}

/* ======================= 01 · Pascal lattice ======================= */
function drawLattice() {
  const { ctx, w, h } = cv('cvLattice');
  const N = 8, L = 22, R = Math.min(90, w * 0.2), T = 14, B = 26;
  const dx = (w - L - R - 14) / N, dy = (h - T - B) / N, cy = T + (h - T - B) / 2;
  const pos = (k, j) => [L + k * dx, cy - (j - k / 2) * dy];
  const C = [[1]];
  for (let k = 1; k <= N; k++) { C[k] = []; for (let j = 0; j <= k; j++) C[k][j] = (C[k - 1][j - 1] || 0) + (C[k - 1][j] || 0); }
  ctx.strokeStyle = COL.rule; ctx.lineWidth = 1;
  for (let k = 0; k < N; k++) for (let j = 0; j <= k; j++) {
    const [x, y] = pos(k, j), [x1, y1] = pos(k + 1, j), [x2, y2] = pos(k + 1, j + 1);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.font = '9.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= N; k++) for (let j = 0; j <= k; j++) {
    const [x, y] = pos(k, j), frac = C[k][j] / Math.pow(2, k);
    ctx.fillStyle = COL.card; ctx.strokeStyle = COL.ink;
    ctx.beginPath(); ctx.arc(x, y, 9.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = Math.min(1, 0.15 + frac * 2.2); ctx.fillStyle = COL.total;
    ctx.beginPath(); ctx.arc(x, y, 9.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = COL.ink; ctx.fillText(C[k][j], x, y + 0.5);
  }
  const bx = L + N * dx + 18, bw = R - 10;
  for (let j = 0; j <= N; j++) {
    const [, y] = pos(N, j), len = C[N][j] / 70 * bw;
    ctx.fillStyle = COL.total; ctx.globalAlpha = 0.55; ctx.fillRect(bx, y - dy * 0.3, len, dy * 0.6); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = COL.soft; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('k = 0 … 8 systems →', L - 8, h - 4);
  ctx.textAlign = 'right'; ctx.fillText('C(8, j)', w - 4, h - 4);
}

/* ======================= 02 · Breach matrix ======================= */
const MX = { rows: 0, cols: 60, g: null, M: null, k: 0 };
function runMatrix() {
  const M = model(), rng = rngFor('matrix');
  MX.rows = Math.min(28, S.m); MX.M = M;
  MX.g = new Int8Array(MX.rows * MX.cols);
  for (let i = 0; i < MX.g.length; i++) MX.g[i] = rng() < M.p ? M.hi : M.lo;
  animate('matrix', 1500, f => drawMatrix(Math.max(1, Math.ceil(f * MX.cols))));
}
function drawMatrix(k = MX.k || MX.cols) {
  if (!MX.g) return;
  MX.k = k;
  const { ctx, w, h } = cv('cvMatrix');
  const { rows, cols, g, M } = MX;
  const L = 40, R = Math.max(110, Math.min(190, w * 0.25)), T = 22, B = 58;
  const gw = w - L - R - 10, gh = h - T - B, cw = gw / cols, ch = gh / rows;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = COL.soft; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
  ctx.fillText('systems 1 … n →', L, T - 6);
  ctx.textAlign = 'right'; ctx.fillText(`probed ${k}/${cols}`, L + gw, T - 6);
  const sums = new Array(rows).fill(0);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = L + c * cw, y = T + r * ch;
    if (c < k) {
      const v = g[r * cols + c]; sums[r] += v;
      ctx.fillStyle = v === 1 ? COL.total : (M.type === 'rad' ? COL.avg : COL.off);
      ctx.globalAlpha = v === 1 ? 0.92 : (M.type === 'rad' ? 0.55 : 1);
    } else { ctx.fillStyle = COL.empty; ctx.globalAlpha = 1; }
    ctx.fillRect(x + 0.5, y + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COL.soft; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) if (rows <= 16 || r % 2 === 0) ctx.fillText('A' + String(r + 1).padStart(2, '0'), L - 5, T + r * ch + ch / 2);
  // row scores
  const sx = L + gw + 12, sw = R - 12 - 46;
  ctx.fillStyle = COL.soft; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('score Sₖ', sx, T - 6);
  if (M.type === 'rad') { ctx.strokeStyle = COL.rule; ctx.beginPath(); ctx.moveTo(sx + sw / 2 + 0.5, T); ctx.lineTo(sx + sw / 2 + 0.5, T + gh); ctx.stroke(); }
  for (let r = 0; r < rows; r++) {
    const y = T + r * ch + ch * 0.18, bh = ch * 0.64, s = sums[r];
    ctx.fillStyle = s >= 0 ? COL.ink : COL.avg; ctx.globalAlpha = 0.75;
    if (M.type === 'rad') { const len = s / cols * (sw / 2); ctx.fillRect(Math.min(sx + sw / 2, sx + sw / 2 + len), y, Math.abs(len), bh); }
    else ctx.fillRect(sx, y, s / cols * sw, bh);
    ctx.globalAlpha = 1; ctx.fillStyle = COL.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s), sx + sw + 40, y + bh / 2);
  }
  // column breach fraction
  const base = h - 16, H = B - 26;
  ctx.strokeStyle = COL.rule; ctx.beginPath(); ctx.moveTo(L, base + 0.5); ctx.lineTo(L + gw, base + 0.5); ctx.stroke();
  for (let c = 0; c < k; c++) {
    let br = 0; for (let r = 0; r < rows; r++) if (g[r * cols + c] === 1) br++;
    const fr = br / rows;
    ctx.fillStyle = COL.total; ctx.globalAlpha = 0.6; ctx.fillRect(L + c * cw + 1, base - H * fr, Math.max(1, cw - 2), H * fr);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([4, 3]); ctx.strokeStyle = COL.ink; ctx.beginPath();
  ctx.moveTo(L, base - H * M.p + 0.5); ctx.lineTo(L + gw, base - H * M.p + 0.5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COL.soft; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`breach fraction per system (dashed = ${M.type === 'rad' ? '1/2' : 'p'})`, L, h - 2);
  // stats
  const rates = sums.map(s => (M.type === 'rad' ? (s + k) / 2 : s) / k);
  const mean = rates.reduce((a, b) => a + b, 0) / rows;
  const best = Math.max(...sums), worst = Math.min(...sums);
  $('#matrixStats').textContent = `after k = ${k} systems · mean breach rate over ${rows} attackers = ${mean.toFixed(3)} (true ${M.p.toFixed(2)}) · best Sₖ = ${best} · worst Sₖ = ${worst}`;
}

/* ======================= 03 · Trajectories ======================= */
function runPaths() {
  const M = model(), n = PATH_NS[+$('#pathN').value], m = +$('#pathM').value;
  $('#pathNOut').textContent = nfmt(n);
  const rng = rngFor('paths|' + n + '|' + m);
  const stride = Math.max(1, Math.floor(n / 300));
  const idx = [];
  for (let k = 1; k <= n; k++) if (k === 1 || k % stride === 0 || k === n) idx.push(k);
  const K = idx.length, raw = new Float64Array(m * K);
  for (let j = 0; j < m; j++) {
    let s = 0, c = 0;
    for (let k = 1; k <= n; k++) { s += rng() < M.p ? M.hi : M.lo; if (k === idx[c]) { raw[j * K + c] = s; c++; } }
  }
  const vals = [0, 1, 2].map(qi => {
    const a = new Float32Array(m * K);
    for (let j = 0; j < m; j++) for (let c = 0; c < K; c++) {
      const s = raw[j * K + c], k = idx[c];
      a[j * K + c] = qi === 0 ? s : qi === 1 ? s / k : s / Math.sqrt(k);
    }
    return a;
  });
  const range = vals.map(a => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    const pad = (hi - lo || 1) * 0.06;
    return [lo - pad, hi + pad];
  });
  S.paths = { M, n, m, idx, K, vals, range, upTo: K };
  [0, 1, 2].forEach(qi => {
    const c = (K - 1), arr = [];
    for (let j = 0; j < m; j++) arr.push(vals[qi][j * K + c]);
    const mo = moments(arr), sk = Math.sqrt(n);
    const th = qi === 0 ? [M.mu * n, M.sd * sk] : qi === 1 ? [M.mu, M.sd / sk] : [M.mu * sk, M.sd];
    $('#pathStat' + qi).textContent = `at n=${nfmt(n)}: mean ${fmt(mo.mean)} (th ${fmt(th[0])}) · sd ${fmt(mo.sd)} (th ${fmt(th[1])})`;
  });
  animate('paths', 1800, f => { S.paths.upTo = Math.max(2, Math.ceil(f * K)); drawPaths(); });
}
function drawPaths() { for (let qi = 0; qi < 3; qi++) drawPathPanel(qi, S.paths.upTo); }
function drawPathPanel(qi, upTo) {
  const P = S.paths; if (!P) return;
  const q = Q[qi], M = P.M, { ctx, w, h } = cv('cvPath' + qi);
  upTo = Math.min(upTo, P.K);
  const mw = Math.max(70, Math.min(150, w * 0.2));
  const box = { x: 56, y: 8, w: w - 56 - mw - 8, h: h - 8 - 34 };
  const mb = { x: box.x + box.w + 6, y: box.y, w: mw - 4, h: box.h };
  const vals = P.vals[qi], K = P.K, idx = P.idx, yr = P.range[qi];
  const A = axes(ctx, box, [0, P.n], yr, { xlabel: 'k = systems attacked', nx: 6 });
  const env = k => { const sk = Math.sqrt(k); return qi === 0 ? [M.mu * k, 2 * M.sd * sk] : qi === 1 ? [M.mu, 2 * M.sd / sk] : [M.mu * sk, 2 * M.sd]; };
  clip(ctx, box);
  ctx.fillStyle = 'rgba(22,32,42,.08)'; ctx.beginPath();
  for (let c = 0; c < upTo; c++) { const [m0, hw] = env(idx[c]); const x = A.X(idx[c]); c ? ctx.lineTo(x, A.Y(m0 + hw)) : ctx.moveTo(x, A.Y(m0 + hw)); }
  for (let c = upTo - 1; c >= 0; c--) { const [m0, hw] = env(idx[c]); ctx.lineTo(A.X(idx[c]), A.Y(m0 - hw)); }
  ctx.closePath(); ctx.fill();
  const m = P.m;
  ctx.strokeStyle = q.col; ctx.lineWidth = 1; ctx.globalAlpha = Math.max(0.07, Math.min(0.5, 5 / Math.sqrt(m)));
  for (let j = 1; j < m; j++) {
    const off = j * K; ctx.beginPath(); ctx.moveTo(A.X(idx[0]), A.Y(vals[off]));
    for (let c = 1; c < upTo; c++) ctx.lineTo(A.X(idx[c]), A.Y(vals[off + c]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([5, 4]); ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = 0; c < upTo; c++) { const x = A.X(idx[c]), y = A.Y(env(idx[c])[0]); c ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(A.X(idx[0]), A.Y(vals[0]));
  for (let c = 1; c < upTo; c++) ctx.lineTo(A.X(idx[c]), A.Y(vals[c]));
  ctx.stroke();
  ctx.restore();
  // marginal histogram of cross-section
  const c = upTo - 1, kNow = idx[c], NB = 30, bw = (yr[1] - yr[0]) / NB, counts = new Float64Array(NB);
  for (let j = 0; j < m; j++) { const b = Math.min(NB - 1, Math.max(0, Math.floor((vals[j * K + c] - yr[0]) / bw))); counts[b]++; }
  let dmax = 0; for (let b = 0; b < NB; b++) dmax = Math.max(dmax, counts[b] / (m * bw));
  ctx.save(); ctx.fillStyle = COL.card; ctx.fillRect(mb.x, mb.y, mb.w, mb.h);
  ctx.strokeStyle = COL.ink; ctx.beginPath(); ctx.moveTo(mb.x + 0.5, mb.y); ctx.lineTo(mb.x + 0.5, mb.y + mb.h); ctx.stroke();
  clip(ctx, mb);
  ctx.fillStyle = q.col; ctx.globalAlpha = 0.55;
  for (let b = 0; b < NB; b++) {
    if (!counts[b]) continue;
    const len = counts[b] / (m * bw) / dmax * (mb.w - 6), y1 = A.Y(yr[0] + b * bw), y2 = A.Y(yr[0] + (b + 1) * bw);
    ctx.fillRect(mb.x + 1, y2, len, Math.max(1, y1 - y2 - 1));
  }
  ctx.globalAlpha = 1;
  const [m0, hw] = env(kNow), sd = hw / 2;
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]); ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const y = yr[0] + (yr[1] - yr[0]) * i / 120, dens = phi((y - m0) / sd) / sd;
    const x = mb.x + 1 + dens / dmax * (mb.w - 6);
    i ? ctx.lineTo(x, A.Y(y)) : ctx.moveTo(x, A.Y(y));
  }
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = COL.soft; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`k = ${nfmt(kNow)}`, mb.x + mb.w, mb.y + mb.h + 18);
}

/* ======================= main experiment ======================= */
async function runMain(tok) {
  const M = model(), m = S.m, nmax = S.nmax;
  const grid = [];
  for (let n = 10; n <= nmax; n *= 10) grid.push(n);
  if (grid[grid.length - 1] !== nmax) grid.push(nmax);
  const cps = uniqSort([...logGrid(1, nmax, 28), ...grid]);
  const finals = await simFinals(M, m, cps, rngFor('main'),
    f => status(`simulating ${nfmt(m)} attackers × ${nfmt(nmax)} systems … ${Math.round(f * 100)}%`),
    () => tok === S.tokMain);
  if (!finals) return false;
  S.data = { M, m, nmax, cps, grid, finals, mom: finals.map(a => moments(a)) };
  return true;
}

/* ======================= 04 · Distributions ======================= */
function drawDists() {
  const D = S.data; if (!D) return;
  const M = D.M, shared = $('#sharedAx').checked, G = D.grid, wrap = $('#distGrid');
  wrap.style.setProperty('--cols', G.length);
  let html = '<div class="dg-corner mono">quantity ↓ · n →</div>' + G.map(n => `<div class="dg-colhead mono">n = ${nfmt(n)}</div>`).join('');
  Q.forEach((q, qi) => {
    html += `<div class="dg-rowhead"><span class="sw" style="background:${q.col}"></span><b>${q.sym}</b><small>${q.name}</small></div>`;
    G.forEach((n, ni) => { html += `<div class="dg-cell"><canvas id="dc${qi}_${ni}"></canvas><div class="dg-cap mono" id="dcap${qi}_${ni}"></div></div>`; });
  });
  wrap.innerHTML = html;
  Q.forEach((q, qi) => {
    const win = n => {
      const c = q.c(n), ce = M.mu * n * c, sd = M.sd * Math.sqrt(n) * c;
      return [Math.max(n * M.lo * c, ce - 4.2 * sd), Math.min(n * M.hi * c, ce + 4.2 * sd), c * M.h / 2];
    };
    let sh = null;
    if (shared) {
      let a = Infinity, b = -Infinity;
      for (const n of G) { const r = win(n); a = Math.min(a, r[0] - r[2]); b = Math.max(b, r[1] + r[2]); }
      sh = [a, b];
    }
    G.forEach((n, ni) => {
      const r = win(n), lo = sh ? sh[0] : r[0] - r[2], hi = sh ? sh[1] : r[1] + r[2];
      const i = D.cps.indexOf(n), Sarr = D.finals[i], c = q.c(n);
      const H = latticeHist(Sarr, lo, hi, n, M, c);
      const { ctx, w, h } = cv(`dc${qi}_${ni}`);
      const box = { x: 6, y: 6, w: w - 12, h: h - 24 };
      let ymax = 0; for (const b of H.bins) ymax = Math.max(ymax, b.d, b.t);
      const xd = sh ? [lo, hi] : [H.x0, H.x1];
      const A = axes(ctx, box, xd, [0, ymax * 1.1 || 1], { noY: true, nx: 3, yticks: [] });
      clip(ctx, box); drawBars(ctx, A, H.bins, q.col); drawTheoStep(ctx, A, H.bins); ctx.restore();
      const mo = D.mom[i];
      $(`#dcap${qi}_${ni}`).innerHTML = `x̄ ${fmt(mo.mean * c)} · s² ${fmt(mo.var * c * c)}<br><span>σ²·(theory) ${fmt(M.v * n * c * c)}</span>`;
    });
  });
}

/* ======================= 05 · Variance ======================= */
function drawVariance() {
  const D = S.data; if (!D) return;
  const M = D.M, { ctx, w, h } = cv('cvVar');
  const box = { x: 72, y: 12, w: w - 72 - 16, h: h - 12 - 44 };
  const ns = D.cps;
  const ser = [ns.map((n, i) => D.mom[i].var), ns.map((n, i) => D.mom[i].var / (n * n)), ns.map((n, i) => D.mom[i].var / n)];
  const theo = [n => M.v * n, n => M.v, n => M.v / n];
  let lo = Infinity, hi = -Infinity;
  ser.forEach((s, qi) => {
    s.forEach(v => { if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    lo = Math.min(lo, theo[qi](D.nmax), theo[qi](1)); hi = Math.max(hi, theo[qi](D.nmax), theo[qi](1));
  });
  const yd = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
  const A = axes(ctx, box, [1, D.nmax], yd, { logx: true, logy: true, xlabel: 'n (systems)', ylabel: 'variance', ylabelOff: 62 });
  clip(ctx, box);
  Q.forEach((q, qi) => {
    ctx.strokeStyle = q.col; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath();
    ctx.moveTo(A.X(1), A.Y(theo[qi](1))); ctx.lineTo(A.X(D.nmax), A.Y(theo[qi](D.nmax))); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = q.col;
    ns.forEach((n, i) => { const v = ser[qi][i]; if (v > 0) { ctx.beginPath(); ctx.arc(A.X(n), A.Y(v), 3.2, 0, 7); ctx.fill(); } });
  });
  ctx.restore();
  legend(ctx, box.x + 12, box.y + 14, [
    { col: COL.total, label: 'Var(Sₙ)     ~ nσ²', dot: true },
    { col: COL.avg, label: 'Var(Sₙ/n)   ~ σ²/n', dot: true },
    { col: COL.norm, label: 'Var(Sₙ/√n)  = σ²', dot: true },
    { col: COL.ink, label: 'theory', dash: [6, 4], lw: 1.5 }
  ]);
  // log-log slopes (least squares, n >= 10)
  const slopes = ser.map(s => {
    const pts = ns.map((n, i) => [Math.log10(n), s[i] > 0 ? Math.log10(s[i]) : null]).filter(p => p[1] !== null && p[0] >= 1);
    const k = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / k, my = pts.reduce((a, p) => a + p[1], 0) / k;
    let num = 0, den = 0; for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    return num / den;
  });
  $('#varSlopes').textContent = `fitted log-log slopes (n ≥ 10): Sₙ ${slopes[0].toFixed(3)} (th +1) · Sₙ/n ${slopes[1].toFixed(3)} (th −1) · Sₙ/√n ${slopes[2].toFixed(3)} (th 0) · σ² = ${fmt(M.v)}`;
  let t = '<thead><tr><th>n</th><th>Var(Sₙ)</th><th class="th">nσ²</th><th>Var(Sₙ/n)</th><th class="th">σ²/n</th><th>Var(Sₙ/√n)</th><th class="th">σ²</th></tr></thead><tbody>';
  for (const n of D.grid) {
    const v = D.mom[D.cps.indexOf(n)].var;
    t += `<tr><td>${nfmt(n)}</td><td>${fmt(v)}</td><td class="th">${fmt(M.v * n)}</td><td>${fmt(v / (n * n))}</td><td class="th">${fmt(M.v / n)}</td><td>${fmt(v / n)}</td><td class="th">${fmt(M.v)}</td></tr>`;
  }
  $('#varTable').innerHTML = t + '</tbody>';
}

/* ======================= 06 · LLN ======================= */
function llnProb(D, i, eps) {
  const a = D.finals[i], n = D.cps[i], mu = D.M.mu;
  let c = 0; for (let k = 0; k < a.length; k++) if (Math.abs(a[k] / n - mu) >= eps - 1e-12) c++;
  return c / a.length;
}
function drawLLN() {
  const eps = +$('#eps').value; $('#epsOut').textContent = eps.toFixed(3);
  const D = S.data; if (!D) return;
  const M = D.M, m = D.m, { ctx, w, h } = cv('cvLLN');
  const box = { x: 56, y: 12, w: w - 56 - 16, h: h - 12 - 44 };
  const A = axes(ctx, box, [1, D.nmax], [0, 1.05], { logx: true, xlabel: 'n (systems)', ylabel: 'P(|Sₙ/n − μ| ≥ ε)', ylabelOff: 46, yticks: [0, 0.2, 0.4, 0.6, 0.8, 1] });
  clip(ctx, box);
  const L1 = Math.log10(D.nmax);
  ctx.strokeStyle = COL.gold; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const n = Math.pow(10, L1 * i / 200), y = Math.min(1, M.v / (n * eps * eps)); i ? ctx.lineTo(A.X(n), A.Y(y)) : ctx.moveTo(A.X(n), A.Y(y)); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const n = Math.pow(10, L1 * i / 200), y = 2 * (1 - Phi(eps * Math.sqrt(n) / M.sd)); i ? ctx.lineTo(A.X(n), A.Y(y)) : ctx.moveTo(A.X(n), A.Y(y)); }
  ctx.stroke();
  const nstar = M.v / (0.05 * eps * eps);
  if (nstar <= D.nmax && nstar >= 1) {
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath();
    ctx.moveTo(A.X(nstar), box.y); ctx.lineTo(A.X(nstar), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
  }
  D.cps.forEach((n, i) => {
    const p = llnProb(D, i, eps), e = 1.96 * Math.sqrt(p * (1 - p) / m), x = A.X(n);
    ctx.strokeStyle = COL.avg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, A.Y(Math.max(0, p - e))); ctx.lineTo(x, A.Y(Math.min(1, p + e))); ctx.stroke();
    ctx.fillStyle = COL.avg; ctx.beginPath(); ctx.arc(x, A.Y(p), 3.4, 0, 7); ctx.fill();
  });
  ctx.restore();
  legend(ctx, box.x + box.w - 250, box.y + 14, [
    { col: COL.avg, label: 'simulation (±95% MC)', dot: true },
    { col: COL.gold, label: 'Chebyshev σ²/(nε²)', dash: [6, 4] },
    { col: COL.ink, label: 'normal approx 2(1−Φ)', lw: 1.3 }
  ]);
  $('#llnNote').textContent = nstar <= D.nmax
    ? `Chebyshev guarantees P ≤ 5% from n* = σ²/(0.05·ε²) ≈ ${nfmt(Math.ceil(nstar))} (dotted line) — a conservative bound: the simulation crosses 5% much earlier.`
    : `Chebyshev needs n* = σ²/(0.05·ε²) ≈ ${nfmt(Math.ceil(nstar))} to guarantee P ≤ 5%: beyond the simulated range. Try a larger ε.`;
  let t = '<thead><tr><th>n</th><th>P̂ (simulated)</th><th>± 95%</th><th class="th">Chebyshev</th><th class="th">normal approx</th></tr></thead><tbody>';
  for (const n of D.grid) {
    const i = D.cps.indexOf(n), p = llnProb(D, i, eps);
    t += `<tr><td>${nfmt(n)}</td><td>${p.toFixed(4)}</td><td>${(1.96 * Math.sqrt(p * (1 - p) / m)).toFixed(4)}</td><td class="th">${Math.min(1, M.v / (n * eps * eps)).toFixed(4)}</td><td class="th">${(2 * (1 - Phi(eps * Math.sqrt(n) / M.sd))).toFixed(4)}</td></tr>`;
  }
  $('#llnTable').innerHTML = t + '</tbody>';
}

/* ======================= 07 · CLT ======================= */
function zParams(M, n) { const c = 1 / (M.sd * Math.sqrt(n)); return { c, d: -n * M.mu * c }; }
function ksStat(Sarr, n, M) {
  const { c, d } = zParams(M, n);
  const z = Float64Array.from(Sarr, s => c * s + d).sort();
  const m = z.length;
  let D = 0, at = 0, Fe = 0;
  for (let i = 0; i < m;) {
    let j = i; while (j < m && z[j] === z[i]) j++;
    const F = Phi(z[i]), d1 = Math.abs(i / m - F), d2 = Math.abs(j / m - F);
    if (d1 > D) { D = d1; at = z[i]; Fe = i / m; }
    if (d2 > D) { D = d2; at = z[i]; Fe = j / m; }
    i = j;
  }
  return { D, at, Fe, z };
}
async function runCLT(tok) {
  const M = makeModel(S.cltModel, S.p);
  const finals = await simFinals(M, S.m, CLT_NS, rngFor('clt|' + S.cltModel), null, () => tok === S.tokClt);
  if (!finals) return false;
  S.clt = { M, m: S.m, finals, ks: CLT_NS.map((n, i) => ksStat(finals[i], n, M)) };
  return true;
}
function drawCLT() {
  const C = S.clt; if (!C) return;
  const i = +$('#cltN').value, n = CLT_NS[i], M = C.M, Sarr = C.finals[i], K = C.ks[i];
  $('#cltNOut').textContent = nfmt(n);
  const { c, d } = zParams(M, n);
  // density
  {
    const { ctx, w, h } = cv('cvCltHist');
    const box = { x: 40, y: 10, w: w - 40 - 10, h: h - 10 - 40 };
    const H = latticeHist(Sarr, -4.2, 4.2, n, M, c, d, 60);
    let ymax = 0.42; for (const b of H.bins) ymax = Math.max(ymax, b.d, b.t);
    const A = axes(ctx, box, [-4.2, 4.2], [0, ymax * 1.08], { xlabel: 'z', nx: 8, ny: 4 });
    clip(ctx, box); drawBars(ctx, A, H.bins, COL.norm); drawTheoStep(ctx, A, H.bins, COL.ink, 1);
    curve(ctx, A, phi, -4.2, 4.2, 200, COL.total, 2.2); ctx.restore();
    legend(ctx, box.x + 10, box.y + 14, [
      { col: COL.norm, label: `simulated Zₙ (m=${nfmt(C.m)})`, box: true },
      { col: COL.ink, label: 'exact Binomial', lw: 1 },
      { col: COL.total, label: '𝒩(0,1) density' }
    ]);
  }
  // CDF
  {
    const { ctx, w, h } = cv('cvCltCdf');
    const box = { x: 40, y: 10, w: w - 40 - 10, h: h - 10 - 40 };
    const A = axes(ctx, box, [-4.2, 4.2], [0, 1], { xlabel: 'z', nx: 8, yticks: [0, 0.25, 0.5, 0.75, 1] });
    clip(ctx, box);
    curve(ctx, A, Phi, -4.2, 4.2, 200, COL.total, 2.2);
    const z = K.z, m = z.length;
    ctx.strokeStyle = COL.norm; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(A.X(-4.2), A.Y(0));
    let F = 0;
    for (let a = 0; a < m;) {
      let b = a; while (b < m && z[b] === z[a]) b++;
      ctx.lineTo(A.X(z[a]), A.Y(F)); F = b / m; ctx.lineTo(A.X(z[a]), A.Y(F)); a = b;
    }
    ctx.lineTo(A.X(4.2), A.Y(F)); ctx.stroke();
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(A.X(K.at), A.Y(K.Fe)); ctx.lineTo(A.X(K.at), A.Y(Phi(K.at))); ctx.stroke();
    ctx.restore();
    legend(ctx, box.x + 10, box.y + 14, [
      { col: COL.norm, label: 'empirical CDF' },
      { col: COL.total, label: 'Φ(z)' },
      { col: COL.gold, label: `D = ${K.D.toFixed(4)}`, lw: 3 }
    ]);
  }
  // KS vs n
  {
    const { ctx, w, h } = cv('cvKs');
    const box = { x: 56, y: 10, w: w - 56 - 12, h: h - 10 - 40 };
    const be = n => 0.4748 * M.rho / (Math.pow(M.sd, 3) * Math.sqrt(n));
    const floor = 0.83 / Math.sqrt(C.m);
    const ds = C.ks.map(k => k.D);
    const lo = Math.min(...ds, floor, be(5000)) / 1.6, hi = Math.max(1, ...ds);
    const yd = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
    const A = axes(ctx, box, [1, 5000], yd, { logx: true, logy: true, xlabel: 'n', ylabel: 'sup|Fₙ − Φ|', ylabelOff: 50 });
    clip(ctx, box);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); ctx.beginPath();
    ctx.moveTo(A.X(1), A.Y(be(1))); ctx.lineTo(A.X(5000), A.Y(be(5000))); ctx.stroke();
    ctx.strokeStyle = COL.soft; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath();
    ctx.moveTo(box.x, A.Y(floor)); ctx.lineTo(box.x + box.w, A.Y(floor)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = COL.norm; ctx.lineWidth = 1.2; ctx.beginPath();
    CLT_NS.forEach((nn, k) => { const x = A.X(nn), y = A.Y(ds[k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    CLT_NS.forEach((nn, k) => {
      ctx.fillStyle = k === i ? COL.total : COL.norm;
      ctx.beginPath(); ctx.arc(A.X(nn), A.Y(ds[k]), k === i ? 5.5 : 3.2, 0, 7); ctx.fill();
    });
    ctx.restore();
    legend(ctx, box.x + box.w - 240, box.y + 14, [
      { col: COL.norm, label: 'Kolmogorov distance D', dot: true },
      { col: COL.gold, label: 'Berry–Esseen bound', dash: [6, 4] },
      { col: COL.soft, label: 'MC noise ≈ 0.83/√m', dash: [2, 3], lw: 1 }
    ]);
  }
  // moments
  const mo = moments(Sarr, c, d), pq = M.p * (1 - M.p);
  const thSkew = (1 - 2 * M.p) / Math.sqrt(n * pq), thKurt = (1 - 6 * pq) / (n * pq);
  let tail = 0; for (let k = 0; k < Sarr.length; k++) if (Math.abs(c * Sarr[k] + d) > 1.96) tail++;
  tail /= Sarr.length;
  const exactTail = (() => { // exact P(|Z|>1.96) from Binomial
    const ln = lgamma(n + 1), lp = Math.log(M.p), lq = Math.log(1 - M.p), o = origin(M, n);
    let s = 0;
    for (let j = 0; j <= n; j++) { const zz = c * (o + M.h * j) + d; if (Math.abs(zz) > 1.96) s += Math.exp(ln - lgamma(j + 1) - lgamma(n - j + 1) + j * lp + (n - j) * lq); }
    return s;
  })();
  const row = (name, e, th, lim) => `<tr><td>${name}</td><td>${fmt(e)}</td><td class="th">${fmt(th)}</td><td class="th">${lim}</td></tr>`;
  $('#cltTable').innerHTML = `<thead><tr><th>n = ${nfmt(n)}</th><th>simulated</th><th class="th">exact (n)</th><th class="th">n → ∞</th></tr></thead><tbody>` +
    row('mean', mo.mean, 0, '0') + row('variance', mo.var, 1, '1') +
    row('skewness', mo.skew, thSkew, '0') + row('excess kurtosis', mo.kurt, thKurt, '0') +
    row('P(|Zₙ| > 1.96)', tail, exactTail, '0.05') +
    `<tr><td>Kolmogorov D</td><td>${K.D.toFixed(4)}</td><td class="th">BE ≤ ${fmt(0.4748 * M.rho / (Math.pow(M.sd, 3) * Math.sqrt(n)))}</td><td class="th">0</td></tr></tbody>`;
}

/* ======================= 08 · live reading ======================= */
function fillReading() {
  const D = S.data; if (!D) return;
  const M = D.M, eps = +$('#eps').value, set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const n1 = D.grid[0], n2 = D.grid[D.grid.length - 1], i1 = D.cps.indexOf(n1), i2 = D.cps.indexOf(n2);
  const within = i => 1 - llnProb(D, i, eps);
  const gap = i => { let a = Infinity, b = -Infinity; for (const s of D.finals[i]) { if (s < a) a = s; if (s > b) b = s; } return b - a; };
  set('r-model', M.label); set('r-m', nfmt(D.m)); set('r-seed', S.seed);
  set('r-n1', nfmt(n1)); set('r-n2', nfmt(n2));
  set('r-sd1', fmt(D.mom[i1].sd / n1)); set('r-sd2', fmt(D.mom[i2].sd / n2));
  set('r-th1', fmt(M.sd / Math.sqrt(n1))); set('r-th2', fmt(M.sd / Math.sqrt(n2)));
  set('r-eps', eps.toFixed(3)); set('r-in1', pct(within(i1))); set('r-in2', pct(within(i2)));
  set('r-gap1', nfmt(gap(i1))); set('r-gap2', nfmt(gap(i2)));
  set('r-mc', fmt(0.5 / Math.sqrt(D.m)));
  let tot = 0; for (const s of D.finals[i2]) tot += s;
  set('r-camp', (tot / (D.m * n2)).toFixed(5)); set('r-mu', fmt(M.mu)); set('r-campse', fmt(M.sd / Math.sqrt(D.m * n2)));
  if (S.clt) {
    const k = CLT_NS.length - 1, C = S.clt, { c, d } = zParams(C.M, CLT_NS[k]);
    let t = 0; for (const s of C.finals[k]) if (Math.abs(c * s + d) > 1.96) t++;
    set('r-tail', pct(t / C.m)); set('r-cltn', nfmt(CLT_NS[k]));
  }
}

/* ======================= orchestration ======================= */
function updateInfo() {
  const M = model();
  $('#modelInfo').textContent = `${M.label} · μ = ${fmt(M.mu)} · σ² = ${fmt(M.v)} · ρ = E|X−μ|³ = ${fmt(M.rho)}`;
  const draws = S.m * S.nmax + S.m * 5000;
  $('#cost').textContent = `≈ ${(draws / 1e6).toFixed(1)} M random draws`;
}
async function runAll() {
  const tok = ++S.tokMain, ctok = ++S.tokClt, t0 = performance.now();
  updateInfo();
  document.body.classList.add('busy');
  runMatrix(); runPaths();
  if (!(await runMain(tok)) || tok !== S.tokMain) return;
  drawDists(); drawVariance(); drawLLN();
  status('simulating CLT experiment …');
  if (!(await runCLT(ctok)) || ctok !== S.tokClt) return;
  drawCLT(); fillReading();
  document.body.classList.remove('busy');
  status(`done in ${Math.round(performance.now() - t0)} ms · seed “${S.seed}”`);
}
let schedT;
function schedule() { clearTimeout(schedT); updateInfo(); schedT = setTimeout(runAll, 300); }
function setSeg(sel, v) { $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }

function bind() {
  $$('#modelSeg button').forEach(b => b.addEventListener('click', () => {
    S.model = b.dataset.v; setSeg('#modelSeg', S.model);
    $('#pCtl').classList.toggle('off', S.model === 'rad'); $('#p').disabled = S.model === 'rad';
    schedule();
  }));
  $('#p').addEventListener('input', () => { S.p = +$('#p').value; $('#pOut').textContent = S.p.toFixed(2); schedule(); });
  $('#m').addEventListener('change', () => { S.m = +$('#m').value; schedule(); });
  $('#nmax').addEventListener('change', () => { S.nmax = +$('#nmax').value; schedule(); });
  $('#seed').addEventListener('change', () => { S.seed = $('#seed').value.trim() || 'seed'; schedule(); });
  $('#reseed').addEventListener('click', () => { $('#seed').value = Math.random().toString(36).slice(2, 8); S.seed = $('#seed').value; schedule(); });
  $('#run').addEventListener('click', runAll);
  $('#matrixReplay').addEventListener('click', runMatrix);
  $('#pathN').addEventListener('input', () => { $('#pathNOut').textContent = nfmt(PATH_NS[+$('#pathN').value]); });
  $('#pathN').addEventListener('change', runPaths);
  $('#pathM').addEventListener('change', runPaths);
  $('#pathReplay').addEventListener('click', runPaths);
  $('#sharedAx').addEventListener('change', drawDists);
  $('#eps').addEventListener('input', () => { drawLLN(); fillReading(); });
  $$('#cltSeg button').forEach(b => b.addEventListener('click', async () => {
    S.cltModel = b.dataset.v; setSeg('#cltSeg', S.cltModel);
    const t = ++S.tokClt;
    if (await runCLT(t)) { drawCLT(); fillReading(); }
  }));
  $('#cltN').addEventListener('input', drawCLT);
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { drawLattice(); drawMatrix(); if (S.paths) drawPaths(); drawDists(); drawVariance(); drawLLN(); drawCLT(); }, 150);
  });
  // active section in the side index
  const links = $$('#toc a');
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => obs.observe(s));
}

function init() {
  bind(); updateInfo(); drawLattice(); runAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawLattice(); drawMatrix(); });
}
document.addEventListener('DOMContentLoaded', init);
