/**
 * Shortcut Card Component
 * Renders the quick access shortcut menu mimicking the countdown card style.
 */

/**
 * Render the shortcut card HTML
 * @returns {string} HTML string
 */
import { t } from '../../core/i18n.js';

const TRANSLATION_NS = 'components/card/shortcut-card';

const SHORTCUT_MENUS = [
    { id: 'tasbih', labelKey: 'menu_tasbih', icon: 'bx bx-doughnut-chart' },
    { id: 'surah', labelKey: 'menu_surah', icon: 'bx bx-book-content' },
    { id: 'juz', labelKey: 'menu_juz', icon: 'bx bx-book-open' },
    { id: 'mushaf', labelKey: 'menu_mushaf', icon: 'bx bx-book-reader' },
    { id: 'kiblat', labelKey: 'menu_kiblat', icon: 'bx bx-compass' },
];

export function renderShortcutCard() {
    const menusHtml = SHORTCUT_MENUS.map(menu => `
        <button class="shortcut-card__item" id="shortcut-${menu.id}" type="button" aria-label="${t(`${TRANSLATION_NS}:${menu.labelKey}`)}">
            <div class="shortcut-card__icon-box">
                <i class="${menu.icon}" aria-hidden="true"></i>
            </div>
            <span class="shortcut-card__name">${t(`${TRANSLATION_NS}:${menu.labelKey}`)}</span>
        </button>
    `).join('');

    return `
        <div class="card countdown shortcut-card">
            <div class="countdown__label">${t(`${TRANSLATION_NS}:title`)}</div>
            <div class="shortcut-card__menu-container">
                <div class="shortcut-card__menu-flex">
                    ${menusHtml}
                </div>
            </div>
        </div>
    `;
}
