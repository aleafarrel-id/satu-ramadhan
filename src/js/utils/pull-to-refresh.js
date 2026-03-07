/**
 * Custom Mobile-optimized Pull to Refresh
 * Provides smooth, native-feeling pull-to-refresh without the stuttering
 * common to generic JavaScript pull-to-refresh libraries.
 */
export function initPullToRefresh(options) {
    const {
        scrollElement,
        onRefresh,
        threshold = 80,
        textPull = 'Tarik untuk memuat ulang',
        textRelease = 'Lepaskan untuk memuat ulang',
        textRefreshing = 'Memuat ulang...',
        iconPull = "<i class='bx bx-down-arrow-alt'></i>",
        iconRefreshing = "<i class='bx bx-loader-alt'></i>"
    } = options;

    const scroller = typeof scrollElement === 'string' ? document.querySelector(scrollElement) : scrollElement;
    if (!scroller) return;

    // Create PTR element
    const ptrEl = document.createElement('div');
    ptrEl.className = 'custom-ptr';
    ptrEl.innerHTML = `
        <div class="custom-ptr-icon">${iconPull}</div>
        <div class="custom-ptr-text">${textPull}</div>
    `;

    // Insert at the top of the scroller
    scroller.insertBefore(ptrEl, scroller.firstChild);

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isRefreshing = false;
    let dy = 0;

    const iconEl = ptrEl.querySelector('.custom-ptr-icon');
    const textEl = ptrEl.querySelector('.custom-ptr-text');

    scroller.addEventListener('touchstart', (e) => {
        if (scroller.scrollTop > 0 || isRefreshing) return;
        startY = e.touches[0].clientY;
        isPulling = true;
        dy = 0;

        ptrEl.style.transition = 'none';
        iconEl.style.transition = 'none';
    }, { passive: true });

    scroller.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing) return;

        currentY = e.touches[0].clientY;
        dy = (currentY - startY) * 0.4; // Apply resistance to pull

        if (dy > 0 && scroller.scrollTop <= 0) {
            // Prevent native scrolling behavior down past the top edge
            if (e.cancelable) {
                e.preventDefault();
            }

            ptrEl.style.height = `${dy}px`;

            if (dy > threshold) {
                iconEl.style.transform = 'rotate(180deg)';
                textEl.textContent = textRelease;
            } else {
                iconEl.style.transform = 'rotate(0deg)';
                textEl.textContent = textPull;
            }
        }
    }, { passive: false }); // Requires active listener to prevent default

    scroller.addEventListener('touchend', async () => {
        if (!isPulling || isRefreshing) return;
        isPulling = false;

        ptrEl.style.transition = 'height 0.3s ease-out';
        iconEl.style.transition = 'transform 0.3s ease-out';

        if (dy > threshold && scroller.scrollTop <= 0) {
            isRefreshing = true;
            ptrEl.style.height = '60px'; // Hold position during loading
            iconEl.className = 'custom-ptr-icon spinning';
            iconEl.innerHTML = iconRefreshing;
            textEl.textContent = textRefreshing;

            if (onRefresh) {
                try {
                    await Promise.resolve(onRefresh());
                } catch (err) {
                    console.error('Refresh error:', err);
                }
            }

            // Reset after delay (even though page may reload)
            setTimeout(reset, 800);
        } else if (dy > 0) {
            reset();
        }
    });

    function reset() {
        ptrEl.style.height = '0px';
        setTimeout(() => {
            isRefreshing = false;
            iconEl.className = 'custom-ptr-icon';
            iconEl.innerHTML = iconPull;
            iconEl.style.transform = 'rotate(0deg)';
            textEl.textContent = textPull;
        }, 300);
    }
}
