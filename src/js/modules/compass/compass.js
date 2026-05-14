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
import * as Notification from '../notification/notification.js';
import { t } from '../../core/i18n.js';

const QIBLA_TOLERANCE_DEG = 2;
const HAPTIC_COOLDOWN_MS = 2000;
const GYRO_DETECT_TIMEOUT_MS = 1000;

/** iOS 13+ requires DeviceOrientationEvent.requestPermission — detect once at module level. */
const IS_IOS_MOTION = typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

/** EMA smoothing factor (0–1). Lower = smoother, higher = responsive. */
const SMOOTHING_FACTOR = 0.25;

/** Minimum heading delta to trigger DOM repaint. */
const MIN_CHANGE_DEG = 0.1;

/**
 * Global magnetometer hardware detection cache.
 * null = pending, true = available, false = absent
 */
let _globalHasGyroscope = null;

/** Ensures the toast for missing compass sensor fires only once per session. */
let _noSensorToastShown = false;

export default class QiblaCompass {
    constructor() {
        this._qiblaAngle = null;
        this._heading = 0;
        this._smoothedHeading = null;
        this._orientationHandler = null;
        this._started = false;

        /** @type {boolean|null} null = pending */
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
     * Runs a proactive magnetometer hardware probe first (Generic Sensor API),
     * then falls back to the event-based detection timeout.
     */
    async start() {
        if (this._started) return;
        this._started = true;

        // Fast-path: already confirmed absent in this session
        if (_globalHasGyroscope === false) {
            this._markNoGyroscope();
            return;
        }

        // Proactive hardware probe — no behavioral analysis, no false positives
        if (_globalHasGyroscope === null) {
            const hasMagnetometer = await this._probeMagnetometerHardware();
            if (hasMagnetometer === false) {
                _globalHasGyroscope = false;
                this._markNoGyroscope();
                return;
            }
        }

        this._orientationHandler = (event) => {
            const hasWebkitHeading = typeof event.webkitCompassHeading === 'number'
                && isFinite(event.webkitCompassHeading)
                && event.webkitCompassHeading >= 0;
            const hasAlpha = typeof event.alpha === 'number';

            if (!hasWebkitHeading && !hasAlpha) return;

            let trueHeading;

            if (hasWebkitHeading) {
                // iOS: webkitCompassHeading is already True North — no declination needed
                trueHeading = event.webkitCompassHeading;
            } else {
                // Android/generic: only accept absolute orientation events
                const isAbsoluteEvent = event.type === 'deviceorientationabsolute' || event.absolute === true;
                if (!isAbsoluteEvent) return;

                const rawHeading = 360 - event.alpha;
                if (!Number.isFinite(rawHeading)) return;

                trueHeading = this._applyDeclination(rawHeading);
            }

            if (!this._receivedOrientation) {
                this._receivedOrientation = true;
                this._hasGyroscope = true;
                _globalHasGyroscope = true;
                this._clearGyroDetectTimer();
            }

            this._heading = this._smoothHeading(trueHeading);
            this._scheduleUpdate();
        };

        if (typeof DeviceOrientationEvent !== 'undefined') {
            this._listenOrientation();
        } else {
            this._markNoGyroscope();
        }

        // iOS sensors may take longer to warm up after permission is granted.
        // Give extra headroom so we don't prematurely mark the sensor as absent.
        const timeout = IS_IOS_MOTION ? 3000 : GYRO_DETECT_TIMEOUT_MS;
        this._gyroDetectTimer = setTimeout(() => {
            if (!this._receivedOrientation) {
                this._markNoGyroscope();
            }
        }, timeout);
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

    /**
     * Proactively checks magnetometer hardware availability via the Generic
     * Sensor API before attaching DeviceOrientation listeners.
     * This is hardware detection — immune to user motion false positives.
     *
     * @returns {Promise<boolean|null>} true = present, false = absent, null = unknown
     * @private
     */
    async _probeMagnetometerHardware() {
        // Try AbsoluteOrientationSensor (Chrome 67+ Android, requires magnetometer)
        if (typeof AbsoluteOrientationSensor !== 'undefined') {
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 1 });
                await new Promise((resolve, reject) => {
                    sensor.addEventListener('error', (e) => reject(e.error), { once: true });
                    sensor.addEventListener('reading', () => { sensor.stop(); resolve(); }, { once: true });
                    sensor.start();
                    // Short timeout: if no reading in 800ms, still consider hardware present
                    // (user may be stationary). We only fail on explicit hardware errors.
                    setTimeout(() => { sensor.stop(); resolve(); }, 800);
                });
                return true;
            } catch (e) {
                if (e.name === 'NotSupportedError' || e.name === 'NotReadableError') {
                    return false; // Hardware confirmed absent
                }
                // SecurityError / NotAllowedError = can't determine, fall through
            }
        }

        // Try Magnetometer API directly (Chrome 67+)
        if (typeof Magnetometer !== 'undefined') {
            try {
                const mag = new Magnetometer({ frequency: 1 });
                await new Promise((resolve, reject) => {
                    mag.addEventListener('error', (e) => reject(e.error), { once: true });
                    mag.addEventListener('reading', () => { mag.stop(); resolve(); }, { once: true });
                    mag.start();
                    setTimeout(() => { mag.stop(); resolve(); }, 800);
                });
                return true;
            } catch (e) {
                if (e.name === 'NotSupportedError' || e.name === 'NotReadableError') {
                    return false;
                }
            }
        }

        // Generic Sensor API not available; rely on event-based fallback 
        return null;
    }

    /** @private */
    _markNoGyroscope() {
        this._hasGyroscope = false;
        _globalHasGyroscope = false;
        this._clearGyroDetectTimer();
        this._showNoSensorToast();
        this._update();
    }

    /**
     * Fires a one-time toast informing the user their device lacks a compass sensor.
     * @private
     */
    _showNoSensorToast() {
        if (_noSensorToastShown) return;
        _noSensorToastShown = true;
        Notification.warning(t('pages/compass-page:toast_no_sensor'));
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
        updateCompassUI(this._heading, this._qiblaAngle, this._hasGyroscope);
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
