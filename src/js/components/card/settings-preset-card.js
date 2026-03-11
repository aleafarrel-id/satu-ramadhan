/**
 * Settings Preset Card Component
 * Renders the "PENGATURAN JADWAL" card on the settings page.
 * Shows the active organization, its start/end dates,
 * and a button to open the Preset Manager modal.
 *
 * Follows the same render/destroy pattern as settings-loc-card.js.
 */

import { getActivePreset } from '../../modules/schedule/ramadhan.js';
import { showPresetManagerModal } from '../modal/preset-manager-modal.js';

/* ── State ── */
let _container = null;

/* ── Helpers ── */

/**
 * Format a YYYY-MM-DD date string for display.
 * @param {string} dateStr - e.g. "2026-02-19"
 * @returns {string} e.g. "19 Feb 2026"
 */
function formatDate(dateStr) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

/* ── Public API ── */

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

/* ── Internal ── */

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
            <div class="settings-preset-header">
                <div class="settings-preset-title">PENGATURAN JADWAL</div>
                <div class="settings-preset-icon-wrapper">
                    <i class='bx bx-calendar settings-preset-calendar-icon'></i>
                    <div class="settings-preset-status-wrapper">
                        <div class="settings-preset-body">
                            <div class="settings-preset-org">${name}</div>
                            <div class="settings-preset-dates">${startStr} — ${endStr}</div>
                        </div>
                    </div>
                </div>
            </div>
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
    `;

    _container.querySelector('#btn-manage-presets')?.addEventListener('click', () => {
        showPresetManagerModal({
            onPresetsChanged: () => refreshPresetCard(),
        });
    });
}
