/**
 * Header Component
 * Renders app logo (with audio pill), digital clock, and date
 */

import { t, loadNS } from '../../core/i18n.js';
import * as Router from '../../router.js';
import * as AudioService from '../../modules/quran/quran-audio-service.js';

const logoUrl = '/favicon/favicon.png';

let _container = null;
let _clockEl = null;
let _dateEl = null;
let _interval = null;
let _eventHandlers = [];

/**
 * Render the header into the container
 */
export async function render(container) {
    _container = container;

    await loadNS('components/ui/header');

    _container.innerHTML = `
        <button class="header-brand-pill" id="header-brand-pill" aria-label="Satu Ramadhan">
            <img src="${logoUrl}" alt="" class="header-logo" />
            <div class="header-audio-indicator">
                <i class='bx bx-headphone'></i>
            </div>
        </button>
        <div class="header-right">
            <div class="header-clock" id="header-clock"></div>
            <div class="header-date" id="header-date"></div>
        </div>
    `;

    _clockEl = document.getElementById('header-clock');
    _dateEl = document.getElementById('header-date');
    const brandPill = document.getElementById('header-brand-pill');

    if (brandPill) {
        brandPill.addEventListener('click', _onBrandClick);
    }

    updateTime();
    _interval = setInterval(updateTime, 1000);

    _registerEvents();
    _syncAudioState();
}

/**
 * Update clock and date display
 */
function updateTime() {
    const now = new Date();

    // Clock: HH:MM:SS
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (_clockEl) _clockEl.textContent = `${h}:${m}:${s}`;

    // Date: Senin, 23 Februari 2026
    const days = t('components/ui/header:days', { returnObjects: true }) || [];
    const months = t('components/ui/header:months', { returnObjects: true }) || [];
    
    if (days.length > 0 && months.length > 0) {
        const day = days[now.getDay()];
        const date = now.getDate();
        const month = months[now.getMonth()];
        const year = now.getFullYear();
        if (_dateEl) _dateEl.textContent = `${day}, ${date} ${month} ${year}`;
    }
}

// Audio Pill Sync 

function _onBrandClick() {
    const state = AudioService.getPlaybackState();
    if (state && state.isPlaying) {
        // Murottal active: Auto open this surah in Quran page
        if (state.surahIndex) {
            sessionStorage.setItem('quran_auto_open_surah', state.surahIndex);
            if (state.ayahNumber) {
               sessionStorage.setItem('quran_auto_open_ayah', state.ayahNumber);
            }
        }
        if (Router.getCurrentPage() === 'quran') {
            Router.refreshCurrentPage();
        } else {
            Router.navigate('quran');
        }
    }
}

function _updatePillState(isPlaying, isPaused) {
    const brandPill = document.getElementById('header-brand-pill');
    if (!brandPill) return;

    if (isPlaying) {
        brandPill.classList.add('is-active');
        brandPill.classList.toggle('is-paused', isPaused);
    } else {
        brandPill.classList.remove('is-active', 'is-paused');
    }
}

function _syncAudioState() {
    const state = AudioService.getPlaybackState();
    _updatePillState(state.isPlaying, state.isPaused);
}

function _registerEvents() {
    _unregisterEvents();
    
    const handlers = [
        ['murottal:play-start', () => _updatePillState(true, false)],
        ['murottal:play-pause', () => _updatePillState(true, true)],
        ['murottal:play-resume', () => _updatePillState(true, false)],
        ['murottal:play-stop', () => _updatePillState(false, false)],
        ['murottal:ayah-change', () => _syncAudioState()]
    ];

    handlers.forEach(([event, handler]) => {
        document.addEventListener(event, handler);
    });

    _eventHandlers = handlers;
}

function _unregisterEvents() {
    _eventHandlers.forEach(([event, handler]) => {
        document.removeEventListener(event, handler);
    });
    _eventHandlers = [];
}

/**
 * Cleanup
 */
export function destroy() {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
    const brandPill = document.getElementById('header-brand-pill');
    if (brandPill) {
        brandPill.removeEventListener('click', _onBrandClick);
    }
    _unregisterEvents();
}
