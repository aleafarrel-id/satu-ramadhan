/**
 * Focus Manager (Arrow Key Navigation)
 * 
 * Provides global arrow-key navigation for elements grouped by data attributes.
 * Allows users to traverse horizontally, vertically, or in a grid without writing
 * custom keydown listeners for every component.
 * 
 * Usage:
 * <div data-focus-group="my-group" data-focus-direction="vertical">
 *    <button data-focus-item>Item 1</button>
 *    <button data-focus-item>Item 2</button>
 * </div>
 */

const NATIVE_ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function initGlobalFocusManager() {
    document.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(e) {
    if (!NATIVE_ARROWS.has(e.key)) return;

    const activeEl = document.activeElement;
    if (!activeEl) return;

    // Check if the currently focused element is part of a focus group
    const groupEl = activeEl.closest('[data-focus-group]');
    if (!groupEl) return;

    // Optional: if user is inside an input/textarea, let them use arrows naturally to move cursor
    if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
        const type = activeEl.type;
        if (type === 'text' || type === 'search' || type === 'number' || activeEl.tagName === 'TEXTAREA') {
            return; // let native arrow behavior happen inside text fields
        }
    }

    const direction = groupEl.getAttribute('data-focus-direction') || 'vertical';
    const wrap = groupEl.getAttribute('data-focus-wrap') === 'true';
    
    // Convert NodeList to regular Array immediately for indexOf
    // Filter out items that belong to a NESTED sub-group (their closest group is not ours)
    const items = Array.from(groupEl.querySelectorAll('[data-focus-item]'))
                       .filter(el => !el.disabled && el.offsetWidth > 0 && el.closest('[data-focus-group]') === groupEl);

    if (items.length === 0) return;

    let currentIndex = items.indexOf(activeEl);
    
    // If somehow focused on an element inside the group but not explicitly marked as item, find nearest
    if (currentIndex === -1) {
        const parentItem = activeEl.closest('[data-focus-item]');
        if (parentItem) currentIndex = items.indexOf(parentItem);
        else return;
    }

    let nextIndex = currentIndex;
    let handled = false;

    if (direction === 'horizontal') {
        if (e.key === 'ArrowLeft') {
            nextIndex = currentIndex - 1;
            handled = true;
        } else if (e.key === 'ArrowRight') {
            nextIndex = currentIndex + 1;
            handled = true;
        }
    } 
    else if (direction === 'vertical') {
        if (e.key === 'ArrowUp') {
            nextIndex = currentIndex - 1;
            handled = true;
        } else if (e.key === 'ArrowDown') {
            nextIndex = currentIndex + 1;
            handled = true;
        }
    }
    else if (direction === 'grid') {
        const cols = parseInt(groupEl.getAttribute('data-focus-grid-cols') || '7', 10);
        
        if (e.key === 'ArrowLeft') {
            nextIndex = currentIndex - 1;
            handled = true;
        } else if (e.key === 'ArrowRight') {
            nextIndex = currentIndex + 1;
            handled = true;
        } else if (e.key === 'ArrowUp') {
            nextIndex = currentIndex - cols;
            handled = true;
        } else if (e.key === 'ArrowDown') {
            nextIndex = currentIndex + cols;
            handled = true;
        }
    }

    if (handled) {
        e.preventDefault(); // prevent scrolling

        if (wrap) {
            if (nextIndex < 0) nextIndex = items.length - 1;
            if (nextIndex >= items.length) nextIndex = 0;
        } else {
            if (nextIndex < 0) nextIndex = 0;
            if (nextIndex >= items.length) nextIndex = items.length - 1;
        }

        if (nextIndex !== currentIndex && items[nextIndex]) {
            items[nextIndex].focus();
        }
    }
}
