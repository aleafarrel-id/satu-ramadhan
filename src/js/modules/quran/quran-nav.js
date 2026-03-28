/**
 * Quran Navigation Module
 */

import * as QuranHeader from '../../components/quran/quran-header.js';
import * as QuranDock from '../../components/quran/quran-dock.js';

let _quranMode = false;
let _navOptions = {};
const _exitTransitionManager = {
   timers: [],
   add(t) { this.timers.push(t); },
   clear() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
   }
};

/**
 * Initializes the navigation manager.
 */
export function init() {
}


/**
 * Activates Quran mode and transitions UI.
 */
export async function enterQuranMode(options = {}) {
   if (_quranMode) return;
   _quranMode = true;
   _navOptions = options;

   _exitTransitionManager.clear();

   const mainNav = document.getElementById('bottom-nav');
   const appHeader = document.getElementById('app-header');
   const appContent = document.getElementById('app-content');
   const quranPage = document.getElementById('quran-page-modal');
   const quranBackdrop = document.getElementById('quran-backdrop');

   if (quranBackdrop) quranBackdrop.classList.add('active');

   if (mainNav) mainNav.classList.add('nav-hidden');
   if (appHeader) appHeader.classList.add('header-hidden');
   if (appContent) appContent.classList.add('no-padding');

   const dockSlot = document.getElementById('quran-dock-slot');
   if (dockSlot) {
      QuranDock.render(dockSlot, handleQuranNav);
   }

   if (quranPage) {
      return new Promise(resolve => {
         const timeout = setTimeout(resolve, 1000);

         const onTransitionEnd = (e) => {
            if (e.propertyName === 'transform') {
               quranPage.removeEventListener('transitionend', onTransitionEnd);
               clearTimeout(timeout);
               resolve();
            }
         };

         quranPage.addEventListener('transitionend', onTransitionEnd);

         requestAnimationFrame(() => {
            requestAnimationFrame(() => {
               quranPage.classList.add('quran-modal-active');
               quranPage.classList.remove('quran-modal-exit');
            });
         });
      });
   }

   return Promise.resolve();
}

/**
 * Deactivates Quran mode and restores UI.
 */
export async function exitQuranMode() {
   if (!_quranMode) return;
   _quranMode = false;

   const mainNav = document.getElementById('bottom-nav');
   const appHeader = document.getElementById('app-header');
   const appContent = document.getElementById('app-content');
   const quranPage = document.getElementById('quran-page-modal');
   const quranBackdrop = document.getElementById('quran-backdrop');

   if (quranBackdrop) quranBackdrop.classList.add('active');

   if (mainNav) mainNav.classList.remove('nav-hidden');
   if (appHeader) appHeader.classList.remove('header-hidden');
   if (appContent) appContent.classList.remove('no-padding');

   if (quranPage) {
      quranPage.classList.remove('quran-modal-active');
      quranPage.classList.add('quran-modal-exit');
   }

   QuranDock.hide();

   if (quranBackdrop) {
      _exitTransitionManager.add(setTimeout(() => {
         if (_quranMode) return;
         quranBackdrop.classList.remove('active');
      }, 600));
   }

   return new Promise(resolve => {
      _exitTransitionManager.add(setTimeout(() => {
         if (!_quranMode) {
            QuranHeader.destroyAll();
            QuranDock.destroy();
         }
         resolve();
      }, 800));
   });
}

/**
 * Handles dock navigation events.
 */
function handleQuranNav(itemId) {
   if (_navOptions.onNavigate) {
      _navOptions.onNavigate(itemId);
   }
}

/**
 * Returns true if Quran mode is active.
 */
export function isQuranMode() {
   return _quranMode;
}