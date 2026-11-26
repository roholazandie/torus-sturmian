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
const CANVAS_SIZE = 400;
const R = 100; // Major radius
const r = 40;  // Minor radius
const MAX_TRACE_SEGMENTS = 3000;

// Recording variables
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const unwrappedCanvas = document.getElementById('unwrappedCanvas');
const unwrappedCtx = unwrappedCanvas.getContext('2d');

const UNWRAPPED_WIDTH = 400;
const UNWRAPPED_HEIGHT = 400;
const MARGIN = 30;

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

// x is the tube angle θ₁/2π, y is the major angle θ₂/2π
function toXYZ(x, y) {
    const theta1 = 2 * Math.PI * x;
    const theta2 = 2 * Math.PI * y;
    return {
        x: (R + r * Math.cos(theta1)) * Math.cos(theta2),
        y: (R + r * Math.cos(theta1)) * Math.sin(theta2),
        z: r * Math.sin(theta1)
    };
}

function project(x, y, z, rotX, rotY) {
    // Rotate around Y axis
    let x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
    let z1 = x * Math.sin(rotY) + z * Math.cos(rotY);

    // Rotate around X axis
    let y1 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    let z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);

    // Perspective projection
    const distance = 600;
    const scale = distance / (distance + z2);

    return {
        x: x1 * scale + CANVAS_SIZE / 2,
        y: y1 * scale + CANVAS_SIZE / 2,
        z: z2
    };
}

let rotX = -Math.PI / 2;  // Rotate 90 degrees to make torus horizontal
let rotY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Mouse interaction handlers
canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;

    // Update rotation based on mouse movement
    rotY += deltaX * 0.01;
    rotX += deltaY * 0.01;

    // Clamp rotX to prevent flipping
    rotX = Math.max(-Math.PI, Math.min(Math.PI, rotX));

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

// Touch support for mobile devices
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        isDragging = true;
        const touch = e.touches[0];
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        e.preventDefault();
    }
});

canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - lastMouseX;
    const deltaY = touch.clientY - lastMouseY;

    rotY += deltaX * 0.01;
    rotX += deltaY * 0.01;

    // Clamp rotX to prevent flipping
    rotX = Math.max(-Math.PI, Math.min(Math.PI, rotX));

    lastMouseX = touch.clientX;
    lastMouseY = touch.clientY;
    e.preventDefault();
});

canvas.addEventListener('touchend', () => {
    isDragging = false;
});

// Set initial cursor style
canvas.style.cursor = 'grab';

// Completed segments plus the partial one up to the particle.
function traceSegments() {
    const pos = positionAt(state.tau);
    const current = { x0: state.segStart.x, y0: state.segStart.y, x1: pos.x, y1: pos.y };
    return state.segments.concat([current]);
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw semi-transparent blue torus fill first
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; // Blue with 0.1 alpha

    const meshRes = 40;
    const torusPoints = [];

    // Generate torus mesh points
    for (let i = 0; i <= meshRes; i++) {
        const row = [];
        for (let j = 0; j <= meshRes; j++) {
            const { x, y, z } = toXYZ(i / meshRes, j / meshRes);
            row.push(project(x, y, z, rotX, rotY));
        }
        torusPoints.push(row);
    }

    // Fill torus sections with semi-transparent blue
    for (let i = 0; i < meshRes; i++) {
        for (let j = 0; j < meshRes; j++) {
            ctx.beginPath();
            ctx.moveTo(torusPoints[i][j].x, torusPoints[i][j].y);
            ctx.lineTo(torusPoints[i+1][j].x, torusPoints[i+1][j].y);
            ctx.lineTo(torusPoints[i+1][j+1].x, torusPoints[i+1][j+1].y);
            ctx.lineTo(torusPoints[i][j+1].x, torusPoints[i][j+1].y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw pink mesh lines on top
    ctx.strokeStyle = '#ec4899'; // Pink color
    ctx.lineWidth = 0.5;

    // Draw longitudinal lines
    for (let i = 0; i < torusPoints.length; i += 4) {
        ctx.beginPath();
        for (let j = 0; j < torusPoints[i].length; j++) {
            const p = torusPoints[i][j];
            if (j === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // Draw meridional lines
    for (let j = 0; j < torusPoints[0].length; j += 4) {
        ctx.beginPath();
        for (let i = 0; i < torusPoints.length; i++) {
            const p = torusPoints[i][j];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // Draw trace: each straight segment of the flat torus is a curve on the
    // 3D torus, sampled finely enough to follow the surface
    if (config.showTrace) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const s of traceSegments()) {
            const steps = Math.max(1, Math.ceil(Math.abs(s.x1 - s.x0) * 24 + Math.abs(s.y1 - s.y0) * 48));
            for (let i = 0; i <= steps; i++) {
                const f = i / steps;
                const { x, y, z } = toXYZ(s.x0 + f * (s.x1 - s.x0), s.y0 + f * (s.y1 - s.y0));
                const p = project(x, y, z, rotX, rotY);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
        }
        ctx.stroke();
    }

    // Draw particle
    const pos = positionAt(state.tau);
    const { x, y, z } = toXYZ(pos.x, pos.y);
    const proj = project(x, y, z, rotX, rotY);
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = state.completedCycle ? '#ef4444' : '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = state.completedCycle ? '#f87171' : '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw unwrapped torus view
    drawUnwrappedTorus();
}

function drawUnwrappedTorus() {
    const rectWidth = UNWRAPPED_WIDTH - 2 * MARGIN;
    const rectHeight = UNWRAPPED_HEIGHT - 2 * MARGIN;
    // x = θ₁/2π to the right, y = θ₂/2π upward, so the path has slope α on screen
    const toScreen = (x, y) => ({
        x: MARGIN + x * rectWidth,
        y: MARGIN + (1 - y) * rectHeight
    });

    // Clear unwrapped canvas
    unwrappedCtx.fillStyle = '#0f172a';
    unwrappedCtx.fillRect(0, 0, UNWRAPPED_WIDTH, UNWRAPPED_HEIGHT);

    // Draw background rectangle with transparent blue
    unwrappedCtx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    unwrappedCtx.fillRect(MARGIN, MARGIN, rectWidth, rectHeight);

    // Draw pink grid lines
    unwrappedCtx.strokeStyle = '#ec4899';
    unwrappedCtx.lineWidth = 0.5;

    const gridSize = 10;

    // Vertical lines
    for (let i = 0; i <= gridSize; i++) {
        const x = MARGIN + (i * rectWidth / gridSize);
        unwrappedCtx.beginPath();
        unwrappedCtx.moveTo(x, MARGIN);
        unwrappedCtx.lineTo(x, UNWRAPPED_HEIGHT - MARGIN);
        unwrappedCtx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= gridSize; i++) {
        const y = MARGIN + (i * rectHeight / gridSize);
        unwrappedCtx.beginPath();
        unwrappedCtx.moveTo(MARGIN, y);
        unwrappedCtx.lineTo(UNWRAPPED_WIDTH - MARGIN, y);
        unwrappedCtx.stroke();
    }

    // Draw axis labels
    unwrappedCtx.fillStyle = '#94a3b8';
    unwrappedCtx.font = '11px sans-serif';
    unwrappedCtx.textAlign = 'center';
    unwrappedCtx.fillText('θ₁ (tube angle) →', UNWRAPPED_WIDTH / 2, UNWRAPPED_HEIGHT - 10);
    unwrappedCtx.save();
    unwrappedCtx.translate(15, UNWRAPPED_HEIGHT / 2);
    unwrappedCtx.rotate(-Math.PI / 2);
    unwrappedCtx.fillText('θ₂ (major angle) →', 0, 0);
    unwrappedCtx.restore();

    // Label which edge emits which symbol
    unwrappedCtx.font = 'bold 13px monospace';
    unwrappedCtx.fillStyle = '#fbbf24';
    unwrappedCtx.fillText('1', UNWRAPPED_WIDTH - MARGIN / 2, UNWRAPPED_HEIGHT / 2 + 4);
    unwrappedCtx.fillText('0', UNWRAPPED_WIDTH / 2, MARGIN / 2 + 4);
    unwrappedCtx.textAlign = 'start';

    // Draw trace: straight segments between consecutive crossings
    if (config.showTrace) {
        unwrappedCtx.strokeStyle = '#f59e0b';
        unwrappedCtx.lineWidth = 2;
        unwrappedCtx.beginPath();
        for (const s of traceSegments()) {
            const a = toScreen(s.x0, s.y0);
            const b = toScreen(s.x1, s.y1);
            unwrappedCtx.moveTo(a.x, a.y);
            unwrappedCtx.lineTo(b.x, b.y);
        }
        unwrappedCtx.stroke();
    }

    // Draw particle on unwrapped view
    const pos = positionAt(state.tau);
    const particle = toScreen(pos.x, pos.y);
    unwrappedCtx.beginPath();
    unwrappedCtx.arc(particle.x, particle.y, 5, 0, Math.PI * 2);
    unwrappedCtx.fillStyle = state.completedCycle ? '#ef4444' : '#f59e0b';
    unwrappedCtx.fill();
    unwrappedCtx.strokeStyle = state.completedCycle ? '#f87171' : '#fbbf24';
    unwrappedCtx.lineWidth = 2;
    unwrappedCtx.stroke();

    // Draw edge indicators (showing where wrapping happens)
    unwrappedCtx.setLineDash([5, 5]);
    unwrappedCtx.strokeStyle = '#475569';
    unwrappedCtx.lineWidth = 1;
    unwrappedCtx.strokeRect(MARGIN, MARGIN, rectWidth, rectHeight);
    unwrappedCtx.setLineDash([]);
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

    const targetTau = state.tau + config.speed * 0.01 / (2 * Math.PI);
    advance(targetTau);
    if (!state.completedCycle) state.tau = targetTau;
    if (state.completedCycle) handleStop();
}

// Generate letters instantly, without animating them
function fastForward(count) {
    state.completedCycle = false;
    advance(Infinity, count, false);
}

function animate() {
    update();
    draw();
    renderAnalysis();
    animationId = requestAnimationFrame(animate);
}

// UI Event Handlers
function handleStart() {
    // After a closed rational period, Start runs the next period
    state.completedCycle = false;
    config.isRunning = true;
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
        document.getElementById('rationalPanel').style.display = 'block';
        document.getElementById('irrationalPanel').style.display = 'none';
    } else {
        document.getElementById('irrationalMode').classList.add('active');
        document.getElementById('rationalMode').classList.remove('active');
        document.getElementById('irrationalPanel').style.display = 'block';
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
    document.getElementById('rhoValue').textContent = value.toFixed(3);
    handleReset();
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

function updateNWordsDisplay() {
    const nwordsArray = Array.from(config.uniqueNWords).sort();
    const nwordsOutput = document.getElementById('nwordsOutput');
    const nwordsCount = document.getElementById('nwordsCount');

    if (nwordsArray.length === 0) {
        nwordsOutput.textContent = 'Press Start to begin...';
        nwordsCount.textContent = '0';
    } else {
        // Display n-words as styled badges
        nwordsOutput.innerHTML = nwordsArray
            .map(nword => `<span class="nword-item">${nword}</span>`)
            .join('');
        nwordsCount.textContent = nwordsArray.length;
    }
}

function updateSequenceDisplay() {
    document.getElementById('sequenceOutput').textContent =
        config.sequence || 'Press Start to begin...';
    document.getElementById('sequenceLength').textContent = config.sequence.length;
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
        // Create a video stream from the canvas
        const stream = canvas.captureStream(30); // 30 FPS

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
