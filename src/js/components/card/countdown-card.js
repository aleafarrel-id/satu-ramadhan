/**
 * Countdown Card Component
 * Renders the countdown timer card showing time until next prayer
 */

import { t } from '../../core/i18n.js';
import { getPrayerName } from '../../modules/prayer/prayer-times.js';

/**
 * Render the countdown card HTML
 * @param {object} prayerState - current prayer state from getCurrentPrayer()
 * @returns {string} HTML string
 */
export function renderCountdownCard(prayerState) {
    const nextName = prayerState.next ? getPrayerName(prayerState.next.key) : '--';

    return `
        <div class="card countdown">
            <div class="countdown__label">${t('components/card/countdown-card:heading', { name: nextName })}</div>
            <div class="countdown__timer">
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-hours">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:hours')}</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-minutes">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:minutes')}</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-seconds">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:seconds')}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Schedule-page variant of the countdown card.
 * Uses scd-* IDs so home's startCountdown callback never conflicts.
 * @param {object} prayerState - current prayer state from getCurrentPrayer()
 * @returns {string} HTML string
 */
export function renderCountdownCardSchedule(prayerState) {
    const nextName = prayerState.next ? getPrayerName(prayerState.next.key) : '--';

    return `
        <div class="card countdown">
            <div class="countdown__label">${t('components/card/countdown-card:heading', { name: nextName })}</div>
            <div class="countdown__timer">
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="scd-hours">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:hours')}</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="scd-minutes">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:minutes')}</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="scd-seconds">--</span>
                    </div>
                    <span class="countdown__unit">${t('components/card/countdown-card:seconds')}</span>
                </div>
            </div>
        </div>
    `;
}
