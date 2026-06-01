/**
 * Surah Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';

import { normalizeSearchText, createQuranSubpage, createHistoryBanner } from '../../modules/quran/quran-utility.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';
import { getSurahList } from '../../modules/quran/quran-api.js';

const subpage = createQuranSubpage({
   fetchDataFn: getSurahList,
   listCreatorFn: QuranCard.createSurahList,
   itemCardCreatorFn: QuranCard.createSurahCard,
   bannerCreatorFn: () => createHistoryBanner((item, type, verse) => QuranReader.open(item, type, verse)),
   filterFn: (data, query) => {
      const normalizedQuery = normalizeSearchText(query);
      return data.filter(s => {
         const normalizedTitle = normalizeSearchText(s.title);
         const sIndexNum = parseInt(s.index).toString();
         const sCountStr = s.count.toString();
         const lowerType = s.type.toLowerCase();

         return (normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery)) ||
            s.titleAr.includes(query) ||
            lowerType.includes(query) ||
            sIndexNum === query ||
            sCountStr === query;
      });
   },
   onItemClick: (surah) => {
      QuranReader.open(surah);
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
