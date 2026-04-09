/**
 * DOM Utilities
 */

/**
 * Clears the content of a container while preserving specific utility elements
 * like Pull-to-Refresh indicators.
 * @param {HTMLElement} container - The container to clear
 * @param {string} preserveSelector - Selector for elements to preserve (default: .custom-ptr)
 */
export function safeClear(container, preserveSelector = '.custom-ptr') {
    if (!container) return;
    
    // Cancel any pending deferred render (requestAnimationFrame) on this container.
    if (typeof container.__quranRenderCancel === 'function') {
        container.__quranRenderCancel();
        container.__quranRenderCancel = null;
    }

    // Iterate over direct children from the end to the beginning.
    // Using matches() avoids running querySelectorAll through massive subtrees (e.g. 30k+ nodes).
    let child = container.lastElementChild;
    while (child) {
        const prev = child.previousElementSibling;
        if (!child.matches(preserveSelector)) {
            // Aggressive GC: clearing innerHTML of massive containers before detaching
            // helps prevent critical mobile browser crashes by instantly destroying the C++ DOM tree.
            child.innerHTML = ''; 
            container.removeChild(child);
        }
        child = prev;
    }
    
    // Clean up any stray text/comment nodes
    let node = container.lastChild;
    while (node) {
        const prev = node.previousSibling;
        if (node.nodeType !== Node.ELEMENT_NODE) {
            container.removeChild(node);
        }
        node = prev;
    }
}
