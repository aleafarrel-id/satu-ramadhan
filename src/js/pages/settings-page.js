/* Lazy-loaded CSS — only fetched when this page module is imported */
import '../../css/pages/settings.css';
import '../../css/components/modal/confirm-modal.css';
import '../../css/components/modal/preset-manager-modal.css';

import { CONFIG } from '../config.js';

import * as settingsPanel from '../components/settings/settings-panel.js';
import * as settingsLocCard from '../components/card/settings-loc-card.js';
import * as settingsPresetCard from '../components/card/settings-preset-card.js';

/* --- STATE --- */
let _container = null;

/* --- LIFECYCLE --- */

/**
 * Renders the main settings page shell and delegates rendering
 * to the location card, preset card, and application settings panel components.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 */
export function render(container) {
    _container = container;

    _container.innerHTML = `
        <div class="settings-page">
            <h2 class="settings-title">Pengaturan</h2>
            <div id="settings-loc-card-container"></div>
            <div id="settings-preset-card-container"></div>
            <div id="settings-panel-container"></div>
            
            <p class="settings-version">${CONFIG.appName} v ${CONFIG.version}</p>
        </div>
    `;

    const locCardContainer = document.getElementById('settings-loc-card-container');
    if (locCardContainer) {
        settingsLocCard.render(locCardContainer);
    }

    const presetCardContainer = document.getElementById('settings-preset-card-container');
    if (presetCardContainer) {
        settingsPresetCard.render(presetCardContainer);
    }

    const panelContainer = document.getElementById('settings-panel-container');
    if (panelContainer) {
        settingsPanel.render(panelContainer);
    }
}

/**
 * Disposes child components to prevent memory leaks and
 * safely nullifies the page container reference.
 */
export function destroy() {
    settingsLocCard.destroy();
    settingsPresetCard.destroy();
    settingsPanel.destroy();
    _container = null;
}
