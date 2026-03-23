/**
 * Qibla Compass Module
 * Fetches qibla bearing from API + handles device orientation for live heading.
 * Detects gyroscope availability and triggers haptic on qibla alignment.
 *
 * Uses a circular low-pass filter (EMA) to smooth noisy sensor data,
 * preventing jittery dial movement on mobile devices.
 */

import { getQiblaDirection } from '../../core/api.js';

import { updateCompassUI } from '../../components/compass/compass-dial.js';
import { updateQiblaInfoCard } from '../../components/card/qibla-info-card.js';

import { doubleVibrate } from '../system/haptic.js';

/* ── Configuration ── */
const QIBLA_TOLERANCE_DEG = 2;
const HAPTIC_COOLDOWN_MS = 2000;
const GYRO_DETECT_TIMEOUT_MS = 1000;

/**
 * Low-pass filter smoothing factor (0–1).
 * Lower = smoother but more laggy, higher = more responsive but jittery.
 */
const SMOOTHING_FACTOR = 0.25;

/**
 * Minimum heading change (in degrees) to actually push a DOM update.
 * Skips imperceptible sub-degree changes that would waste paint cycles.
 */
const MIN_CHANGE_DEG = 0.1;

/**
 * Global cache for gyroscope detection state to prevent re-detecting
 * every time the user navigates back to the compass page.
 * null = not detected yet, true = has gyro, false = no gyro
 */
let _globalHasGyroscope = null;

export default class QiblaCompass {
    constructor() {
        this._qiblaAngle = null;
        this._heading = 0;
        this._smoothedHeading = null; // null until first reading
        this._orientationHandler = null;
        this._started = false;

        /** @type {boolean|null} null = belum terdeteksi */
        this._hasGyroscope = _globalHasGyroscope;
        this._gyroDetectTimer = null;
        this._receivedOrientation = false;

        /** Haptic cooldown state */
        this._lastHapticTime = 0;

        /** rAF throttle state */
        this._rafId = null;
        this._lastRenderedHeading = null;
    }

    /**
     * Fetch qibla direction for the given coordinates
     * @param {number} latitude
     * @param {number} longitude
     */
    async init(latitude, longitude) {
        const direction = await getQiblaDirection(latitude, longitude);

        if (direction !== null) {
            this._qiblaAngle = direction;
        }

        // Apply immediately with current heading
        this._update();
    }

    /**
     * Start listening to device orientation for live compass heading
     */
    start() {
        if (this._started) return;
        this._started = true;

        // Fast-fail if we already know device lacks a gyroscope
        if (_globalHasGyroscope === false) {
            this._markNoGyroscope();
            return;
        }

        this._orientationHandler = (event) => {
            // On desktop browsers the event fires but all axes are null — not a real sensor
            const hasWebkit = typeof event.webkitCompassHeading === 'number';
            const hasAlpha = typeof event.alpha === 'number';

            if (!hasWebkit && !hasAlpha) return;

            // A compass requires absolute orientation (relative to Earth's magnetic north).
            // If the reading is relative (e.g. standard deviceorientation on some Androids)
            // and lacks webkitCompassHeading, it's useless for a compass and we must ignore it
            // to avoid jitter and wrong directions.
            const isAbsoluteEvent = event.type === 'deviceorientationabsolute' || event.absolute === true;
            if (!hasWebkit && !isAbsoluteEvent) return;

            // webkitCompassHeading = iOS, alpha = Android/others (0-360 from True North)
            const rawHeading = hasWebkit ? event.webkitCompassHeading : (360 - event.alpha);

            // Ignore invalid readings during sensor warm-up
            if (!Number.isFinite(rawHeading)) return;

            // Mark gyroscope as available on first valid reading
            if (!this._receivedOrientation) {
                this._receivedOrientation = true;
                this._hasGyroscope = true;
                _globalHasGyroscope = true;
                this._clearGyroDetectTimer();
            }

            // Apply circular low-pass filter to smooth jittery sensor data
            this._heading = this._smoothHeading(rawHeading);
            this._scheduleUpdate();
        };

        // iOS 13+ requires permission request
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        this._listenOrientation();
                    } else {
                        this._markNoGyroscope();
                    }
                })
                .catch(() => this._markNoGyroscope());
        } else if (typeof DeviceOrientationEvent !== 'undefined') {
            // Android & desktop — try absolute first, regular as fallback
            this._listenOrientation();
        } else {
            // No DeviceOrientationEvent API at all
            this._markNoGyroscope();
        }

        // Fallback: if no orientation event fires within timeout, declare no gyro
        this._gyroDetectTimer = setTimeout(() => {
            if (!this._receivedOrientation) {
                this._markNoGyroscope();
            }
        }, GYRO_DETECT_TIMEOUT_MS);
    }

    /**
     * Stop listening and reset state
     */
    stop() {
        if (!this._started) return;
        this._started = false;
        this._clearGyroDetectTimer();

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        if (this._orientationHandler) {
            window.removeEventListener('deviceorientationabsolute', this._orientationHandler, true);
            window.removeEventListener('deviceorientation', this._orientationHandler, true);
            this._orientationHandler = null;
        }
    }

    /** @returns {number} qibla bearing in degrees from True North */
    get qiblaAngle() {
        return this._qiblaAngle;
    }

    /** @returns {number} current device heading (smoothed) */
    get heading() {
        return this._heading;
    }

    /** @returns {boolean|null} true/false after detection, null while pending */
    get hasGyroscope() {
        return this._hasGyroscope;
    }

    /* ── Private helpers ── */

    /**
     * Subscribe to device orientation events
     * @private
     */
    _listenOrientation() {
        window.addEventListener('deviceorientationabsolute', this._orientationHandler, true);
        window.addEventListener('deviceorientation', this._orientationHandler, true);
    }

    /**
     * Mark device as lacking gyroscope and refresh UI
     * @private
     */
    _markNoGyroscope() {
        this._hasGyroscope = false;
        _globalHasGyroscope = false;
        this._clearGyroDetectTimer();
        this._update();
    }

    /**
     * Clear the gyroscope detection timeout
     * @private
     */
    _clearGyroDetectTimer() {
        if (this._gyroDetectTimer) {
            clearTimeout(this._gyroDetectTimer);
            this._gyroDetectTimer = null;
        }
    }

    /**
     * Apply circular exponential moving average (EMA) to smooth heading.
     * Standard EMA breaks at the 0°/360° wraparound; this uses sin/cos
     * decomposition to handle it correctly.
     * @param {number} rawDeg — raw heading in degrees
     * @returns {number} smoothed heading in degrees (0-360)
     * @private
     */
    _smoothHeading(rawDeg) {
        if (this._smoothedHeading === null) {
            this._smoothedHeading = rawDeg;
            return rawDeg;
        }

        const toRad = Math.PI / 180;
        const rawRad = rawDeg * toRad;
        const prevRad = this._smoothedHeading * toRad;

        // EMA on the unit-circle components avoids wraparound glitches
        const smoothX = (1 - SMOOTHING_FACTOR) * Math.cos(prevRad) + SMOOTHING_FACTOR * Math.cos(rawRad);
        const smoothY = (1 - SMOOTHING_FACTOR) * Math.sin(prevRad) + SMOOTHING_FACTOR * Math.sin(rawRad);

        let smoothDeg = Math.atan2(smoothY, smoothX) / toRad;
        if (smoothDeg < 0) smoothDeg += 360;

        this._smoothedHeading = smoothDeg;
        return smoothDeg;
    }

    /**
     * Schedule a single DOM update on the next animation frame.
     * Coalesces rapid sensor events into one paint per vsync.
     * @private
     */
    _scheduleUpdate() {
        if (this._rafId) return; // already scheduled

        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;

            // Skip if heading hasn't changed enough to be visible
            if (
                this._lastRenderedHeading !== null &&
                this._angleDiff(this._heading, this._lastRenderedHeading) < MIN_CHANGE_DEG
            ) {
                return;
            }

            this._lastRenderedHeading = this._heading;
            this._update();
            this._checkQiblaAlignment();
        });
    }

    /**
     * Push current heading + qibla to the compass UI
     * @private
     */
    _update() {
        updateCompassUI(this._heading, this._qiblaAngle);
        updateQiblaInfoCard(this._heading, this._qiblaAngle, this._hasGyroscope);
    }

    /**
     * Check if device is currently pointing at qibla within tolerance
     * and trigger haptic feedback with cooldown.
     * @private
     */
    _checkQiblaAlignment() {
        if (this._qiblaAngle === null) return;

        const diff = this._angleDiff(this._heading, this._qiblaAngle);

        if (diff <= QIBLA_TOLERANCE_DEG) {
            const now = Date.now();
            if (now - this._lastHapticTime >= HAPTIC_COOLDOWN_MS) {
                this._lastHapticTime = now;
                doubleVibrate();
            }
        }
    }

    /**
     * Compute the smallest angular difference between two angles (0-360)
     * @param {number} a
     * @param {number} b
     * @returns {number} difference in degrees (0-180)
     * @private
     */
    _angleDiff(a, b) {
        const diff = Math.abs(a - b) % 360;
        return diff > 180 ? 360 - diff : diff;
    }
}
