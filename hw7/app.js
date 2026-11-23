'use strict';
/* =====================================================================
   HW7 Statistics: modes of convergence, the sqrt(n) law, Bayes
   Vanilla JS + Canvas 2D. No chart or statistics libraries.
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COL = { ink: '#16202a', soft: '#5b6670', grid: '#e6dfcf', rule: '#cfc4ad', card: '#fbf8f1',
  red: '#c0392b', blue: '#1d4f91', green: '#2e7d57', gold: '#b8860b', violet: '#7d3c98' };
const PAL = ['#1d4f91', '#c0392b', '#2e7d57', '#b8860b', '#7d3c98', '#16202a', '#d35400', '#117a8b'];

/* ======================= small helpers ======================= */
const nfmt = n => Math.round(n).toLocaleString('en-US');
const pct = (v, d = 1) => (100 * v).toFixed(d) + '%';
function fmt(v, d = 3) {
  if (!isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(1);
  if (a >= 100) return (+v.toFixed(0)).toString();
  if (a < 1e-3) return v.toExponential(1);
  return (+v.toFixed(d)).toString();
}
function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normalGen(rnd) {
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = rnd(); while (u <= 1e-300) u = rnd();
    const r = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * rnd();
    spare = r * Math.sin(t); return r * Math.cos(t);
  };
}
function erf(x) { // Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7)
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function gammaln(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
  x -= 1; let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const logGammaPdf = (x, shape, rate) => shape * Math.log(rate) - gammaln(shape) + (shape - 1) * Math.log(x) - rate * x;

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
  for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) t.push(v); }
  if (t.length > 7) return t.filter((_, i) => i % 2 === 0);
  return t;
}
const supE = v => { if (v >= 1e-2 && v <= 1e4) return fmt(v); const e = Math.round(Math.log10(v)); return '1e' + e; };
function axes(ctx, box, xd, yd, o = {}) {
  const X = scale(xd[0], xd[1], box.x, box.x + box.w, o.logx), Y = scale(yd[0], yd[1], box.y + box.h, box.y, o.logy);
  const xt = o.xticks || niceTicks(xd[0], xd[1], o.nx || 6), yt = o.yticks || niceTicks(yd[0], yd[1], o.ny || 5);
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
  if (o.ylabel) { ctx.save(); ctx.translate(box.x - (o.ylabelOff || 44), box.y + box.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
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
  ctx.fillStyle = 'rgba(251,248,241,.94)'; ctx.strokeStyle = COL.rule;
  ctx.fillRect(x - 6, y - 10, wmax + 8, items.length * 16 + 4); ctx.strokeRect(x - 6.5, y - 10.5, wmax + 8, items.length * 16 + 4);
  let yy = y;
  for (const it of items) {
    ctx.strokeStyle = it.col; ctx.fillStyle = it.col; ctx.lineWidth = it.lw || 2; ctx.setLineDash(it.dash || []);
    if (it.box) { ctx.fillRect(x, yy - 5, 16, 10); } else if (it.dot) { ctx.beginPath(); ctx.arc(x + 8, yy, 4, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 16, yy); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.fillText(it.label, x + 22, yy); yy += 16;
  }
  ctx.restore();
}
function polyline(ctx, xs, ys, X, Y, col, lw = 2, dash) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath();
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]; if (!isFinite(y)) { pen = false; continue; }
    const px = X(xs[i]), py = Y(y);
    if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke(); ctx.restore();
}
const boxFor = (w, h, l = 52, r = 14, t = 14, b = 38) => ({ x: l, y: t, w: Math.max(40, w - l - r), h: Math.max(40, h - t - b) });

/* =====================================================================
   02 · CONVERGENCE MICROSCOPE
   ===================================================================== */
const M = 1000, NMAX = 4096, NTRAJ = 25;
const CPS = Array.from({ length: 12 }, (_, j) => 2 << j);           // 2, 4, …, 4096
const SEQS = {
  A: {
    name: 'A · running mean of Bernoulli(0.3)', limit: 0.3, moving: false,
    note: 'X̄ₙ of i.i.d. Bernoulli(0.3) draws, the frequency of a 0/1 event. The LLN case: every mode holds, the limit is the constant p = 0.3.',
    modes: { as: [1, 'strong LLN'], p: [1, 'weak LLN'], l2: [1, 'E = 0.21/n'], d: [1, 'to the constant 0.3'] },
    mse: n => 0.21 / n,
    gen: rnd => { let s = 0; return n => { s += rnd() < 0.3 ? 1 : 0; return s / n; }; },
    traj: { y: [0, 1], label: 'Xₙ' }, dist: { x: [0, 0.7], cdf: x => (x >= 0.3 ? 1 : 0), clabel: 'limit: step at 0.3' }
  },
  B: {
    name: 'B · independent Xₙ ~ Bernoulli(1/n)', limit: 0, moving: false,
    note: 'Independent alarms that ring with probability 1/n. At each fixed n a ring is rare, so Xₙ → 0 in probability and in L². But Σ1/n = ∞ and the Xₙ are independent, so by the second Borel–Cantelli lemma every path rings infinitely often: no trajectory converges. Between n/2 and n a ring occurs with probability exactly 1/2, at every scale.',
    modes: { as: [0, 'Borel–Cantelli II'], p: [1, 'P(Xₙ=1) = 1/n'], l2: [1, 'E Xₙ² = 1/n'], d: [1, 'to the constant 0'] },
    mse: n => 1 / n,
    gen: rnd => n => (rnd() < 1 / n ? 1 : 0),
    traj: { raster: true, label: 'path #' }, dist: { x: [-0.5, 1.5], cdf: x => (x >= 0 ? 1 : 0), clabel: 'limit: step at 0' }
  },
  C: {
    name: 'C · Xₙ = n²·1{U < 1/n}, one U per path', limit: 0, moving: false,
    note: 'One uniform U is drawn per path, then Xₙ = n² while n < 1/U and 0 afterwards. Every path (U > 0) is eventually 0 forever: almost sure convergence. Yet E Xₙ² = n⁴·(1/n) = n³ → ∞: the rare huge values dominate the mean square. The simulation almost never sees them (dots disappear), which is exactly why L² failures are invisible in samples.',
    modes: { as: [1, 'zero after n > 1/U'], p: [1, 'P(Xₙ≠0) = 1/n'], l2: [0, 'E Xₙ² = n³ → ∞'], d: [1, 'to the constant 0'] },
    mse: n => n * n * n,
    gen: rnd => { const u = rnd(); return n => (u < 1 / n ? n * n : 0); },
    traj: { y: [0, 7.5], log1p: true, label: 'log₁₀(1 + Xₙ)' }, dist: { x: [-0.5, 1.5], cdf: x => (x >= 0 ? 1 : 0), clabel: 'limit: step at 0' }
  },
  D: {
    name: 'D · independent copies Xₙ ~ N(0,1)', limit: null, moving: true,
    note: 'Fresh independent standard normals. Their law never changes, so Xₙ → N(0,1) in distribution trivially. But the values never settle: Xₙ − X_{n/2} ~ N(0,2) at every n. Distributional convergence says nothing about the values themselves.',
    modes: { as: [0, 'values never settle'], p: [0, 'Xₙ − X₂ₙ ~ N(0,2)'], l2: [0, 'E(Xₙ − X_{n/2})² = 2'], d: [1, 'law is N(0,1) for all n'] },
    mse: () => 2,
    gen: (rnd) => { const g = normalGen(rnd); return () => g(); },
    traj: { y: [-3.5, 3.5], label: 'Xₙ' }, dist: { x: [-3.5, 3.5], cdf: Phi, clabel: 'limit: Φ(x)' }
  },
  E: {
    name: 'E · CLT: Zₙ = √n(X̄ₙ − 1), Exp(1) data', limit: null, moving: true,
    note: 'The standardized mean of skewed Exp(1) data. Its ECDF approaches Φ (CLT), starting visibly skewed at n = 8. The path itself keeps wandering: corr(Zₙ, Z₂ₙ) = 1/√2, so E(Zₙ − Z_{n/2})² = 2 − √2 ≈ 0.586 does not shrink. The CLT is a statement about the law only.',
    modes: { as: [0, 'LIL: limsup = +∞'], p: [0, 'corr(Zₙ,Z₂ₙ) = 1/√2'], l2: [0, 'E(Zₙ − Z_{n/2})² = 2 − √2'], d: [1, 'CLT: → N(0,1)'] },
    mse: () => 2 - Math.SQRT2,
    gen: rnd => { let s = 0; return n => { s += -Math.log(1 - rnd()); return (s - n) / Math.sqrt(n); }; },
    traj: { y: [-3.5, 3.5], label: 'Zₙ' }, dist: { x: [-3.5, 3.5], cdf: Phi, clabel: 'limit: Φ(x)' }
  }
};
const SIM = {};
function simulate(key) {
  if (SIM[key]) return SIM[key];
  const S = SEQS[key], rnd = mulberry32(hash('hw7-micro-' + key));
  const dev = CPS.map(() => new Float64Array(M)), sup = CPS.map(() => new Float64Array(M)), val = CPS.map(() => new Float64Array(M));
  const traj = [];
  for (let m = 0; m < M; m++) {
    const g = S.gen(rnd), tr = m < NTRAJ ? new Float32Array(NMAX) : null;
    let ref = S.moving ? null : S.limit, j = 0, curSup = 0;
    for (let n = 1; n <= NMAX; n++) {
      const x = g(n);
      if (tr) tr[n - 1] = x;
      if (n === 1) { if (S.moving) ref = x; continue; }
      const d = Math.abs(x - ref); if (d > curSup) curSup = d;
      if (n === CPS[j]) { dev[j][m] = d; sup[j][m] = curSup; val[j][m] = x; curSup = 0; if (S.moving) ref = x; j++; }
    }
    if (tr) traj.push(tr);
  }
  const mse = dev.map(a => { let s = 0; for (const v of a) s += v * v; return s / M; });
  return (SIM[key] = { dev, sup, val, traj, mse });
}

function drawTraj(key, R) {
  const S = SEQS[key], { ctx, w, h } = cv('cvTraj'), box = boxFor(w, h, 50);
  const xt = [1, 4, 16, 64, 256, 1024, 4096];
  if (S.traj.raster) {
    const A = axes(ctx, box, [1, NMAX], [0, NTRAJ], { logx: true, xticks: xt, yticks: [0, 5, 10, 15, 20, 25], xlabel: 'n', ylabel: S.traj.label, ylabelOff: 40 });
    ctx.fillStyle = COL.red;
    R.traj.forEach((tr, i) => { for (let n = 1; n <= NMAX; n++) if (tr[n - 1] > 0) ctx.fillRect(A.X(n) - 1, A.Y(i + 0.85), 2.2, A.Y(i + 0.15) - A.Y(i + 0.85)); });
    ctx.fillStyle = COL.soft; ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'right';
    ctx.fillText('each tick = one Xₙ = 1', box.x + box.w - 6, box.y + 12);
    return;
  }
  const A = axes(ctx, box, [1, NMAX], S.traj.y, { logx: true, xticks: xt, xlabel: 'n', ylabel: S.traj.label, ylabelOff: 40 });
  clip(ctx, box);
  R.traj.forEach((tr, i) => {
    ctx.strokeStyle = PAL[i % PAL.length]; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.beginPath();
    for (let n = 1; n <= NMAX; n++) { const v = S.traj.log1p ? Math.log10(1 + tr[n - 1]) : tr[n - 1]; const px = A.X(n), py = A.Y(v); n === 1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  if (S.limit !== null && !S.traj.log1p) { ctx.strokeStyle = COL.ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(box.x, A.Y(S.limit)); ctx.lineTo(box.x + box.w, A.Y(S.limit)); ctx.stroke(); }
  ctx.restore();
}
function drawProb(key, R, eps) {
  const S = SEQS[key], { ctx, w, h } = cv('cvProb'), box = boxFor(w, h, 50);
  const A = axes(ctx, box, [2, NMAX], [0, 1], { logx: true, xticks: [2, 8, 32, 128, 512, 2048], xlabel: 'n', ylabel: 'probability', ylabelOff: 40 });
  const pP = R.dev.map(a => { let c = 0; for (const v of a) if (v > eps) c++; return c / M; });
  const pS = R.sup.map(a => { let c = 0; for (const v of a) if (v > eps) c++; return c / M; });
  polyline(ctx, CPS, pP, A.X, A.Y, COL.blue, 2.2);
  polyline(ctx, CPS, pS, A.X, A.Y, COL.red, 2.2);
  ctx.fillStyle = COL.blue; CPS.forEach((n, i) => { ctx.beginPath(); ctx.arc(A.X(n), A.Y(pP[i]), 2.6, 0, 7); ctx.fill(); });
  ctx.fillStyle = COL.red; CPS.forEach((n, i) => { ctx.beginPath(); ctx.arc(A.X(n), A.Y(pS[i]), 2.6, 0, 7); ctx.fill(); });
  const ref = S.moving ? 'X_{n/2}' : 'L';
  legend(ctx, box.x + box.w - 250, box.y + 14, [
    { col: COL.blue, label: `P(|Xₙ − ${ref === 'L' ? fmt(S.limit) : 'X_n/2'}| > ε)  [in prob.]` },
    { col: COL.red, label: 'P(some k∈(n/2,n] is far)  [a.s.]' }]);
}
function drawL2(key, R) {
  const S = SEQS[key], { ctx, w, h } = cv('cvL2'), box = boxFor(w, h, 56);
  const th = CPS.map(S.mse), pos = R.mse.filter(v => v > 0);
  let lo = Math.min(...th, ...pos), hi = Math.max(...th, ...pos);
  lo = Math.pow(10, Math.floor(Math.log10(lo) - 0.2)); hi = Math.pow(10, Math.ceil(Math.log10(hi) + 0.2));
  if (hi / lo < 100) { lo /= 10; hi *= 10; }
  const A = axes(ctx, box, [2, NMAX], [lo, hi], { logx: true, logy: true, xticks: [2, 8, 32, 128, 512, 2048], yticks: logTicks(lo, hi), fy: supE, xlabel: 'n', ylabel: 'mean square', ylabelOff: 46 });
  polyline(ctx, CPS, th, A.X, A.Y, COL.ink, 1.5, [5, 4]);
  ctx.fillStyle = COL.green;
  CPS.forEach((n, i) => { if (R.mse[i] > 0) { ctx.beginPath(); ctx.arc(A.X(n), A.Y(R.mse[i]), 3.4, 0, 7); ctx.fill(); } else { ctx.strokeStyle = COL.green; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(A.X(n), box.y + box.h - 6, 3.4, 0, 7); ctx.stroke(); } });
  legend(ctx, box.x + 10, box.y + 14, [{ col: COL.ink, dash: [5, 4], lw: 1.5, label: 'exact value' }, { col: COL.green, dot: true, label: 'Monte Carlo (1,000 paths)' }].concat(R.mse.some(v => v === 0) ? [{ col: COL.green, label: '○ at bottom: MC estimate = 0' }] : []));
}
function drawDist(key, R) {
  const S = SEQS[key], { ctx, w, h } = cv('cvDist'), box = boxFor(w, h, 44);
  const xd = S.dist.x, A = axes(ctx, box, xd, [0, 1], { xlabel: 'x', ylabel: 'F(x)', ylabelOff: 34 });
  clip(ctx, box);
  const xs = Array.from({ length: 401 }, (_, i) => xd[0] + (xd[1] - xd[0]) * i / 400);
  polyline(ctx, xs, xs.map(S.dist.cdf), A.X, A.Y, COL.ink, 2.4, [6, 4]);
  const picks = [2, 5, 11], cols = [COL.gold, COL.violet, COL.red];
  picks.forEach((j, k) => {
    const v = Float64Array.from(R.val[j]).sort();
    ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.8; ctx.beginPath();
    ctx.moveTo(box.x, A.Y(0));
    let idx = 0; for (; idx < M && v[idx] < xd[0]; idx++);
    let F = idx / M; ctx.lineTo(box.x, A.Y(F));
    for (; idx < M && v[idx] <= xd[1]; idx++) { const px = A.X(v[idx]); ctx.lineTo(px, A.Y(F)); F = (idx + 1) / M; ctx.lineTo(px, A.Y(F)); }
    ctx.lineTo(box.x + box.w, A.Y(F)); ctx.stroke();
  });
  ctx.restore();
  legend(ctx, box.x + 10, box.y + 14, [{ col: COL.gold, label: 'n = 8' }, { col: COL.violet, label: 'n = 64' }, { col: COL.red, label: 'n = 4,096' }, { col: COL.ink, dash: [6, 4], label: S.dist.clabel }]);
}
function renderMicro(onlyProb) {
  const key = $('#seqSel').value, eps = +$('#eps').value, R = simulate(key), S = SEQS[key];
  $('#epsOut').textContent = eps.toFixed(2);
  if (!onlyProb) {
    $('#seqNote').textContent = S.note;
    const names = { as: 'almost sure', p: 'in probability', l2: 'mean square (L²)', d: 'in distribution' };
    $('#seqInfo').innerHTML = Object.keys(names).map(k => `<div><dt>${names[k]}</dt><dd class="${S.modes[k][0] ? 'yes' : 'no'}">${S.modes[k][0] ? '✓ yes' : '✗ no'}</dd><dt style="text-transform:none;letter-spacing:0;margin-top:2px">${S.modes[k][1]}</dt></div>`).join('');
    drawTraj(key, R); drawL2(key, R); drawDist(key, R);
  }
  drawProb(key, R, eps);
}

/* =====================================================================
   03 · VARIANCE ADDITIVITY AND sqrt(n)
   ===================================================================== */
const CP3 = Array.from({ length: 11 }, (_, j) => 4 << j);   // 4 … 4096
function arVarExact(n, r) {
  if (Math.abs(r) < 1e-12) return n;
  return n * (1 + r) / (1 - r) - 2 * r * (1 - Math.pow(r, n)) / ((1 - r) * (1 - r));
}
function simDep(dep, rho) {
  const rnd = mulberry32(hash(`hw7-dep-${dep}-${rho.toFixed(2)}`)), g = normalGen(rnd), P = 1000;
  const S = CP3.map(() => new Float64Array(P)), cover = CP3.map(() => 0);
  const c = Math.sqrt(1 - rho * rho);
  for (let p = 0; p < P; p++) {
    let x = g(), s = 0, q = 0, j = 0; const x1 = x;
    for (let n = 1; n <= NMAX; n++) {
      if (n > 1) x = dep === 'iid' ? g() : dep === 'same' ? x1 : rho * x + c * g();
      s += x; q += x * x;
      if (n === CP3[j]) {
        S[j][p] = s;
        const m = s / n, v = Math.max(0, (q - n * m * m) / (n - 1));
        if (Math.abs(m) <= 1.96 * Math.sqrt(v / n) && v > 0) cover[j]++;
        j++;
      }
    }
  }
  const varS = S.map(a => { let mu = 0; for (const v of a) mu += v; mu /= P; let ss = 0; for (const v of a) ss += (v - mu) * (v - mu); return ss / (P - 1); });
  return { varS, cover: cover.map(c => c / P) };
}
function slope(xs, ys) {
  const lx = xs.map(Math.log), ly = ys.map(Math.log), n = lx.length;
  const mx = lx.reduce((a, b) => a + b) / n, my = ly.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (lx[i] - mx) * (ly[i] - my); sxx += (lx[i] - mx) ** 2; }
  return sxy / sxx;
}
let depTimer = null;
function renderDep() {
  const dep = $('#depSel').value, rho = +$('#rho').value;
  $('#rhoOut').textContent = rho.toFixed(2); $('#rhoLbl').hidden = dep !== 'ar';
  const R = simDep(dep, rho);
  const theory = n => dep === 'iid' ? n : dep === 'same' ? n * n : arVarExact(n, rho);
  // --- Var(S_n)
  {
    const { ctx, w, h } = cv('cvVarS'), box = boxFor(w, h, 56);
    const all = [...R.varS, ...CP3.map(theory), ...CP3];
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
    const A = axes(ctx, box, [4, NMAX], [lo, hi], { logx: true, logy: true, xticks: [4, 16, 64, 256, 1024, 4096], yticks: logTicks(lo, hi), fy: supE, xlabel: 'n', ylabel: 'Var(Sₙ)', ylabelOff: 46 });
    polyline(ctx, CP3, CP3.map(n => n), A.X, A.Y, COL.soft, 1.2, [3, 3]);
    polyline(ctx, CP3, CP3.map(theory), A.X, A.Y, COL.ink, 1.6, [6, 4]);
    ctx.fillStyle = COL.red; CP3.forEach((n, i) => { ctx.beginPath(); ctx.arc(A.X(n), A.Y(R.varS[i]), 3.4, 0, 7); ctx.fill(); });
    legend(ctx, box.x + 10, box.y + 14, [{ col: COL.red, dot: true, label: 'simulated (1,000 paths)' }, { col: COL.ink, dash: [6, 4], label: 'exact formula' }, { col: COL.soft, dash: [3, 3], lw: 1.2, label: 'independent: Var = n' }]);
    const tail = CP3.map((n, i) => i).filter(i => CP3[i] >= 256);
    const sl = slope(tail.map(i => CP3[i]), tail.map(i => R.varS[i]));
    const extra = dep === 'ar' ? ` · long-run factor (1+ρ)/(1−ρ) = ${fmt((1 + rho) / (1 - rho))} · effective sample size at n = 1,024: ≈ ${nfmt(1024 * (1 - rho) / (1 + rho))}` :
      dep === 'same' ? ' · Var(Sₙ) = n²: the √n law is replaced by n, averaging gains nothing' : ' · covariances are 0, so Var(Sₙ) = nσ²';
    $('#varNote').textContent = `fitted slope for n ≥ 256: ${sl.toFixed(3)} (√n scaling needs slope 1)${extra}`;
  }
  // --- coverage
  {
    const { ctx, w, h } = cv('cvCov'), box = boxFor(w, h, 50);
    const A = axes(ctx, box, [4, NMAX], [0, 1], { logx: true, xticks: [4, 16, 64, 256, 1024, 4096], fy: v => Math.round(v * 100) + '%', xlabel: 'n', ylabel: 'coverage', ylabelOff: 42 });
    ctx.strokeStyle = COL.green; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(box.x, A.Y(0.95)); ctx.lineTo(box.x + box.w, A.Y(0.95)); ctx.stroke(); ctx.setLineDash([]);
    polyline(ctx, CP3, R.cover, A.X, A.Y, COL.blue, 2.2);
    ctx.fillStyle = COL.blue; CP3.forEach((n, i) => { ctx.beginPath(); ctx.arc(A.X(n), A.Y(R.cover[i]), 3, 0, 7); ctx.fill(); });
    legend(ctx, box.x + box.w - 200, box.y + box.h - 40, [{ col: COL.blue, label: 'simulated coverage' }, { col: COL.green, dash: [5, 4], label: 'nominal 95%' }]);
    const c1024 = R.cover[CP3.indexOf(1024)];
    let th = '';
    if (dep === 'ar') th = ` · large-n theory: 2Φ(1.96·√((1−ρ)/(1+ρ))) − 1 = ${pct(2 * Phi(1.96 * Math.sqrt((1 - rho) / (1 + rho))) - 1)}`;
    if (dep === 'same') th = ' · s = 0 (all values equal), so the interval collapses to a point and never covers μ = 0';
    $('#covNote').textContent = `coverage at n = 1,024: ${pct(c1024)}${th}`;
  }
}

/* =====================================================================
   05 · EVIDENCE METER
   ===================================================================== */
function renderMeter() {
  const pi = Math.pow(10, +$('#pi').value), sen = +$('#sen').value, fpr = Math.pow(10, +$('#fpr').value);
  $('#piOut').textContent = pi >= 0.01 ? pct(pi, 2) : `1 in ${nfmt(1 / pi)}`;
  $('#senOut').textContent = pct(sen, 1);
  $('#fprOut').textContent = fpr >= 0.01 ? pct(fpr, 1) : pct(fpr, 2);
  const N = 1e6, att = N * pi, ben = N - att, TP = att * sen, FN = att - TP, FP = ben * fpr, TN = ben - FP;
  const ppv = TP / (TP + FP), LR = sen / fpr, db = v => 10 * Math.log10(v);
  $('#nfTable').innerHTML = `<table class="ledger"><thead><tr><th></th><th>alarm</th><th>no alarm</th><th>total</th></tr></thead><tbody>
    <tr><td><b>attack</b></td><td>${nfmt(TP)}</td><td>${nfmt(FN)}</td><td>${nfmt(att)}</td></tr>
    <tr><td><b>benign</b></td><td class="no">${nfmt(FP)}</td><td>${nfmt(TN)}</td><td>${nfmt(ben)}</td></tr>
    <tr><td><b>total</b></td><td>${nfmt(TP + FP)}</td><td>${nfmt(FN + TN)}</td><td>${nfmt(N)}</td></tr></tbody></table>`;
  $('#nfCap').innerHTML = `P(attack | alarm) = ${nfmt(TP)} / ${nfmt(TP + FP)} = <b>${pct(ppv, 2)}</b>. Likelihood ratio LR = ${fmt(sen)} / ${fmt(fpr)} = ${fmt(LR)}, i.e. <b>${db(LR).toFixed(1)} dB</b> per alarm; prior odds ${db(pi / (1 - pi)).toFixed(1)} dB.`;
  const K = 6, ks = [...Array(K + 1).keys()], lo = Math.log(pi / (1 - pi));
  const post = ks.map(k => { const l = lo + k * Math.log(LR); return 1 / (1 + Math.exp(-l)); });
  const dbs = ks.map(k => db(pi / (1 - pi)) + k * db(LR));
  const { ctx, w, h } = cv('cvMeter'), box = boxFor(w, h, 50, 14, 22, 38);
  const A = axes(ctx, box, [-0.6, K + 0.6], [0, 1], { xticks: ks, fx: v => v, fy: v => Math.round(v * 100) + '%', xlabel: 'independent alarms k', ylabel: 'P(attack | k alarms)', ylabelOff: 42 });
  const bw = Math.min(40, box.w / (K + 1) * 0.6);
  ks.forEach(k => {
    const x = A.X(k), y = A.Y(post[k]);
    ctx.fillStyle = post[k] >= 0.5 ? COL.red : COL.blue; ctx.fillRect(x - bw / 2, y, bw, A.Y(0) - y);
    ctx.fillStyle = COL.ink; ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    const lab = (dbs[k] >= 0 ? '+' : '') + dbs[k].toFixed(0) + (w < 480 ? '' : ' dB');
    if (w < 480) ctx.font = '9.5px "IBM Plex Mono", monospace';
    if (y < box.y + 22) { ctx.fillStyle = '#fff'; ctx.fillText(lab, x, y + 14); } else ctx.fillText(lab, x, y - 6);
  });
  ctx.strokeStyle = COL.soft; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(box.x, A.Y(0.5)); ctx.lineTo(box.x + box.w, A.Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = COL.soft; ctx.textAlign = 'left'; ctx.fillText('even odds = 0 dB', box.x + 4, A.Y(0.5) - 6);
}

/* =====================================================================
   06 · CAESAR
   ===================================================================== */
const EN = [8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074];
const ENSUM = EN.reduce((a, b) => a + b), LQ = EN.map(v => Math.log(v / ENSUM));
function renderCaesar() {
  const pt = $('#ptIn').value.toLowerCase();
  let th = Math.round(+$('#shiftIn').value); if (!(th >= 0 && th <= 25)) th = 0;
  const ct = [...pt].map(ch => { const c = ch.charCodeAt(0) - 97; return c >= 0 && c < 26 ? String.fromCharCode(97 + (c + th) % 26) : ch; }).join('');
  const letters = [...ct].filter(ch => ch >= 'a' && ch <= 'z').map(ch => ch.charCodeAt(0) - 97);
  const sl = $('#kSl'); sl.max = String(letters.length); if (+sl.value > letters.length) sl.value = String(letters.length);
  const k = +sl.value; $('#kOut').textContent = `${k} / ${letters.length}`;
  let seen = 0;
  $('#cipherOut').innerHTML = [...ct].map(ch => { if (ch >= 'a' && ch <= 'z') { seen++; return `<span class="${seen <= k ? 'seen' : 'hid'}">${ch.toUpperCase()}</span>`; } return ch === ' ' ? ' ' : `<span class="hid">${ch.replace(/[&<>]/g, '')}</span>`; }).join('');
  const kind = $('#priorSel').value;
  const prior = Array.from({ length: 26 }, (_, s) => kind === 'flat' ? 1 / 26 : kind === 'habit' ? (s === 3 ? 0.5 : 0.5 / 25) : (s === th ? 0 : 1 / 25));
  const logL = Array.from({ length: 26 }, (_, s) => { let l = 0; for (let i = 0; i < k; i++) l += LQ[(letters[i] - s + 26) % 26]; return l; });
  const lp = logL.map((l, s) => prior[s] > 0 ? l + Math.log(prior[s]) : -Infinity), mx = Math.max(...lp);
  const un = lp.map(v => Math.exp(v - mx)), Z = un.reduce((a, b) => a + b), post = un.map(v => v / Z);
  const H = -post.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0);
  const map = post.indexOf(Math.max(...post));
  const { ctx, w, h } = cv('cvCaesar'), box = boxFor(w, h, 50, 14, 16, 38);
  const A = axes(ctx, box, [-0.6, 25.6], [0, 1], { xticks: [0, 3, 5, 10, 15, 20, 25], fx: v => v, fy: v => Math.round(v * 100) + '%', xlabel: 'shift θ', ylabel: 'probability', ylabelOff: 42 });
  const bw = box.w / 26 * 0.7;
  for (let s = 0; s < 26; s++) {
    const x = A.X(s);
    ctx.fillStyle = s === th ? COL.red : COL.blue; ctx.globalAlpha = s === th ? 1 : 0.8;
    ctx.fillRect(x - bw / 2, A.Y(post[s]), bw, A.Y(0) - A.Y(post[s]));
    ctx.globalAlpha = 1; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - bw / 2 - 1, A.Y(prior[s])); ctx.lineTo(x + bw / 2 + 1, A.Y(prior[s])); ctx.stroke();
  }
  legend(ctx, box.x + box.w - 220, box.y + 14, [{ col: COL.blue, box: true, label: 'posterior, wrong keys' }, { col: COL.red, box: true, label: `posterior, true key θ = ${th}` }, { col: COL.ink, lw: 1.5, label: 'prior' }]);
  const dec = [...ct].map(ch => { const c = ch.charCodeAt(0) - 97; return c >= 0 && c < 26 ? String.fromCharCode(97 + (c - map + 26) % 26) : ch; }).join('');
  let msg = `after ${k} letters: posterior entropy ${H.toFixed(2)} bits (log₂26 = 4.70 is total ignorance) · MAP key θ = ${map} with P = ${pct(post[map])} · P(true key) = ${pct(post[th], 2)} · decrypt with MAP: “${dec.slice(0, 48)}${dec.length > 48 ? '…' : ''}”`;
  if (kind === 'dog') msg += ' · the prior gave the true key probability 0, so no amount of evidence can ever bring it back (Cromwell’s rule).';
  if (kind === 'flat') msg += ' · with a uniform prior the posterior is just the normalized likelihood.';
  $('#caesarNote').textContent = msg;
}

/* =====================================================================
   07 · ATTACK RATE (grid posterior)
   ===================================================================== */
const G = 1200, LMAX = 30, GRID = Float64Array.from({ length: G }, (_, i) => (i + 1) * LMAX / G), DL = LMAX / G;
const PRIORS = [
  { key: 'flat', name: 'flat on (0, 30]', col: COL.soft, logp: () => 0 },
  { key: 'info', name: 'informative Gamma(20, 2.5): mean 8', col: COL.green, logp: l => logGammaPdf(l, 20, 2.5) },
  { key: 'wrong', name: 'confident Gamma(200, 100): λ ≈ 2 ± 0.14', col: COL.red, logp: l => logGammaPdf(l, 200, 100) },
  { key: 'mix', name: 'bimodal: 80% "quiet" (mean 3) + 20% "under attack" (mean 15)', col: COL.violet, logp: l => Math.log(0.8 * Math.exp(logGammaPdf(l, 9, 3)) + 0.2 * Math.exp(logGammaPdf(l, 30, 2))) }
];
PRIORS.forEach(p => { p.lp = Float64Array.from(GRID, p.logp); });
function poissonCounts(lam, n) {
  const rnd = mulberry32(hash('hw7-rate-' + lam.toFixed(1))), L = Math.exp(-lam), out = [];
  for (let i = 0; i < n; i++) { let k = 0, p = rnd(); while (p > L) { k++; p *= rnd(); } out.push(k); }
  return out;
}
function gridPost(lp, S, n) {
  const a = new Float64Array(G); let mx = -Infinity;
  for (let i = 0; i < G; i++) { const l = GRID[i]; a[i] = lp[i] + S * Math.log(l) - n * l; if (a[i] > mx) mx = a[i]; }
  let Z = 0; for (let i = 0; i < G; i++) { a[i] = Math.exp(a[i] - mx); Z += a[i]; }
  for (let i = 0; i < G; i++) a[i] /= Z * DL;        // density
  return a;
}
function summ(d) {
  let m = 0, c = 0, lo = NaN, hi = NaN, gt = 0;
  for (let i = 0; i < G; i++) { const p = d[i] * DL; m += GRID[i] * p; if (GRID[i] > 10) gt += p; const c2 = c + p; if (isNaN(lo) && c2 >= 0.025) lo = GRID[i]; if (isNaN(hi) && c2 >= 0.975) hi = GRID[i]; c = c2; }
  return { mean: m, lo, hi, gt };
}
let rateData = null, rateLam = null;
function renderRate() {
  const lam = +$('#lam').value, hrs = +$('#hSl').value, sel = +$('#showSel').value;
  $('#lamOut').textContent = lam; $('#hOut').textContent = hrs;
  if (rateLam !== lam) { rateData = poissonCounts(lam, 168); rateLam = lam; }
  const cum = [0]; rateData.forEach(v => cum.push(cum[cum.length - 1] + v));
  const S = cum[hrs], P = PRIORS[sel];
  const post = gridPost(P.lp, S, hrs), prior = gridPost(P.lp, 0, 0), like = gridPost(PRIORS[0].lp, S, hrs);
  {
    const { ctx, w, h } = cv('cvRate'), box = boxFor(w, h, 50);
    const ymax = Math.max(...post, ...like) * 1.15, cut = Math.max(...prior) > ymax;
    const A = axes(ctx, box, [0, LMAX], [0, ymax], { xlabel: 'λ (attempts per hour)', ylabel: 'density', ylabelOff: 40 });
    clip(ctx, box);
    ctx.fillStyle = 'rgba(192,57,43,.12)'; ctx.beginPath(); ctx.moveTo(A.X(GRID[0]), A.Y(0)); for (let i = 0; i < G; i++) ctx.lineTo(A.X(GRID[i]), A.Y(post[i])); ctx.lineTo(A.X(LMAX), A.Y(0)); ctx.fill();
    polyline(ctx, GRID, prior, A.X, A.Y, P.col === COL.soft ? COL.ink : P.col, 1.8, [6, 4]);
    if (hrs > 0) polyline(ctx, GRID, like, A.X, A.Y, COL.soft, 1.6, [2, 3]);
    polyline(ctx, GRID, post, A.X, A.Y, COL.red, 2.4);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A.X(lam), box.y); ctx.lineTo(A.X(lam), box.y + box.h); ctx.stroke();
    ctx.restore();
    legend(ctx, box.x + box.w - 230, box.y + 14, [{ col: P.col === COL.soft ? COL.ink : P.col, dash: [6, 4], label: cut ? 'prior (peak off-scale)' : 'prior' }, { col: COL.soft, dash: [2, 3], label: 'likelihood (normalized)' }, { col: COL.red, label: 'posterior' }, { col: COL.ink, lw: 1, label: `true λ = ${lam}` }]);
  }
  {
    const { ctx, w, h } = cv('cvRateConv'), box = boxFor(w, h, 44);
    const hs = Array.from({ length: 169 }, (_, i) => i);
    const curves = PRIORS.map(p => hs.map(t => summ(gridPost(p.lp, cum[t], t)).mean));
    const A = axes(ctx, box, [0, 168], [0, Math.max(16, lam * 1.3)], { xticks: [0, 24, 48, 72, 96, 120, 144, 168], fx: v => v, xlabel: 'hours observed', ylabel: 'posterior mean of λ', ylabelOff: 34 });
    ctx.strokeStyle = COL.ink; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.x, A.Y(lam)); ctx.lineTo(box.x + box.w, A.Y(lam)); ctx.stroke(); ctx.setLineDash([]);
    curves.forEach((c, i) => polyline(ctx, hs, c, A.X, A.Y, PRIORS[i].col, i === sel ? 2.8 : 1.6));
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(A.X(hrs), box.y); ctx.lineTo(A.X(hrs), box.y + box.h); ctx.stroke(); ctx.setLineDash([]);
    legend(ctx, box.x + box.w - 170, box.y + 14, PRIORS.map(p => ({ col: p.col, label: p.key === 'flat' ? 'flat' : p.key === 'info' ? 'informative' : p.key === 'wrong' ? 'confident λ≈2' : 'bimodal' })));
  }
  const rows = PRIORS.map((p, i) => { const s = summ(gridPost(p.lp, S, hrs)), s0 = summ(gridPost(p.lp, 0, 0)); return `<tr${i === sel ? ' class="hl"' : ''}><td style="color:${p.col}"><b>${p.name}</b></td><td>${fmt(s0.mean, 2)}</td><td><b>${fmt(s.mean, 2)}</b></td><td>[${fmt(s.lo, 2)}, ${fmt(s.hi, 2)}]</td><td>${pct(s.gt)}</td></tr>`; });
  const xb = hrs > 0 ? S / hrs : NaN, se = Math.sqrt(xb / hrs);
  rows.push(`<tr><td><b>frequentist MLE x̄ ± 1.96√(x̄/n)</b></td><td>–</td><td><b>${hrs > 0 ? fmt(xb, 2) : '–'}</b></td><td>${hrs > 0 ? `[${fmt(Math.max(0, xb - 1.96 * se), 2)}, ${fmt(xb + 1.96 * se, 2)}]` : 'undefined, n = 0'}</td><td>–</td></tr>`);
  $('#rateTable').innerHTML = `<thead><tr><th>analyst / prior</th><th>prior mean</th><th>posterior mean</th><th>95% interval</th><th>P(λ > 10 | data)</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('#rateCap').innerHTML = hrs === 0 ? 'No data yet: each posterior equals its prior, and the four analysts disagree completely.' :
    `${hrs} hour${hrs > 1 ? 's' : ''}, ${nfmt(S)} attempts in total (x̄ = ${fmt(xb, 2)}). With little data the conclusions depend on the prior; as hours accumulate the likelihood, whose width shrinks like 1/√n, takes over and the posteriors converge. The confident wrong prior is the slowest: it is worth about 100 hours of data on its own (its rate parameter).`;
}

/* =====================================================================
   wiring
   ===================================================================== */
function init() {
  $('#seqSel').innerHTML = Object.keys(SEQS).map(k => `<option value="${k}">${SEQS[k].name}</option>`).join('');
  $('#seqSel').addEventListener('change', () => renderMicro(false));
  $('#eps').addEventListener('input', () => renderMicro(true));
  const depGo = () => { cancelAnimationFrame(depTimer); depTimer = requestAnimationFrame(renderDep); };
  $('#depSel').addEventListener('change', depGo); $('#rho').addEventListener('input', () => { $('#rhoOut').textContent = (+$('#rho').value).toFixed(2); depGo(); });
  ['#pi', '#sen', '#fpr'].forEach(s => $(s).addEventListener('input', renderMeter));
  ['#ptIn', '#shiftIn', '#kSl'].forEach(s => $(s).addEventListener('input', renderCaesar));
  $('#priorSel').addEventListener('change', renderCaesar);
  $('#showSel').innerHTML = PRIORS.map((p, i) => `<option value="${i}"${i === 1 ? ' selected' : ''}>${p.key === 'flat' ? 'flat' : p.key === 'info' ? 'informative' : p.key === 'wrong' ? 'confident but wrong' : 'bimodal mixture'}</option>`).join('');
  ['#lam', '#hSl'].forEach(s => $(s).addEventListener('input', renderRate));
  $('#showSel').addEventListener('change', renderRate);
  const all = () => { renderMicro(false); renderDep(); renderMeter(); renderCaesar(); renderRate(); };
  all();
  let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(all, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  const links = $$('#toc a');
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => obs.observe(s));
}
document.addEventListener('DOMContentLoaded', init);
