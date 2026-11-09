"use strict";
/* =====================================================================
   HW5 Statistics — Riemann vs Lebesgue, numerical normal CDF
   Vanilla JS + Canvas 2D. No chart or math libraries.
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COL = { ink: '#16202a', soft: '#5b6670', grid: '#e6dfcf', rule: '#cfc4ad', card: '#fbf8f1',
  red: '#c0392b', blue: '#1d4f91', green: '#2e7d57', gold: '#b8860b', purple: '#7d3c98' };

/* ---------- 50-digit reference values of Φ (mpmath.ncdf, dps=50) ---------- */
const REF = [[-10,7.619853024160526066e-24],[-9.75,9.2234135249394181485e-23],[-9.5,1.0494515075362607493e-21],[-9.25,1.122463359132798266e-20],[-9,1.1285884059538406477e-19],[-8.75,1.0667637375474858003e-18],[-8.5,9.4795348222033183542e-18],[-8.25,7.919726314642477341e-17],[-8,6.2209605742717841235e-16],[-7.75,4.5946274357785954602e-15],[-7.5,3.1908916729108962278e-14],[-7.25,2.0838581586720694312e-13],[-7,1.2798125438858350044e-12],[-6.75,7.3922577780178224195e-12],[-6.5,4.0160005838591178083e-11],[-6.25,2.0522634252189388816e-10],[-6,9.865876450376981407e-10],[-5.75,4.4621724539016118731e-9],[-5.5,1.8989562465887719384e-8],[-5.25,7.6049605164887142511e-8],[-5,2.8665157187919391167e-7],[-4.75,1.0170832425687031713e-6],[-4.5,3.3976731247300604017e-6],[-4.25,0.000010688525774934420469],[-4,0.000031671241833119921254],[-3.75,0.000088417285200803867818],[-3.5,0.00023262907903552503635],[-3.25,0.00057702504239076704292],[-3,0.0013498980316300945267],[-2.75,0.0029797632350545567543],[-2.5,0.006209665325776135167],[-2.25,0.012224472655044703153],[-2,0.0227501319481792072],[-1.75,0.040059156863817090419],[-1.5,0.066807201268858066004],[-1.25,0.10564977366685525769],[-1,0.15865525393145705141],[-0.75,0.22662735237686819933],[-0.5,0.30853753872598689636],[-0.25,0.40129367431707627576],[0,0.5],[0.25,0.59870632568292372424],[0.5,0.69146246127401310364],[0.75,0.77337264762313180067],[1,0.84134474606854294859],[1.25,0.89435022633314474231],[1.5,0.933192798731141934],[1.75,0.95994084313618290958],[2,0.9772498680518207928],[2.25,0.98777552734495529685],[2.5,0.99379033467422386483],[2.75,0.99702023676494544325],[3,0.99865010196836990547],[3.25,0.99942297495760923296],[3.5,0.99976737092096447496],[3.75,0.99991158271479919613],[4,0.99996832875816688008],[4.25,0.99998931147422506558],[4.5,0.99999660232687526994],[4.75,0.9999989829167574313],[5,0.99999971334842812081],[5.25,0.99999992395039483511],[5.5,0.99999998101043753411],[5.75,0.9999999955378275461],[6,0.99999999901341235496],[6.25,0.99999999979477365748],[6.5,0.99999999995983999416],[6.75,0.99999999999260774222],[7,0.99999999999872018746],[7.25,0.99999999999979161418],[7.5,0.99999999999996809108],[7.75,0.99999999999999540537],[8,0.9999999999999993779],[8.25,0.9999999999999999208],[8.5,0.99999999999999999052],[8.75,0.99999999999999999893],[9,0.99999999999999999989],[9.25,0.99999999999999999999],[9.5,1.0],[9.75,1.0],[10,1.0]];
/* NIST/SEMATECH e-Handbook 1.3.6.7.1: area from 0 to z (5 decimals) */
const NIST = { 0.5: 0.19146, 1: 0.34134, 1.64: 0.44950, 1.96: 0.47500, 2: 0.47725, 2.32: 0.48983, 3: 0.49865 };
const REFPTS = [[-8, 6.2209605742717841235e-16], [-5, 2.8665157187919391167e-7], [-3, 0.0013498980316300945267],
  [0.5, 0.69146246127401310364], [1, 0.84134474606854294859], [1.64, 0.94949741652589627589], [1.96, 0.97500210485177956379],
  [2, 0.9772498680518207928], [2.32, 0.98982956133128031843], [3, 0.99865010196836990547]];

/* ======================= helpers ======================= */
function fmt(v) {
  if (v === 0) return '0';
  if (v === Infinity) return '∞';
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e5) return v.toLocaleString('en-US');
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1).replace('e+', 'e');
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return (+v.toPrecision(3)).toString();
}
const f6 = v => (v === Infinity ? '∞' : isFinite(v) ? v.toFixed(6) : '–');
const ex = v => (v === 0 ? '0' : !isFinite(v) ? '∞' : v.toExponential(1));
const nfmt = n => n.toLocaleString('en-US');
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
function logTicks(a, b, every = 1) {
  const t = [];
  for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.floor(Math.log10(b) + 1e-9); e++) if (e % every === 0) t.push(Math.pow(10, e));
  return t;
}
const fmtPow = v => { const e = Math.round(Math.log10(v)); return e === 0 ? '1' : e === 1 ? '10' : '1e' + e; };
function axes(ctx, box, xd, yd, o = {}) {
  const X = scale(xd[0], xd[1], box.x, box.x + box.w, o.logx), Y = scale(yd[0], yd[1], box.y + box.h, box.y, o.logy);
  const xt = o.xticks || (o.logx ? logTicks(xd[0], xd[1]) : niceTicks(xd[0], xd[1], o.nx || 6));
  const yt = o.yticks || (o.logy ? logTicks(yd[0], yd[1], o.yevery || 1) : niceTicks(yd[0], yd[1], o.ny || 5));
  ctx.save();
  ctx.fillStyle = COL.card; ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.lineWidth = 1; ctx.strokeStyle = COL.grid; ctx.beginPath();
  for (const x of xt) { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); }
  for (const y of yt) { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(box.x, py); ctx.lineTo(box.x + box.w, py); }
  ctx.stroke();
  ctx.strokeStyle = COL.ink; ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.fillStyle = COL.soft;
  if (!o.noX) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (const x of xt) ctx.fillText((o.fx || (o.logx ? fmtPow : fmt))(x), X(x), box.y + box.h + 4); }
  if (!o.noY) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (const y of yt) ctx.fillText((o.fy || (o.logy ? fmtPow : fmt))(y), box.x - 5, Y(y)); }
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
    if (it.dot) { ctx.beginPath(); ctx.arc(x + 8, yy, 3.5, 0, 7); ctx.fill(); }
    else if (it.box) { ctx.globalAlpha = 0.45; ctx.fillRect(x, yy - 5, 16, 10); ctx.globalAlpha = 1; }
    else { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 16, yy); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.fillText(it.label, x + 22, yy);
    yy += 16;
  }
  ctx.restore();
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ======================= Ex.1 · function catalogue ======================= */
let EVALS = 0;                       // global counter of f-evaluations
const PI = Math.PI;
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/* fat Cantor (Smith–Volterra–Cantor) set, depth D */
const FC_D = 26;
function fcMember(x) {
  if (x < 0 || x > 1) return false;
  let lo = 0, hi = 1;
  for (let k = 1; k <= FC_D; k++) {
    const c = (lo + hi) / 2, r = 0.5 * Math.pow(4, -k);
    if (Math.abs(x - c) < r) return false;
    if (x < c) hi = c - r; else lo = c + r;
  }
  return true;
}
function fcMeets(u, v, lo = 0, hi = 1, k = 1) {
  if (v < lo || u > hi) return false;
  if (k > FC_D) return true;
  const c = (lo + hi) / 2, r = 0.5 * Math.pow(4, -k);
  return fcMeets(u, v, lo, c - r, k + 1) || fcMeets(u, v, c + r, hi, k + 1);
}
function fcIntervals(depth) {          // remaining intervals at a given depth (for drawing)
  let I = [[0, 1]];
  for (let k = 1; k <= depth; k++) {
    const r = 0.5 * Math.pow(4, -k), nx = [];
    for (const [lo, hi] of I) { const c = (lo + hi) / 2; nx.push([lo, c - r], [c + r, hi]); }
    I = nx;
  }
  return I;
}
/* smallest denominator of a fraction in [u, v] (u, v grid points k/N) */
function qMin(u, v) {
  for (let q = 1; q < 1e7; q++) if (Math.ceil(u * q - 1e-9) <= Math.floor(v * q + 1e-9)) return q;
  return Infinity;
}

/* Each function: f, [a,b], exact value, Riemann status, range [ymin,ymax],
   pieces = monotone pieces {p,q,dir:+1|-1|0,fl,fr} (dir 0 = constant fl),
   infsup(u,v) exact inf/sup on a column, optional measure oracle muGT(t). */
const FUNCS = [
  { key: 'sin', label: 'sin x on [0, π]', a: 0, b: PI, exact: 2, rie: 'ok', ymin: 0, ymax: 1,
    f: x => Math.sin(x),
    pieces: [{ p: 0, q: PI / 2, dir: 1, fl: 0, fr: 1 }, { p: PI / 2, q: PI, dir: -1, fl: 1, fr: 0 }],
    infsup: (u, v, F) => { const a = F(u), b = F(v); return [Math.min(a, b), u <= PI / 2 && v >= PI / 2 ? 1 : Math.max(a, b)]; },
    note: 'Smooth: the textbook case. Both brackets close fast on 2.' },
  { key: 'sq', label: 'x² on [0, 1]', a: 0, b: 1, exact: 1 / 3, rie: 'ok', ymin: 0, ymax: 1,
    f: x => x * x, pieces: [{ p: 0, q: 1, dir: 1, fl: 0, fr: 1 }],
    infsup: (u, v, F) => [F(u), F(v)], note: 'Monotone and convex: inf and sup at the column ends.' },
  { key: 'step13', label: '1 if x < ½, 3 otherwise', a: 0, b: 1, exact: 2, rie: 'ok', ymin: 1, ymax: 3,
    f: x => (x < 0.5 ? 1 : 3), pieces: [{ p: 0, q: 0.5, dir: 0, fl: 1 }, { p: 0.5, q: 1, dir: 0, fl: 3 }],
    infsup: (u, v, F) => { F(u); return v < 0.5 ? [1, 1] : u >= 0.5 ? [3, 3] : [1, 3]; },
    note: 'One jump: only the column containing ½ has a gap. Lebesgue sees just two level sets of measure ½.' },
  { key: 'abs', label: '|x − ½| on [0, 1]', a: 0, b: 1, exact: 0.25, rie: 'ok', ymin: 0, ymax: 0.5,
    f: x => Math.abs(x - 0.5), pieces: [{ p: 0, q: 0.5, dir: -1, fl: 0.5, fr: 0 }, { p: 0.5, q: 1, dir: 1, fl: 0, fr: 0.5 }],
    infsup: (u, v, F) => { const a = F(u), b = F(v); return [u <= 0.5 && v >= 0.5 ? 0 : Math.min(a, b), Math.max(a, b)]; },
    note: 'A kink at ½. Piecewise linear: the midpoint rule is exact whenever ½ is a column edge.' },
  { key: 'isqrt', label: '1/√x on (0, 1]', a: 0, b: 1, exact: 2, rie: 'improper', ymin: 1, ymax: Infinity,
    f: x => (x <= 0 ? Infinity : 1 / Math.sqrt(x)), pieces: [{ p: 0, q: 1, dir: -1, fl: Infinity, fr: 1 }],
    infsup: (u, v, F) => [F(v), F(u)],
    note: 'Unbounded near 0. Upper Darboux sums are infinite; layers are cut at a height T = 1 + √M and the tail above T is exactly 1/T.' },
  { key: 'step10', label: '1 if x < ½, 0 otherwise', a: 0, b: 1, exact: 0.5, rie: 'ok', ymin: 0, ymax: 1,
    f: x => (x < 0.5 ? 1 : 0), pieces: [{ p: 0, q: 0.5, dir: 0, fl: 1 }, { p: 0.5, q: 1, dir: 0, fl: 0 }],
    infsup: (u, v, F) => { F(u); return v < 0.5 ? [1, 1] : u >= 0.5 ? [0, 0] : [0, 1]; },
    note: 'An indicator of an interval: Lebesgue gives 1 · μ([0, ½)) in a single layer.' },
  { key: 'sinc', label: 'sin x / x on [0, π]', a: 0, b: PI, exact: 1.8519370519824662, rie: 'ok', ymin: 0, ymax: 1,
    f: x => (x === 0 ? 1 : Math.sin(x) / x), pieces: [{ p: 0, q: PI, dir: -1, fl: 1, fr: 0 }],
    infsup: (u, v, F) => [F(v), F(u)],
    note: 'Its integral Si(π) has no elementary formula either: like Φ, it is a special function.' },
  { key: 'dir', label: 'Dirichlet 1_ℚ on [0, 1]', a: 0, b: 1, exact: 0, rie: 'no', ymin: 0, ymax: 1, oracle: true,
    f: () => 1,                                       // every float is rational
    infsup: () => [0, 1], muGT: t => (t < 0 ? 1 : 0),
    note: 'Not Riemann-integrable. Lebesgue: {f > y} = ℚ ∩ [0,1] is countable, so its measure is 0 (measure oracle).' },
  { key: 'thomae', label: "Thomae's popcorn function", a: 0, b: 1, exact: 0, rie: 'ok', ymin: 0, ymax: 1, oracle: true,
    f: x => 0, // irrational value; exact rational handling in midSum
    midSum: N => { let s = 0; for (let i = 0; i < N; i++) { const p = 2 * i + 1, q = 2 * N, g = gcd(p, q); s += g / q; } EVALS += N; return s / N; },
    infsup: (u, v, F) => { EVALS += 1; return [0, 1 / qMin(u, v)]; }, muGT: t => (t < 0 ? 1 : 0),
    note: 'Discontinuous at every rational, yet Riemann-integrable: sup on each column is 1/q_min, computed exactly.' },
  { key: 'fat', label: 'Fat Cantor set indicator 1_C', a: 0, b: 1, exact: 0.5, rie: 'no', ymin: 0, ymax: 1, oracle: true,
    f: x => (fcMember(x) ? 1 : 0),
    infsup: (u, v) => { EVALS += 1; return [0, fcMeets(u, v) ? 1 : 0]; }, muGT: t => (t < 0 ? 1 : t < 1 ? 0.5 : 0),
    note: 'C has no interior but measure ½: lower sums stay 0, upper sums tend to ½. Lebesgue: μ(C) = ½ (measure oracle).' }
];
const FN = k => FUNCS.find(f => f.key === k);
const Fcount = fn => x => { EVALS++; return fn.f(x); };

/* ---- exact preimage of {f > t} on the monotone pieces (bisection) ---- */
function crossing(F, p, q, t, dir) {      // monotone on (p,q): point where f crosses t
  let lo = p, hi = q;
  for (let i = 0; i < 64 && hi - lo > 1e-16 * Math.max(1, Math.abs(lo)); i++) {
    const m = (lo + hi) / 2, above = F(m) > t;
    if (dir > 0) { if (above) hi = m; else lo = m; } else { if (above) lo = m; else hi = m; }
  }
  return (lo + hi) / 2;
}
function preimage(fn, t, F) {             // list of intervals where f > t
  const out = [];
  for (const P of fn.pieces) {
    if (P.dir === 0) { if (P.fl > t) out.push([P.p, P.q]); continue; }
    const lo = Math.min(P.fl, P.fr), hi = Math.max(P.fl, P.fr);
    if (hi <= t) continue;
    if (lo > t) { out.push([P.p, P.q]); continue; }
    const c = crossing(F, P.p, P.q, t, P.dir);
    out.push(P.dir > 0 ? [c, P.q] : [P.p, c]);
  }
  return out;
}
function muGT(fn, t, F) {
  if (fn.muGT) return fn.muGT(t);
  return preimage(fn, t, F).reduce((s, [u, v]) => s + (v - u), 0);
}

/* ---- Riemann: midpoint + Darboux ---- */
function riemann(fn, N) {
  const F = Fcount(fn), dx = (fn.b - fn.a) / N;
  EVALS = 0;
  let mid = 0;
  if (fn.midSum) mid = fn.midSum(N) * (fn.b - fn.a);
  else { for (let i = 0; i < N; i++) mid += F(fn.a + (i + 0.5) * dx); mid *= dx; }
  const eMid = EVALS; EVALS = 0;
  let L = 0, U = 0;
  for (let i = 0; i < N; i++) {
    const u = fn.a + i * dx, v = i === N - 1 ? fn.b : fn.a + (i + 1) * dx;
    const [lo, hi] = fn.infsup(u, v, F);
    L += lo; U += hi;
  }
  return { mid, L: L * dx, U: U * dx, eMid, eDar: EVALS };
}
/* ---- Lebesgue: layer cake, lower/upper/midpoint ---- */
function lebTop(fn, M) { return isFinite(fn.ymax) ? fn.ymax : 1 + Math.sqrt(M); }
function lebesgue(fn, M) {
  const F = Fcount(fn), top = lebTop(fn, M), dy = (top - fn.ymin) / M, len = fn.b - fn.a;
  EVALS = 0;
  const base = fn.ymin * len, g = [];
  for (let j = 0; j <= M; j++) g.push(muGT(fn, fn.ymin + j * dy, F));
  let L = base, U = base, mid = base;
  for (let j = 0; j < M; j++) { L += dy * g[j + 1]; U += dy * g[j]; mid += dy * muGT(fn, fn.ymin + (j + 0.5) * dy, F); }
  if (!isFinite(fn.ymax)) U = Infinity;
  return { mid, L, U, evals: EVALS, top };
}

/* ======================= Ex.1 · drawing ======================= */
function fnPlotRange(fn, M) { const top = lebTop(fn, M); return [Math.min(0, fn.ymin), top * 1.06]; }
function drawCurve(ctx, A, fn) {
  ctx.save(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
  if (fn.key === 'dir') {
    ctx.setLineDash([2, 3]); ctx.beginPath();
    ctx.moveTo(A.X(0), A.Y(1)); ctx.lineTo(A.X(1), A.Y(1)); ctx.moveTo(A.X(0), A.Y(0)); ctx.lineTo(A.X(1), A.Y(0)); ctx.stroke();
  } else if (fn.key === 'thomae') {
    ctx.fillStyle = COL.ink;
    for (let q = 1; q <= 40; q++) for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) { ctx.beginPath(); ctx.arc(A.X(p / q), A.Y(1 / q), q < 6 ? 2.6 : 1.4, 0, 7); ctx.fill(); }
  } else if (fn.key === 'fat') {
    ctx.fillStyle = COL.ink;
    for (const [u, v] of fcIntervals(7)) ctx.fillRect(A.X(u), A.Y(1) - 1, Math.max(0.6, A.X(v) - A.X(u)), 3);
  } else {
    ctx.beginPath(); let first = true;
    const S = 600;
    for (let i = 0; i <= S; i++) {
      const x = fn.a + (fn.b - fn.a) * i / S, y = fn.f(x === 0 && fn.key === 'isqrt' ? 1e-6 : x);
      if (fn.key.startsWith('step') && i > 0 && (fn.a + (fn.b - fn.a) * (i - 1) / S) < 0.5 && x >= 0.5) { ctx.lineTo(A.X(0.5), A.Y(fn.f(0.4999))); ctx.moveTo(A.X(0.5), A.Y(fn.f(0.5))); }
      first ? ctx.moveTo(A.X(x), A.Y(y)) : ctx.lineTo(A.X(x), A.Y(y)); first = false;
    }
    ctx.stroke();
  }
  ctx.restore();
}
function drawRiemann(fn, N, M) {
  const { ctx, w, h } = cv('cvRie'), box = { x: 44, y: 10, w: w - 56, h: h - 44 };
  const yr = fnPlotRange(fn, M), A = axes(ctx, box, [fn.a, fn.b], yr, { nx: 5, ny: 4, xlabel: 'x' });
  clip(ctx, box);
  const dx = (fn.b - fn.a) / N, F = Fcount(fn), thin = N > 120;
  for (let i = 0; i < N; i++) {
    const u = fn.a + i * dx, v = u + dx, [lo, hi] = fn.infsup(u, v, F);
    const x0 = A.X(u), x1 = A.X(v), top = isFinite(hi) ? A.Y(hi) : box.y;
    ctx.fillStyle = 'rgba(29,79,145,.13)'; ctx.fillRect(x0, top, x1 - x0, A.Y(yr[0] < 0 ? 0 : yr[0]) - top);
    ctx.fillStyle = 'rgba(29,79,145,.45)'; const ly = A.Y(lo); ctx.fillRect(x0, ly, x1 - x0, A.Y(0) - ly);
    if (!thin) { ctx.strokeStyle = 'rgba(29,79,145,.6)'; ctx.lineWidth = 0.8; ctx.strokeRect(x0, top, x1 - x0, A.Y(0) - top); }
  }
  drawCurve(ctx, A, fn);
  ctx.restore();
  legend(ctx, box.x + box.w - 170, box.y + 14, [{ col: COL.blue, label: 'lower sum Lₙ', box: true }, { col: 'rgba(29,79,145,.35)', label: 'upper sum Uₙ', box: true }]);
}
function drawLebesgue(fn, N, M) {
  const { ctx, w, h } = cv('cvLeb'), box = { x: 44, y: 10, w: w - 56, h: h - 64 };
  const yr = fnPlotRange(fn, M), A = axes(ctx, box, [fn.a, fn.b], yr, { nx: 5, ny: 4 });
  const top = lebTop(fn, M), dy = (top - fn.ymin) / M, F = Fcount(fn);
  clip(ctx, box);
  if (fn.ymin > 0) { ctx.fillStyle = 'rgba(192,57,43,.30)'; ctx.fillRect(A.X(fn.a), A.Y(fn.ymin), A.X(fn.b) - A.X(fn.a), A.Y(0) - A.Y(fn.ymin)); }
  const step = Math.max(1, Math.floor(M / 80));
  for (let j = 0; j < M; j += step) {
    const y0 = fn.ymin + j * dy, y1 = Math.min(top, y0 + dy * step), t = y0 + dy / 2;
    const segs = fn.oracle ? (fn.key === 'fat' && t < 1 ? fcIntervals(7) : []) : preimage(fn, t, F);
    ctx.fillStyle = j % (2 * step) === 0 ? 'rgba(192,57,43,.42)' : 'rgba(192,57,43,.28)';
    for (const [u, v] of segs) ctx.fillRect(A.X(u), A.Y(y1), Math.max(0.6, A.X(v) - A.X(u)), A.Y(y0) - A.Y(y1));
  }
  drawCurve(ctx, A, fn);
  ctx.restore();
  // preimage strip for the middle level
  const tMid = fn.ymin + (top - fn.ymin) * 0.5, sy = box.y + box.h + 22;
  const segs = fn.oracle ? (fn.key === 'fat' ? fcIntervals(7) : []) : preimage(fn, tMid, F);
  ctx.fillStyle = COL.soft; ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = COL.rule; ctx.beginPath(); ctx.moveTo(box.x, sy + 0.5); ctx.lineTo(box.x + box.w, sy + 0.5); ctx.stroke();
  ctx.fillStyle = COL.red; for (const [u, v] of segs) ctx.fillRect(A.X(u), sy - 4, Math.max(1, A.X(v) - A.X(u)), 8);
  ctx.fillStyle = COL.soft;
  const mu = muGT(fn, tMid, F);
  ctx.fillText(`{f > ${fmt(tMid)}}  μ = ${fmt(mu)}${fn.oracle ? ' (oracle)' : ''}`, box.x, sy + 16);
  ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = COL.red; ctx.beginPath(); ctx.moveTo(box.x, A.Y(tMid)); ctx.lineTo(box.x + box.w, A.Y(tMid)); ctx.stroke(); ctx.restore();
}
function labRun() {
  const fn = FN($('#fnSel').value), N = +$('#nSl').value, M = +$('#mSl').value;
  $('#nOut').textContent = N; $('#mOut').textContent = M;
  $('#fnNote').innerHTML = fn.note + (fn.oracle ? ' <span class="oracle">measure oracle</span>' : '');
  drawRiemann(fn, N, M); drawLebesgue(fn, N, M);
  const R = riemann(fn, N), Lb = lebesgue(fn, M);
  const err = v => (isFinite(v) ? ex(Math.abs(v - fn.exact)) : '–');
  const rieExact = fn.rie === 'no' ? 'does not exist' : fn.rie === 'improper' ? '2 (improper)' : f6(fn.exact);
  $('#labTable').innerHTML = `<thead><tr><th>method</th><th>estimate</th><th>error</th><th>lower bound</th><th>upper bound</th><th>bracket width</th><th>f-evaluations</th></tr></thead><tbody>
    <tr><td>Riemann midpoint (N = ${N})</td><td>${f6(R.mid)}</td><td>${err(R.mid)}</td><td colspan="3" class="th">point estimate</td><td>${nfmt(R.eMid)}</td></tr>
    <tr><td>Riemann Darboux (N = ${N})</td><td class="th">–</td><td class="th">–</td><td>${f6(R.L)}</td><td>${f6(R.U)}</td><td>${f6(R.U - R.L)}</td><td>${nfmt(R.eDar)}</td></tr>
    <tr><td>Lebesgue mid-layer (M = ${M})</td><td>${f6(Lb.mid)}</td><td>${err(Lb.mid)}</td><td>${f6(Lb.L)}</td><td>${f6(Lb.U)}</td><td>${f6(Lb.U - Lb.L)}</td><td>${fn.oracle ? 'oracle' : nfmt(Lb.evals)}</td></tr>
    <tr><td class="th">exact</td><td class="th" colspan="6">Lebesgue ${f6(fn.exact)} · Riemann ${rieExact}</td></tr></tbody>`;
}

/* ---- convergence chart for the selected function ---- */
function drawConv() {
  const fn = FN($('#fnSel').value), Ns = [];
  const nmax = fn.key === 'thomae' ? 2048 : 4096;
  for (let n = 4; n <= nmax; n *= 2) Ns.push(n);
  const S = { mid: [], gapR: [], lmid: [], gapL: [] }, ev = { mid: [], dar: [], leb: [] };
  for (const n of Ns) {
    const R = riemann(fn, n), L = lebesgue(fn, n);
    S.mid.push(Math.abs(R.mid - fn.exact)); S.gapR.push(R.U - R.L); S.lmid.push(Math.abs(L.mid - fn.exact)); S.gapL.push(L.U - L.L);
    ev.mid.push(R.eMid); ev.dar.push(R.eDar); ev.leb.push(L.evals);
  }
  const { ctx, w, h } = cv('cvConv'), box = { x: 62, y: 12, w: w - 76, h: h - 56 };
  const all = [...S.mid, ...S.gapR, ...S.lmid, ...S.gapL].filter(v => isFinite(v) && v > 0);
  const lo = Math.max(1e-17, Math.min(...all)), hi = Math.max(...all, 1);
  const yd = [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi)))];
  const span = Math.log10(yd[1]) - Math.log10(yd[0]);
  const A = axes(ctx, box, [Ns[0] / 1.3, Ns[Ns.length - 1] * 1.3], yd, { logx: true, logy: true, yevery: span > 10 ? 2 : 1,
    xticks: Ns.filter((_, i) => i % 2 === 0), fx: v => nfmt(v), xlabel: 'N columns = M layers', ylabel: 'error or bracket width', ylabelOff: 54 });
  clip(ctx, box);
  const series = [[S.mid, COL.blue, [], 'Riemann midpoint error'], [S.gapR, COL.blue, [5, 4], 'Riemann Darboux gap Uₙ − Lₙ'],
    [S.lmid, COL.red, [], 'Lebesgue mid-layer error'], [S.gapL, COL.red, [5, 4], 'Lebesgue bracket gap']];
  for (const [arr, c, d] of series) {
    ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.setLineDash(d); ctx.beginPath(); let st = false;
    arr.forEach((v, i) => { if (!(isFinite(v) && v > 0)) { st = false; return; } const x = A.X(Ns[i]), y = A.Y(Math.max(v, yd[0])); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; });
    ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = c;
    arr.forEach((v, i) => { if (isFinite(v) && v > 0) { ctx.beginPath(); ctx.arc(A.X(Ns[i]), A.Y(Math.max(v, yd[0])), 2.8, 0, 7); ctx.fill(); } });
  }
  ctx.restore();
  legend(ctx, box.x + box.w - 250, box.y + 14, series.map(([, c, d, l]) => ({ col: c, dash: d, label: l })));
  const k = Ns.length - 1, n = Ns[k];
  const zero = v => (v === 0 ? 'exactly 0 (not drawn on a log axis)' : ex(v));
  $('#convNote').textContent = `${fn.label} at N = M = ${nfmt(n)}: midpoint error ${zero(S.mid[k])} with ${nfmt(ev.mid[k])} evaluations · Darboux gap ${isFinite(S.gapR[k]) ? ex(S.gapR[k]) : '∞'} with ${nfmt(ev.dar[k])} · Lebesgue error ${zero(S.lmid[k])}, gap ${isFinite(S.gapL[k]) ? ex(S.gapL[k]) : '∞'}, with ${fn.oracle ? 'a measure oracle' : nfmt(ev.leb[k]) + ' evaluations'}.`;
}
function drawAllTable() {
  const N = 1000;
  let t = '<thead><tr><th>function</th><th>exact (Lebesgue)</th><th>Riemann mid</th><th>error</th><th>Darboux [L, U]</th><th>Lebesgue mid</th><th>error</th><th>Lebesgue [L, U]</th><th>evals R / L</th><th>time R / L (ms)</th></tr></thead><tbody>';
  let fasterR = 0, totR = 0;
  for (const fn of FUNCS) {
    let t0 = performance.now(); const R = riemann(fn, N); const tR = performance.now() - t0;
    t0 = performance.now(); const L = lebesgue(fn, N); const tL = performance.now() - t0;
    if (!fn.oracle) { totR++; if (tR < tL) fasterR++; }
    const e = v => (isFinite(v) ? ex(Math.abs(v - fn.exact)) : '–');
    t += `<tr><td>${fn.label}${fn.oracle ? ' <span class="oracle">oracle</span>' : ''}</td><td>${f6(fn.exact)}</td><td>${f6(R.mid)}</td><td>${e(R.mid)}</td>` +
      `<td>[${f6(R.L)}, ${f6(R.U)}]</td><td>${f6(L.mid)}</td><td>${e(L.mid)}</td><td>[${f6(L.L)}, ${f6(L.U)}]</td>` +
      `<td>${nfmt(R.eMid + R.eDar)} / ${fn.oracle ? '–' : nfmt(L.evals)}</td><td>${tR.toFixed(2)} / ${tL.toFixed(2)}</td></tr>`;
  }
  $('#allTable').innerHTML = t + '</tbody>';
  $('#allNote').textContent = `Riemann evaluations = midpoint + Darboux. On this device Riemann was faster for ${fasterR} of the ${totR} functions with computed preimages. For Riemann-integrable functions the two brackets overlap and shrink on the same value; for Dirichlet and the fat Cantor set the Darboux bracket stays wide.`;
}
function drawGap() {
  const keys = ['sin', 'thomae', 'fat', 'dir'], cols = [COL.green, COL.gold, COL.purple, COL.red], Ns = [];
  for (let n = 4; n <= 4096; n *= 2) Ns.push(n);
  const data = keys.map(k => Ns.map(n => (k === 'thomae' && n > 2048 ? NaN : (() => { const r = riemann(FN(k), n); return r.U - r.L; })())));
  const { ctx, w, h } = cv('cvGap'), box = { x: 62, y: 12, w: w - 76, h: h - 56 };
  const A = axes(ctx, box, [Ns[0] / 1.3, Ns[Ns.length - 1] * 1.3], [1e-7, 3], { logx: true, logy: true,
    xticks: Ns.filter((_, i) => i % 2 === 0), fx: v => nfmt(v), xlabel: 'N columns', ylabel: 'Darboux gap Uₙ − Lₙ', ylabelOff: 54 });
  clip(ctx, box);
  data.forEach((arr, s) => {
    ctx.strokeStyle = cols[s]; ctx.fillStyle = cols[s]; ctx.lineWidth = 2; ctx.beginPath(); let st = false;
    arr.forEach((v, i) => { if (!(v > 0)) return; const x = A.X(Ns[i]), y = A.Y(v); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; });
    ctx.stroke();
    arr.forEach((v, i) => { if (v > 0) { ctx.beginPath(); ctx.arc(A.X(Ns[i]), A.Y(v), 3, 0, 7); ctx.fill(); } });
  });
  ctx.restore();
  legend(ctx, box.x + 14, box.y + box.h - 72, [
    { col: COL.red, label: 'Dirichlet: gap = 1 forever' }, { col: COL.purple, label: 'fat Cantor: gap → ½' },
    { col: COL.gold, label: 'Thomae: gap → 0 (slowly)' }, { col: COL.green, label: 'sin x: gap → 0 like 1/N' }]);
}

/* ======================= Ex.2 · normal CDF ======================= */
const SQ2PI = Math.sqrt(2 * Math.PI);
let PE = 0;
const phi = t => Math.exp(-t * t / 2) / SQ2PI;
const phiC = t => { PE++; return Math.exp(-t * t / 2) / SQ2PI; };
const XCAP = 40;                                  // φ(40) underflows: nothing beyond matters

/* A · adaptive Simpson */
function simpAdapt(a, b, eps, fa, fm, fb, whole, depth) {
  const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2, flm = phiC(lm), frm = phiC(rm);
  const left = (m - a) / 6 * (fa + 4 * flm + fm), right = (b - m) / 6 * (fm + 4 * frm + fb), d = left + right - whole;
  if (depth <= 0 || Math.abs(d) <= 15 * eps) return left + right + d / 15;
  return simpAdapt(a, m, eps / 2, fa, flm, fm, left, depth - 1) + simpAdapt(m, b, eps / 2, fm, frm, fb, right, depth - 1);
}
function PhiSimpson(x, eps = 1e-12) {
  const ax = Math.min(Math.abs(x), XCAP);
  if (ax === 0) return 0.5;
  const fa = phiC(0), fb = phiC(ax), fm = phiC(ax / 2);
  const I = simpAdapt(0, ax, eps, fa, fm, fb, ax / 6 * (fa + 4 * fm + fb), 50);
  return x >= 0 ? 0.5 + I : 0.5 - I;
}
/* B · Gauss–Legendre: nodes by Newton on P_n */
const GL = {};
function glRule(n) {
  if (GL[n]) return GL[n];
  const x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp; z -= dz; if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * dp * dp));
  }
  return (GL[n] = { x, w });
}
function PhiGL(x, n = 16) {
  const ax = Math.min(Math.abs(x), XCAP);
  if (ax === 0) return 0.5;
  const R = glRule(n), P = Math.max(1, Math.ceil(ax)), hw = ax / P / 2;
  let I = 0;
  for (let p = 0; p < P; p++) {
    const c = (2 * p + 1) * hw;
    for (let k = 0; k < n; k++) I += R.w[k] * phiC(c + hw * R.x[k]);
  }
  I *= hw;
  return x >= 0 ? 0.5 + I : 0.5 - I;
}
/* C · Marsaglia positive series */
let TERMS = 0;
function PhiMarsaglia(x) {
  let s = x, t = x, k = 1;
  for (; k < 5000; k++) { t *= x * x / (2 * k + 1); const n = s + t; if (n === s) break; s = n; }
  TERMS = k; PE++;
  return 0.5 + phi(x) * s;
}
/* D · Laplace continued fraction for Q(x), x > 0 */
const cfK = ax => Math.ceil(40 + 320 / Math.max(ax * ax, 0.25));
function Qcf(ax, K) { let r = ax; for (let k = K; k >= 1; k--) r = ax + k / r; PE++; return phi(ax) / r; }
function PhiCF(x, K = 60) { const ax = Math.abs(x); if (ax === 0) return 0.5; const q = Qcf(ax, K); return x < 0 ? q : 1 - q; }
/* baseline · alternating Taylor series of erf (what NOT to do in the tails) */
function PhiErfTaylor(x) {
  const z = x / Math.SQRT2; let s = z, t = z;
  for (let k = 1; k < 300; k++) { t *= -z * z / k; const n = s + t / (2 * k + 1); if (n === s) break; s = n; }
  return 0.5 * (1 + 2 / Math.sqrt(Math.PI) * s);
}
/* Hybrid */
function PhiHybrid(x) {
  const ax = Math.abs(x);
  if (ax < 2) return PhiMarsaglia(x);
  const q = Qcf(ax, cfK(ax));
  return x < 0 ? q : 1 - q;
}
const METHODS = [
  { key: 'simp', label: 'A · adaptive Simpson', col: COL.blue, fn: x => PhiSimpson(x, +$('#tolSel').value) },
  { key: 'gl', label: 'B · Gauss–Legendre', col: COL.green, fn: x => PhiGL(x, +$('#glSel').value) },
  { key: 'mars', label: 'C · Marsaglia series', col: COL.gold, fn: PhiMarsaglia },
  { key: 'cf', label: 'D · continued fraction (K = 60)', col: COL.purple, fn: x => PhiCF(x, 60) },
  { key: 'erf', label: 'baseline · alternating erf series', col: COL.soft, fn: PhiErfTaylor, dash: [4, 3] },
  { key: 'hyb', label: 'Hybrid (C + D)', col: COL.red, fn: PhiHybrid, lw: 3 }
];
const relErr = (v, r) => (r === 0 ? Math.abs(v) : Math.abs(v - r) / Math.abs(r));

function calcRun() {
  const x = +$('#xIn').value;
  if (!isFinite(x)) return;
  const ref = refAt(x);
  let t = '<thead><tr><th>method</th><th>Φ(x)</th><th>rel. error</th><th>work</th></tr></thead><tbody>';
  for (const m of METHODS) {
    PE = 0; TERMS = 0; const v = m.fn(x);
    const work = m.key === 'mars' ? `${TERMS} terms` : m.key === 'erf' ? 'series' : m.key === 'cf' ? '60 levels' :
      m.key === 'hyb' ? (Math.abs(x) < 2 ? `series, ${TERMS} terms` : `fraction, ${cfK(Math.abs(x))} levels`) : `${PE} φ-evals`;
    t += `<tr><td>${m.label}</td><td>${v.toPrecision(16)}</td><td>${ref === null ? '–' : ex(relErr(v, ref))}</td><td>${work}</td></tr>`;
  }
  $('#calcTable').innerHTML = t + `<tr><td class="th">reference (mpmath, 50 digits)</td><td class="th" colspan="3">${ref === null ? 'not tabulated: choose a multiple of 0.25 in [−10, 10] or 1.64, 1.96, 2.32' : ref.toPrecision(16)}</td></tr></tbody>`;
  $('#calcNote').textContent = ref === null ? 'Relative errors need a reference: the embedded table covers x = −10, −9.75, …, 10 plus 1.64, 1.96 and 2.32.' :
    'Try x = −6: the two quadratures and the series lose almost all relative accuracy (they compute ½ − 0.49999…), the continued fraction and the hybrid do not.';
  drawPhi(x);
}
function refAt(x) { const r = REF.find(([a]) => Math.abs(a - x) < 1e-9) || REFPTS.find(([a]) => Math.abs(a - x) < 1e-9); return r ? r[1] : null; }
function drawPhi(x) {
  const { ctx, w, h } = cv('cvPhi'), box = { x: 40, y: 10, w: w - 50, h: h - 44 };
  const A = axes(ctx, box, [-4.2, 4.2], [0, 0.44], { nx: 8, ny: 4, xlabel: 't' });
  clip(ctx, box);
  ctx.fillStyle = 'rgba(192,57,43,.35)'; ctx.beginPath(); ctx.moveTo(A.X(-4.2), A.Y(0));
  const xe = Math.max(-4.2, Math.min(4.2, x));
  for (let i = 0; i <= 200; i++) { const t = -4.2 + (xe + 4.2) * i / 200; ctx.lineTo(A.X(t), A.Y(phi(t))); }
  ctx.lineTo(A.X(xe), A.Y(0)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 300; i++) { const t = -4.2 + 8.4 * i / 300; i ? ctx.lineTo(A.X(t), A.Y(phi(t))) : ctx.moveTo(A.X(t), A.Y(phi(t))); }
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = COL.ink; ctx.font = '12px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`Φ(${x}) = ${PhiHybrid(x).toPrecision(10)}`, box.x + 8, box.y + 6);
}
function drawErr() {
  const { ctx, w, h } = cv('cvErr'), box = { x: 62, y: 12, w: w - 76, h: h - 56 };
  const A = axes(ctx, box, [-10, 10], [1e-17, 1e2], { logy: true, yevery: 2, nx: 10, xlabel: 'x', ylabel: 'relative error of Φ(x)', ylabelOff: 54 });
  clip(ctx, box);
  ctx.fillStyle = 'rgba(46,125,87,.08)'; ctx.fillRect(box.x, A.Y(1e-14), box.w, A.Y(1e-17) - A.Y(1e-14));
  const worst = {};
  for (const m of METHODS) {
    let wst = 0; ctx.strokeStyle = m.col; ctx.lineWidth = m.lw || 1.6; ctx.setLineDash(m.dash || []); ctx.beginPath(); let st = false;
    for (const [x, r] of REF) {
      const e = relErr(m.fn(x), r); wst = Math.max(wst, e);
      const y = A.Y(Math.min(1e2, Math.max(1e-17, e)));
      st ? ctx.lineTo(A.X(x), y) : ctx.moveTo(A.X(x), y); st = true;
    }
    ctx.stroke(); ctx.setLineDash([]); worst[m.key] = wst;
  }
  ctx.restore();
  legend(ctx, box.x + box.w - 270, box.y + 14, METHODS.map(m => ({ col: m.col, label: m.label, dash: m.dash, lw: m.lw })));
  $('#errNote').textContent = 'Errors below 1e-17 are drawn at the floor; the shaded band is double-precision territory (≤ 1e-14). Left of 0 the true Φ(x) is tiny, so any method that computes it as ½ minus something loses digits.';
  return worst;
}
function drawRefTable() {
  let t = '<thead><tr><th>x</th><th>reference Φ(x)</th><th>NIST (0.5 + table)</th><th>hybrid</th><th>rel. error</th></tr></thead><tbody>';
  for (const [x, r] of REFPTS) {
    const v = PhiHybrid(x), ni = NIST[x];
    t += `<tr><td>${x}</td><td>${r.toPrecision(15)}</td><td>${ni !== undefined ? (0.5 + ni).toFixed(5) : '<span class="th">not in table</span>'}</td><td>${v.toPrecision(15)}</td><td>${ex(relErr(v, r))}</td></tr>`;
  }
  $('#refTable').innerHTML = t + '</tbody>';
}
function drawSpeed(worst) {
  const xs = []; const r = mulberry32(5); for (let i = 0; i < 4000; i++) xs.push(-8 + 16 * r());
  let t = '<thead><tr><th>method</th><th>ns / call</th><th>worst rel. error</th></tr></thead><tbody>';
  for (const m of METHODS) {
    const f = m.fn, reps = 3; let sink = 0;
    const t0 = performance.now();
    for (let k = 0; k < reps; k++) for (const x of xs) sink += f(x);
    const ns = (performance.now() - t0) * 1e6 / (reps * xs.length);
    t += `<tr><td>${m.label}</td><td>${ns.toFixed(0)}</td><td>${ex(worst[m.key])}</td></tr>`;
    if (sink === 42) console.log(sink);
  }
  $('#speedTable').innerHTML = t + '</tbody>';
  $('#speedNote').textContent = 'Timings over 12,000 calls with x uniform in [−8, 8]; they vary between devices and runs, compare them only within this table.';
}
function benchAll() { const w = drawErr(); drawRefTable(); drawSpeed(w); }

/* ======================= Bonus · inversion ======================= */
function invPhi(u) {
  let x = Math.sign(u - 0.5) * Math.sqrt(-2 * Math.log(Math.min(u, 1 - u))) * 0.9, it = 0;
  for (; it < 60; it++) { const d = (PhiHybrid(x) - u) / phi(x); x -= d; if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(x))) break; }
  return [x, it + 1];
}
function drawInv() {
  const n = +$('#invN').value, r = mulberry32(2026), B = 60, lo = -4.5, hi = 4.5, bw = (hi - lo) / B, cnt = new Float64Array(B);
  let s1 = 0, s2 = 0, its = 0, worst = 0;
  for (let i = 0; i < n; i++) {
    const u = Math.min(1 - 1e-16, Math.max(1e-16, r())), [x, k] = invPhi(u);
    its += k; worst = Math.max(worst, Math.abs(PhiHybrid(x) - u)); s1 += x; s2 += x * x;
    const b = Math.floor((x - lo) / bw); if (b >= 0 && b < B) cnt[b]++;
  }
  const { ctx, w, h } = cv('cvInv'), box = { x: 44, y: 10, w: w - 56, h: h - 44 };
  const A = axes(ctx, box, [lo, hi], [0, 0.46], { nx: 9, ny: 4, xlabel: 'x = Φ⁻¹(u)' });
  clip(ctx, box);
  ctx.fillStyle = 'rgba(29,79,145,.5)';
  for (let b = 0; b < B; b++) { const d = cnt[b] / (n * bw), x0 = A.X(lo + b * bw), x1 = A.X(lo + (b + 1) * bw); ctx.fillRect(x0, A.Y(d), x1 - x0 - 1, A.Y(0) - A.Y(d)); }
  ctx.strokeStyle = COL.red; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 300; i++) { const t = lo + (hi - lo) * i / 300; i ? ctx.lineTo(A.X(t), A.Y(phi(t))) : ctx.moveTo(A.X(t), A.Y(phi(t))); }
  ctx.stroke(); ctx.restore();
  legend(ctx, box.x + box.w - 200, box.y + 14, [{ col: COL.blue, label: `${nfmt(n)} samples`, box: true }, { col: COL.red, label: 'density φ' }]);
  const mean = s1 / n, v = s2 / n - mean * mean;
  $('#invNote').textContent = `sample mean ${mean.toFixed(4)} (theory 0) · sample variance ${v.toFixed(4)} (theory 1) · ${(its / n).toFixed(1)} Newton steps per sample on average · worst |Φ(x) − u| = ${ex(worst)}`;
}

/* ======================= wiring ======================= */
function init() {
  $('#fnSel').innerHTML = FUNCS.map(f => `<option value="${f.key}">${f.label}</option>`).join('');
  const lab = () => { labRun(); };
  $('#fnSel').addEventListener('change', () => { labRun(); drawConv(); });
  $('#nSl').addEventListener('input', lab); $('#mSl').addEventListener('input', lab);
  $('#xIn').addEventListener('input', calcRun);
  $('#tolSel').addEventListener('change', () => { calcRun(); benchAll(); });
  $('#glSel').addEventListener('change', () => { calcRun(); benchAll(); });
  $('#invRun').addEventListener('click', drawInv); $('#invN').addEventListener('change', drawInv);
  const links = $$('#toc a');
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => obs.observe(s));
  const all = () => { labRun(); drawConv(); drawAllTable(); drawGap(); calcRun(); benchAll(); drawInv(); };
  all();
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { labRun(); drawConv(); drawGap(); drawPhi(+$('#xIn').value); drawErr(); drawInv(); }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { labRun(); drawConv(); drawGap(); drawPhi(+$('#xIn').value); drawErr(); drawInv(); });
}
document.addEventListener('DOMContentLoaded', init);
