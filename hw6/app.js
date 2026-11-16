'use strict';
/* =====================================================================
   HW6 Statistics — contingency tables, independence, chi-square
   Vanilla JS + Canvas 2D. No chart or statistics libraries.
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const COL = { ink: '#16202a', soft: '#5b6670', grid: '#e6dfcf', rule: '#cfc4ad', card: '#fbf8f1',
  red: '#c0392b', blue: '#1d4f91', green: '#2e7d57', gold: '#b8860b' };
const PAL = ['#1d4f91', '#c0392b', '#2e7d57', '#b8860b', '#7d3c98', '#16202a', '#d35400', '#117a8b', '#8e6c3a', '#5b6670', '#a93263', '#4a7f2a'];
const ALPHA = 0.05;

/* ======================= small helpers ======================= */
const nfmt = n => n.toLocaleString('en-US');
const pct = v => (100 * v).toFixed(1) + '%';
function fmt(v, d = 3) {
  if (!isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  if (a < 1e-3) return v.toExponential(1);
  return (+v.toFixed(d)).toString();
}
function fmtP(log10p) {
  if (log10p > -4) return Math.pow(10, log10p).toFixed(4);
  const e = Math.floor(log10p), m = Math.pow(10, log10p - e);
  return `${m.toFixed(1)}×10<sup>${e}</sup>`;
}
const fmtPtxt = l => (l > -4 ? Math.pow(10, l).toFixed(4) : `≈ 10^${Math.round(l)}`);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ======================= chi-square distribution ======================= */
function gammaln(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
  x -= 1; let a = c[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/* natural log of Q(a, x) = upper regularized incomplete gamma */
function logGammaQ(a, x) {
  if (x <= 0) return 0;
  const pre = -x + a * Math.log(x) - gammaln(a);
  if (x < a + 1) {                       // series for P, then Q = 1 − P
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    const P = Math.exp(pre) * sum;
    return Math.log1p(-Math.min(P, 1 - 1e-300));
  }
  const tiny = 1e-300;                   // Lentz continued fraction for Q
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return pre + Math.log(h);
}
const log10pChi2 = (chi2, df) => (df <= 0 ? 0 : logGammaQ(df / 2, chi2 / 2) / Math.LN10);
const chi2pdf = (x, k) => (x <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - gammaln(k / 2)));

/* ======================= datasets ======================= */
/* A dataset: { n, vars: { name: { levels:[...], codes:Int32Array } } } with codes = level index per record */
function fromCodes(levels, str) { const a = new Int32Array(str.length); for (let i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) < 97 ? +str[i] : str.charCodeAt(i) - 97; return { levels, codes: a }; }

function datasetKDD() {
  return {
    n: KDD.protocol.codes.length,
    vars: {
      'protocol type': fromCodes(KDD.protocol.levels, KDD.protocol.codes),
      'connection flag': fromCodes(KDD.flag.levels, KDD.flag.codes),
      'logged in': fromCodes(KDD.logged_in.levels, KDD.logged_in.codes),
      'attack category': fromCodes(KDD.category.levels, KDD.category.codes)
    },
    dx: 'protocol type', dy: 'attack category'
  };
}
/* Berkeley 1973, as distributed in R's UCBAdmissions (Bickel, Hammel & O'Connell, 1975):
   per department: [men admitted, men rejected, women admitted, women rejected] */
const UCB = { A: [512, 313, 89, 19], B: [353, 207, 17, 8], C: [120, 205, 202, 391], D: [138, 279, 131, 244], E: [53, 138, 94, 299], F: [22, 351, 24, 317] };
function datasetBerkeley() {
  const g = [], d = [], a = [];
  Object.entries(UCB).forEach(([dep, [ma, mr, fa, fr]], k) => {
    const push = (gg, aa, cnt) => { for (let i = 0; i < cnt; i++) { g.push(gg); d.push(k); a.push(aa); } };
    push(0, 0, ma); push(0, 1, mr); push(1, 0, fa); push(1, 1, fr);
  });
  return {
    n: g.length,
    vars: {
      gender: { levels: ['men', 'women'], codes: Int32Array.from(g) },
      department: { levels: Object.keys(UCB), codes: Int32Array.from(d) },
      outcome: { levels: ['admitted', 'rejected'], codes: Int32Array.from(a) }
    },
    dx: 'gender', dy: 'outcome'
  };
}
function datasetRNG(N = 20000) {
  const c0 = new Int32Array(N), c1 = new Int32Array(N), l0 = new Int32Array(N), l1 = new Int32Array(N);
  const buf = new Uint32Array(N + 1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) for (let o = 0; o < buf.length; o += 16384) crypto.getRandomValues(buf.subarray(o, Math.min(buf.length, o + 16384)));
  else { const r = mulberry32(99); for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(r() * 4294967296); }
  let x = 20261116 % 2147483648;
  const lcg = [];
  for (let i = 0; i <= N; i++) { lcg.push(x); x = (Math.imul(1103515245, x) + 12345) >>> 0; x %= 2147483648; }
  for (let i = 0; i < N; i++) { c0[i] = buf[i] & 3; c1[i] = buf[i + 1] & 3; l0[i] = lcg[i] & 3; l1[i] = lcg[i + 1] & 3; }
  const L = ['00', '01', '10', '11'];
  return {
    n: N,
    vars: {
      'CSPRNG low bits of xₖ': { levels: L, codes: c0 }, 'CSPRNG low bits of xₖ₊₁': { levels: L, codes: c1 },
      'LCG low bits of xₖ': { levels: L, codes: l0 }, 'LCG low bits of xₖ₊₁': { levels: L, codes: l1 }
    },
    dx: 'LCG low bits of xₖ', dy: 'LCG low bits of xₖ₊₁'
  };
}
/* CSV: strings per column; numeric columns with many values are binned by quantiles */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 3) throw new Error('need a header and at least two rows');
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => l.split(sep).map(s => s.trim().replace(/^"(.*)"$/, '$1'));
  const head = split(lines[0]), rows = lines.slice(1).map(split).filter(r => r.length === head.length);
  return { head, rows };
}
function datasetCSV(parsed, bins) {
  const vars = {};
  parsed.head.forEach((h, j) => {
    const col = parsed.rows.map(r => r[j]);
    const nums = col.map(Number), isNum = col.every(s => s !== '' && isFinite(Number(s)));
    const distinct = new Set(col).size;
    if (isNum && distinct > 8) {
      const sorted = [...nums].sort((a, b) => a - b), cuts = [];
      for (let k = 1; k < bins; k++) cuts.push(sorted[Math.floor(k * sorted.length / bins)]);
      const uc = [...new Set(cuts)], edges = [sorted[0], ...uc, sorted[sorted.length - 1]];
      const levels = edges.slice(0, -1).map((e, k) => (k === edges.length - 2 ? `[${fmt(e)}, ${fmt(edges[k + 1])}]` : `[${fmt(e)}, ${fmt(edges[k + 1])})`));
      const codes = Int32Array.from(nums.map(v => { let k = 0; while (k < uc.length && v >= uc[k]) k++; return k; }));
      vars[h + ' (binned)'] = { levels, codes, numeric: true };
    } else {
      const freq = new Map(); col.forEach(s => freq.set(s, (freq.get(s) || 0) + 1));
      const levels = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a));
      const idx = new Map(levels.map((l, i) => [l, i]));
      vars[h] = { levels, codes: Int32Array.from(col.map(s => idx.get(s))) };
    }
  });
  const names = Object.keys(vars);
  return { n: parsed.rows.length, vars, dx: names[0], dy: names[1] || names[0] };
}
const DATASETS = [
  { key: 'kdd', title: 'NSL-KDD network intrusions', src: 'real · cybersecurity', desc: '22,544 connections from the KDDTest+ set: protocol, flag, login, attack category.', make: datasetKDD },
  { key: 'ucb', title: 'Berkeley admissions 1973', src: 'real · classic', desc: '4,526 graduate applicants: gender, department, outcome. The textbook Simpson’s paradox.', make: datasetBerkeley },
  { key: 'rng', title: 'Secure vs broken generator', src: 'simulated · crypto', desc: 'Low bits of consecutive outputs: browser CSPRNG vs a power-of-two LCG.', make: () => datasetRNG() },
  { key: 'csv', title: 'Your own CSV', src: 'any bivariate data', desc: 'Paste or load a file; choose any two columns.', make: null }
];

/* ======================= core analysis ======================= */
function crossTab(xv, yv) {
  const r = xv.levels.length, c = yv.levels.length, n = xv.codes.length;
  const T = Array.from({ length: r }, () => new Float64Array(c));
  for (let k = 0; k < n; k++) T[xv.codes[k]][yv.codes[k]]++;
  // drop empty rows / columns
  const rk = [...Array(r).keys()].filter(i => T[i].some(v => v > 0));
  const ck = [...Array(c).keys()].filter(j => rk.some(i => T[i][j] > 0));
  return { T: rk.map(i => ck.map(j => T[i][j])), xl: rk.map(i => xv.levels[i]), yl: ck.map(j => yv.levels[j]), rk, ck };
}
function analyse(T) {
  const r = T.length, c = T[0].length;
  const R = T.map(row => row.reduce((a, b) => a + b, 0)), C = [...Array(c).keys()].map(j => T.reduce((a, row) => a + row[j], 0));
  const n = R.reduce((a, b) => a + b, 0);
  const E = T.map((row, i) => row.map((_, j) => R[i] * C[j] / n));
  let chi2 = 0, minE = Infinity, small = 0;
  const contrib = T.map((row, i) => row.map((o, j) => { const e = E[i][j]; minE = Math.min(minE, e); if (e < 5) small++; const v = (o - e) ** 2 / e; chi2 += v; return v; }));
  const resid = T.map((row, i) => row.map((o, j) => (o - E[i][j]) / Math.sqrt(E[i][j])));
  const df = (r - 1) * (c - 1), lp = log10pChi2(chi2, df);
  const V = Math.min(r, c) > 1 ? Math.sqrt(chi2 / (n * (Math.min(r, c) - 1))) : 0;
  return { r, c, R, C, n, E, chi2, contrib, resid, df, lp, V, minE, smallFrac: small / (r * c) };
}
function chi2WithMargins(T, E) { let s = 0; for (let i = 0; i < T.length; i++) for (let j = 0; j < T[0].length; j++) s += (T[i][j] - E[i][j]) ** 2 / E[i][j]; return s; }
function permutation(xc, yc, A, map, B = 999, seed = 7) {
  const rnd = mulberry32(seed), y = Int32Array.from(yc), n = y.length, out = new Float64Array(B);
  const r = A.r, c = A.c, T = Array.from({ length: r }, () => new Float64Array(c));
  let ge = 0;
  for (let b = 0; b < B; b++) {
    for (let k = n - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = y[k]; y[k] = y[j]; y[j] = t; }
    for (const row of T) row.fill(0);
    for (let k = 0; k < n; k++) { const i = map.x[xc[k]], j = map.y[y[k]]; if (i >= 0 && j >= 0) T[i][j]++; }
    out[b] = chi2WithMargins(T, A.E);
    if (out[b] >= A.chi2 - 1e-9) ge++;
  }
  return { sims: out, p: (1 + ge) / (B + 1), B };
}

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

/* ======================= state & rendering ======================= */
const S = { ds: null, dsKey: 'kdd', view: 'n', csv: null, cur: null };

function renderDatasetCards() {
  $('#dsGrid').innerHTML = DATASETS.map(d => `<button class="ds ${d.key === S.dsKey ? 'on' : ''}" data-k="${d.key}"><span class="src">${d.src}</span><b>${d.title}</b><small>${d.desc}</small></button>`).join('');
  $$('#dsGrid .ds').forEach(b => b.addEventListener('click', () => selectDataset(b.dataset.k)));
}
function selectDataset(key) {
  S.dsKey = key; renderDatasetCards();
  $('#csvBox').hidden = key !== 'csv';
  if (key === 'csv') { loadCSV(); return; }
  S.ds = DATASETS.find(d => d.key === key).make();
  fillVarSelects(S.ds.dx, S.ds.dy);
  run();
}
function loadCSV() {
  try {
    S.csv = parseCSV($('#csvText').value);
    S.ds = datasetCSV(S.csv, +$('#binSel').value);
    fillVarSelects(S.ds.dx, S.ds.dy); run();
  } catch (e) { $('#dsNote').textContent = 'CSV error: ' + e.message; }
}
function fillVarSelects(dx, dy) {
  const names = Object.keys(S.ds.vars), opt = sel => names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('#xSel').innerHTML = opt(dx); $('#ySel').innerHTML = opt(dy);
  $('#binLbl').hidden = !names.some(n => S.ds.vars[n].numeric);
}
function run() {
  const xn = $('#xSel').value, yn = $('#ySel').value, xv = S.ds.vars[xn], yv = S.ds.vars[yn];
  const ct = crossTab(xv, yv);
  if (ct.T.length < 2 || ct.T[0].length < 2) { $('#dsNote').textContent = 'Choose two variables with at least two observed levels each.'; return; }
  const A = analyse(ct.T);
  const map = { x: new Int32Array(xv.levels.length).fill(-1), y: new Int32Array(yv.levels.length).fill(-1) };
  ct.rk.forEach((i, k) => { map.x[i] = k; }); ct.ck.forEach((j, k) => { map.y[j] = k; });
  S.cur = { xn, yn, xv, yv, ct, A, map };
  const sameVar = xn === yn;
  $('#dsNote').textContent = `${nfmt(S.ds.n)} records · X = ${xn} (${ct.xl.length} levels) · Y = ${yn} (${ct.yl.length} levels)` + (sameVar ? ' · X and Y are the same variable: dependence is total by construction.' : '');
  $('#preview').textContent = 'first records (x, y):\n' + [...Array(Math.min(8, S.ds.n)).keys()].map(k => `${String(k + 1).padStart(3)}  ${xv.levels[xv.codes[k]]}, ${yv.levels[yv.codes[k]]}`).join('\n');
  renderTable(); drawMosaic(); renderExpected(); drawResid(); renderChi(); renderScale();
}
function renderTable() {
  const { ct, A } = S.cur, v = S.view;
  const cell = (i, j) => {
    const o = ct.T[i][j];
    if (v === 'n') return nfmt(o);
    if (v === 'f') return pct(o / A.n);
    if (v === 'row') return pct(o / A.R[i]);
    return pct(o / A.C[j]);
  };
  let h = `<table class="ct"><thead><tr><th>${esc(S.cur.xn)} \\ ${esc(S.cur.yn)}</th>${ct.yl.map(l => `<th>${esc(l)}</th>`).join('')}<th class="m">${v === 'row' ? 'row sum' : 'margin X'}</th></tr></thead><tbody>`;
  ct.xl.forEach((l, i) => {
    const marg = v === 'n' ? nfmt(A.R[i]) : v === 'f' ? pct(A.R[i] / A.n) : v === 'row' ? '100%' : pct(A.R[i] / A.n);
    h += `<tr><th>${esc(l)}</th>${ct.yl.map((_, j) => `<td>${cell(i, j)}</td>`).join('')}<td class="m">${marg}</td></tr>`;
  });
  const bottom = j => (v === 'n' ? nfmt(A.C[j]) : v === 'col' ? '100%' : pct(A.C[j] / A.n));
  h += `<tr><th class="m">${v === 'col' ? 'column sum' : 'margin Y'}</th>${ct.yl.map((_, j) => `<td class="m">${bottom(j)}</td>`).join('')}<td class="tot">${v === 'n' ? 'n = ' + nfmt(A.n) : v === 'f' ? '100%' : v === 'row' ? 'f(Y) ↑' : 'f(X) ←'}</td></tr></tbody></table>`;
  $('#ctWrap').innerHTML = h;
  const caps = {
    n: 'Observed counts nᵢⱼ with the marginal totals.',
    f: 'Joint relative frequencies fᵢⱼ = nᵢⱼ / n; the margins are the marginal distributions f(X) and f(Y).',
    row: 'Each row is a conditional distribution f(Y | X = xᵢ). Under independence every row would equal the bottom line, the marginal f(Y).',
    col: 'Each column is a conditional distribution f(X | Y = yⱼ). Under independence every column would equal the right column, the marginal f(X).'
  };
  $('#ctCap').textContent = caps[v];
}
function drawMosaic() {
  const { ct, A } = S.cur, { ctx, w, h } = cv('cvMosaic');
  const box = { x: 12, y: 10, w: w - 24 - (w > 600 ? 150 : 0), h: h - 48 };
  const gap = 3, usable = box.w - gap * (A.r - 1);
  let x = box.x;
  const margY = A.C.map(c => c / A.n);
  ct.xl.forEach((lab, i) => {
    const cw = usable * A.R[i] / A.n;
    let y = box.y + box.h;
    ct.yl.forEach((_, j) => {
      const hh = box.h * ct.T[i][j] / A.R[i];
      ctx.fillStyle = PAL[j % PAL.length]; ctx.globalAlpha = 0.8; ctx.fillRect(x, y - hh, cw, hh); y -= hh;
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.ink; ctx.font = '10.5px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (cw > 24) ctx.fillText(String(lab).slice(0, Math.max(2, Math.floor(cw / 7))), x + cw / 2, box.y + box.h + 6);
    x += cw + gap;
  });
  // independence lines
  ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
  let acc = 0;
  for (let j = 0; j < A.c - 1; j++) { acc += margY[j]; const y = box.y + box.h - box.h * acc; ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = COL.soft; ctx.textAlign = 'left'; ctx.fillText(`X = ${S.cur.xn} →`, box.x, box.y + box.h + 22);
  if (w > 600) legend(ctx, box.x + box.w + 18, box.y + 10, ct.yl.slice(0, 12).map((l, j) => ({ col: PAL[j % PAL.length], box: true, label: String(l).slice(0, 14) })));
}
function renderExpected() {
  const { ct, A } = S.cur;
  let h = `<table class="ct"><thead><tr><th>X \\ Y</th>${ct.yl.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>`;
  ct.xl.forEach((l, i) => {
    h += `<tr><th>${esc(l)}</th>${ct.yl.map((_, j) => `<td>${fmt(A.E[i][j], 1)}<small>obs ${nfmt(ct.T[i][j])} · χ² ${fmt(A.contrib[i][j], 2)}</small></td>`).join('')}</tr>`;
  });
  $('#expWrap').innerHTML = h + '</tbody></table>';
}
function drawResid() {
  const { ct, A } = S.cur, { ctx, w, h } = cv('cvResid');
  const L = Math.min(110, w * 0.26), T = 34, cw = (w - L - 10) / A.c, ch = (h - T - 10) / A.r;
  let rmax = 4; A.resid.forEach(row => row.forEach(v => { rmax = Math.max(rmax, Math.abs(v)); }));
  const sc = v => Math.min(1, Math.sqrt(Math.abs(v) / rmax));
  ctx.font = '10.5px "IBM Plex Mono", monospace';
  ct.yl.forEach((l, j) => { ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(l).slice(0, Math.max(3, Math.floor(cw / 7))), L + j * cw + cw / 2, T - 6); });
  ct.xl.forEach((l, i) => {
    ctx.fillStyle = COL.ink; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(String(l).slice(0, 14), L - 6, T + i * ch + ch / 2);
    ct.yl.forEach((_, j) => {
      const v = A.resid[i][j], a = sc(v);
      ctx.fillStyle = v >= 0 ? `rgba(192,57,43,${0.08 + 0.85 * a})` : `rgba(29,79,145,${0.08 + 0.85 * a})`;
      ctx.fillRect(L + j * cw + 1, T + i * ch + 1, cw - 2, ch - 2);
      if (Math.abs(v) > 2) { ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.strokeRect(L + j * cw + 1.5, T + i * ch + 1.5, cw - 3, ch - 3); }
      if (cw > 34 && ch > 16) { ctx.fillStyle = a > 0.55 ? '#fff' : COL.ink; ctx.textAlign = 'center'; ctx.fillText(fmt(v, 1), L + j * cw + cw / 2, T + i * ch + ch / 2); }
    });
  });
}
function renderChi() {
  const { A, xv, yv, map } = S.cur;
  const P = permutation(xv.codes, yv.codes, A, map);
  const unreliable = A.smallFrac > 0.2 || A.minE < 1;
  const lpUse = unreliable ? Math.log10(P.p) : A.lp;
  const dep = lpUse < Math.log10(ALPHA);
  $('#kpi').innerHTML = [['n', nfmt(A.n)], ['table', `${A.r} × ${A.c}`], ['χ²', fmt(A.chi2, 3)], ['df', A.df],
    ['p (χ² approx.)', fmtP(A.lp)], ["Cramér's V", A.V.toFixed(3)]].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const strength = A.V < 0.1 ? 'negligible' : A.V < 0.3 ? 'weak' : A.V < 0.5 ? 'moderate' : 'strong';
  $('#verdict').className = 'verdict ' + (dep ? 'dep' : 'ind');
  $('#verdict').innerHTML = dep
    ? `<b class="tag">DEPENDENT at α = 5%.</b> If ${esc(S.cur.xn)} and ${esc(S.cur.yn)} were independent, a χ² this large would occur with probability ${fmtP(lpUse)}${unreliable ? ' (permutation p-value)' : ''}. The association is <b>${strength}</b> (V = ${A.V.toFixed(3)}).`
    : `<b class="tag">NO EVIDENCE OF DEPENDENCE at α = 5%.</b> A χ² of ${fmt(A.chi2, 3)} or more happens with probability ${fmtP(lpUse)}${unreliable ? ' (permutation p-value)' : ''} under independence: the table is compatible with independent variables. This does not prove independence; it says the data cannot tell them apart from it.`;
  let warn = '';
  if (A.smallFrac > 0.2 || A.minE < 1) warn = `<div class="warn">${pct(A.smallFrac)} of the cells have an expected count below 5 (smallest ${fmt(A.minE, 2)}). The chi-square approximation of the p-value is unreliable here, so the verdict uses the permutation p-value.</div>`;
  $('#warnBox').innerHTML = warn;
  drawPerm(P);
}
function drawPerm(P) {
  const { A } = S.cur, { ctx, w, h } = cv('cvPerm'), box = { x: 44, y: 10, w: w - 56, h: h - 46 };
  let smax = 0; P.sims.forEach(v => { smax = Math.max(smax, v); });
  const k = A.df, xmax = Math.max(smax, k + 5 * Math.sqrt(2 * k), Math.min(A.chi2 * 1.1, k + 9 * Math.sqrt(2 * k)));
  const B = 40, bw = xmax / B, cnt = new Float64Array(B);
  P.sims.forEach(v => { const b = Math.min(B - 1, Math.floor(v / bw)); cnt[b]++; });
  let ymax = 0; cnt.forEach(c => { ymax = Math.max(ymax, c / (P.B * bw)); });
  for (let i = 1; i <= 100; i++) ymax = Math.max(ymax, chi2pdf(xmax * i / 100, k));
  const Ax = axes(ctx, box, [0, xmax], [0, ymax * 1.15], { nx: 5, ny: 3, xlabel: 'χ²' });
  ctx.fillStyle = 'rgba(29,79,145,.45)';
  cnt.forEach((c, b) => { const d = c / (P.B * bw); ctx.fillRect(Ax.X(b * bw), Ax.Y(d), Ax.X(bw) - Ax.X(0) - 1, Ax.Y(0) - Ax.Y(d)); });
  ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 1; i <= 200; i++) { const x = xmax * i / 200, y = chi2pdf(x, k); i > 1 ? ctx.lineTo(Ax.X(x), Ax.Y(Math.min(y, ymax * 1.15))) : ctx.moveTo(Ax.X(x), Ax.Y(Math.min(y, ymax * 1.15))); }
  ctx.stroke();
  const off = A.chi2 > xmax, xo = off ? box.x + box.w - 2 : Ax.X(A.chi2);
  ctx.strokeStyle = COL.red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(xo, box.y); ctx.lineTo(xo, box.y + box.h); ctx.stroke();
  ctx.fillStyle = COL.red; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(off ? `observed ${fmt(A.chi2, 1)} → far off scale` : `observed ${fmt(A.chi2, 2)}`, xo - 4, box.y + 4);
  legend(ctx, box.x + 10, box.y + 30, [{ col: 'rgba(29,79,145,.6)', box: true, label: 'shuffled χ²' }, { col: COL.ink, label: `χ²(${k}) density` }]);
  $('#permCap').innerHTML = `Permutation p-value: <b>${P.p === 1 / (P.B + 1) ? '≤ ' + (1 / (P.B + 1)).toFixed(3) : P.p.toFixed(3)}</b> (${nfmt(P.B)} shuffles; the smallest attainable value is 1/1000). Asymptotic p-value: ${fmtP(A.lp)}.`;
}
function renderScale() {
  const { A } = S.cur, e = +$('#kSl').value - 6, k = Math.pow(2, e);
  $('#kOut').textContent = k >= 1 ? '×' + k : '×1/' + (1 / k);
  const { ctx, w, h } = cv('cvScale'), box = { x: 54, y: 10, w: w - 66, h: h - 44 };
  const ks = [], lps = [];
  for (let t = -6; t <= 6; t += 0.25) { const kk = Math.pow(2, t); ks.push(t); lps.push(Math.max(-320, log10pChi2(A.chi2 * kk, A.df))); }
  const lo = Math.min(-3, Math.floor(Math.min(...lps))), Ax = axes(ctx, box, [-6, 6], [lo, 0], {
    xticks: [-6, -4, -2, 0, 2, 4, 6], fx: v => (v >= 0 ? '×' + Math.pow(2, v) : '×1/' + Math.pow(2, -v)), ny: 4, fy: v => (v === 0 ? '1' : '1e' + v),
    xlabel: 'n multiplied by', ylabel: 'p-value (log)', ylabelOff: 46 });
  ctx.strokeStyle = COL.gold; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(box.x, Ax.Y(Math.log10(ALPHA))); ctx.lineTo(box.x + box.w, Ax.Y(Math.log10(ALPHA))); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = COL.blue; ctx.lineWidth = 2; ctx.beginPath(); ks.forEach((t, i) => { const y = Ax.Y(Math.max(lo, lps[i])); i ? ctx.lineTo(Ax.X(t), y) : ctx.moveTo(Ax.X(t), y); }); ctx.stroke();
  const lpk = Math.max(-320, log10pChi2(A.chi2 * k, A.df));
  ctx.fillStyle = COL.red; ctx.beginPath(); ctx.arc(Ax.X(e), Ax.Y(Math.max(lo, lpk)), 5, 0, 7); ctx.fill();
  $('#scaleCap').innerHTML = `With n ${k >= 1 ? '×' + k : '÷' + (1 / k)} and the same proportions: χ² = ${fmt(A.chi2 * k, 3)}, p = ${fmtP(lpk)}, V = ${A.V.toFixed(3)} (unchanged). The dashed line is α = 5%: significance depends on n, the strength of the association does not.`;
}

/* ======================= Berkeley strata & Mantel–Haenszel ======================= */
function berkeley() {
  const rows = [], all = [0, 0, 0, 0];
  let sumA = 0, sumE = 0, sumV = 0, num = 0, den = 0;
  for (const [dep, q] of Object.entries(UCB)) {
    const [a, b, c, d] = q, n = a + b + c + d;
    q.forEach((v, i) => { all[i] += v; });
    const A = analyse([[a, b], [c, d]]);
    rows.push({ dep, rm: a / (a + b), rw: c / (c + d), nm: a + b, nw: c + d, chi2: A.chi2, lp: A.lp });
    sumA += a; sumE += (a + b) * (a + c) / n; sumV += (a + b) * (c + d) * (a + c) * (b + d) / (n * n * (n - 1));
    num += a * d / n; den += b * c / n;
  }
  const cmh = Math.pow(Math.max(0, Math.abs(sumA - sumE) - 0.5), 2) / sumV, cmhLp = log10pChi2(cmh, 1), OR = num / den;
  const Aall = analyse([[all[0], all[1]], [all[2], all[3]]]);
  let t = '<thead><tr><th>stratum</th><th>men admitted</th><th>women admitted</th><th>χ² (df 1)</th><th>p</th></tr></thead><tbody>';
  t += `<tr class="cur"><td><b>all departments</b></td><td>${pct(all[0] / (all[0] + all[1]))} of ${nfmt(all[0] + all[1])}</td><td>${pct(all[2] / (all[2] + all[3]))} of ${nfmt(all[2] + all[3])}</td><td>${fmt(Aall.chi2, 2)}</td><td>${fmtP(Aall.lp)}</td></tr>`;
  rows.forEach(r => { t += `<tr><td>department ${r.dep}</td><td>${pct(r.rm)} of ${nfmt(r.nm)}</td><td>${pct(r.rw)} of ${nfmt(r.nw)}</td><td>${fmt(r.chi2, 2)}</td><td class="${r.lp < Math.log10(ALPHA) ? 'cmp-bad' : ''}">${fmtP(r.lp)}</td></tr>`; });
  t += `<tr><td><b>Mantel–Haenszel</b> (pooled within strata)</td><td colspan="2">common odds ratio men/women ${OR.toFixed(3)}</td><td>${fmt(cmh, 3)}</td><td>${fmtP(cmhLp)}</td></tr></tbody>`;
  $('#strataTable').innerHTML = t;
  $('#cmhTxt').textContent = `χ²_MH = ${cmh.toFixed(3)}, p = ${Math.pow(10, cmhLp).toFixed(3)}, common odds ratio ${OR.toFixed(3)}`;
  // chart
  const { ctx, w, h } = cv('cvSimpson'), box = { x: 50, y: 10, w: w - 62, h: h - 46 };
  const Ax = axes(ctx, box, [-0.5, 5.5], [0, 1], { xticks: [0, 1, 2, 3, 4, 5], fx: v => 'dept ' + 'ABCDEF'[v], ny: 5, fy: v => Math.round(v * 100) + '%', ylabel: 'admitted', ylabelOff: 44 });
  const tot = [all[0] / (all[0] + all[1]), all[2] / (all[2] + all[3])];
  [[tot[0], COL.blue], [tot[1], COL.red]].forEach(([y, c]) => { ctx.strokeStyle = c; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(box.x, Ax.Y(y)); ctx.lineTo(box.x + box.w, Ax.Y(y)); ctx.stroke(); });
  ctx.setLineDash([]);
  rows.forEach((r, i) => {
    [[r.rm, r.nm, COL.blue, -7], [r.rw, r.nw, COL.red, 7]].forEach(([y, n, c, dx]) => {
      ctx.fillStyle = c; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(Ax.X(i) + dx, Ax.Y(y), 3 + Math.sqrt(n) * 0.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    });
  });
  legend(ctx, box.x + box.w - 220, box.y + 14, [{ col: COL.blue, dot: true, label: 'men (dashed: overall 44.5%)' }, { col: COL.red, dot: true, label: 'women (dashed: overall 30.4%)' }]);
}

/* ======================= summary of all datasets ======================= */
function summary() {
  const cases = [
    ['NSL-KDD', datasetKDD, 'protocol type', 'attack category'],
    ['NSL-KDD', datasetKDD, 'connection flag', 'attack category'],
    ['NSL-KDD', datasetKDD, 'logged in', 'attack category'],
    ['Berkeley', datasetBerkeley, 'gender', 'outcome'],
    ['Berkeley', datasetBerkeley, 'gender', 'department'],
    ['Berkeley', datasetBerkeley, 'department', 'outcome'],
    ['Generators', datasetRNG, 'CSPRNG low bits of xₖ', 'CSPRNG low bits of xₖ₊₁'],
    ['Generators', datasetRNG, 'LCG low bits of xₖ', 'LCG low bits of xₖ₊₁']
  ];
  const cache = {};
  let t = '<thead><tr><th>data</th><th>X × Y</th><th>n</th><th>χ²</th><th>df</th><th>p</th><th>V</th><th>verdict (α = 5%)</th></tr></thead><tbody>';
  for (const [name, mk, x, y] of cases) {
    const d = cache[name] || (cache[name] = mk());
    const A = analyse(crossTab(d.vars[x], d.vars[y]).T), dep = A.lp < Math.log10(ALPHA);
    t += `<tr><td>${name}</td><td>${esc(x)} × ${esc(y)}</td><td>${nfmt(A.n)}</td><td>${fmt(A.chi2, 2)}</td><td>${A.df}</td><td>${fmtP(A.lp)}</td><td>${A.V.toFixed(3)}</td><td class="${dep ? 'cmp-bad' : 'cmp-good'}">${dep ? 'dependent' : 'compatible with independence'}</td></tr>`;
  }
  $('#summaryTable').innerHTML = t + '</tbody>';
}

/* ======================= wiring ======================= */
function init() {
  renderDatasetCards();
  $('#xSel').addEventListener('change', run); $('#ySel').addEventListener('change', run);
  $('#binSel').addEventListener('change', () => { if (S.dsKey === 'csv') loadCSV(); });
  $('#csvLoad').addEventListener('click', loadCSV);
  $('#csvFile').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#csvText').value = r.result; loadCSV(); }; r.readAsText(f); });
  $$('#viewSeg button').forEach(b => b.addEventListener('click', () => { S.view = b.dataset.v; $$('#viewSeg button').forEach(x => x.classList.toggle('on', x === b)); renderTable(); }));
  $('#kSl').addEventListener('input', renderScale);
  const links = $$('#toc a');
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
  $$('section.sec').forEach(s => obs.observe(s));
  selectDataset('kdd'); berkeley(); summary();
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawMosaic(); drawResid(); renderChi(); renderScale(); berkeley(); }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawMosaic(); drawResid(); renderScale(); berkeley(); });
}
document.addEventListener('DOMContentLoaded', init);
