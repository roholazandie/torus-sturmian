// Combinatorial analysis of a growing binary word, plus the continued-fraction
// structure (convergents and standard words) of the slope that generates it.

const MAX_FACTOR_LENGTH = 20;

// Tracks, for every n ≤ maxN, the distinct factors of length n (complexity
// p(n)) and the min/max number of 1s among them (balance), one symbol at a time.
function createFactorTracker(maxN = MAX_FACTOR_LENGTH) {
    const factors = [];
    const minOnes = [];
    const maxOnes = [];
    const windowOnes = [];
    for (let n = 0; n <= maxN; n++) {
        factors.push(new Set());
        minOnes.push(Infinity);
        maxOnes.push(-Infinity);
        windowOnes.push(0);
    }
    let bits = 0;     // last maxN symbols, newest in the lowest bit
    let length = 0;
    let ones = 0;
    const onesPrefix = [0];  // onesPrefix[N] = number of 1s among the first N symbols

    function push(symbol) {
        const bit = symbol === '1' ? 1 : 0;
        for (let n = 1; n <= maxN; n++) {
            // The bit leaving a window of length n is the one n positions back
            const leaving = length >= n ? (bits >>> (n - 1)) & 1 : 0;
            windowOnes[n] += bit - leaving;
        }
        bits = ((bits << 1) | bit) & ((1 << maxN) - 1);
        length++;
        ones += bit;
        onesPrefix.push(ones);

        for (let n = 1; n <= Math.min(length, maxN); n++) {
            factors[n].add(bits & ((1 << n) - 1));
            if (windowOnes[n] < minOnes[n]) minOnes[n] = windowOnes[n];
            if (windowOnes[n] > maxOnes[n]) maxOnes[n] = windowOnes[n];
        }
    }

    return {
        push,
        maxN,
        get length() { return length; },
        get ones() { return ones; },
        onesPrefix,
        complexity: n => factors[n].size,
        onesRange: n => [minOnes[n], maxOnes[n]]
    };
}

// Continued fraction [a0; a1, a2, ...] of p/q, exact (Euclid).
function rationalContinuedFraction(p, q) {
    const terms = [];
    while (q !== 0) {
        terms.push(Math.floor(p / q));
        [p, q] = [q, p % q];
    }
    return terms;
}

// Continued fraction of a float, stopped before rounding error dominates.
function continuedFraction(x, maxTerms = 12, maxDenominator = 1e6) {
    const terms = [];
    const target = x;
    let [p0, q0, p1, q1] = [0, 1, 1, 0];
    for (let i = 0; i < maxTerms; i++) {
        const a = Math.floor(x);
        const [p, q] = [a * p1 + p0, a * q1 + q0];
        if (q > maxDenominator) break;
        terms.push(a);
        [p0, q0, p1, q1] = [p1, q1, p, q];
        const frac = x - a;
        if (Math.abs(target - p / q) < 1e-12 || frac < 1e-12) break;
        x = 1 / frac;
    }
    return terms;
}

// Convergents p_k/q_k and standard words S_k of [a0; a1, ...].
// S_{-1} = 0, S_0 = 0^{a0} 1, S_k = S_{k-1}^{a_k} S_{k-2}. Each S_k is the period
// of the slope-p_k/q_k word whose corner is written 01 (p_k/q_k below α, k even)
// or 10 (above, k odd); it has q_k ones and p_k zeros. Words longer than
// maxWordLength are not built (their length is still reported).
function convergents(terms, maxWordLength = 1e6) {
    const rows = [];
    let [p0, q0, p1, q1] = [0, 1, 1, 0];
    let prevWord = '0';
    let word = null;
    terms.forEach((a, k) => {
        [p0, q0, p1, q1] = [p1, q1, a * p1 + p0, a * q1 + q0];
        const length = p1 + q1;
        let next = null;
        if (length <= maxWordLength && (k === 0 || word !== null)) {
            next = k === 0 ? '0'.repeat(a) + '1' : word.repeat(a) + prevWord;
        }
        if (k > 0) prevWord = word;
        word = next;
        rows.push({ k, a, p: p1, q: q1, length, word, side: k % 2 === 0 ? 'below' : 'above' });
    });
    return rows;
}

// D(N) = (#1s among the first N symbols) − N/(1+α) always lies in this band,
// of width exactly 1 (balanced words have bounded discrepancy).
function discrepancyBand(alpha, rho) {
    return [-(rho + alpha) / (1 + alpha), (1 - rho) / (1 + alpha)];
}

if (typeof module !== 'undefined') {
    module.exports = {
        MAX_FACTOR_LENGTH, createFactorTracker, rationalContinuedFraction,
        continuedFraction, convergents, discrepancyBand
    };
}
