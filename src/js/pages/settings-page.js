/**
 * Settings Page
 * Location selection and app preferences
 */

import { CONFIG } from '../config.js';

import * as settingsPanel from '../components/ui/settings-panel.js';
import * as settingsLocCard from '../components/ui/settings-loc-card.js';

let _container = null;

export function render(container) {
    _container = container;

    _container.innerHTML = `
        <div class="settings-page">
            <h2 class="settings-title">Pengaturan</h2>
            <div id="settings-loc-card-container"></div>
            <div id="settings-panel-container"></div>
            
            <p class="settings-version">${CONFIG.appName} v ${CONFIG.version}</p>
        </div>
    `;

    const locCardContainer = document.getElementById('settings-loc-card-container');
    if (locCardContainer) {
        settingsLocCard.render(locCardContainer);
    }

    const panelContainer = document.getElementById('settings-panel-container');
    if (panelContainer) {
        settingsPanel.render(panelContainer);
    }
}

export function destroy() {
    settingsLocCard.destroy();
    settingsPanel.destroy();
}
