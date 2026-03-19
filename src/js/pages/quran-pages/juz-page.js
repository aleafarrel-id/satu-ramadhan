/**
 * Al-Quran Juz Subpage Component
 */

import * as QuranCard from '../../components/quran/quran-card.js';
import { normalizeSearchText, createQuranSubpage } from '../../modules/quran/quran-utility.js';

const subpage = createQuranSubpage({
   apiPath: '/quran/juz.json',
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
      console.log('Juz clicked:', juz.index);
   }
});

export const render = subpage.render;
export const onSearch = subpage.onSearch;
export const onSearchExit = subpage.onSearchExit;
export const destroy = subpage.destroy;
