/**
 * Settings Preset Card Component
 * Renders the preset settings card on the settings page.
 */

// Core & Libraries
import { getActivePreset } from '../../modules/schedule/ramadhan.js';

// Utilities & Helpers
import { makeAccessibleBtn } from '../../utils/a11y.js';
import { MONTH_NAMES_SHORT } from '../../utils/datetime.js';

// UI Components
import { showPresetManagerModal } from '../modal/preset-manager-modal.js';

let _container = null;

/**
 * Format a YYYY-MM-DD date string for display.
 * @param {string} dateStr - e.g. "2026-02-19"
 * @returns {string} e.g. "19 Feb 2026"
 */
function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${MONTH_NAMES_SHORT[parseInt(m) - 1]} ${y}`;
}

/**
 * Render the preset settings card into the given container.
 * @param {HTMLElement} container
 */
export async function render(container) {
    _container = container;
    await renderCardContent();
}

/**
 * Re-render the card content without a full page reload.
 * Called after CRUD operations in the preset manager modal.
 */
export async function refreshPresetCard() {
    if (!_container) return;
    await renderCardContent();
}

/**
 * Cleanup on page destroy.
 */
export function destroy() {
    _container = null;
}

/**
 * Build and insert the card HTML, then bind events.
 */
async function renderCardContent() {
    const preset = await getActivePreset();

    const name = preset?.name || 'Tidak diketahui';
    const startStr = preset?.startDate ? formatDate(preset.startDate) : '-';
    const endStr = preset?.endDate ? formatDate(preset.endDate) : '-';

    _container.innerHTML = `
        <div class="card settings-preset-card">
            <div class="settings-preset-header" id="settings-preset-header">
                <div class="settings-preset-title">JADWAL RAMADAN</div>
                <div class="settings-preset-icon-wrapper">
                    <i class='bx bx-calendar settings-preset-calendar-icon'></i>
                    <div class="settings-preset-status-wrapper">
                        <div class="settings-preset-body">
                            <div class="settings-preset-org">${name}</div>
                            <div class="settings-preset-dates">${startStr} — ${endStr}</div>
                        </div>
                    </div>
                    <i class='bx bx-chevron-down settings-card-chevron'></i>
                </div>
            </div>
            <div class="settings-card-collapse">
                <div class="settings-card-collapse-inner">
                    <p class="settings-preset-desc">
                        Kelola organisasi serta tanggal awal-akhir Ramadhan
                    </p>
                    <div class="settings-preset-actions">
                        <button class="btn btn--gold" id="btn-manage-presets">
                            <i class='bx bx-cog'></i>
                            <span>Kelola Preset</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const header = _container.querySelector('#settings-preset-header');
    if (header) {
        makeAccessibleBtn(header, () => {
            _container.querySelector('.settings-preset-card')?.classList.toggle('expanded');
        });
    }

    _container.querySelector('#btn-manage-presets')?.addEventListener('click', () => {
        showPresetManagerModal({
            onPresetsChanged: () => refreshPresetCard(),
        });
    });
}
