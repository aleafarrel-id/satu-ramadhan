/**
 * Juz Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';

import { normalizeSearchText, createQuranSubpage, createHistoryBanner } from '../../modules/quran/quran-utility.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';
import { getJuzList } from '../../modules/quran/quran-api.js';

const subpage = createQuranSubpage({
   fetchDataFn: getJuzList,
   listCreatorFn: QuranCard.createJuzList,
   itemCardCreatorFn: QuranCard.createJuzCard,
   bannerCreatorFn: () => createHistoryBanner((item, type, verse) => QuranReader.open(item, type, verse)),
   filterFn: (data, query) => {
      const normalizedQuery = normalizeSearchText(query);
      return data.filter(j => {
         const jIndexNum = parseInt(j.index).toString();
         const startNameNormal = normalizeSearchText(j.start.name);
         const endNameNormal = normalizeSearchText(j.end.name);

         const isMatchIndex = jIndexNum === query || `juz${jIndexNum}` === normalizedQuery;

         return (normalizedQuery.length > 0 && (startNameNormal.includes(normalizedQuery) || endNameNormal.includes(normalizedQuery))) || isMatchIndex;
      });
   },
   onItemClick: (juz) => {
      QuranReader.open(juz, 'juz');
   }
});

let _currentContainer = null;

export const render = async (container, query) => {
   _currentContainer = container;
   const res = await subpage.render(container, query);

   return res;
};

export const refreshBanner = async () => {
   if (!_currentContainer) return;
   const newBanner = await createHistoryBanner((item, type, verse) => QuranReader.open(item, type, verse));
   if (!_currentContainer) return;

   const currentBanner = _currentContainer.querySelector('.last-read-banner');
   if (currentBanner && currentBanner.parentNode) {
      currentBanner.parentNode.replaceChild(newBanner, currentBanner);
   }
};

export const onSearch = subpage.onSearch;
export const onSearchExit = subpage.onSearchExit;

export const destroy = async () => {
   _currentContainer = null;
   await subpage.destroy();
};
