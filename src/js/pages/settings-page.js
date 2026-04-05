/* Lazy-loaded CSS — only fetched when this page module is imported */
import '../../css/pages/settings.css';
import '../../css/components/modal/confirm-modal.css';
import '../../css/components/modal/preset-manager-modal.css';
import '../../css/components/modal/language-selector-modal.css';

import { CONFIG } from '../config/version-config.js';

import * as settingsPanel from '../components/settings/settings-panel.js';
import * as settingsQuranPanel from '../components/settings/settings-quran-panel.js';
import * as settingsLocCard from '../components/settings/settings-loc-card.js';
import * as settingsPresetCard from '../components/settings/settings-preset-card.js';
import * as settingsDisplayPanel from '../components/settings/settings-display-panel.js';
import { t, loadNS } from '../core/i18n.js';

/* --- STATE --- */
let _container = null;

/* --- LIFECYCLE --- */

/**
 * Renders the main settings page shell and delegates rendering
 * to the location card, preset card, and application settings panel components.
 *
 * @param {HTMLElement} container - The DOM element to render into.
 */
export async function render(container) {
    _container = container;

    await loadNS('pages/settings-page');
    await loadNS('components/settings/settings-loc-card');
    await loadNS('components/settings/settings-preset-card');
    await loadNS('components/settings/settings-display-panel');
    await loadNS('components/settings/settings-panel');
    await loadNS('components/settings/settings-quran-panel');
    await loadNS('components/ui/header');

    _container.innerHTML = `
        <div class="settings-page">
            <h2 class="settings-title">${t('pages/settings-page:title')}</h2>
            <div id="settings-loc-card-container"></div>
            <div id="settings-preset-card-container"></div>
            <div id="settings-display-panel-container"></div>
            <div id="settings-panel-container"></div>
            <div id="settings-quran-panel-container"></div>
            
            <p class="settings-version">${t('pages/settings-page:version_info', { appName: t('common:app_name'), version: CONFIG.version })}</p>
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

    const displayPanelContainer = document.getElementById('settings-display-panel-container');
    if (displayPanelContainer) {
        settingsDisplayPanel.render(displayPanelContainer);
    }

    const panelContainer = document.getElementById('settings-panel-container');
    if (panelContainer) {
        settingsPanel.render(panelContainer);
    }

    const quranPanelContainer = document.getElementById('settings-quran-panel-container');
    if (quranPanelContainer) {
        settingsQuranPanel.render(quranPanelContainer);
    }
}

/**
 * Disposes child components to prevent memory leaks and
 * safely nullifies the page container reference.
 */
export function destroy() {
    settingsLocCard.destroy();
    settingsPresetCard.destroy();
    settingsDisplayPanel.destroy();
    settingsPanel.destroy();
    settingsQuranPanel.destroy();
    _container = null;
}
