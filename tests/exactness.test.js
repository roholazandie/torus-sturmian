// Exactness against references that use no floating point, and checks of the
// mathematical claims made in the page text.
const { cuttingSequence, createCrossingStream, gcd } = require('../sturmian.js');
const A = require('../analysis.js');
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; if (fails < 20) console.log('FAIL', msg); } };

// φ, ρ = 0 is the Fibonacci word (substitution 0 → 01, 1 → 0)
let fib = '0';
while (fib.length < 5e6) fib = fib.replace(/./g, c => (c === '0' ? '01' : '0'));
const phiWord = cuttingSequence({ alpha: (1 + Math.sqrt(5)) / 2 }, 5e6);
check(phiWord === fib.slice(0, 5e6), 'φ word differs from the Fibonacci word');

// √2: zeros before the k-th 1 equal floor(k√2) = isqrt(2k²); passes the Pell
// near-misses (k = 1,136,689 misses a corner by 3e-7)
function isqrt(n) {
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
}
const stream = createCrossingStream({ alpha: Math.SQRT2 });
let zeros = 0;
let k = 0;
while (k < 2e6) {
    const ev = stream.next();
    check(!ev.corner, `false corner at k = ${k}`);
    if (ev.symbol === '0') { zeros++; continue; }
    k++;
    if (k % 1000 === 0 || (k > 1136600 && k < 1136800)) {
        check(BigInt(zeros) === isqrt(2n * BigInt(k) * BigInt(k)), `√2 block count at k = ${k}`);
    }
}

// Typed decimals α and ρ behave exactly like the rational they denote, corners included
for (const [as, rs] of [['0.1', '0'], ['0.3', '0'], ['2.5', '0.5'], ['0.7', '0.3'], ['3.6', '0.2'], ['12.3', '0.9'], ['0.01', '0.01'], ['7', '0.25']]) {
    const d = Math.max((as.split('.')[1] || '').length, (rs.split('.')[1] || '').length);
    const S = BigInt(10 ** d);
    const P = BigInt(Math.round(parseFloat(as) * 10 ** d));
    const R = BigInt(Math.round(parseFloat(rs) * 10 ** d));
    for (const order of ['10', '01']) {
        let kk = 1n;
        let m = 1n;
        let exact = '';
        while (exact.length < 50000) {
            // k-th 1 at τ = k, m-th 0 at τ = (m − ρ)/α; scaled by S both are integers
            const one = kk * P;
            const zero = m * S - R;
            if (one < zero) { exact += '1'; kk++; } else if (one > zero) { exact += '0'; m++; } else { exact += order; kk++; m++; }
        }
        const ours = cuttingSequence({ alpha: parseFloat(as), rho: parseFloat(rs), cornerOrder: order }, 50000);
        check(ours === exact.slice(0, 50000), `typed α = ${as}, ρ = ${rs}, corner ${order}`);
    }
}

// "With ρ = 0 it is the characteristic word": c(n) = ⌊(n+1)β⌋ − ⌊nβ⌋, β = 1/(1+α)
for (const alpha of [Math.SQRT2, Math.PI, Math.E, 0.3183, 7.77]) {
    const beta = 1 / (1 + alpha);
    let c = '';
    for (let n = 1; n <= 20000; n++) c += Math.floor((n + 1) * beta) - Math.floor(n * beta);
    check(cuttingSequence({ alpha }, 20000) === c, `characteristic word α = ${alpha}`);
}

// Rational periods are rotations of Christoffel words
const christoffel = (zerosCount, onesCount, round) => {
    const n = zerosCount + onesCount;
    let s = '';
    for (let i = 0; i < n; i++) s += round((i + 1) * onesCount / n) - round(i * onesCount / n);
    return s;
};
for (let q = 1; q <= 30; q++) {
    for (let p = 1; p <= 30; p++) {
        if (gcd(p, q) !== 1) continue;
        for (const order of ['10', '01']) {
            const w = cuttingSequence({ p, q, cornerOrder: order }, p + q);
            const rotationOf = c => (c + c).includes(w);
            check(rotationOf(christoffel(p, q, Math.floor)) || rotationOf(christoffel(p, q, Math.ceil)), `${p}/${q} ${order} not a Christoffel rotation`);
        }
    }
}

// Continued fractions of typed decimals are the canonical expansion of the decimal
for (let i = 0; i < 20000; i++) {
    const d = 1 + (i % 4);
    const S = 10 ** d;
    const num = 1 + ((i * 7919) % (10 * S));
    const x = parseFloat((num / S).toFixed(d));
    const g = gcd(num, S);
    const exact = A.rationalContinuedFraction(num / g, S / g);
    const ours = A.continuedFraction(x);
    const truncated = ours.length < exact.length && A.convergents(exact, 0)[ours.length].q > 1e6;
    check(ours.join() === exact.join() || (truncated && exact.slice(0, ours.length).join() === ours.join()), `CF of ${x}: ${ours} vs ${exact}`);
}
check(A.continuedFraction(2.8).join() === '2,1,4', 'CF of 2.8 is canonical');
check(A.continuedFraction(Math.PI).slice(0, 10).join() === '3,7,15,1,292,1,1,1,2,1', 'CF of π');

console.log(fails ? `${fails} failures` : 'all tests passed');
process.exitCode = fails ? 1 : 0;
