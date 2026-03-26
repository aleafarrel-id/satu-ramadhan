/**
 * Location Search Modal (Sliding from bottom)
 * Real search with debounce, loading states, and location selection.
 */

import { searchLocation } from '../../core/location-search.js';
import { setManualLocation } from '../../core/geolocation.js';

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

import { handleManualLocationSelection } from '../../utils/location-feedback.js';
import { makeAccessibleBtn, addEscHandler, trapFocus } from '../../utils/a11y.js';

/* ── State ── */
let _overlayEl = null;
let _debounceTimer = null;
let _onLocationSelected = null;
let _currentQuery = '';
let _releaseFocus = null;

/* ── Configuration ── */
const DEBOUNCE_MS = 600; // Adjusted for Nominatim's 1 req/sec limit

/* ── Public API ── */

/**
 * Show the location search modal.
 * @param {object} [options]
 * @param {Function} [options.onLocationSelected] - Called with the selected location object
 */
export function showLocationSearchModal({ onLocationSelected } = {}) {
    if (_overlayEl) removeModal();

    _onLocationSelected = onLocationSelected || null;
    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance sliding animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Trap focus inside modal
    _releaseFocus = trapFocus(_overlayEl);

    // Bind overlay dismiss (click outside modal content)
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) hideModal();
    });

    // ── Bind: Escape to close ──
    addEscHandler(_overlayEl, hideModal);

    // Bind search input with debounce
    const searchInput = _overlayEl.querySelector('.loc-search-input');
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        handleSearchInput(query);
    });

    // Auto focus after animation
    setTimeout(() => searchInput?.focus(), 300);
}

/**
 * Hide modal with exit animation
 */
export function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    // Clear pending debounce
    if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
    }
    _currentQuery = '';

    const sheet = _overlayEl.querySelector('.loc-search-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    // Safety: force remove after animation
    setTimeout(removeModal, 450);
}

/* ── Internal Helpers ── */

function removeModal() {
    if (_releaseFocus) {
        _releaseFocus();
        _releaseFocus = null;
    }
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    _onLocationSelected = null;
    unregisterModalDismiss(hideModal);
}

/**
 * Handle debounced search input
 * @param {string} query
 */
function handleSearchInput(query) {
    if (_debounceTimer) clearTimeout(_debounceTimer);

    const resultsEl = _overlayEl?.querySelector('.loc-search-results');
    if (!resultsEl) return;

    _currentQuery = query;

    if (query.length < 2) {
        resultsEl.innerHTML = renderPlaceholder();
        return;
    }

    // Show loading state immediately
    resultsEl.innerHTML = renderLoading();

    // Debounce the actual search
    _debounceTimer = setTimeout(async () => {
        const queryForThisSearch = query;
        try {
            const results = await searchLocation(query);

            // Guard: modal closed or user typed something new while searching (Race condition)
            if (!_overlayEl || _currentQuery !== queryForThisSearch) return;

            if (results.length === 0) {
                resultsEl.innerHTML = renderEmpty(query);
            } else {
                resultsEl.innerHTML = results.map(renderResultItem).join('');
                bindResultItems(resultsEl, results);
            }
        } catch {
            if (!_overlayEl) return;
            resultsEl.innerHTML = renderError();
        }
    }, DEBOUNCE_MS);
}

/**
 * Bind click listeners to result items
 * @param {HTMLElement} container
 * @param {Array<object>} results
 */
function bindResultItems(container, results) {
    const items = container.querySelectorAll('.loc-search-item');

    items.forEach((item, index) => {
        makeAccessibleBtn(item, async () => {
            const selected = results[index];
            if (!selected) return;

            // Save to storage
            await setManualLocation(selected);
            await handleManualLocationSelection(selected);

            // Invoke callback before closing
            const callback = _onLocationSelected;
            hideModal();
            callback?.(selected);
        });
    });
}

/* ── Render Functions ── */

function renderPlaceholder() {
    return `
        <div class="loc-search-placeholder">
            <i class='bx bx-search loc-search-placeholder-icon'></i>
            <span>Mulai ketik nama lokasi...</span>
        </div>
    `;
}

function renderLoading() {
    return `
        <div class="loc-search-loading">
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>Mencari lokasi...</span>
        </div>
    `;
}

function renderEmpty(query) {
    return `
        <div class="loc-search-placeholder">
            <i class='bx bx-map-alt loc-search-placeholder-icon'></i>
            <span>Tidak ada hasil untuk "${query}"</span>
        </div>
    `;
}

function renderError() {
    return `
        <div class="loc-search-placeholder">
            <i class='bx bx-error-circle loc-search-placeholder-icon'></i>
            <span>Pencarian gagal. Periksa koneksi internet.</span>
        </div>
    `;
}

/**
 * Render a single result item
 * @param {object} location - Normalized location object
 * @returns {string} HTML string
 */
function renderResultItem(location) {
    const icon = location.source === 'local' ? 'bx-map-pin' : 'bx-globe';
    const badge = location.source === 'local'
        ? '<span class="loc-search-badge loc-search-badge--local">Lokal</span>'
        : '<span class="loc-search-badge loc-search-badge--online">Online</span>';

    const displayName = location.districtName
        ? `${location.districtName}, ${location.regencyName}`
        : location.regencyName;

    return `
        <div class="loc-search-item" data-focus-item>
            <i class='bx ${icon}'></i>
            <div class="loc-search-item-info">
                <div class="loc-search-item-title">${displayName}</div>
                <div class="loc-search-item-subtitle">${location.provinceName || ''}${badge}</div>
            </div>
        </div>
    `;
}

/**
 * Create the modal DOM structure
 * @returns {HTMLElement}
 */
function createModalDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'loc-search-overlay';

    overlay.innerHTML = `
        <div class="loc-search-sheet">
            <div class="loc-search-header">
                <h3 class="loc-search-title">Cari Lokasi</h3>
            </div>
            <div class="loc-search-input-wrapper">
                <i class='bx bx-search loc-search-icon'></i>
                <input type="text" class="loc-search-input" placeholder="Cari kota atau lokasi..." autocomplete="off">
            </div>
            <div class="loc-search-results" data-focus-group="loc-search-results" data-focus-direction="vertical">
                ${renderPlaceholder()}
            </div>
        </div>
    `;

    return overlay;
}
