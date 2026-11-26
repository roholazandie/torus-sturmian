// Rendering of the two views: the shaded 3D torus and the unwrapped square.
// Points on the torus are given in the unit square: x = θ₁/2π (around the
// tube), y = θ₂/2π (around the hole).

const VIEW_COLORS = {
    sym0: [59, 130, 246],    // 0: θ₂ wraps (tube circle, top/bottom edges)
    sym1: [217, 119, 6],     // 1: θ₁ wraps (outer circle, left/right edges)
    path: [226, 232, 240],
    surface: [72, 92, 150],
    background: '#0a101d',
    grid: '#18223a',
    label: '#8b98ad'
};

const R = 100;  // major radius (model units)
const r = 40;   // minor radius
const CAMERA_DISTANCE = 600;
const RECENT_SEGMENTS = 48;  // drawn bright, fading with age
const RECENT_LEVELS = 6;
const FLASH_RADIUS = 12;
const FLASH_MS = 650;
const DEFAULT_VIEW = { rotX: -1.05, rotY: 0.35 };

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const unwrappedCanvas = document.getElementById('unwrappedCanvas');
const unwrappedCtx = unwrappedCanvas.getContext('2d');

const view = { ...DEFAULT_VIEW };
const flashes = [];
let suppressFlashes = false;

const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

// Size a canvas backing store to its CSS box at device resolution.
function fitCanvas(target, context) {
    const dpr = window.devicePixelRatio || 1;
    const size = target.clientWidth;
    const backing = Math.round(size * dpr);
    if (target.width !== backing || target.height !== backing) {
        target.width = backing;
        target.height = backing;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return size;
}

// Remember a crossing so both views can flash it; (x, y) is the exit point.
function noteCrossing(symbol, x, y) {
    if (suppressFlashes) return;
    flashes.push({ symbol, x, y, time: performance.now() });
    if (flashes.length > 12) flashes.shift();
}

// Completed segments plus the partial one up to the particle.
function traceSegments() {
    const pos = positionAt(state.tau);
    const current = { x0: state.segStart.x, y0: state.segStart.y, x1: pos.x, y1: pos.y };
    return state.segments.concat([current]);
}

// Split the trace into an "old" bucket and a few recent age levels. The old
// bucket's opacity drops as the path gets longer, so a dense trace reads as an
// evenly shaded surface instead of a solid fill.
function traceBuckets() {
    const segments = traceSegments();
    const firstRecent = Math.max(0, segments.length - RECENT_SEGMENTS);
    const old = segments.slice(0, firstRecent);
    const recent = segments.slice(firstRecent);
    const oldLength = old.reduce((sum, s) => sum + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0);
    const levels = Array.from({ length: RECENT_LEVELS }, () => []);
    recent.forEach((s, i) => {
        levels[Math.min(RECENT_LEVELS - 1, Math.floor(RECENT_LEVELS * (i + 1) / recent.length))].push(s);
    });
    return { old, oldAlpha: Math.max(0.06, Math.min(0.55, 8 / Math.max(oldLength, 1e-9))), levels };
}

// ---------------------------------------------------------------------------
// 3D torus

function torusPoint(x, y) {
    const t1 = 2 * Math.PI * x;
    const t2 = 2 * Math.PI * y;
    const ring = R + r * Math.cos(t1);
    return {
        x: ring * Math.cos(t2),
        y: ring * Math.sin(t2),
        z: r * Math.sin(t1),
        nx: Math.cos(t1) * Math.cos(t2),
        ny: Math.cos(t1) * Math.sin(t2),
        nz: Math.sin(t1)
    };
}

function rotate(x, y, z) {
    const cy = Math.cos(view.rotY), sy = Math.sin(view.rotY);
    const cx = Math.cos(view.rotX), sx = Math.sin(view.rotX);
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    return { x: x1, y: y * cx - z1 * sx, z: y * sx + z1 * cx };
}

// Rotated, projected point with its depth and whether it faces the camera.
function viewPoint(x, y, size) {
    const p = torusPoint(x, y);
    const q = rotate(p.x, p.y, p.z);
    const n = rotate(p.nx, p.ny, p.nz);
    const scale = CAMERA_DISTANCE / (CAMERA_DISTANCE + q.z) * size / 330;
    // The camera sits at z = −CAMERA_DISTANCE looking along +z
    const facing = n.x * q.x + n.y * q.y + n.z * (q.z + CAMERA_DISTANCE) < 0;
    return { sx: q.x * scale + size / 2, sy: q.y * scale + size / 2, z: q.z, n, facing };
}

const LIGHT = (() => {
    const v = [-0.45, -0.65, -0.6];
    const len = Math.hypot(...v);
    return v.map(c => c / len);
})();

function drawSurface(g, size) {
    const U = 24;  // around the tube
    const V = 56;  // around the hole
    const grid = [];
    for (let i = 0; i <= U; i++) {
        const row = [];
        for (let j = 0; j <= V; j++) row.push(viewPoint(i / U, j / V, size));
        grid.push(row);
    }

    const quads = [];
    for (let i = 0; i < U; i++) {
        for (let j = 0; j < V; j++) {
            const center = viewPoint((i + 0.5) / U, (j + 0.5) / V, size);
            if (!center.facing) continue;
            quads.push({ i, j, z: center.z, n: center.n });
        }
    }
    quads.sort((a, b) => b.z - a.z);

    for (const { i, j, n } of quads) {
        const diffuse = Math.max(0, n.x * LIGHT[0] + n.y * LIGHT[1] + n.z * LIGHT[2]);
        const shade = 0.22 + 0.78 * diffuse;
        const c = VIEW_COLORS.surface.map(v => Math.round(v * shade));
        const fill = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
        g.fillStyle = fill;
        g.strokeStyle = fill;
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(grid[i][j].sx, grid[i][j].sy);
        g.lineTo(grid[i + 1][j].sx, grid[i + 1][j].sy);
        g.lineTo(grid[i + 1][j + 1].sx, grid[i + 1][j + 1].sy);
        g.lineTo(grid[i][j + 1].sx, grid[i][j + 1].sy);
        g.closePath();
        g.fill();
        g.stroke();
    }
}

// A curve on the torus, split into the parts facing toward and away from the camera.
function strokeTorusCurve(g, size, samples, pointAt, color, width, frontAlpha, backAlpha) {
    const front = new Path2D();
    const back = new Path2D();
    let prev = viewPoint(...pointAt(0), size);
    for (let i = 1; i <= samples; i++) {
        const p = viewPoint(...pointAt(i / samples), size);
        const path = p.facing && prev.facing ? front : back;
        path.moveTo(prev.sx, prev.sy);
        path.lineTo(p.sx, p.sy);
        prev = p;
    }
    g.lineWidth = width;
    g.lineCap = 'round';
    g.strokeStyle = rgba(color, backAlpha);
    g.stroke(back);
    g.strokeStyle = rgba(color, frontAlpha);
    g.stroke(front);
}

function torusTracePaths(segments, size) {
    const front = new Path2D();
    const back = new Path2D();
    for (const s of segments) {
        const steps = Math.max(1, Math.ceil(Math.abs(s.x1 - s.x0) * 32 + Math.abs(s.y1 - s.y0) * 64));
        let prev = viewPoint(s.x0, s.y0, size);
        for (let i = 1; i <= steps; i++) {
            const f = i / steps;
            const p = viewPoint(s.x0 + f * (s.x1 - s.x0), s.y0 + f * (s.y1 - s.y0), size);
            const path = p.facing && prev.facing ? front : back;
            path.moveTo(prev.sx, prev.sy);
            path.lineTo(p.sx, p.sy);
            prev = p;
        }
    }
    return { front, back };
}

function drawTorusTrace(g, size) {
    const { old, oldAlpha, levels } = traceBuckets();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const oldPaths = torusTracePaths(old, size);
    g.lineWidth = 1;
    g.strokeStyle = rgba(VIEW_COLORS.path, oldAlpha * 0.25);
    g.stroke(oldPaths.back);
    g.lineWidth = 1.2;
    g.strokeStyle = rgba(VIEW_COLORS.path, oldAlpha);
    g.stroke(oldPaths.front);

    levels.forEach((segments, k) => {
        const age = (k + 1) / RECENT_LEVELS;
        const paths = torusTracePaths(segments, size);
        g.lineWidth = 1;
        g.strokeStyle = rgba(VIEW_COLORS.path, 0.1 + 0.15 * age);
        g.stroke(paths.back);
        g.lineWidth = 1.4 + 0.8 * age;
        g.strokeStyle = rgba(VIEW_COLORS.path, Math.max(oldAlpha, 0.35 + 0.65 * age));
        g.stroke(paths.front);
    });
}

function drawParticle(g, x, y, visible) {
    const color = state.completedCycle ? [239, 68, 68] : [255, 255, 255];
    const glow = g.createRadialGradient(x, y, 0, x, y, 14);
    glow.addColorStop(0, rgba(color, visible ? 0.55 : 0.2));
    glow.addColorStop(1, rgba(color, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rgba(color, visible ? 1 : 0.4);
    g.beginPath();
    g.arc(x, y, visible ? 4.5 : 3, 0, Math.PI * 2);
    g.fill();
}

function drawFlash(g, sx, sy, flash, now) {
    const t = (now - flash.time) / FLASH_MS;
    if (t >= 1) return;
    const color = flash.symbol === '1' ? VIEW_COLORS.sym1 : VIEW_COLORS.sym0;
    g.strokeStyle = rgba(color, 1 - t);
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(sx, sy, 4 + FLASH_RADIUS * t, 0, Math.PI * 2);
    g.stroke();
}

function drawTorus() {
    const size = fitCanvas(canvas, ctx);
    const now = performance.now();
    ctx.fillStyle = VIEW_COLORS.background;
    ctx.fillRect(0, 0, size, size);

    drawSurface(ctx, size);

    // Cut circles: crossing θ₁ = 0 writes 1, crossing θ₂ = 0 writes 0
    strokeTorusCurve(ctx, size, 96, t => [0, t], VIEW_COLORS.sym1, 2.5, 0.95, 0.25);
    strokeTorusCurve(ctx, size, 48, t => [t, 0], VIEW_COLORS.sym0, 2.5, 0.95, 0.25);

    if (config.showTrace) drawTorusTrace(ctx, size);

    for (const flash of flashes) {
        const p = viewPoint(flash.x, flash.y, size);
        if (p.facing) drawFlash(ctx, p.sx, p.sy, flash, now);
    }

    const pos = positionAt(state.tau);
    const p = viewPoint(pos.x, pos.y, size);
    drawParticle(ctx, p.sx, p.sy, p.facing);
}

// ---------------------------------------------------------------------------
// Unwrapped square

function drawSymbolTag(g, symbol, x, y) {
    const color = symbol === '1' ? VIEW_COLORS.sym1 : VIEW_COLORS.sym0;
    g.fillStyle = rgba(color, 1);
    g.beginPath();
    g.roundRect(x - 8, y - 9, 16, 18, 4);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '600 12px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(symbol, x, y + 0.5);
}

function drawUnwrappedTorus() {
    const size = fitCanvas(unwrappedCanvas, unwrappedCtx);
    const g = unwrappedCtx;
    const now = performance.now();
    const m = Math.round(size * 0.09);
    const side = size - 2 * m;
    // x = θ₁/2π to the right, y = θ₂/2π upward, so the path has slope α on screen
    const toScreen = (x, y) => ({ x: m + x * side, y: m + (1 - y) * side });

    g.fillStyle = VIEW_COLORS.background;
    g.fillRect(0, 0, size, size);

    // Faint grid
    g.strokeStyle = VIEW_COLORS.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 10; i++) {
        const v = Math.round(m + i * side / 10) + 0.5;
        g.moveTo(v, m);
        g.lineTo(v, m + side);
        g.moveTo(m, v);
        g.lineTo(m + side, v);
    }
    g.stroke();

    // Trace: dense history faint, recent segments bright
    if (config.showTrace) {
        const { old, oldAlpha, levels } = traceBuckets();
        const pathOf = (segments) => {
            const path = new Path2D();
            for (const s of segments) {
                const a = toScreen(s.x0, s.y0);
                const b = toScreen(s.x1, s.y1);
                path.moveTo(a.x, a.y);
                path.lineTo(b.x, b.y);
            }
            return path;
        };
        g.lineCap = 'round';
        g.lineWidth = 1.2;
        g.strokeStyle = rgba(VIEW_COLORS.path, oldAlpha);
        g.stroke(pathOf(old));
        levels.forEach((segments, k) => {
            const age = (k + 1) / RECENT_LEVELS;
            g.lineWidth = 1.4 + 0.8 * age;
            g.strokeStyle = rgba(VIEW_COLORS.path, Math.max(oldAlpha, 0.35 + 0.65 * age));
            g.stroke(pathOf(segments));
        });
    }

    // Glued edges: left/right write 1, top/bottom write 0
    g.lineWidth = 3;
    g.lineCap = 'butt';
    g.strokeStyle = rgba(VIEW_COLORS.sym1, 1);
    g.beginPath();
    g.moveTo(m, m); g.lineTo(m, m + side);
    g.moveTo(m + side, m); g.lineTo(m + side, m + side);
    g.stroke();
    g.strokeStyle = rgba(VIEW_COLORS.sym0, 1);
    g.beginPath();
    g.moveTo(m, m); g.lineTo(m + side, m);
    g.moveTo(m, m + side); g.lineTo(m + side, m + side);
    g.stroke();

    drawSymbolTag(g, '1', m + side + m / 2, size / 2);
    drawSymbolTag(g, '1', m / 2, size / 2);
    drawSymbolTag(g, '0', size / 2, m / 2);
    drawSymbolTag(g, '0', size / 2, m + side + m / 2);

    // Axis hints
    g.fillStyle = VIEW_COLORS.label;
    g.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('θ₁ →', m + side * 0.62, m + side + m / 2);
    g.save();
    g.translate(m / 2, m + side * 0.38);
    g.rotate(-Math.PI / 2);
    g.fillText('θ₂ →', 0, 0);
    g.restore();

    // Crossing flashes at the exit edge and at the glued entry edge
    for (const flash of flashes) {
        const exit = toScreen(flash.x, flash.y);
        const entry = flash.symbol === '1' ? toScreen(0, flash.y) : toScreen(flash.x, 0);
        drawFlash(g, exit.x, exit.y, flash, now);
        drawFlash(g, entry.x, entry.y, flash, now);
    }

    const pos = positionAt(state.tau);
    const p = toScreen(pos.x, pos.y);
    drawParticle(g, p.x, p.y, true);
}

function drawViews() {
    drawTorus();
    drawUnwrappedTorus();
    if (isRecording) composeRecordingFrame();
}

// ---------------------------------------------------------------------------
// Recording: both views side by side with the latest letters underneath

const recordingCanvas = document.createElement('canvas');
const recordingCtx = recordingCanvas.getContext('2d');
const RECORDING_VIEW = 540;
const RECORDING_STRIP = 56;

function composeRecordingFrame() {
    const gap = 16;
    const width = 2 * RECORDING_VIEW + 3 * gap;
    const height = RECORDING_VIEW + 2 * gap + RECORDING_STRIP;
    if (recordingCanvas.width !== width || recordingCanvas.height !== height) {
        recordingCanvas.width = width;
        recordingCanvas.height = height;
    }
    const g = recordingCtx;
    g.fillStyle = '#070b14';
    g.fillRect(0, 0, width, height);
    g.drawImage(canvas, gap, gap, RECORDING_VIEW, RECORDING_VIEW);
    g.drawImage(unwrappedCanvas, 2 * gap + RECORDING_VIEW, gap, RECORDING_VIEW, RECORDING_VIEW);

    // Latest letters, colored by symbol, newest on the right
    g.font = '600 20px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    const charWidth = g.measureText('0').width + 2;
    const count = Math.floor((width - 2 * gap) / charWidth);
    const tail = config.sequence.slice(-count);
    const y = RECORDING_VIEW + gap + RECORDING_STRIP / 2 + gap / 2;
    let x = width - gap - tail.length * charWidth;
    for (const ch of tail) {
        g.fillStyle = rgba(ch === '1' ? VIEW_COLORS.sym1 : VIEW_COLORS.sym0, 1);
        g.fillText(ch, x, y);
        x += charWidth;
    }
}

function getRecordingCanvas() {
    composeRecordingFrame();
    return recordingCanvas;
}

// ---------------------------------------------------------------------------
// Rotation by dragging (mouse, pen and touch)

let dragPointer = null;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
    dragPointer = e.pointerId;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointer) return;
    view.rotY += (e.clientX - lastPointer.x) * 0.01;
    view.rotX += (e.clientY - lastPointer.y) * 0.01;
    // Clamp rotX to prevent flipping
    view.rotX = Math.max(-Math.PI, Math.min(Math.PI, view.rotX));
    lastPointer = { x: e.clientX, y: e.clientY };
});

const endDrag = (e) => {
    if (e.pointerId === dragPointer) dragPointer = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('dblclick', () => Object.assign(view, DEFAULT_VIEW));
