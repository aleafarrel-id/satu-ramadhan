/**
 * Fasting Details Modal
 * Displays info, niat, and doa for a specific fasting day.
 */

import { registerModalDismiss, unregisterModalDismiss } from '../../modules/system/back-handler.js';
import { t } from '../../core/i18n.js';
import { getModalRoot } from '../../utils/modal-portal.js';

let _overlayEl = null;

export function showFastingDetailsModal(fastingId) {
    if (_overlayEl) removeModal();
    
    // Fetch from i18n namespace
    const data = t(`fasting:${fastingId}`, { returnObjects: true });
    if (!data || typeof data === 'string') return;

    // Yield to the main thread to allow touch ripples or other UI feedback
    // to paint before locking the thread with heavy DOM injection.
    setTimeout(() => {
        _overlayEl = createModalDOM(data);
        getModalRoot().appendChild(_overlayEl);

        registerModalDismiss(hideModal);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => _overlayEl.classList.add('active'));
        });
    }, 10);
}

function hideModal() {
    if (!_overlayEl) return;
    _overlayEl.classList.remove('active');

    const sheet = _overlayEl.querySelector('.fasting-modal-sheet');
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

function createModalDOM(data) {
    const overlay = document.createElement('div');
    overlay.className = 'fasting-modal-overlay';
    
    // Type styling
    const typeClass = `fasting-modal-sheet--${data.type}`;
    let typeLabel = t('fasting:common.type_sunnah') || 'Sunnah';
    if (data.type === 'mandatory') typeLabel = t('fasting:common.type_mandatory') || 'Wajib';
    if (data.type === 'forbidden') typeLabel = t('fasting:common.type_forbidden') || 'Haram';

    let contentHtml = `<p class="fasting-modal-desc">${data.description}</p>`;
    
    if (data.niat) {
        const titleNiat = t('fasting:common.niat_title') || 'Niat Puasa';
        contentHtml += `
            <div class="fasting-modal-section-title"><i class='bx bx-book-heart'></i> ${titleNiat}</div>
            <div class="fasting-modal-content-card">
                <div class="fasting-modal-arabic">${data.niat.arabic}</div>
                <div class="fasting-modal-latin">${data.niat.latin}</div>
                <div class="fasting-modal-translation">"${data.niat.translation}"</div>
            </div>
        `;
    }

    if (data.type !== 'forbidden') {
        const doaBerbuka = t('fasting:common.doa_berbuka', { returnObjects: true });
        const titleDoa = t('fasting:common.doa_title') || 'Doa Berbuka';
        
        if (doaBerbuka && typeof doaBerbuka === 'object') {
            contentHtml += `
                <div class="fasting-modal-section-title"><i class='bx bx-food-menu'></i> ${titleDoa}</div>
                <div class="fasting-modal-content-card">
                    <div class="fasting-modal-arabic">${doaBerbuka.arabic}</div>
                    <div class="fasting-modal-latin">${doaBerbuka.latin}</div>
                    <div class="fasting-modal-translation">"${doaBerbuka.translation}"</div>
                </div>
            `;
        }
    }

    overlay.innerHTML = `
        <div class="fasting-modal-sheet ${typeClass}">
            <div class="fasting-modal-header">
                <div class="fasting-modal-icon-wrapper">
                    <i class='bx ${data.icon}'></i>
                </div>
                <div class="fasting-modal-title-group">
                    <div class="fasting-modal-title">${data.name}</div>
                    <div class="fasting-modal-type">${typeLabel}</div>
                </div>
            </div>
            <div class="fasting-modal-body">
                ${contentHtml}
            </div>
            <div class="fasting-modal-footer">
                <button class="fasting-modal-close-btn" id="fasting-btn-close">${t('common:close') || 'Tutup'}</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideModal();
    });

    const closeBtn = overlay.querySelector('#fasting-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', hideModal);

    return overlay;
}
