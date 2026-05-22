/**
 * Settings Calculation Panel Component
 * Renders the calculation method settings card on the settings page.
 */

import { getActiveMethodConfig } from '../../core/calculation-resolver.js';
import { store } from '../../core/store.js';
import { t } from '../../core/i18n.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { makeAccessibleBtn } from '../../utils/a11y.js';

let _container = null;
let _subId = null;

export async function render(container) {
    _container = container;
    await renderCardContent();
    
    // Subscribe to store to auto-update UI when settings change
    if (!_subId) {
        _subId = store.subscribe('settings.calculation', () => {
            renderCardContent();
        });
    }
}

export function refreshCalculationPanel() {
    if (_container) renderCardContent();
}

export function destroy() {
    if (_subId) {
        store.unsubscribe(_subId);
        _subId = null;
    }
    _container = null;
}

async function renderCardContent() {
    if (!_container) return;
    
    const config = getActiveMethodConfig();
    const isAuto = store.getState('settings.calculation.isAutoDetected');
    
    const modeLabel = isAuto 
        ? t('components/settings/settings-calculation-panel:mode_auto') 
        : t('components/settings/settings-calculation-panel:mode_manual');
        
    const methodName = config.name || 'Unknown';
    const shortName = config.shortName || methodName;
    
    _container.innerHTML = `
        <div class="card settings-preset-card">
            <div class="settings-preset-header" id="settings-calculation-header">
                <div class="settings-preset-title">${t('components/settings/settings-calculation-panel:section')}</div>
                <div class="settings-preset-icon-wrapper">
                    <i class='bx bx-calculator settings-preset-calendar-icon'></i>
                    <div class="settings-preset-status-wrapper">
                        <div class="settings-preset-body">
                            <div class="settings-preset-org calc-panel-org">${escapeHtml(shortName)}</div>
                            <div class="settings-preset-dates calc-panel-dates">
                                <span class="calc-panel-badge">${escapeHtml(modeLabel)}</span>
                                <span class="calc-panel-fullname">${escapeHtml(methodName)}</span>
                            </div>
                        </div>
                    </div>
                    <i class='bx bx-chevron-down settings-card-chevron'></i>
                </div>
            </div>
            <div class="settings-card-collapse">
                <div class="settings-card-collapse-inner">
                    <p class="settings-preset-desc">
                        ${t('components/settings/settings-calculation-panel:desc')}
                    </p>
                    <div class="settings-preset-actions">
                        <button class="btn btn--gold" id="btn-change-calculation">
                            <i class='bx bx-cog'></i>
                            <span>${t('components/settings/settings-calculation-panel:btn_change')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const header = _container.querySelector('#settings-calculation-header');
    if (header) {
        makeAccessibleBtn(header, () => {
            const card = _container.querySelector('.settings-preset-card');
            card?.classList.toggle('expanded');
        });
    }

    const btn = _container.querySelector('#btn-change-calculation');
    if (btn) {
        btn.addEventListener('click', async () => {
            const mod = await import('../modal/calculation-method-modal.js');
            mod.showCalculationMethodModal({
                onMethodChanged: () => refreshCalculationPanel()
            });
        });
    }
}
