/**
 * Tasbih Page Controller
 * Hidden left-swipe compartment for digital tasbih (dhikr counter).
 *
 * Architecture:
 * - #tasbih-panel  → outer fixed wrapper (receives .tasbih-active class for pointer-events)
 * - .tasbih-page   → inner animated div (receives translateX transform via CSS)
 *
 * State is persisted via store.js across app restarts.
 */

import '../../css/pages/tasbih.css';
import '../../css/components/tasbih/tasbih-beads.css';

import { store } from '../core/store.js';
import tasbihData from '../../data/tasbih.json';
import { registerModalDismiss, unregisterModalDismiss } from '../modules/system/back-handler.js';
import { t, loadNS } from '../core/i18n.js';
import { showConfirmModal } from '../components/modal/confirm-modal.js';
import { showTasbihPresetModal } from '../components/modal/tasbih-preset-modal.js';
import { escapeHtml } from '../utils/sanitize.js';
import { trapFocus } from '../utils/a11y.js';
import { impact, doubleVibrate, lockVibrate } from '../modules/system/haptic.js';
import { preloadAudio, playSingleClick, playDoubleClick } from '../modules/tasbih/tasbih-audio.js';
import { isWeb } from '../modules/system/platform.js';
import * as notif from '../modules/notification/notification.js';
import { setStatusBarOverride, clearStatusBarOverride } from '../core/theme.js';

// ── Module State ───────────────────────────────────────────────────────────────

let _container = null;
let _isOpen = false;
let _releasePanelFocus = null;
let _releaseSelectorFocus = null;
let _sessions = {};
let _count = 0;
let _round = 1;
let _totalCount = 0;
let _physicalCount = 0;
let _activeZikirId = 'subhanallah';
let _activeZikir = null;
let _beadPositions = [];
let _svgW = 390;
let _svgH = 460;
let _resizeObserver = null;
let _feedbackMode = 'haptic';
let _isLocked = false;
let _unsubscribeLanguage = null;

function _getAllZikir() {
    const customPresets = store.getState('tasbih.customPresets') || [];
    return [...customPresets, ...tasbihData];
}

/** Cached DOM element references */
const _el = {};

// ── Initialization ─────────────────────────────────────────────────────────────

/**
 * Initialize the Tasbih compartment — called once on app startup.
 * @param {HTMLElement} container — the #tasbih-panel element
 */
export async function init(container) {
    if (!container) return;
    _container = container;

    await loadNS('pages/tasbih-page');
    await loadNS('components/modal/confirm-modal');
    await loadNS('components/modal/tasbih-preset-modal');

    // Restore persisted state
    _sessions = store.getState('tasbih.sessions') || {};
    _totalCount = store.getState('tasbih.total') ?? 0;
    _physicalCount = store.getState('tasbih.physicalCount') ?? 0;
    _activeZikirId = store.getState('tasbih.activeZikir') ?? 'subhanallah';
    _activeZikir = _getAllZikir().find(z => z.id === _activeZikirId) ?? _getAllZikir()[0];
    _feedbackMode = store.getState('tasbih.feedbackMode') ?? (isWeb ? 'audio' : 'haptic');
    _isLocked = store.getState('tasbih.isLocked') ?? false;

    // Migrate from legacy single state if any
    if (Object.keys(_sessions).length === 0) {
        const legacyCount = store.getState('tasbih.count') ?? 0;
        const legacyRound = store.getState('tasbih.round') ?? 1;
        _sessions[_activeZikirId] = { count: legacyCount, round: legacyRound };
    }

    _count = _sessions[_activeZikirId]?.count ?? 0;
    _round = _sessions[_activeZikirId]?.round ?? 1;

    _renderHTML();
    _cacheElements();
    _bindEvents();
    _updateInfoCard();
    _updateBeads();
    _updateFeedbackToggleIcon();
    _updateLockIcon();
    _initAudio();

    // Listen for language changes to re-render translations seamlessly
    if (!_unsubscribeLanguage) {
        _unsubscribeLanguage = store.subscribe('settings.language', async () => {
            await loadNS('pages/tasbih-page');
            _renderHTML();
            _cacheElements();
            _bindEvents();
            _updateInfoCard();
            _updateFeedbackToggleIcon();
            _updateLockIcon();
        });
    }
}

// ── Open / Close API ──────────────────────────────────────────────────────────

/** Open the Tasbih panel (called from gesture module). */
export function open() {
    if (_isOpen || !_container) return;
    _isOpen = true;

    // Tasbih has a white/cream background — switch status bar icons to dark
    // so they are readable when the teal (light) theme is active.
    setStatusBarOverride('tasbih');

    _container.setAttribute('aria-hidden', 'false');
    _container.removeAttribute('inert');
    _container.classList.add('tasbih-active');

    registerModalDismiss(close);
    _releasePanelFocus = trapFocus(_container);
}

/** Close the Tasbih panel (back button / swipe left / hardware back). */
export function close() {
    if (!_isOpen || !_container) return;
    _isOpen = false;

    // Restore default theme status bar style when closing Tasbih.
    clearStatusBarOverride('tasbih');

    // Release focus trap — restores focus to the element that was active
    // before the panel was opened (better than a bare blur() to body).
    _releasePanelFocus?.();
    _releasePanelFocus = null;

    _container.classList.remove('tasbih-active');
    _container.setAttribute('aria-hidden', 'true');
    _container.setAttribute('inert', '');

    unregisterModalDismiss(close);
}

/** Returns whether the panel is currently open. */
export function isOpen() {
    return _isOpen;
}

// ── Render ────────────────────────────────────────────────────────────────────

/** Build the complete DOM tree. Runs once on init. */
function _renderHTML() {
    _container.innerHTML = `
        <div class="tasbih-page">

            <!-- Geometric background pattern layer -->
            <div class="tasbih-bg-pattern" aria-hidden="true"></div>

            <!-- ── Header ── -->
            <header class="tasbih-header">
                <button class="tasbih-back-btn" id="tb-back" aria-label="${t('pages/tasbih-page:back')}">
                    <i class="bx bx-left-arrow-alt"></i>
                </button>
                <span class="tasbih-header-title">${t('pages/tasbih-page:title')}</span>
                <button class="tasbih-settings-btn" id="tb-settings" aria-label="${t('pages/tasbih-page:select_dzikir')}">
                    <i class="bx bx-menu"></i>
                </button>
            </header>

            <!-- ── Info Card (name + counter) ── -->
            <div class="tasbih-info-card">
                <div class="tasbih-info-header">
                    <div class="tasbih-info-name" id="tb-name"></div>
                    <button class="tasbih-add-btn" id="tb-edit" aria-label="${t('pages/tasbih-page:change_dzikir')}">
                        <i class="bx bx-plus"></i>
                        <span>${t('pages/tasbih-page:add', { defaultValue: 'Tambah' })}</span>
                    </button>
                </div>
                
                <div class="tasbih-info-body">
                    <!-- Spinner + count/target -->
                    <div class="tasbih-counter-row">
                        <svg class="tasbih-counter-spinner" viewBox="0 0 32 32" aria-hidden="true">
                            <circle class="tasbih-spinner-track" cx="16" cy="16" r="13"
                                stroke-dasharray="81.7" stroke-dashoffset="0"/>
                            <circle class="tasbih-spinner-progress" id="tb-spinner" cx="16" cy="16" r="13"
                                stroke-dasharray="81.7" stroke-dashoffset="81.7"/>
                        </svg>
                        <div class="tasbih-counter-display">
                            <span class="tasbih-count-number" id="tb-count">0</span>
                            <span class="tasbih-count-separator">/</span>
                            <span class="tasbih-count-target" id="tb-target">33</span>
                        </div>
                    </div>
                    <div class="tasbih-info-label" id="tb-label"></div>
                </div>

                <div class="tasbih-info-footer">
                    <!-- Round + Total stats -->
                    <div class="tasbih-stats-row">
                        <div class="tasbih-stat-item">
                            <span class="tasbih-stat-label">${t('pages/tasbih-page:round')}</span>
                            <span class="tasbih-stat-value" id="tb-round">01</span>
                        </div>
                        <div class="tasbih-stat-item">
                            <span class="tasbih-stat-label">${t('pages/tasbih-page:total')}</span>
                            <span class="tasbih-stat-value" id="tb-total">0</span>
                        </div>
                    </div>
                    
                    <!-- Actions -->
                    <div class="tasbih-actions-row">
                        <button class="tasbih-action-btn action-clean" id="tb-clean">
                            <i class="bx bx-trash"></i> <span>${t('pages/tasbih-page:clean_total')}</span>
                        </button>
                        <button class="tasbih-action-btn action-reset" id="tb-reset">
                            <i class="bx bx-revision"></i> <span>${t('pages/tasbih-page:reset_round')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- ── Beads Visual Area (full tap zone) ── -->
            <div class="tasbih-beads-area" id="tb-beads-area">
            <!-- ── Feedback Mode Toggle + Lock (Top Right Capsule) ── -->
            <div class="tasbih-controls-capsule">
                <button class="tasbih-lock-btn" id="tb-lock-toggle"
                    aria-label="${t('pages/tasbih-page:toggle_lock', { defaultValue: 'Kunci / Buka Kunci Tasbih' })}">
                    <i class="bx bx-lock-open"></i>
                </button>
                <div class="tasbih-controls-divider"></div>
                <button class="tasbih-feedback-btn" id="tb-feedback-toggle"
                    aria-label="${t('pages/tasbih-page:toggle_feedback', { defaultValue: 'Ganti mode umpan balik' })}">
                    <i class="bx bx-mobile-vibration"></i>
                </button>
            </div>
            </div>

            <!-- ── Floating Navigation (Bottom Left) ── -->
            <div class="tasbih-fab-nav">
                <button class="tasbih-fab-btn" id="tb-prev" aria-label="Previous">
                    <i class="bx bx-chevron-left"></i>
                </button>
                <div class="tasbih-fab-divider"></div>
                <button class="tasbih-fab-btn" id="tb-next" aria-label="Next">
                    <i class="bx bx-chevron-right"></i>
                </button>
            </div>

             <!-- ── Dzikir Selector Bottom Sheet ── -->
            <div class="tasbih-selector-modal" id="tb-selector-modal" role="dialog"
                aria-label="${t('pages/tasbih-page:select_dzikir')}" aria-modal="true">
                <div class="tasbih-selector-content">
                    <div class="tasbih-selector-header">
                        <h3 class="tasbih-selector-title">${t('pages/tasbih-page:select_dzikir')}</h3>
                    </div>
                    <div class="tasbih-list" id="tb-list" role="listbox">
                        ${_buildListHTML()}
                    </div>
                </div>
            </div>

        </div>
    `;
}

/**
 * Rebuild the SVG arc of wooden beads based on dynamic width/height.
 */
function _rebuildBeadsSVG() {
    if (!_el.beadsArea) return;

    const W = _svgW;
    const H = _svgH;

    // Dynamic Bead Radius based on screen width (baseline 390px = 18px radius)
    // Ensures beads scale down gracefully on small screens without becoming too small (min 13px)
    const BEAD_R = Math.min(22, Math.max(13, 18 * (W / 390)));

    // For smartphone (< 430px) keep 12 beads. For larger screens, add extra beads gradually (max 16).
    const numBeads = W > 430 ? Math.min(16, 12 + Math.floor((W - 430) / 80)) : 12;

    _beadPositions = [];

    // Pick specific slots for the beads along a curve
    for (let i = 0; i < numBeads; i++) {
        let t_linear = (i - 1) / (numBeads - 2);
        if (i === 0) t_linear = -0.3;
        if (i === numBeads - 1) t_linear = 1.3;

        let t_x = t_linear;
        if (t_linear > 0 && t_linear <= 1) {
            t_x = Math.pow(t_linear, 0.75);
        }

        const x = W * 0.0 + t_x * (W * 1.0);
        const t_clamped = Math.max(0, t_x);
        const y = H * 0.4 + Math.pow(t_clamped, 3) * H * 0.55;
        _beadPositions.push({ x, y });
    }

    // Calculate full smooth path string matching bead equations
    const cordP = [];
    for (let i = 0; i <= 50; i++) {
        let t = -0.3 + (i / 50) * 1.6;
        const x = W * 0.0 + t * (W * 1.0);
        const t_clamped = Math.max(0, t);
        const y = H * 0.4 + Math.pow(t_clamped, 3) * H * 0.55;
        cordP.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const cordD = `M ${cordP.join(' L ')}`;

    // Build bead elements (DOM elements based on numBeads)
    const beadsHTML = Array.from({ length: numBeads }).map((_, i) => {
        const pos = _beadPositions[i];
        return `
            <g class="bead-group bead-pending" id="tb-bead-${i}" style="transform: translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px); transition: none;">
                <circle class="bead-sphere" cx="0" cy="0" r="${BEAD_R}"/>
                <ellipse class="bead-highlight"
                    cx="${-BEAD_R * 0.3}" cy="${-BEAD_R * 0.32}"
                    rx="${BEAD_R * 0.35}" ry="${BEAD_R * 0.22}"
                    transform="rotate(-30 0 0)"/>
                <ellipse class="bead-shadow"
                    cx="${BEAD_R * 0.28}" cy="${BEAD_R * 0.3}"
                    rx="${BEAD_R * 0.3}" ry="${BEAD_R * 0.18}"
                    transform="rotate(-30 0 0)"/>
            </g>
        `;
    }).join('');

    // Selectively replace the SVG only — preserve sibling elements
    // (e.g. the feedback toggle button) that live inside beads-area.
    const existingSvg = _el.beadsArea.querySelector('.tasbih-beads-svg');
    if (existingSvg) existingSvg.remove();

    const svgMarkup = `
        <svg class="tasbih-beads-svg" viewBox="0 0 ${W} ${H}">
            <defs>
                <!-- Pending bead: warm wooden tan -->
                <radialGradient id="bead-gradient-pending" cx="35%" cy="32%" r="65%">
                    <stop offset="0%"   stop-color="var(--bead-pending-1, #E8C99A)"/>
                    <stop offset="45%"  stop-color="var(--bead-pending-2, #C4956A)"/>
                    <stop offset="100%" stop-color="var(--bead-pending-3, #8B6347)"/>
                </radialGradient>
                <!-- Counted bead: slightly muted to show it's been passed -->
                <radialGradient id="bead-gradient-counted" cx="35%" cy="32%" r="65%">
                    <stop offset="0%"   stop-color="var(--bead-counted-1, #D4B588)"/>
                    <stop offset="45%"  stop-color="var(--bead-counted-2, #A87C56)"/>
                    <stop offset="100%" stop-color="var(--bead-counted-3, #6E4D30)"/>
                </radialGradient>
                <!-- Active bead: warm glowing highlight -->
                <radialGradient id="bead-gradient-active" cx="30%" cy="28%" r="70%">
                    <stop offset="0%"   stop-color="var(--bead-active-1, #F5DFB8)"/>
                    <stop offset="40%"  stop-color="var(--bead-active-2, #DBA96D)"/>
                    <stop offset="100%" stop-color="var(--bead-active-3, #9A6A3A)"/>
                </radialGradient>
                <!-- Marker bead: dark, like the separator bead on a real tasbih -->
                <radialGradient id="bead-gradient-marker" cx="35%" cy="32%" r="65%">
                    <stop offset="0%"   stop-color="var(--bead-marker-1, #555555)"/>
                    <stop offset="50%"  stop-color="var(--bead-marker-2, #2A2A2A)"/>
                    <stop offset="100%" stop-color="var(--bead-marker-3, #111111)"/>
                </radialGradient>
            </defs>

            <!-- The cord string running through beads -->
            <path class="tasbih-cord" d="${cordD}"/>

            <!-- All beads -->
            ${beadsHTML}
        </svg>
    `;

    // Insert SVG before the first child (toggle button) to keep z-order correct
    const template = document.createElement('template');
    template.innerHTML = svgMarkup.trim();
    _el.beadsArea.prepend(template.content.firstElementChild);
}

/** Build dzikir list items for the selector sheet. */
function _buildListHTML() {
    return _getAllZikir().map(z => {
        const isCustom = z.id.startsWith('custom_');
        const name = z.id === 'custom' ? t('pages/tasbih-page:custom_dzikir_name') : escapeHtml(z.name);
        const targetText = z.target > 0
            ? t('pages/tasbih-page:target', { value: z.target + 'x' })
            : t('pages/tasbih-page:target', { value: t('pages/tasbih-page:target_free') });

        let rightSideHtml = '';
        if (isCustom) {
            rightSideHtml = `
                <button class="tb-list-action edit-btn" aria-label="${t('common:edit')}"><i class="bx bx-pencil"></i></button>
                <button class="tb-list-action delete-btn" aria-label="${t('common:delete')}"><i class="bx bx-trash"></i></button>
            `;
        } else if (z.arabic) {
            rightSideHtml = `<span class="tasbih-list-item-arabic">${z.arabic}</span>`;
        }

        return `
        <div class="tasbih-list-item ${z.id === _activeZikirId ? 'selected' : ''}" data-id="${z.id}" role="option" aria-selected="${z.id === _activeZikirId}" tabindex="0">
            <div class="tasbih-list-item-header">
                <div class="tasbih-list-item-info">
                    <span class="tasbih-list-item-name">${name}</span>
                    <span class="tasbih-list-item-target">${targetText}</span>
                </div>
                <div class="tasbih-list-item-right">
                    ${rightSideHtml}
                </div>
            </div>
            <div class="tb-inline-container" id="inline-${z.id}"></div>
        </div>
    `}).join('');
}

// ── Element Caching ────────────────────────────────────────────────────────────

function _cacheElements() {
    _el.page = _container.querySelector('.tasbih-page');
    _el.backBtn = _container.querySelector('#tb-back');
    _el.settingsBtn = _container.querySelector('#tb-settings');
    _el.editBtn = _container.querySelector('#tb-edit');
    _el.prevBtn = _container.querySelector('#tb-prev');
    _el.nextBtn = _container.querySelector('#tb-next');
    _el.name = _container.querySelector('#tb-name');
    _el.label = _container.querySelector('#tb-label');
    _el.count = _container.querySelector('#tb-count');
    _el.target = _container.querySelector('#tb-target');
    _el.round = _container.querySelector('#tb-round');
    _el.total = _container.querySelector('#tb-total');
    _el.spinner = _container.querySelector('#tb-spinner');
    _el.beadsArea = _container.querySelector('#tb-beads-area');
    _el.resetBtn = _container.querySelector('#tb-reset');
    _el.cleanBtn = _container.querySelector('#tb-clean');
    _el.selectorModal = _container.querySelector('#tb-selector-modal');
    _el.list = _container.querySelector('#tb-list');
    _el.feedbackToggle = _container.querySelector('#tb-feedback-toggle');
    _el.lockToggle = _container.querySelector('#tb-lock-toggle');

    if (_resizeObserver) {
        _resizeObserver.disconnect();
    }

    if (_el.beadsArea) {
        _svgW = 0;
        _svgH = 0;

        _resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    if (Math.abs(_svgW - width) > 2 || Math.abs(_svgH - height) > 2) {
                        _svgW = width;
                        _svgH = height;
                        _rebuildBeadsSVG();
                        _updateBeads(false);
                    }
                }
            }
        });
        _resizeObserver.observe(_el.beadsArea);
    }
}

// ── Event Binding ──────────────────────────────────────────────────────────────

function _bindEvents() {
    _el.backBtn.addEventListener('click', close);

    // Feedback mode toggle (haptic ↔ audio)
    _el.feedbackToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleFeedbackMode();
    });
    _el.feedbackToggle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });

    // Lock toggle
    _el.lockToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleLock();
    });
    _el.lockToggle?.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });

    // Settings opens selector
    _el.settingsBtn.addEventListener('click', _openSelector);

    // Edit opens custom preset constructor modal (Always creation mode now)
    _el.editBtn.addEventListener('click', () => {
        showTasbihPresetModal({
            onComplete: () => {
                const newActiveId = store.getState('tasbih.activeZikir') ?? 'subhanallah';
                if (newActiveId !== _activeZikirId) {
                    _changeZikir(newActiveId);
                } else {
                    _el.list.innerHTML = _buildListHTML();
                }
            }
        });
    });

    _el.prevBtn.addEventListener('click', _prevZikir);
    _el.nextBtn.addEventListener('click', _nextZikir);

    // Tap the beads area → increment counter
    let _lastTap = 0;
    let _lastShake = 0;
    const handleTap = (e) => {
        if (e.cancelable && e.type === 'touchstart') e.preventDefault();

        // Locked state: respond immediately but throttle lightly to avoid
        // touchstart + click double-fire on the same physical tap
        if (_isLocked) {
            const now = Date.now();
            if (now - _lastShake < 100) return;
            _lastShake = now;
            _shakeLockIcon();
            return;
        }

        // Throttle only applies to actual counting (prevent double-fire from
        // simultaneous touchstart + click events on the same tap)
        const now = Date.now();
        if (now - _lastTap < 80) return;
        _lastTap = now;

        _increment();
    };

    _el.beadsArea.addEventListener('click', handleTap);
    _el.beadsArea.addEventListener('touchstart', handleTap, { passive: false });

    // Reset Round
    _el.resetBtn.addEventListener('click', () => {
        _count = 0;
        _saveState();
        _updateInfoCard();
        _updateBeads();
    });

    // Clean Total
    _el.cleanBtn.addEventListener('click', () => {
        showConfirmModal({
            title: t('pages/tasbih-page:confirm_clean_title'),
            message: t('pages/tasbih-page:confirm_clean_desc'),
            confirmText: t('pages/tasbih-page:confirm_clean_yes'),
            cancelText: t('pages/tasbih-page:confirm_clean_no'),
            isDanger: true,
            theme: 'quran',
            onConfirm: () => {
                _totalCount = 0;
                _count = 0;
                _round = 1;
                _sessions = {};
                _saveState();
                _updateInfoCard(true);
                _updateBeads(true);
            }
        });
    });

    // Selector modal close
    _el.selectorModal.addEventListener('click', e => {
        if (e.target === _el.selectorModal) _closeSelector();
    });

    // Keyboard activation for list items (Enter / Space → same logic as click).
    // Guard: native buttons and links already handle Enter/Space — do not intercept.
    _el.list.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (['BUTTON', 'A', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        const item = e.target.closest('.tasbih-list-item');
        if (!item) return;
        e.preventDefault();
        item.click();
    });

    // Dzikir selection via event delegation
    _el.list.addEventListener('click', e => {
        const item = e.target.closest('.tasbih-list-item');
        if (!item) return;

        // Prevent generic selection click if interacting inside the inline form
        if (e.target.closest('.tb-inline-container')) {
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const id = item.dataset.id;

        if (editBtn) {
            e.stopPropagation();
            const zikir = _getAllZikir().find(z => z.id === id);
            _toggleInlineForm(id, zikir);
            return;
        }

        if (deleteBtn) {
            e.stopPropagation();
            const zikir = _getAllZikir().find(z => z.id === id);

            showConfirmModal({
                title: t('pages/tasbih-page:confirm_delete_preset_title', { defaultValue: 'Hapus Preset?' }),
                message: t('pages/tasbih-page:confirm_delete_preset_desc', {
                    presetName: escapeHtml(zikir?.name || 'Preset'),
                    defaultValue: "Anda yakin ingin menghapus preset '{{presetName}}'?"
                }),
                confirmText: t('common:delete'),
                cancelText: t('common:cancel'),
                isDanger: true,
                theme: 'quran',
                onConfirm: () => {
                    const customPresets = store.getState('tasbih.customPresets') || [];
                    const updated = customPresets.filter(p => p.id !== id);
                    store.setState('tasbih.customPresets', updated);

                    if (store.getState('tasbih.activeZikir') === id || _activeZikirId === id) {
                        store.setState('tasbih.activeZikir', 'subhanallah');
                        _changeZikir('subhanallah'); // Switches visually to default
                    } else {
                        _el.list.innerHTML = _buildListHTML();
                    }
                    notif.success(t('pages/tasbih-page:preset_deleted', { defaultValue: 'Preset berhasil dihapus' }));
                }
            });
            return;
        }

        _changeZikir(id);
        _closeSelector();
    });
}

// ── Counter Logic ──────────────────────────────────────────────────────────────

function _increment() {
    const target = _activeZikir.target;
    let roundComplete = false;

    if (target > 0 && _count === target) {
        // Transition tap (e.g. from 33 -> 0)
        _physicalCount++;
        _triggerFeedback('double');

        const isCustomPreset = _activeZikir.id.startsWith('custom_') || _activeZikir.id === 'custom';

        if (!isCustomPreset) {
            // Auto Next Flow for Default Presets
            const defaultTasbihs = tasbihData.filter(z => z.target > 0);
            const currentIdx = defaultTasbihs.findIndex(z => z.id === _activeZikirId);

            _animateBeadsArea();

            if (currentIdx > -1) {
                const nextId = defaultTasbihs[(currentIdx + 1) % defaultTasbihs.length].id;

                // Update current dzikir's round before transitioning
                _count = 0;
                _round++;

                // Change zikir (implicitly calls _saveState to store current round, then loads next id state)
                _changeZikir(nextId);
            }
            return; // Exit early since _changeZikir handles UI re-render
        } else {
            // Normal Round Complete for Custom Presets
            _count = 0;
            _round++;
            roundComplete = true;
        }
    } else {
        // Normal counting
        _count++;
        _totalCount++;
        _physicalCount++;
        _triggerFeedback('single');
    }

    _saveState();
    _updateInfoCard(roundComplete);
    _updateBeads(roundComplete);
    _animateBeadsArea();
}

// ── UI Update Functions ────────────────────────────────────────────────────────

/**
 * Update the info card text and spinner progress.
 * @param {boolean} [roundComplete=false]
 */
function _updateInfoCard(roundComplete = false) {
    const target = _activeZikir.target;
    const targetDisplay = target > 0 ? target : '∞';
    const circumference = 81.7; // 2 * PI * 13

    // Name + label
    const name = _activeZikir.id === 'custom' ? t('pages/tasbih-page:custom_dzikir_name') : _activeZikir.name;
    _el.name.textContent = name;

    if (_activeZikir.arabic) {
        _el.label.textContent = _activeZikir.arabic;
        _el.label.style.display = '';
    } else {
        _el.label.textContent = '';
        _el.label.style.display = 'none';
    }

    // Count number with bump animation
    _el.count.textContent = _count;
    _el.count.classList.remove('animate-bump');
    void _el.count.offsetWidth;
    _el.count.classList.add('animate-bump');

    // Target display
    _el.target.textContent = targetDisplay;

    // Round counter
    const roundStr = String(_round).padStart(2, '0');
    _el.round.textContent = roundStr;

    if (roundComplete) {
        _el.round.classList.remove('animate-round');
        void _el.round.offsetWidth;
        _el.round.classList.add('animate-round');
    }

    // Total count
    _el.total.textContent = _totalCount;

    // Circular spinner progress
    let progress = 0;
    if (target > 0) {
        progress = Math.min(_count / target, 1);
    } else {
        progress = (_count % 100) / 100;
    }

    const dashOffset = circumference - progress * circumference;
    _el.spinner.style.strokeDashoffset = dashOffset;
}

/**
 * Update bead visual states and physical sliding positions.
 * Implements infinite conveyor belt (Top to Bottom / Kiri Atas ke Kanan Bawah)
 */
function _updateBeads(roundComplete = false) {
    if (_beadPositions.length === 0) return;

    const totalBeads = _beadPositions.length;

    for (let i = 0; i < totalBeads; i++) {
        const beadEl = _container.querySelector(`#tb-bead-${i}`);
        if (!beadEl) continue;

        // Use _physicalCount to ensure the animation never jumps back when _totalCount resets!
        // (i + _physicalCount) % totalBeads means they flow from Slot 0 -> Slot totalBeads-1
        const nextSlot = (i + _physicalCount) % totalBeads;
        const pos = _beadPositions[nextSlot];

        // Slot 0 is the left-offscreen holding area. 
        // Whenever a bead enters slot 0, it teleported from right-offscreen.
        if (nextSlot === 0) {
            beadEl.style.transition = 'none';
            beadEl.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
        } else {
            beadEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            beadEl.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
        }

        // Color coding (optional realism). Make active beads darker
        beadEl.classList.remove('bead-counted', 'bead-active', 'bead-pending');
        if (nextSlot >= totalBeads - 4 && nextSlot <= totalBeads - 2) {
            beadEl.classList.add('bead-active'); // At junction point (kanan bawah)
        } else {
            beadEl.classList.add('bead-pending');
        }
    }
}

/** Brief ripple on the beads area for tactile feel */
function _animateBeadsArea() {
    _el.beadsArea.classList.remove('ripple-effect');
    void _el.beadsArea.offsetWidth;
    _el.beadsArea.classList.add('ripple-effect');
    _el.beadsArea.addEventListener('animationend', () => {
        _el.beadsArea.classList.remove('ripple-effect');
    }, { once: true });
}

// ── Dzikir Selector ────────────────────────────────────────────────────────────

function _openSelector() {
    _el.selectorModal.classList.add('active');
    registerModalDismiss(_closeSelector);
    _releaseSelectorFocus = trapFocus(_el.selectorModal);
}

function _closeSelector() {
    _el.selectorModal.classList.remove('active');
    unregisterModalDismiss(_closeSelector);
    _releaseSelectorFocus?.();
    _releaseSelectorFocus = null;
    setTimeout(() => {
        _closeAllInlineForms();
    }, 300);
}

// ── Change Zikir Logic & Inline Editing ────────────────────────────────────────

let _openInlineId = null;

function _closeAllInlineForms() {
    if (_openInlineId) {
        const container = _el.list.querySelector(`#inline-${_openInlineId}`);
        if (container) {
            container.innerHTML = '';
        }
        _openInlineId = null;
    }
}

function _toggleInlineForm(id, zikir) {
    if (_openInlineId === id) {
        _closeAllInlineForms();
        return;
    }

    _closeAllInlineForms();
    _openInlineId = id;

    const container = _el.list.querySelector(`#inline-${id}`);
    if (!container) return;

    container.innerHTML = `
        <div class="tb-inline-form">
            <div class="tb-inline-form-group">
                <label class="tb-inline-label">${t('components/modal/tasbih-preset-modal:form_name_label')}</label>
                <input type="text" class="tb-inline-input" id="inline-name-${id}" value="${escapeHtml(zikir.name)}">
            </div>
            <div class="tb-inline-form-group">
                <label class="tb-inline-label">${t('components/modal/tasbih-preset-modal:form_target_label')}</label>
                <input type="number" class="tb-inline-input" id="inline-target-${id}" value="${zikir.target}">
            </div>
            <div class="tb-inline-actions">
                <button class="tb-inline-btn tb-inline-btn--outline cancel-inline">${t('common:cancel')}</button>
                <button class="tb-inline-btn tb-inline-btn--primary save-inline">${t('common:save')}</button>
            </div>
        </div>
    `;

    container.querySelector('.cancel-inline').addEventListener('click', (e) => {
        e.stopPropagation();
        _closeAllInlineForms();
    });

    container.querySelector('.save-inline').addEventListener('click', (e) => {
        e.stopPropagation();

        const nameVal = container.querySelector(`#inline-name-${id}`).value.trim();
        const targetVal = parseInt(container.querySelector(`#inline-target-${id}`).value.trim() || '0', 10);

        if (!nameVal) {
            notif.warning(t('components/modal/tasbih-preset-modal:err_name_empty'));
            return;
        }

        impact('light');
        const finalTarget = isNaN(targetVal) || targetVal < 0 ? 0 : targetVal;

        const customPresets = store.getState('tasbih.customPresets') || [];
        const presetIdx = customPresets.findIndex(p => p.id === id);
        if (presetIdx > -1) {
            customPresets[presetIdx].name = nameVal;
            customPresets[presetIdx].target = finalTarget;
            store.setState('tasbih.customPresets', customPresets);

            // Update running memory if editing the currently active dzikir
            if (id === _activeZikirId) {
                _activeZikir = customPresets[presetIdx];
                if (_count > _activeZikir.target && _activeZikir.target > 0) {
                    _count = 0;
                    _round = 1;
                    _saveState();
                }
            }

            _updateInfoCard();
            _el.list.innerHTML = _buildListHTML();
            _openInlineId = null;
            notif.success(t('components/modal/tasbih-preset-modal:preset_saved', { defaultValue: 'Preset berhasil disimpan' }));
        }
    });

    setTimeout(() => {
        const input = container.querySelector(`#inline-name-${id}`);
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
}

function _changeZikir(id) {
    if (_activeZikirId === id && _getAllZikir().length === _el.list.children.length) return;

    // Save previous zikir state before switching
    _saveState();

    _activeZikirId = id;
    _activeZikir = _getAllZikir().find(z => z.id === id) ?? _getAllZikir()[0];

    // Load newly selected zikir state
    _count = _sessions[_activeZikirId]?.count ?? 0;
    _round = _sessions[_activeZikirId]?.round ?? 1;

    // Validate bounds logic
    if (_count > (_activeZikir.target) && _activeZikir.target > 0) {
        // Hard reset if we switch to a smaller target and overlap
        _count = 0;
        _round = 1;
    } else if (isNaN(_count)) {
        _count = 0;
        _round = 1;
    }

    // Always rebuild list HTML to reflect newly added custom presets
    _el.list.innerHTML = _buildListHTML();

    _saveState();
    _updateInfoCard();
    _updateBeads();
}

// ── Persistence ────────────────────────────────────────────────────────────────

function _saveState() {
    if (!_sessions[_activeZikirId]) _sessions[_activeZikirId] = { count: 0, round: 1 };
    _sessions[_activeZikirId].count = _count;
    _sessions[_activeZikirId].round = _round;

    store.setState('tasbih.sessions', _sessions);
    store.setState('tasbih.total', _totalCount);
    store.setState('tasbih.physicalCount', _physicalCount);
    store.setState('tasbih.activeZikir', _activeZikirId);
}

function _prevZikir() {
    const all = _getAllZikir();
    let index = all.findIndex(z => z.id === _activeZikirId);
    if (index === -1) index = 0;
    index = (index - 1 + all.length) % all.length;
    _changeZikir(all[index].id);
}

function _nextZikir() {
    const all = _getAllZikir();
    let index = all.findIndex(z => z.id === _activeZikirId);
    if (index === -1) index = 0;
    index = (index + 1) % all.length;
    _changeZikir(all[index].id);
}

// ── Feedback Mode (Haptic / Audio) ─────────────────────────────────────────────

/**
 * Preloads audio assets for SFX feedback.
 * Non-blocking — failures are swallowed so tasbih still works.
 */
async function _initAudio() {
    try {
        await preloadAudio();
    } catch (e) {
        console.warn('Tasbih audio preload failed:', e);
    }
}

/**
 * Unified feedback dispatcher — routes to haptic or audio
 * based on the current feedback mode.
 * @param {'single'|'double'} type - 'single' for normal tap, 'double' for round complete
 */
function _triggerFeedback(type) {
    if (_feedbackMode === 'audio') {
        if (type === 'double') {
            playDoubleClick();
        } else {
            playSingleClick();
        }
    } else {
        // Haptic mode (default on native)
        if (type === 'double') {
            doubleVibrate();
        } else {
            impact('light');
        }
    }
}

/**
 * Toggles between haptic and audio feedback modes.
 * Persists preference and updates the UI indicator.
 */
function _toggleFeedbackMode() {
    _feedbackMode = _feedbackMode === 'haptic' ? 'audio' : 'haptic';
    store.setState('tasbih.feedbackMode', _feedbackMode);
    _updateFeedbackToggleIcon();

    // Provide immediate tactile confirmation when switching TO haptic
    if (_feedbackMode === 'haptic') {
        impact('light');
    } else {
        playSingleClick();
    }
}

/**
 * Syncs the toggle button's icon and visual state with the current mode.
 * - Haptic mode  → vibration icon (default look)
 * - Audio mode   → volume icon + accent highlight
 */
function _updateFeedbackToggleIcon() {
    if (!_el.feedbackToggle) return;

    const icon = _el.feedbackToggle.querySelector('i');
    const isAudio = _feedbackMode === 'audio';

    // Swap icon class
    icon.className = isAudio ? 'bx bx-volume-full' : 'bx bx-mobile-vibration';

    // Toggle accent highlight
    _el.feedbackToggle.classList.toggle('mode-audio', isAudio);

    // Micro-animation on icon change
    _el.feedbackToggle.classList.add('animating');
    _el.feedbackToggle.addEventListener('animationend', () => {
        _el.feedbackToggle.classList.remove('animating');
    }, { once: true });
}

/**
 * Toggles the tasbih lock state.
 */
function _toggleLock() {
    _isLocked = !_isLocked;
    store.setState('tasbih.isLocked', _isLocked);
    _updateLockIcon();

    if (_isLocked) {
        impact('light');
    }
}

/**
 * Syncs the lock button icon and visual state.
 */
function _updateLockIcon() {
    if (!_el.lockToggle) return;

    const icon = _el.lockToggle.querySelector('i');
    if (_isLocked) {
        icon.className = 'bx bx-lock';
        _el.lockToggle.classList.add('mode-locked');
        _el.lockToggle.setAttribute('aria-pressed', 'true');
    } else {
        icon.className = 'bx bx-lock-open';
        _el.lockToggle.classList.remove('mode-locked');
        _el.lockToggle.setAttribute('aria-pressed', 'false');
    }
}

/**
 * Plays a shake animation on the lock icon when tapped while locked.
 * Also triggers a distinctive feedback (haptic or audio depending on mode).
 */
function _shakeLockIcon() {
    if (!_el.lockToggle) return;

    // Distinctive feedback — different from single tap (light) and round complete (double)
    if (_feedbackMode === 'audio') {
        _playLockedAudioFeedback();
    } else {
        lockVibrate();
    }

    _el.lockToggle.classList.remove('shake');
    void _el.lockToggle.offsetWidth; // force reflow
    _el.lockToggle.classList.add('shake');
    _el.lockToggle.addEventListener('animationend', () => {
        _el.lockToggle.classList.remove('shake');
    }, { once: true });
}

/**
 * Synthesizes a short low-frequency "thud" via Web Audio API
 * to signal that the counter is locked.
 * Different timbre from the pre-recorded click/double-click SFX.
 */
function _playLockedAudioFeedback() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Low thud — 80Hz square wave for a distinctly "blocked" feel
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(80, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);

        // Medium volume, quick decay
        gainNode.gain.setValueAtTime(0.25, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.12);

        // Clean up after playback
        oscillator.addEventListener('ended', () => ctx.close().catch(() => {}));
    } catch (e) {
        // Silently fail — audio context may be unavailable
    }
}
