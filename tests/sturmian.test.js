const { gcd, createCrossingStream, cuttingSequence } = require('../sturmian.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

// 1. Zeros between consecutive 1s must equal floor(kα+ρ) − floor((k−1)α+ρ)
for (const alpha of [Math.SQRT2, (1+Math.sqrt(5))/2, Math.PI, 0.0137, 50.5, 777.123]) {
  for (const rho of [0, 0.25, 0.73]) {
    const w = cuttingSequence({ alpha, rho, cornerOrder: '01' }, 20000);
    const blocks = w.split('1'); blocks.pop();
    blocks.forEach((b, i) => {
      const k = i + 1, exp = Math.floor(k*alpha+rho) - Math.floor((k-1)*alpha+rho);
      if (b.length !== exp) check(false, `alpha=${alpha} rho=${rho} block ${k}: ${b.length} vs ${exp}`);
    });
  }
}
// 2. Factor complexity n+1 for irrational slopes
for (const alpha of [Math.SQRT2, (1+Math.sqrt(5))/2, Math.PI, Math.E]) {
  const w = cuttingSequence({ alpha, rho: 0.3 }, 50000);
  for (let n = 1; n <= 25; n++) {
    const s = new Set(); for (let i = 0; i + n <= 40000; i++) s.add(w.substr(i, n));
    check(s.size === n + 1, `complexity alpha=${alpha} n=${n}: ${s.size}`);
  }
}
// 3. Rational, rho=0: period p+q, central word palindrome, corner pair at end
for (let q = 1; q <= 30; q++) for (let p = 1; p <= 30; p++) {
  if (gcd(p, q) !== 1) continue;
  for (const order of ['10', '01']) {
    const L = p + q, w = cuttingSequence({ p, q, cornerOrder: order }, 3 * L);
    const per = w.slice(0, L), c = per.slice(0, L - 2);
    check(w === per.repeat(3), `periodic ${p}/${q}`);
    check(per.endsWith(order), `corner pair ${p}/${q} ${order}`);
    check(c === [...c].reverse().join(''), `palindrome ${p}/${q}`);
    check([...per].filter(x => x === '1').length === q, `count ${p}/${q}`);
  }
}
// 4. Rational with rho on a corner (rho = j/q) and off a corner
const w4 = cuttingSequence({ p: 2, q: 5, rho: 0.2 }, 14);
check(w4.slice(0, 7) === w4.slice(7), 'period with rho=0.2');
console.log('2/5 rho=0:', cuttingSequence({ p: 2, q: 5 }, 7), ' rho=0.2:', w4.slice(0,7), ' rho=0.1:', cuttingSequence({ p: 2, q: 5, rho: 0.1 }, 7));
console.log('phi:', cuttingSequence({ alpha: (1+Math.sqrt(5))/2 }, 30));
console.log(fails ? `${fails} failures` : 'all tests passed');
process.exitCode = fails ? 1 : 0;
