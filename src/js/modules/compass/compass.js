/**
 * Qibla Compass Module
 * True North heading via magnetic declination correction on Web API.
 */

// Core Services
import { getQiblaDirection } from '../../core/api.js';

// UI Components
import { updateCompassUI } from '../../components/compass/compass-dial.js';
import { updateQiblaInfoCard } from '../../components/card/qibla-info-card.js';

// Utilities & Modules
import { doubleVibrate } from '../system/haptic.js';
import { getMagneticDeclination } from './magnetic-declination.js';

const QIBLA_TOLERANCE_DEG = 2;
const HAPTIC_COOLDOWN_MS = 2000;
const GYRO_DETECT_TIMEOUT_MS = 1000;

/** EMA smoothing factor (0–1). Lower = smoother, higher = responsive. */
const SMOOTHING_FACTOR = 0.25;

/** Minimum heading delta to trigger DOM repaint. */
const MIN_CHANGE_DEG = 0.1;

/**
 * Global gyroscope detection cache.
 * null = pending, true = available, false = absent
 */
let _globalHasGyroscope = null;

export default class QiblaCompass {
    constructor() {
        this._qiblaAngle = null;
        this._heading = 0;
        this._smoothedHeading = null;
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

        /** Magnetic declination (computed once per location) */
        this._declination = 0;
    }

    /**
     * Fetch qibla direction and compute magnetic declination.
     * @param {number} latitude
     * @param {number} longitude
     */
    async init(latitude, longitude) {
        const direction = await getQiblaDirection(latitude, longitude);

        if (direction !== null) {
            this._qiblaAngle = direction;
        }

        this._declination = getMagneticDeclination(latitude, longitude);
        this._update();
    }

    /**
     * Start listening to device orientation for live compass heading.
     */
    start() {
        if (this._started) return;
        this._started = true;

        if (_globalHasGyroscope === false) {
            this._markNoGyroscope();
            return;
        }

        this._orientationHandler = (event) => {
            const hasWebkit = typeof event.webkitCompassHeading === 'number';
            const hasAlpha = typeof event.alpha === 'number';

            if (!hasWebkit && !hasAlpha) return;

            const isAbsoluteEvent = event.type === 'deviceorientationabsolute' || event.absolute === true;
            if (!hasWebkit && !isAbsoluteEvent) return;

            // iOS webkitCompassHeading = True North, Android alpha = Magnetic North
            const rawHeading = hasWebkit ? event.webkitCompassHeading : (360 - event.alpha);

            if (!Number.isFinite(rawHeading)) return;

            if (!this._receivedOrientation) {
                this._receivedOrientation = true;
                this._hasGyroscope = true;
                _globalHasGyroscope = true;
                this._clearGyroDetectTimer();
            }

            // Apply declination only for alpha-based (Android); iOS already True North
            const trueHeading = hasWebkit ? rawHeading : this._applyDeclination(rawHeading);

            this._heading = this._smoothHeading(trueHeading);
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
            this._listenOrientation();
        } else {
            this._markNoGyroscope();
        }

        this._gyroDetectTimer = setTimeout(() => {
            if (!this._receivedOrientation) {
                this._markNoGyroscope();
            }
        }, GYRO_DETECT_TIMEOUT_MS);
    }

    /**
     * Stop listening and reset state.
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

    /** @returns {number} qibla bearing from True North */
    get qiblaAngle() {
        return this._qiblaAngle;
    }

    /** @returns {number} smoothed device heading (True North) */
    get heading() {
        return this._heading;
    }

    /** @returns {boolean|null} */
    get hasGyroscope() {
        return this._hasGyroscope;
    }

    /* ── Heading Processing ── */

    /**
     * Convert magnetic heading to true heading.
     * @param {number} magneticDeg
     * @returns {number} 0–360
     * @private
     */
    _applyDeclination(magneticDeg) {
        return ((magneticDeg + this._declination) % 360 + 360) % 360;
    }

    /** @private */
    _listenOrientation() {
        window.addEventListener('deviceorientationabsolute', this._orientationHandler, true);
        window.addEventListener('deviceorientation', this._orientationHandler, true);
    }

    /** @private */
    _markNoGyroscope() {
        this._hasGyroscope = false;
        _globalHasGyroscope = false;
        this._clearGyroDetectTimer();
        this._update();
    }

    /** @private */
    _clearGyroDetectTimer() {
        if (this._gyroDetectTimer) {
            clearTimeout(this._gyroDetectTimer);
            this._gyroDetectTimer = null;
        }
    }

    /**
     * Circular EMA via sin/cos decomposition. Handles 0°/360° wraparound.
     * @param {number} rawDeg
     * @returns {number} smoothed heading (0–360)
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

        const smoothX = (1 - SMOOTHING_FACTOR) * Math.cos(prevRad) + SMOOTHING_FACTOR * Math.cos(rawRad);
        const smoothY = (1 - SMOOTHING_FACTOR) * Math.sin(prevRad) + SMOOTHING_FACTOR * Math.sin(rawRad);

        let smoothDeg = Math.atan2(smoothY, smoothX) / toRad;
        if (smoothDeg < 0) smoothDeg += 360;

        this._smoothedHeading = smoothDeg;
        return smoothDeg;
    }

    /* ── Render Scheduling ── */

    /** @private */
    _scheduleUpdate() {
        if (this._rafId) return;

        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;

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

    /** @private */
    _update() {
        updateCompassUI(this._heading, this._qiblaAngle);
        updateQiblaInfoCard(this._heading, this._qiblaAngle, this._hasGyroscope);
    }

    /** @private */
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
     * @param {number} a
     * @param {number} b
     * @returns {number} 0–180
     * @private
     */
    _angleDiff(a, b) {
        const diff = Math.abs(a - b) % 360;
        return diff > 180 ? 360 - diff : diff;
    }
}
