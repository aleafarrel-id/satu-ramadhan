/**
 * Location Search Modal (Sliding from bottom)
 * Used for manual location search
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';

let _overlayEl = null;

export function showLocationSearchModal() {
    if (_overlayEl) removeModal();

    _overlayEl = createModalDOM();
    document.body.appendChild(_overlayEl);

    // Register with hardware back handler
    registerModalDismiss(hideModal);

    // Trigger entrance sliding animation
    requestAnimationFrame(() => _overlayEl.classList.add('active'));

    // Bind Overlay (click outside modal content to close)
    _overlayEl.addEventListener('click', (e) => {
        if (e.target === _overlayEl) {
            hideModal();
        }
    });

    // Mock search logic
    const searchInput = _overlayEl.querySelector('.loc-search-input');
    const searchResults = _overlayEl.querySelector('.loc-search-results');

    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length > 0) {
            searchResults.innerHTML = `
                <div class="loc-search-item">
                    <i class='bx bx-map'></i>
                    <div class="loc-search-item-info">
                        <div class="loc-search-item-title">Hasil pencarian untuk "${query}"</div>
                    </div>
                </div>
            `;
        } else {
            searchResults.innerHTML = `
                <div class="loc-search-placeholder">
                    Mulai ketik nama lokasi...
                </div>
            `;
        }
    });

    // Auto focus
    setTimeout(() => {
        searchInput?.focus();
    }, 300);
}

/**
 * Hide modal
 */

export function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.loc-search-sheet');
    if (sheet) {
        sheet.addEventListener('transitionend', removeModal, { once: true });
    } else {
        _overlayEl.addEventListener('transitionend', removeModal, { once: true });
    }

    setTimeout(removeModal, 450);
}

function removeModal() {
    if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
    }
    unregisterModalDismiss(hideModal);
}

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
            <div class="loc-search-results">
                <div class="loc-search-placeholder">
                    Mulai ketik nama lokasi...
                </div>
            </div>
        </div>
    `;

    return overlay;
}
