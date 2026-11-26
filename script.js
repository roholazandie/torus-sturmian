// Path: θ₁ = 2πτ (around the tube), θ₂ = 2π(ατ + ρ) (around the central axis).
// Positions are kept in the unit square: x = θ₁/2π, y = θ₂/2π.
// Crossings come from createCrossingStream (sturmian.js) and are exact.

// Global state
let state = freshState();

let config = {
    tangent: (1 + Math.sqrt(5)) / 2,
    p: 2,
    q: 5,
    rho: 0,
    cornerOrder: '10',
    useRatio: false,
    speed: 5,
    isRunning: false,
    showTrace: true,
    sequence: '',
    nWordsLength: 2,
    uniqueNWords: new Set()
};

let animationId = null;
const MAX_TRACE_SEGMENTS = 3000;
const SEQUENCE_SHOWN = 4000;
const MAX_LETTERS_PER_FRAME = 20000;
let lastFrameTime = 0;

// Recording variables
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function freshState() {
    return {
        tau: 0,                   // time, in turns of θ₁
        stream: null,             // exact crossing generator
        pending: null,            // next crossing not yet reached
        segStart: { x: 0, y: 0 }, // start of the current straight segment
        segTau: 0,                // τ at segStart
        segments: [],             // completed segments in the unit square
        symbolsInPeriod: 0,
        completedCycle: false
    };
}

// Helper functions
function effectiveSlope() {
    return config.useRatio ? config.p / config.q : config.tangent;
}

function resetSimulation() {
    state = freshState();
    state.stream = createCrossingStream(config.useRatio
        ? { p: config.p, q: config.q, rho: config.rho, cornerOrder: config.cornerOrder }
        : { alpha: config.tangent, rho: config.rho, cornerOrder: config.cornerOrder });
    state.pending = state.stream.next();
    state.segStart = { x: 0, y: config.rho };
}

// Position in the unit square at time τ (within the current segment).
function positionAt(tau) {
    const dt = tau - state.segTau;
    return {
        x: state.segStart.x + dt,
        y: state.segStart.y + effectiveSlope() * dt
    };
}

// Consume crossings in exact time order until targetTau or maxSymbols letters.
// With stopAtPeriod, a rational path halts once it closes.
function advance(targetTau, maxSymbols = Infinity, stopAtPeriod = true) {
    const slope = effectiveSlope();
    // A rational path closes after (p + q)/gcd crossings
    const periodLength = (config.p + config.q) / gcd(config.p, config.q);
    let added = '';

    while (state.pending.tau <= targetTau && added.length < maxSymbols) {
        const ev = state.pending;
        const dt = ev.tau - state.segTau;
        const end = {
            x: Math.min(1, state.segStart.x + dt),
            y: Math.min(1, state.segStart.y + slope * dt)
        };
        if (ev.symbol === '1') end.x = 1;
        else end.y = 1;

        noteCrossing(ev.symbol, end.x, end.y);
        if (end.x - state.segStart.x > 1e-12 || end.y - state.segStart.y > 1e-12) {
            state.segments.push({ x0: state.segStart.x, y0: state.segStart.y, x1: end.x, y1: end.y });
        }
        state.segStart = {
            x: ev.symbol === '1' ? 0 : end.x,
            y: ev.symbol === '0' ? 0 : end.y
        };
        state.segTau = ev.tau;
        state.tau = ev.tau;
        state.pending = state.stream.next();
        added += ev.symbol;

        if (config.useRatio && ++state.symbolsInPeriod === periodLength) {
            state.symbolsInPeriod = 0;
            if (stopAtPeriod) {
                state.completedCycle = true;
                break;
            }
        }
    }

    if (state.segments.length > 2 * MAX_TRACE_SEGMENTS) {
        state.segments = state.segments.slice(-MAX_TRACE_SEGMENTS);
    }

    if (added) appendSymbols(added);
}

function update() {
    if (!config.isRunning) return;

    // Advance by elapsed time, so speed does not depend on the display's refresh rate
    const now = performance.now();
    const frames = Math.min(6, (now - lastFrameTime) / (1000 / 60));
    lastFrameTime = now;
    const targetTau = state.tau + frames * config.speed * 0.01 / (2 * Math.PI);

    // Cap the letters per frame so huge slopes slow the animation instead of freezing it
    advance(targetTau, MAX_LETTERS_PER_FRAME);
    if (!state.completedCycle && state.pending.tau > targetTau) state.tau = targetTau;
    if (state.completedCycle) handleStop();
}

// Generate letters instantly, without animating them
function fastForward(count) {
    state.completedCycle = false;
    suppressFlashes = true;
    advance(Infinity, count, false);
    suppressFlashes = false;
}

function animate() {
    update();
    drawViews();
    renderAnalysis();
    animationId = requestAnimationFrame(animate);
}

// UI Event Handlers
function handleStart() {
    // After a closed rational period, Start runs the next period
    state.completedCycle = false;
    config.isRunning = true;
    lastFrameTime = performance.now();
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';
    disableInputs(true);

    // Start recording if checkbox is checked
    const recordCheckbox = document.getElementById('enableRecording');
    if (recordCheckbox.checked) {
        startRecording().then(success => {
            if (success) {
                isRecording = true;
                // Disable the checkbox while recording
                recordCheckbox.disabled = true;
            }
        });
    }
}

function handleStop() {
    config.isRunning = false;
    document.getElementById('startBtn').style.display = 'flex';
    document.getElementById('stopBtn').style.display = 'none';
    disableInputs(false);

    // Stop recording if it was running
    if (isRecording) {
        stopRecording();
        isRecording = false;
        // Re-enable the recording checkbox
        document.getElementById('enableRecording').disabled = false;
    }
}

function handleReset() {
    handleStop();
    config.sequence = '';
    config.uniqueNWords.clear();
    resetSimulation();
    resetAnalysis();
    updateSequenceDisplay();
}

function setMode(useRatio) {
    if (config.isRunning) return;

    config.useRatio = useRatio;

    if (useRatio) {
        document.getElementById('rationalMode').classList.add('active');
        document.getElementById('irrationalMode').classList.remove('active');
        document.getElementById('rationalPanel').style.display = 'flex';
        document.getElementById('irrationalPanel').style.display = 'none';
    } else {
        document.getElementById('irrationalMode').classList.add('active');
        document.getElementById('rationalMode').classList.remove('active');
        document.getElementById('irrationalPanel').style.display = 'flex';
        document.getElementById('rationalPanel').style.display = 'none';
    }
    handleReset();
}

function setTangent(value) {
    if (config.isRunning) return;
    config.tangent = value;
    document.getElementById('tangentSlider').value = value;
    document.getElementById('tangentInput').value = value;
    document.getElementById('tangentValue').textContent = value.toFixed(6);
    handleReset();
}

function setRatio(p, q) {
    if (config.isRunning) return;
    config.p = p;
    config.q = q;
    document.getElementById('pInput').value = p;
    document.getElementById('qInput').value = q;
    updateRatioDisplay();
    handleReset();
}

function setRho(value) {
    if (config.isRunning) return;
    config.rho = value;
    document.getElementById('rhoSlider').value = value;
    document.getElementById('rhoInput').value = value;
    document.getElementById('rhoValue').textContent = formatOffset(value);
    handleReset();
}

// Three decimals, or more when rounding would display a value below 1 as 1.000
function formatOffset(value) {
    for (let digits = 3; digits < 12; digits++) {
        const text = value.toFixed(digits);
        if (parseFloat(text) < 1) return text;
    }
    return String(value);
}

function updateRatioDisplay() {
    const g = gcd(config.p, config.q);
    const ratio = config.p / config.q;
    const reduced = g > 1 ? ` = ${config.p / g}/${config.q / g}` : '';
    document.getElementById('ratioDisplay').textContent =
        `${config.p}/${config.q}${reduced} = ${ratio.toFixed(6)}`;
}

// Add the factors ending at each newly appended symbol
function appendSymbols(symbols) {
    const n = config.nWordsLength;
    const start = config.sequence.length;
    config.sequence += symbols;
    feedAnalysis(symbols);
    for (let end = Math.max(start + 1, n); end <= config.sequence.length; end++) {
        config.uniqueNWords.add(config.sequence.substring(end - n, end));
    }
    updateSequenceDisplay();
}

function recomputeNWords() {
    config.uniqueNWords.clear();
    const n = config.nWordsLength;
    for (let i = 0; i + n <= config.sequence.length; i++) {
        config.uniqueNWords.add(config.sequence.substring(i, i + n));
    }
    updateNWordsDisplay();
}

// Wrap runs of each letter so 0 and 1 carry their symbol colors
function colorWord(word) {
    return word.replace(/0+|1+/g, run => `<span class="w${run[0]}">${run}</span>`);
}

function updateNWordsDisplay() {
    const nwordsArray = Array.from(config.uniqueNWords).sort();
    const nwordsOutput = document.getElementById('nwordsOutput');
    const nwordsCount = document.getElementById('nwordsCount');

    if (nwordsArray.length === 0) {
        nwordsOutput.textContent = 'Press Start to begin…';
        nwordsCount.textContent = '0';
    } else {
        nwordsOutput.innerHTML = nwordsArray
            .map(nword => `<span class="nword-item">${colorWord(nword)}</span>`)
            .join('');
        nwordsCount.textContent = nwordsArray.length;
    }
}

// Show the latest letters; earlier ones are summarized as a count
function updateSequenceDisplay() {
    const output = document.getElementById('sequenceOutput');
    const sequence = config.sequence;
    if (!sequence) {
        output.textContent = 'Press Start to begin…';
    } else {
        const hidden = Math.max(0, sequence.length - SEQUENCE_SHOWN);
        const earlier = hidden > 0 ? `<span class="earlier">… ${hidden.toLocaleString('en-US')} earlier letters</span>` : '';
        output.innerHTML = earlier + colorWord(sequence.slice(hidden));
        output.scrollTop = output.scrollHeight;
    }
    document.getElementById('sequenceLength').textContent = sequence.length.toLocaleString('en-US');
    updateNWordsDisplay();
}

function disableInputs(disabled) {
    document.getElementById('irrationalMode').disabled = disabled;
    document.getElementById('rationalMode').disabled = disabled;
    document.getElementById('tangentSlider').disabled = disabled;
    document.getElementById('tangentInput').disabled = disabled;
    document.getElementById('pInput').disabled = disabled;
    document.getElementById('qInput').disabled = disabled;
    document.getElementById('rhoSlider').disabled = disabled;
    document.getElementById('rhoInput').disabled = disabled;
    document.getElementById('cornerOrder').disabled = disabled;

    const presetButtons = document.querySelectorAll('.preset-button');
    presetButtons.forEach(btn => btn.disabled = disabled);
}

// Event Listeners
document.getElementById('tangentSlider').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    config.tangent = value;
    document.getElementById('tangentInput').value = value;
    document.getElementById('tangentValue').textContent = value.toFixed(6);
    handleReset();
});

document.getElementById('tangentInput').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.tangent = value;
        document.getElementById('tangentSlider').value = Math.min(value, 10);
        document.getElementById('tangentValue').textContent = value.toFixed(6);
        handleReset();
    }
});

document.getElementById('pInput').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.p = value;
        updateRatioDisplay();
        handleReset();
    }
});

document.getElementById('qInput').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.q = value;
        updateRatioDisplay();
        handleReset();
    }
});

document.getElementById('rhoSlider').addEventListener('input', (e) => {
    setRho(parseFloat(e.target.value));
});

document.getElementById('rhoInput').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && value < 1) setRho(value);
});

document.getElementById('cornerOrder').addEventListener('change', (e) => {
    config.cornerOrder = e.target.value;
    handleReset();
});

document.getElementById('speedSlider').addEventListener('input', (e) => {
    config.speed = parseFloat(e.target.value);
    document.getElementById('speedValue').textContent = config.speed.toFixed(1);
});

document.getElementById('showTrace').addEventListener('change', (e) => {
    config.showTrace = e.target.checked;
});

document.getElementById('nwordsLength').addEventListener('change', (e) => {
    config.nWordsLength = parseInt(e.target.value);
    recomputeNWords();
});

// Recording functions
async function startRecording() {
    try {
        // Record both views side by side (composited in render.js)
        const stream = getRecordingCanvas().captureStream(30); // 30 FPS

        // Check for browser support and create MediaRecorder
        const options = {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 5000000 // 5 Mbps
        };

        // Fallback mime types if vp9 is not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    alert('Video recording is not supported in this browser.');
                    return false;
                }
            }
        }

        mediaRecorder = new MediaRecorder(stream, options);
        recordedChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Create a blob from the recorded chunks
            const blob = new Blob(recordedChunks, { type: 'video/webm' });

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sturmian-torus-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Reset recording state
            recordedChunks = [];
            mediaRecorder = null;
        };

        mediaRecorder.start();
        return true;
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please check browser permissions.');
        return false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    resetSimulation();
    animate();
});
