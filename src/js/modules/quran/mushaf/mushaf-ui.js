/**
 * Mushaf UI — HTML string builders for Mushaf page elements.
 * Uses string interpolation instead of DOM manipulation for faster rendering.
 */

/** Escapes HTML special characters to prevent XSS. */
function _esc(str) {
   if (str === null || str === undefined) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

/**
 * Builds the full HTML string for a Mushaf page.
 * @param {Object} pageData
 * @returns {string}
 */
export function buildPageHTML(pageData) {
   const pageNum = parseInt(pageData.page, 10);
   const openingClass = (pageNum === 1 || pageNum === 2) ? ' mushaf-page--opening' : '';

   let linesHTML = '';
   for (const line of pageData.lines) {
      switch (line.type) {
         case 'surah-header': linesHTML += _buildSurahHeaderHTML(line); break;
         case 'basmala':      linesHTML += _buildBasmalaHTML();          break;
         case 'text':
         default:             linesHTML += _buildTextLineHTML(line);     break;
      }
   }

   return `<div class="mushaf-page${openingClass}" data-page="${_esc(pageData.page)}"><div class="mushaf-lines">${linesHTML}</div></div>`;
}

/** Builds an empty backing page for the landscape RTL flip trick. */
export function buildEmptyPageHTML() {
   return '<div class="mushaf-page mushaf-page-empty"></div>';
}

// ── Legacy DOM API (kept for backward compatibility) ──

export function buildPageElement(pageData) {
   const t = document.createElement('template');
   t.innerHTML = buildPageHTML(pageData);
   return t.content.firstChild;
}

export function buildEmptyPageElement() {
   const t = document.createElement('template');
   t.innerHTML = buildEmptyPageHTML();
   return t.content.firstChild;
}

// ── Private Helpers ──

function _buildSurahHeaderHTML(line) {
   return `<div class="mushaf-line mushaf-line--surah-header"><span class="mushaf-surah-name">${_esc(line.text)}</span></div>`;
}

function _buildBasmalaHTML() {
   return '<div class="mushaf-line mushaf-line--basmala"><span class="mushaf-word">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</span></div>';
}

function _buildTextLineHTML(line) {
   if ((!line.words || !line.words.length) && (!line.text || line.text.trim() === '')) {
      return '';
   }

   if (!line.words || !line.words.length) {
      return `<div class="mushaf-line mushaf-line--text"><span class="mushaf-word">${_esc(line.text)}</span></div>`;
   }

   // Concatenate all words into a single span for optimal rendering performance.
   let fullText = '';
   for (let i = 0, len = line.words.length; i < len; i++) {
      const w = line.words[i];
      fullText += (i > 0 ? ' ' : '') + (w.word || w.text || '');
   }

   return `<div class="mushaf-line mushaf-line--text"><span class="mushaf-word">${_esc(fullText)}</span></div>`;
}
