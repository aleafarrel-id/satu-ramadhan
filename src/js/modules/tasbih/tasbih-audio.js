/**
 * Tasbih Audio Feedback Module
 *
 * Provides low-latency sound effects as an alternative to haptic feedback
 * for the tasbih counter. Uses Web Audio API (AudioContext + AudioBuffer)
 * instead of <audio> elements to achieve near-zero latency on rapid taps.
 *
 * Audio files are pre-decoded into memory on init, then each playback
 * creates a fresh AudioBufferSourceNode — the recommended way to
 * fire-and-forget short SFX with Web Audio API.
 *
 * @module tasbih-audio
 */

// Asset Paths 
// Resolved relative to `base: './'` in vite.config.js.
// Files live in public/audio/sfx/ and are copied verbatim to dist/.

const CLICK_URL     = './audio/sfx/mouse-click.mp3';
const DBL_CLICK_URL = './audio/sfx/double-mouse-click.mp3';

// Module State 

/** @type {AudioContext|null} */
let _ctx = null;

/** @type {AudioBuffer|null} Pre-decoded single-click buffer */
let _clickBuffer = null;

/** @type {AudioBuffer|null} Pre-decoded double-click buffer */
let _dblClickBuffer = null;

/** Whether preload has completed successfully */
let _ready = false;

// Helpers 

/**
 * Lazily creates (or resumes) the shared AudioContext.
 * Must be called from a user-gesture context on the first invocation
 * to satisfy browser autoplay policies.
 * @returns {AudioContext}
 */
function _ensureContext() {
    if (!_ctx) {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (_ctx.state === 'suspended') {
        _ctx.resume().catch(() => {});
    }
    return _ctx;
}

/**
 * Fetches and decodes an audio file into an AudioBuffer.
 * @param {AudioContext} ctx
 * @param {string} url
 * @returns {Promise<AudioBuffer>}
 */
async function _fetchAndDecode(ctx, url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${url} (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Plays an AudioBuffer immediately with fire-and-forget semantics.
 * Each call creates a new source node (they are one-shot by design).
 * @param {AudioBuffer} buffer
 */
function _playBuffer(buffer) {
    if (!buffer || !_ctx) return;

    const ctx = _ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
}

// Public API 

/**
 * Pre-fetches and decodes both SFX files into memory.
 * Call once on tasbih init. Non-blocking — failures are swallowed
 * with a console warning so the tasbih still functions without audio.
 */
export async function preloadAudio() {
    if (_ready) return;

    try {
        const ctx = _ensureContext();
        const [click, dblClick] = await Promise.all([
            _fetchAndDecode(ctx, CLICK_URL),
            _fetchAndDecode(ctx, DBL_CLICK_URL),
        ]);
        _clickBuffer = click;
        _dblClickBuffer = dblClick;
        _ready = true;
    } catch (e) {
        console.warn('[tasbih-audio] Preload failed:', e);
    }
}

/**
 * Play the single-click SFX (normal tasbih tap).
 * Fire-and-forget — safe to call rapidly.
 */
export function playSingleClick() {
    _ensureContext();
    _playBuffer(_clickBuffer);
}

/**
 * Play the double-click SFX (round complete / reset to 0).
 * Fire-and-forget — safe to call rapidly.
 */
export function playDoubleClick() {
    _ensureContext();
    _playBuffer(_dblClickBuffer);
}
