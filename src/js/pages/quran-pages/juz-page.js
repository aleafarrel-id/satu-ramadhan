/**
 * Juz Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import { normalizeSearchText, createQuranSubpage } from '../../modules/quran/quran-utility.js';
import * as QuranReader from '../../modules/quran/quran-reader.js';

import { getJuzList } from '../../modules/quran/quran-api.js';

const subpage = createQuranSubpage({
   fetchDataFn: getJuzList,
   listCreatorFn: QuranCard.createJuzList,
   itemCardCreatorFn: QuranCard.createJuzCard,
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

export const render = subpage.render;
export const onSearch = subpage.onSearch;
export const onSearchExit = subpage.onSearchExit;
export const destroy = subpage.destroy;
