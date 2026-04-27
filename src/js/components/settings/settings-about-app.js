import { t, loadNS } from '../../core/i18n.js';

export function render(container) {
    // Force preload i18n to guarantee translations work accurately
    loadNS('components/settings/settings-about-app');

    container.innerHTML = `
        <div class="card settings-card settings-card-spacing" data-focus-group="settings-about-list" data-focus-direction="vertical">
            <div class="settings-card-header">
                <div class="settings-card-title">${t('components/settings/settings-about-app:section_about', { defaultValue: 'TENTANG APLIKASI' })}</div>
            </div>
            <div class="settings-item" id="privacy-policy-row" tabindex="0" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-shield-quarter'></i>
                    <span>${t('components/settings/settings-about-app:privacy_policy', { defaultValue: 'Kebijakan Privasi' })}</span>
                </div>
                <div class="settings-item-value">
                    <i class='bx bx-chevron-right'></i>
                </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-item" id="about-app-row" tabindex="0" data-focus-item>
                <div class="settings-item-info">
                    <i class='bx bx-info-circle'></i>
                    <span>${t('components/settings/settings-about-app:about_app', { defaultValue: 'Tentang Aplikasi' })}</span>
                </div>
                <div class="settings-item-value">
                    <i class='bx bx-chevron-right'></i>
                </div>
            </div>
        </div>
    `;
}

export function destroy() {
    // Cleanup if needed
}
