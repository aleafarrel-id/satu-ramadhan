/**
 * Qibla Info Card Component
 * Displays the Qibla angle from API and current device heading
 */

import { t } from '../../core/i18n.js';

/**
 * Render the full Qibla info card
 * @returns {string} HTML string
 */
export function renderQiblaInfoCard() {
    return `
        <div class="card qibla-info-card">
            <div class="qibla-info-card__header">
                <span>${t('components/card/qibla-info-card:title')}</span>
                <button class="btn btn--compass-guide" id="btn-compass-guide" aria-label="${t('components/card/qibla-info-card:calibration_guide')}">
                    <i class='bx bx-info-circle'></i>
                </button>
            </div>
            <div class="qibla-info-card__content">
                <div class="qibla-info-card__icon-wrapper">
                    <img src="./assets/icon/kaaba.webp" alt="Kaaba" class="qibla-info-card__icon" />
                </div>
                
                <div class="qibla-info-card__badges" id="qibla-badges-container">
                    <!-- Qibla Target Angle (API) -->
                    <div class="qibla-badge qibla-badge--filled">
                        <span class="qibla-badge__icon-circle">
                            <i class='bx bxs-compass'></i>
                        </span>
                        <span class="qibla-badge__value" id="qibla-api-val">0.0&deg;</span>
                    </div>

                    <!-- Current Device Angle -->
                    <div class="qibla-badge qibla-badge--outline" id="qibla-device-badge">
                        <span class="qibla-badge__icon-circle">
                            <i class='bx bx-mobile-alt'></i>
                        </span>
                        <span class="qibla-badge__value" id="qibla-device-val">0.0&deg;</span>
                    </div>
                </div>
            </div>
            
            <!-- Fallback text for devices without Gyroscope -->
            <div class="qibla-info-card__fallback" id="qibla-fallback-text">
                ${t('components/card/qibla-info-card:no_gyroscope')}
            </div>
        </div>
    `;
}

/**
 * Updates the values displayed in the Qibla info card
 * @param {number} heading - The device heading (0-360)
 * @param {number} qiblaAngle - The angle to the Qibla
 * @param {boolean|null} hasGyroscope - Gyro status: true/false/null (pending)
 */
export function updateQiblaInfoCard(heading, qiblaAngle, hasGyroscope = null) {
    const apiValEl = document.getElementById('qibla-api-val');
    const deviceBadgeEl = document.getElementById('qibla-device-badge');
    const deviceValEl = document.getElementById('qibla-device-val');
    const fallbackTextEl = document.getElementById('qibla-fallback-text');

    if (apiValEl && qiblaAngle !== null) {
        apiValEl.innerHTML = `${qiblaAngle.toFixed(1)}&deg;`;
    }

    if (deviceBadgeEl && deviceValEl && fallbackTextEl) {
        if (hasGyroscope === false) {
            deviceBadgeEl.classList.add('is-hidden');
            fallbackTextEl.classList.add('is-visible');
        } else {
            deviceBadgeEl.classList.remove('is-hidden');
            fallbackTextEl.classList.remove('is-visible');
            deviceValEl.innerHTML = `${heading.toFixed(1)}&deg;`;
        }
    }
}
