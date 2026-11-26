// Analysis panels: factor complexity, balance, letter frequency and the
// continued-fraction / standard-word structure of the slope.

let tracker = createFactorTracker();
let analysisDirty = true;
let lastAnalysisRender = -Infinity;
const ANALYSIS_INTERVAL_MS = 150;

const CHART = {
    data: '#f59e0b',
    reference: '#94a3b8',
    band: 'rgba(148, 163, 184, 0.14)',
    grid: '#1e293b',
    axisText: '#94a3b8',
    font: '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    pad: { top: 12, right: 12, bottom: 26, left: 40 }
};

// Geometry of the last render, used for hover lookups
const chartGeometry = {};

function resetAnalysis() {
    tracker = createFactorTracker();
    analysisDirty = true;
}

function feedAnalysis(symbols) {
    for (const symbol of symbols) tracker.push(symbol);
    analysisDirty = true;
}

function renderAnalysis(force = false) {
    const now = performance.now();
    if (!analysisDirty || (!force && now - lastAnalysisRender < ANALYSIS_INTERVAL_MS)) return;
    lastAnalysisRender = now;
    analysisDirty = false;

    drawComplexityChart();
    renderBalance();
    drawFrequencyChart();
    renderContinuedFraction();
}

window.addEventListener('resize', () => { analysisDirty = true; });

// Size a canvas to its CSS box at device resolution; returns a context in CSS pixels.
function setupChart(chartCanvas) {
    const dpr = window.devicePixelRatio || 1;
    const width = chartCanvas.clientWidth;
    const height = chartCanvas.clientHeight;
    if (chartCanvas.width !== Math.round(width * dpr) || chartCanvas.height !== Math.round(height * dpr)) {
        chartCanvas.width = Math.round(width * dpr);
        chartCanvas.height = Math.round(height * dpr);
    }
    const c = chartCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height);
    c.font = CHART.font;
    return { c, width, height };
}

function drawYAxis(c, width, toY, ticks, format) {
    c.strokeStyle = CHART.grid;
    c.lineWidth = 1;
    c.fillStyle = CHART.axisText;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const t of ticks) {
        const y = Math.round(toY(t)) + 0.5;
        c.beginPath();
        c.moveTo(CHART.pad.left, y);
        c.lineTo(width - CHART.pad.right, y);
        c.stroke();
        c.fillText(format(t), CHART.pad.left - 6, y);
    }
}

function complexityReference(n) {
    if (!config.useRatio) return n + 1;
    const period = (config.p + config.q) / gcd(config.p, config.q);
    return Math.min(n + 1, period);
}

function drawComplexityChart() {
    const { c, width, height } = setupChart(document.getElementById('complexityChart'));
    const maxN = tracker.maxN;
    const plotW = width - CHART.pad.left - CHART.pad.right;
    const plotH = height - CHART.pad.top - CHART.pad.bottom;
    const yMax = maxN + 1;
    const band = plotW / maxN;
    const toX = n => CHART.pad.left + (n - 0.5) * band;
    const toY = v => CHART.pad.top + plotH * (1 - v / yMax);

    drawYAxis(c, width, toY, [0, 5, 10, 15, 20], t => t);

    // Bars: observed p(n); lighter where the word is still too short to show n + 1
    const barW = Math.min(24, band * 0.6);
    for (let n = 1; n <= maxN; n++) {
        const v = tracker.complexity(n);
        if (v === 0) continue;
        c.globalAlpha = v < complexityReference(n) ? 0.4 : 1;
        c.fillStyle = CHART.data;
        c.beginPath();
        c.roundRect(toX(n) - barW / 2, toY(v), barW, toY(0) - toY(v), [4, 4, 0, 0]);
        c.fill();
    }
    c.globalAlpha = 1;

    // Reference curve: n + 1, or min(n + 1, period) for a rational slope
    c.strokeStyle = CHART.reference;
    c.lineWidth = 2;
    c.setLineDash([5, 4]);
    c.beginPath();
    for (let n = 1; n <= maxN; n++) {
        const y = toY(complexityReference(n));
        if (n === 1) c.moveTo(toX(n), y);
        else c.lineTo(toX(n), y);
    }
    c.stroke();
    c.setLineDash([]);

    // X labels
    c.fillStyle = CHART.axisText;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const n of [1, 5, 10, 15, 20]) c.fillText(n === 1 ? 'n = 1' : n, toX(n), height - CHART.pad.bottom + 6);

    chartGeometry.complexity = { band };

    // Header: how far the observed complexity already matches the theory
    let matched = 0;
    while (matched < maxN && tracker.complexity(matched + 1) === complexityReference(matched + 1)) matched++;
    document.getElementById('complexityRefLabel').textContent =
        config.useRatio ? `min(n + 1, ${complexityReference(maxN + 1)})` : 'n + 1';
    document.getElementById('complexityNote').textContent = tracker.length === 0 ? '' :
        matched === maxN ? `matches for all n ≤ ${maxN}` : `matches for n ≤ ${matched}; longer factors need a longer word`;
}

function renderBalance() {
    const frequency = 1 / (1 + effectiveSlope());
    let worst = 0;
    let checked = 0;
    const cells = [];
    for (let n = 1; n <= tracker.maxN; n++) {
        if (tracker.length < n) {
            cells.push(`<div class="balance-cell empty"><div class="n">n = ${n}</div><div class="range">–</div></div>`);
            continue;
        }
        const [lo, hi] = tracker.onesRange(n);
        worst = Math.max(worst, hi - lo);
        checked = n;
        const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
        const cls = hi - lo > 1 ? 'balance-cell unbalanced' : 'balance-cell';
        const title = `windows of length ${n} contain ${range} ones; n/(1+α) = ${(n * frequency).toFixed(3)}`;
        cells.push(`<div class="${cls}" title="${title}"><div class="n">n = ${n}</div><div class="range">${range}</div></div>`);
    }
    document.getElementById('balanceGrid').innerHTML = cells.join('');
    document.getElementById('balanceNote').textContent = checked === 0 ? '' :
        worst <= 1 ? `✓ balanced for every n ≤ ${checked}` : `✗ spread ${worst} found`;
}

function drawFrequencyChart() {
    const { c, width, height } = setupChart(document.getElementById('frequencyChart'));
    const alpha = effectiveSlope();
    const [bandLo, bandHi] = discrepancyBand(alpha, config.rho);
    const L = tracker.length;
    const prefix = tracker.onesPrefix;
    const D = N => prefix[N] - N / (1 + alpha);

    const plotW = width - CHART.pad.left - CHART.pad.right;
    const plotH = height - CHART.pad.top - CHART.pad.bottom;
    const yLo = bandLo - 0.15;
    const yHi = bandHi + 0.15;
    const toY = v => CHART.pad.top + plotH * (yHi - v) / (yHi - yLo);
    // Log-scaled N so early oscillations stay readable as the word grows
    const xMax = Math.max(L, 10);
    const logMax = Math.log(xMax);
    const toX = N => CHART.pad.left + plotW * Math.log(Math.max(N, 1)) / logMax;

    drawYAxis(c, width, toY, [bandLo, 0, bandHi], t => t.toFixed(2));

    // Theoretical band
    c.fillStyle = CHART.band;
    c.fillRect(CHART.pad.left, toY(bandHi), plotW, toY(bandLo) - toY(bandHi));
    c.strokeStyle = CHART.reference;
    c.lineWidth = 1;
    for (const v of [bandLo, bandHi]) {
        const y = Math.round(toY(v)) + 0.5;
        c.beginPath();
        c.moveTo(CHART.pad.left, y);
        c.lineTo(width - CHART.pad.right, y);
        c.stroke();
    }

    // D(N): exact polyline where each pixel holds a few N, min/max envelope beyond
    if (L > 0) {
        const columns = Math.floor(plotW);
        const envelope = [];
        let lineEnd = 1;
        for (let col = 0; col < columns; col++) {
            const from = Math.ceil(Math.exp(logMax * col / columns));
            const to = Math.min(L, Math.floor(Math.exp(logMax * (col + 1) / columns)));
            if (from > L) break;
            if (to - from < 3) {
                lineEnd = Math.max(lineEnd, to);
                continue;
            }
            let lo = Infinity;
            let hi = -Infinity;
            for (let N = from; N <= to; N++) {
                const d = D(N);
                if (d < lo) lo = d;
                if (d > hi) hi = d;
            }
            envelope.push({ x: CHART.pad.left + col + 0.5, lo, hi });
        }

        if (envelope.length > 0) {
            c.fillStyle = CHART.data;
            c.globalAlpha = 0.35;
            c.beginPath();
            envelope.forEach((e, i) => i === 0 ? c.moveTo(e.x, toY(e.hi)) : c.lineTo(e.x, toY(e.hi)));
            for (let i = envelope.length - 1; i >= 0; i--) c.lineTo(envelope[i].x, toY(envelope[i].lo));
            c.closePath();
            c.fill();
            c.globalAlpha = 1;
        }

        c.strokeStyle = CHART.data;
        c.lineWidth = 2;
        c.lineJoin = 'round';
        c.beginPath();
        for (let N = 1; N <= Math.min(lineEnd, L); N++) {
            if (N === 1) c.moveTo(toX(N), toY(D(N)));
            else c.lineTo(toX(N), toY(D(N)));
        }
        c.stroke();
    }

    // X labels at powers of ten
    c.fillStyle = CHART.axisText;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const tickLabel = N => N >= 1e6 ? `${N / 1e6}M` : N >= 1e3 ? `${N / 1e3}k` : `${N}`;
    for (let N = 1; N <= xMax; N *= 10) {
        c.fillText(N === 1 ? 'N = 1' : tickLabel(N), Math.max(toX(N), CHART.pad.left + 16), height - CHART.pad.bottom + 6);
    }

    chartGeometry.frequency = { plotW, logMax };

    const target = 1 / (1 + alpha);
    document.getElementById('frequencyNote').textContent = L === 0 ? `1/(1+α) = ${target.toFixed(6)}` :
        `${(tracker.ones / L).toFixed(6)} observed · ${target.toFixed(6)} expected`;
}

function wordStatus(row, sequence) {
    if (row.word === null) return { text: 'too long', ok: false };
    if (sequence.length < row.length) return { text: `${(row.length - sequence.length).toLocaleString('en-US')} to go`, ok: false };
    if (config.rho === 0) {
        return sequence.startsWith(row.word)
            ? { text: '✓ prefix', ok: true }
            : { text: `prefix only with corner rule ${row.side === 'below' ? '01' : '10'}`, ok: false };
    }
    return sequence.includes(row.word) ? { text: '✓ factor', ok: true } : { text: 'not seen yet', ok: false };
}

function renderContinuedFraction() {
    const alpha = effectiveSlope();
    const terms = config.useRatio
        ? rationalContinuedFraction(config.p, config.q)
        : continuedFraction(alpha);
    const rows = convergents(terms);
    const last = rows[rows.length - 1];
    const exact = Math.abs(last.p / last.q - alpha) < 1e-12;

    const tail = terms.length > 1 ? `; ${terms.slice(1).join(', ')}` : '';
    document.getElementById('cfExpansion').textContent =
        `α ${exact ? '=' : '≈'} [${terms[0]}${tail}${exact ? '' : ', …'}]`;

    const sequence = config.sequence;
    const shown = 16;
    document.getElementById('cfTableBody').innerHTML = rows.map((row, i) => {
        const isAlpha = exact && i === rows.length - 1;
        const side = isAlpha ? '= α' : row.side === 'below' ? '< α' : '> α';
        const order = row.side === 'below' ? '01' : '10';
        const word = row.word === null ? '' :
            row.word.length > shown ? `${row.word.slice(0, shown)}…` : row.word;
        const status = wordStatus(row, sequence);
        const fraction = `${row.p}/${row.q}`;
        const pq = isAlpha && config.useRatio ? fraction :
            `<button class="preset-button" title="Run the closed path ${fraction} (ρ = 0, corner rule ${order})"
                onclick="runConvergent(${row.p}, ${row.q}, '${order}')">${fraction}</button>`;
        return `<tr>
            <td>${row.k}</td>
            <td>${row.a}</td>
            <td>${pq} <span class="status">${side}</span></td>
            <td>${row.length.toLocaleString('en-US')}</td>
            <td class="word">${word}</td>
            <td class="status${status.ok ? ' ok' : ''}">${status.text}</td>
        </tr>`;
    }).join('');
    disableInputs(config.isRunning);
}

// Switch to the closed path of a convergent, with the corner rule that makes its
// period the standard word S_k.
function runConvergent(p, q, order) {
    if (config.isRunning) return;
    config.cornerOrder = order;
    document.getElementById('cornerOrder').value = order;
    config.rho = 0;
    document.getElementById('rhoSlider').value = 0;
    document.getElementById('rhoInput').value = 0;
    document.getElementById('rhoValue').textContent = (0).toFixed(3);
    config.p = p;
    config.q = q;
    document.getElementById('pInput').value = p;
    document.getElementById('qInput').value = q;
    updateRatioDisplay();
    setMode(true);
}

// Hover readouts
function attachTooltip(chartId, tipId, describe) {
    const chartCanvas = document.getElementById(chartId);
    const tip = document.getElementById(tipId);
    chartCanvas.addEventListener('mousemove', (e) => {
        const rect = chartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const html = describe(x);
        if (!html) {
            tip.style.display = 'none';
            return;
        }
        tip.innerHTML = html;
        tip.style.display = 'block';
        const left = Math.min(x + 12, rect.width - tip.offsetWidth - 4);
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = '8px';
    });
    chartCanvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

attachTooltip('complexityChart', 'complexityTip', (x) => {
    const g = chartGeometry.complexity;
    if (!g) return null;
    const n = Math.floor((x - CHART.pad.left) / g.band) + 1;
    if (n < 1 || n > tracker.maxN) return null;
    return `n = ${n}<br>observed p(n) = ${tracker.complexity(n)}<br>expected ${complexityReference(n)}`;
});

attachTooltip('frequencyChart', 'frequencyTip', (x) => {
    const g = chartGeometry.frequency;
    if (!g || tracker.length === 0) return null;
    const N = Math.round(Math.exp((x - CHART.pad.left) / g.plotW * g.logMax));
    if (N < 1 || N > tracker.length) return null;
    const alpha = effectiveSlope();
    const ones = tracker.onesPrefix[N];
    return `N = ${N.toLocaleString('en-US')}<br>1s: ${ones} (${(ones / N).toFixed(5)})<br>D(N) = ${(ones - N / (1 + alpha)).toFixed(4)}`;
});
