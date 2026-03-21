/**
 * Mushaf UI Builder — Pure DOM construction for Mushaf page elements.
 */

export function buildPageElement(pageData) {
   const page = document.createElement('div');
   page.className = 'mushaf-page';
   page.dataset.page = pageData.page;

   const pageNum = parseInt(pageData.page, 10);
   if (pageNum === 1 || pageNum === 2) {
      page.classList.add('mushaf-page--opening');
   }

   const linesContainer = document.createElement('div');
   linesContainer.className = 'mushaf-lines';

   for (const line of pageData.lines) {
      let lineEl;
      switch (line.type) {
         case 'surah-header':
            lineEl = _buildSurahHeaderLine(line);
            break;
         case 'basmala':
            lineEl = _buildBasmalaLine(line);
            break;
         case 'text':
         default:
            lineEl = _buildTextLine(line);
            break;
      }
      if (lineEl) linesContainer.appendChild(lineEl);
   }

   page.appendChild(linesContainer);
   return page;
}

/** Builds an empty backing page for the landscape RTL trick. */
export function buildEmptyPageElement() {
   const page = document.createElement('div');
   page.className = 'mushaf-page mushaf-page-empty';
   return page;
}

function _buildSurahHeaderLine(line) {
   const el = document.createElement('div');
   el.className = 'mushaf-line mushaf-line--surah-header';
   const nameEl = document.createElement('span');
   nameEl.className = 'mushaf-surah-name';
   nameEl.textContent = line.text;
   el.appendChild(nameEl);
   return el;
}

function _buildBasmalaLine(line) {
   const el = document.createElement('div');
   el.className = 'mushaf-line mushaf-line--basmala';
   const wordEl = document.createElement('span');
   wordEl.className = 'mushaf-word';
   wordEl.textContent = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
   el.appendChild(wordEl);
   return el;
}

function _buildTextLine(line) {
   if ((!line.words || !line.words.length) && (!line.text || line.text.trim() === '')) {
      return null;
   }

   const el = document.createElement('div');
   el.className = 'mushaf-line mushaf-line--text';

   if (!line.words || !line.words.length) {
      const fallback = document.createElement('span');
      fallback.className = 'mushaf-word';
      fallback.textContent = line.text;
      el.appendChild(fallback);
      return el;
   }

   for (const w of line.words) {
      const wordEl = document.createElement('span');
      wordEl.className = 'mushaf-word';
      wordEl.dataset.location = w.location || '';
      wordEl.textContent = w.word || w.text || '';
      el.appendChild(wordEl);
   }
   return el;
}
