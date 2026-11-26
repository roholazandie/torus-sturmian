const { cuttingSequence, gcd } = require('../sturmian.js');
const A = require('../analysis.js');
let fails = 0; const check = (ok, m) => { if (!ok) { fails++; if (fails < 20) console.log('FAIL', m); } };

// Tracker vs brute force
for (const [opts, L] of [[{ alpha: Math.PI, rho: 0.2 }, 3000], [{ p: 5, q: 8 }, 500], [{ p: 3, q: 7, rho: 0.5, cornerOrder: '01' }, 400]]) {
  const w = cuttingSequence(opts, L), t = A.createFactorTracker();
  for (const c of w) t.push(c);
  for (let n = 1; n <= 20; n++) {
    const S = new Set(), ones = [];
    for (let i = 0; i + n <= L; i++) { const f = w.substr(i, n); S.add(f); ones.push([...f].filter(x => x === '1').length); }
    check(t.complexity(n) === S.size, `complexity ${JSON.stringify(opts)} n=${n}`);
    const [lo, hi] = t.onesRange(n);
    check(lo === Math.min(...ones) && hi === Math.max(...ones), `balance range n=${n}`);
    check(hi - lo <= 1, `balanced n=${n}`);
    if (opts.p) { const P = (opts.p + opts.q) / gcd(opts.p, opts.q); check(S.size === Math.min(n + 1, P), `rational complexity min(n+1,p+q) n=${n}: ${S.size}`); }
  }
}
// Continued fractions & standard words
check(A.rationalContinuedFraction(13, 8).join() === '1,1,1,1,2', 'cf 13/8');
check(A.continuedFraction(Math.PI).slice(0, 5).join() === '3,7,15,1,292', 'cf pi');
check(A.continuedFraction(Math.SQRT2).every((a, i) => a === (i ? 2 : 1)), 'cf sqrt2');
for (const alpha of [Math.PI, (1 + Math.sqrt(5)) / 2, Math.SQRT2, Math.E - 2, 1 / Math.PI, 0.0137 + 1e-7]) {
  const rows = A.convergents(A.continuedFraction(alpha), 2e5);
  const w = cuttingSequence({ alpha }, 2e5);
  for (const r of rows) {
    if (!r.word) continue;
    check(r.word.length === r.p + r.q && [...r.word].filter(c => c === '1').length === r.q, `length/ones S_${r.k} for ${alpha}`);
    check(w.startsWith(r.word), `prefix S_${r.k} for ${alpha}`);
    check(cuttingSequence({ p: r.p, q: r.q, cornerOrder: r.side === 'below' ? '01' : '10' }, r.length) === r.word, `S_${r.k} = period of ${r.p}/${r.q}`);
  }
}
// Rational: standard words of p/q are prefixes of the rho=0 word; last one needs matching corner order
for (const [p, q] of [[2, 5], [5, 8], [13, 8], [7, 3]]) {
  const rows = A.convergents(A.rationalContinuedFraction(p, q));
  const last = rows[rows.length - 1];
  for (const order of ['10', '01']) {
    const w = cuttingSequence({ p, q, cornerOrder: order }, 3 * (p + q));
    rows.slice(0, -1).forEach(r => check(w.startsWith(r.word), `rational prefix ${p}/${q} S_${r.k} order ${order}`));
    check(w.startsWith(last.word) === ((last.side === 'below') === (order === '01')), `last ${p}/${q} ${order}`);
  }
}
// Discrepancy band, irrational and rational, both corner orders
for (const opts of [{ alpha: Math.PI }, { alpha: 0.37 + 1e-9, rho: 0.6 }, { p: 2, q: 5 }, { p: 2, q: 5, cornerOrder: '01' }, { p: 3, q: 7, rho: 0.2 }, { p: 3, q: 7, rho: 0.2, cornerOrder: '01' }, { p: 4, q: 1, rho: 0.5 }]) {
  const alpha = opts.alpha ?? opts.p / opts.q, rho = opts.rho ?? 0, [lo, hi] = A.discrepancyBand(alpha, rho);
  const w = cuttingSequence(opts, 20000); let ones = 0, mn = 1e9, mx = -1e9;
  for (let N = 1; N <= w.length; N++) { ones += w[N - 1] === '1'; const D = ones - N / (1 + alpha); mn = Math.min(mn, D); mx = Math.max(mx, D); }
  check(mn >= lo - 1e-9 && mx <= hi + 1e-9, `band ${JSON.stringify(opts)}: [${mn}, ${mx}] vs [${lo}, ${hi}]`);
}
console.log(fails ? `${fails} failures` : 'all tests passed');
process.exitCode = fails ? 1 : 0;
