// Global state
let state = {
    t: 0,
    lastTheta1: 0,
    lastTheta2: 0,
    tracePoints: [],
    initialized: false,
    completedCycle: false
};

let config = {
    tangent: 1.618,
    p: 2,
    q: 5,
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

// Helper functions
function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
        let temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

function toXYZ(theta1, theta2) {
    const x = (R + r * Math.cos(theta1)) * Math.cos(theta2);
    const y = (R + r * Math.cos(theta1)) * Math.sin(theta2);
    const z = r * Math.sin(theta1);
    return { x, y, z };
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

function draw() {
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // No auto-rotation - torus angle controlled by mouse
    // rotY += 0.005;  // Removed auto-rotation

    // Draw semi-transparent blue torus fill first
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; // Blue with 0.1 alpha

    const meshRes = 40;
    const torusPoints = [];

    // Generate torus mesh points
    for (let i = 0; i <= meshRes; i++) {
        const u = (i / meshRes) * 2 * Math.PI;
        const row = [];
        for (let j = 0; j <= meshRes; j++) {
            const v = (j / meshRes) * 2 * Math.PI;
            const { x, y, z } = toXYZ(u, v);
            const proj = project(x, y, z, rotX, rotY);
            row.push(proj);
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

    // Calculate current position
    const effectiveTangent = config.useRatio ? (config.p / config.q) : config.tangent;
    const theta1 = state.t;
    const theta2 = effectiveTangent * state.t;

    const { x, y, z } = toXYZ(theta1, theta2);
    const pos = project(x, y, z, rotX, rotY);

    // Draw trace if enabled
    if (config.showTrace && state.tracePoints.length > 1) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < state.tracePoints.length; i++) {
            const tp = state.tracePoints[i];
            const { x: tx, y: ty, z: tz } = toXYZ(tp.theta1, tp.theta2);
            const tproj = project(tx, ty, tz, rotX, rotY);

            if (i === 0) ctx.moveTo(tproj.x, tproj.y);
            else ctx.lineTo(tproj.x, tproj.y);
        }
        ctx.stroke();
    }

    // Draw particle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = state.completedCycle ? '#ef4444' : '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = state.completedCycle ? '#f87171' : '#fbbf24';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw unwrapped torus view
    drawUnwrappedTorus();
}

function drawUnwrappedTorus() {
    // Clear unwrapped canvas
    unwrappedCtx.fillStyle = '#0f172a';
    unwrappedCtx.fillRect(0, 0, UNWRAPPED_WIDTH, UNWRAPPED_HEIGHT);

    // Draw background rectangle with transparent blue
    unwrappedCtx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    unwrappedCtx.fillRect(30, 30, UNWRAPPED_WIDTH - 60, UNWRAPPED_HEIGHT - 60);

    // Draw pink grid lines
    unwrappedCtx.strokeStyle = '#ec4899';
    unwrappedCtx.lineWidth = 0.5;

    const gridSize = 10;
    const rectWidth = UNWRAPPED_WIDTH - 60;
    const rectHeight = UNWRAPPED_HEIGHT - 60;

    // Vertical lines
    for (let i = 0; i <= gridSize; i++) {
        const x = 30 + (i * rectWidth / gridSize);
        unwrappedCtx.beginPath();
        unwrappedCtx.moveTo(x, 30);
        unwrappedCtx.lineTo(x, UNWRAPPED_HEIGHT - 30);
        unwrappedCtx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= gridSize; i++) {
        const y = 30 + (i * rectHeight / gridSize);
        unwrappedCtx.beginPath();
        unwrappedCtx.moveTo(30, y);
        unwrappedCtx.lineTo(UNWRAPPED_WIDTH - 30, y);
        unwrappedCtx.stroke();
    }

    // Draw labels
    unwrappedCtx.fillStyle = '#94a3b8';
    unwrappedCtx.font = '11px sans-serif';
    unwrappedCtx.fillText('θ₂ (major) →', UNWRAPPED_WIDTH / 2 - 30, UNWRAPPED_HEIGHT - 10);
    unwrappedCtx.save();
    unwrappedCtx.translate(15, UNWRAPPED_HEIGHT / 2);
    unwrappedCtx.rotate(-Math.PI / 2);
    unwrappedCtx.fillText('θ₁ (minor) →', -30, 0);
    unwrappedCtx.restore();

    // Draw trace on unwrapped view
    if (config.showTrace && state.tracePoints.length > 1) {
        unwrappedCtx.strokeStyle = '#f59e0b';
        unwrappedCtx.lineWidth = 2;
        unwrappedCtx.beginPath();

        for (let i = 0; i < state.tracePoints.length; i++) {
            const tp = state.tracePoints[i];
            // Map angles to rectangle coordinates
            // θ₁ ranges from 0 to 2π → maps to vertical (y-axis)
            // θ₂ ranges from 0 to 2π → maps to horizontal (x-axis)
            const x = 30 + ((tp.theta2 % (2 * Math.PI)) / (2 * Math.PI)) * rectWidth;
            const y = 30 + ((tp.theta1 % (2 * Math.PI)) / (2 * Math.PI)) * rectHeight;

            if (i === 0) {
                unwrappedCtx.moveTo(x, y);
            } else {
                const prevTp = state.tracePoints[i - 1];
                const prevX = 30 + ((prevTp.theta2 % (2 * Math.PI)) / (2 * Math.PI)) * rectWidth;
                const prevY = 30 + ((prevTp.theta1 % (2 * Math.PI)) / (2 * Math.PI)) * rectHeight;

                // Handle wrapping - if the line would cross the boundary, don't draw it
                const xDiff = Math.abs(x - prevX);
                const yDiff = Math.abs(y - prevY);

                if (xDiff < rectWidth * 0.5 && yDiff < rectHeight * 0.5) {
                    unwrappedCtx.lineTo(x, y);
                } else {
                    unwrappedCtx.moveTo(x, y);
                }
            }
        }
        unwrappedCtx.stroke();
    }

    // Calculate current position on unwrapped view
    const effectiveTangent = config.useRatio ? (config.p / config.q) : config.tangent;
    const theta1 = state.t;
    const theta2 = effectiveTangent * state.t;

    // Map to rectangle coordinates
    const particleX = 30 + ((theta2 % (2 * Math.PI)) / (2 * Math.PI)) * rectWidth;
    const particleY = 30 + ((theta1 % (2 * Math.PI)) / (2 * Math.PI)) * rectHeight;

    // Draw particle on unwrapped view
    unwrappedCtx.beginPath();
    unwrappedCtx.arc(particleX, particleY, 5, 0, Math.PI * 2);
    unwrappedCtx.fillStyle = state.completedCycle ? '#ef4444' : '#f59e0b';
    unwrappedCtx.fill();
    unwrappedCtx.strokeStyle = state.completedCycle ? '#f87171' : '#fbbf24';
    unwrappedCtx.lineWidth = 2;
    unwrappedCtx.stroke();

    // Draw edge indicators (showing where wrapping happens)
    unwrappedCtx.setLineDash([5, 5]);
    unwrappedCtx.strokeStyle = '#475569';
    unwrappedCtx.lineWidth = 1;
    unwrappedCtx.strokeRect(30, 30, rectWidth, rectHeight);
    unwrappedCtx.setLineDash([]);
}

function update() {
    if (!config.isRunning) return;

    // Calculate desired time step based on speed
    const targetDt = config.speed * 0.01;

    // Subdivide into smaller steps for smooth animation
    // More subdivisions at higher speeds to maintain smoothness
    const subdivisions = Math.ceil(config.speed / 10);
    const subDt = targetDt / subdivisions;

    for (let sub = 0; sub < subdivisions; sub++) {
        // Update time parameter with smaller step
        state.t += subDt;

        // Calculate angles
        const effectiveTangent = config.useRatio ? (config.p / config.q) : config.tangent;
        const theta1 = state.t;
        const theta2 = effectiveTangent * state.t;

        // Check if we've completed a full cycle (only in rational mode)
        if (config.useRatio && !state.completedCycle && state.initialized) {
            const g = gcd(config.p, config.q);
            const expectedT = 2 * Math.PI * config.q / g;

            if (state.t >= expectedT) {
                state.completedCycle = true;
                state.t = expectedT;
                handleStop();
                break;
            }
        }

        // Check for edge crossings
        if (state.initialized) {
            const currentTheta1Wraps = Math.floor(theta1 / (2 * Math.PI));
            const lastTheta1Wraps = Math.floor(state.lastTheta1 / (2 * Math.PI));

            const currentTheta2Wraps = Math.floor(theta2 / (2 * Math.PI));
            const lastTheta2Wraps = Math.floor(state.lastTheta2 / (2 * Math.PI));

            // Check theta1 crossing (minor circle)
            if (currentTheta1Wraps > lastTheta1Wraps) {
                config.sequence += '1';
                updateSequenceDisplay();
            }

            // Check theta2 crossing (major circle)
            if (currentTheta2Wraps > lastTheta2Wraps) {
                config.sequence += '0';
                updateSequenceDisplay();
            }
        } else {
            state.initialized = true;
        }

        state.lastTheta1 = theta1;
        state.lastTheta2 = theta2;

        // Add to trace with controlled density
        // At high speeds, don't add every single point to avoid memory issues
        if (sub === subdivisions - 1 || config.speed < 20 || state.tracePoints.length === 0) {
            state.tracePoints.push({ theta1, theta2 });

            // Limit trace points to prevent memory issues
            if (state.tracePoints.length > 5000) {
                // Keep every nth point to maintain the overall shape
                const keepRatio = Math.ceil(state.tracePoints.length / 2500);
                state.tracePoints = state.tracePoints.filter((_, i) => i % keepRatio === 0);
            }
        }
    }
}

function animate() {
    update();
    draw();
    animationId = requestAnimationFrame(animate);
}

// UI Event Handlers
function handleStart() {
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
    resetNWords();
    state = {
        t: 0,
        lastTheta1: 0,
        lastTheta2: 0,
        tracePoints: [],
        initialized: false,
        completedCycle: false
    };
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
}

function setTangent(value) {
    if (config.isRunning) return;
    config.tangent = value;
    document.getElementById('tangentSlider').value = value;
    document.getElementById('tangentInput').value = value;
    document.getElementById('tangentValue').textContent = value.toFixed(6);
}

function setRatio(p, q) {
    if (config.isRunning) return;
    config.p = p;
    config.q = q;
    document.getElementById('pInput').value = p;
    document.getElementById('qInput').value = q;
    updateRatioDisplay();
}

function updateRatioDisplay() {
    const ratio = config.p / config.q;
    document.getElementById('ratioDisplay').textContent =
        `${config.p}/${config.q} = ${ratio.toFixed(6)}`;
}

function updateNWords() {
    const sequence = config.sequence;
    const n = config.nWordsLength;
    
    if (sequence.length >= n) {
        // Extract all n-words from the sequence
        for (let i = 0; i <= sequence.length - n; i++) {
            const nword = sequence.substring(i, i + n);
            config.uniqueNWords.add(nword);
        }
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

function resetNWords() {
    config.uniqueNWords.clear();
    updateNWordsDisplay();
}

function updateSequenceDisplay() {
    document.getElementById('sequenceOutput').textContent =
        config.sequence || 'Press Start to begin...';
    document.getElementById('sequenceLength').textContent = config.sequence.length;
    
    // Update n-words when sequence changes
    updateNWords();
}

function disableInputs(disabled) {
    document.getElementById('irrationalMode').disabled = disabled;
    document.getElementById('rationalMode').disabled = disabled;
    document.getElementById('tangentSlider').disabled = disabled;
    document.getElementById('tangentInput').disabled = disabled;
    document.getElementById('pInput').disabled = disabled;
    document.getElementById('qInput').disabled = disabled;

    const presetButtons = document.querySelectorAll('.preset-button');
    presetButtons.forEach(btn => btn.disabled = disabled);
}

// Event Listeners
document.getElementById('tangentSlider').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    config.tangent = value;
    document.getElementById('tangentInput').value = value;
    document.getElementById('tangentValue').textContent = value.toFixed(6);
});

document.getElementById('tangentInput').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.tangent = value;
        document.getElementById('tangentSlider').value = Math.min(value, 10);
        document.getElementById('tangentValue').textContent = value.toFixed(6);
    }
});

document.getElementById('pInput').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.p = value;
        updateRatioDisplay();
    }
});

document.getElementById('qInput').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
        config.q = value;
        updateRatioDisplay();
    }
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
    // Reset and recalculate n-words with new length
    resetNWords();
    updateNWords();
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
    // Start animation loop
    animate();
});