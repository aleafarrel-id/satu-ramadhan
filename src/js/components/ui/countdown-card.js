/**
 * Countdown Card Component
 * Renders the countdown timer card showing time until next prayer
 */

/**
 * Render the countdown card HTML
 * @param {object} prayerState - current prayer state from getCurrentPrayer()
 * @returns {string} HTML string
 */
export function renderCountdownCard(prayerState) {
    const nextName = prayerState.next?.name || '--';

    return `
        <div class="card countdown">
            <div class="countdown__label">Menuju <span class="countdown__prayer-name" id="cd-prayer-name">${nextName}</span></div>
            <div class="countdown__timer">
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-hours">--</span>
                    </div>
                    <span class="countdown__unit">JAM</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-minutes">--</span>
                    </div>
                    <span class="countdown__unit">MNT</span>
                </div>
                <span class="countdown__separator">:</span>
                <div class="countdown__column">
                    <div class="countdown__digit-box">
                        <span class="countdown__number" id="cd-seconds">--</span>
                    </div>
                    <span class="countdown__unit">DTK</span>
                </div>
            </div>
        </div>
    `;
}
