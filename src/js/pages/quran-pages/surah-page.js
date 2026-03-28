/**
 * Surah Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';

import { normalizeSearchText, createQuranSubpage } from '../../modules/quran/quran-utility.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';
import { getSurahList } from '../../modules/quran/quran-api.js';

const subpage = createQuranSubpage({
   fetchDataFn: getSurahList,
   listCreatorFn: QuranCard.createSurahList,
   itemCardCreatorFn: QuranCard.createSurahCard,
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

export const render = subpage.render;
export const onSearch = subpage.onSearch;
export const onSearchExit = subpage.onSearchExit;
export const destroy = subpage.destroy;

