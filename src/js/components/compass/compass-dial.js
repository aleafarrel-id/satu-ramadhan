/**
 * Compass UI Component
 * Generates and manages the complex compass DOM
 */

/**
 * Generates the HTML string for the compass.
 * Creates the 72 ticks dynamically to keep HTML/CSS clean.
 * @returns {string} HTML string of the compass
 */
export function renderCompass() {
    let ticksHtml = '';
    // 360 degrees / 5 degrees = 72 ticks
    for (let i = 0; i < 72; i++) {
        const angle = i * 5;
        let classes = ['compass-tick'];

        if (angle % 30 === 0) {
            classes.push('major');
        } else {
            classes.push('minor');
        }

        let labelHtml = '';

        if (angle === 0) {
            classes.push('north');
            labelHtml = '<span class="compass-label north-label">U</span>';
        } else if (angle === 90) {
            labelHtml = '<span class="compass-label">T</span>';
        } else if (angle === 180) {
            labelHtml = '<span class="compass-label">S</span>';
        } else if (angle === 270) {
            labelHtml = '<span class="compass-label">B</span>';
        }

        ticksHtml += `<div class="${classes.join(' ')}" style="transform: rotate(${angle}deg)">
            ${labelHtml}
        </div>`;
    }

    return `
        <div class="compass-container" id="compass-dial-container">
            <!-- Rotating Dial -->
            <div class="compass-dial-wrapper">
                <div class="compass-dial"></div>
                
                <div class="compass-ticks">
                    ${ticksHtml}
                </div>

                <!-- Qibla Indicator (Kaaba) placed on the dial so it rotates with it -->
                <div class="qibla-indicator-wrapper">
                    <div class="qibla-icon">
                        <img src="./assets/icon/kaaba.webp" alt="Kaaba" />
                    </div>
                </div>
            </div>

            <!-- Fixed Elements -->
            <div class="compass-inner"></div>
            
            <div class="compass-needle">
                <div class="needle-top"></div>
                <div class="needle-bottom"></div>
                <div class="needle-center"></div>
            </div>
        </div>
    `;
}

/** Cached DOM reference — survives the page's lifetime */
let _cachedContainer = null;

/**
 * Updates the compass UI angles via CSS variables
 * @param {number} heading - The device heading (0-360)
 * @param {number} qiblaAngle - The angle to the Qibla relative to True North
 */
export function updateCompassUI(heading, qiblaAngle) {
    if (!_cachedContainer || !_cachedContainer.isConnected) {
        _cachedContainer = document.getElementById('compass-dial-container');
    }
    if (!_cachedContainer) return;

    // Apply strictly via CSS variable for smooth transition and clear separation of concerns
    _cachedContainer.style.setProperty('--heading', `${heading}deg`);
    _cachedContainer.style.setProperty('--qibla-angle', `${qiblaAngle}deg`);
}
