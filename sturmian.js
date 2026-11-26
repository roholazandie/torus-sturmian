// Exact cutting sequence of the line θ₁ = 2πτ, θ₂ = 2π(ατ + ρ) on the torus.
//
// Time τ is measured in turns of θ₁ (the tube angle). A '1' is emitted when θ₁
// completes a turn (τ = k) and a '0' when θ₂ does (ατ + ρ = m). Both families
// of crossing times are arithmetic progressions known in closed form, so the
// word is produced by merging them — no time stepping, no missed crossings.
//
// When both angles wrap at the same instant the path passes through a corner of
// the fundamental square; both symbols are emitted, in `cornerOrder`.

// Relative tolerance for treating two crossing times as simultaneous: a few
// units of double rounding. Anything looser turns genuine near-misses into
// corners; for √2 the line misses a corner by 3e-7 at k = 1,136,689.
const TIE_EPS = 8 * Number.EPSILON;

function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// Options: either { alpha } or { p, q } (rational slope p/q, compared in exact
// integer-scaled form), plus rho ∈ [0, 1) and cornerOrder '10' or '01'.
function createCrossingStream({ alpha, p = null, q = null, rho = 0, cornerOrder = '10' }) {
    const rational = p !== null && q !== null;
    const slope = rational ? p / q : alpha;
    let k = 1;  // index of the next θ₁ crossing
    let m = 1;  // index of the next θ₂ crossing
    const queue = [];

    // Sign of (time of k-th '1') − (time of m-th '0'), scaled to avoid division.
    function compare() {
        const a = rational ? k * p : k * slope;
        const b = rational ? (m - rho) * q : m - rho;
        const d = a - b;
        return Math.abs(d) <= TIE_EPS * Math.max(1, Math.abs(a)) ? 0 : d;
    }

    function next() {
        if (queue.length > 0) return queue.shift();

        const c = compare();
        if (c < 0) {
            return { tau: k++, symbol: '1', corner: false };
        }
        if (c > 0) {
            return { tau: (m++ - rho) / slope, symbol: '0', corner: false };
        }
        const tau = k;
        k++;
        m++;
        queue.push({ tau, symbol: cornerOrder[1], corner: true });
        return { tau, symbol: cornerOrder[0], corner: true };
    }

    return { next, slope };
}

// Generate the first `length` symbols of the cutting sequence.
function cuttingSequence(options, length) {
    const stream = createCrossingStream(options);
    let word = '';
    while (word.length < length) word += stream.next().symbol;
    return word.slice(0, length);
}

if (typeof module !== 'undefined') {
    module.exports = { gcd, createCrossingStream, cuttingSequence };
}
