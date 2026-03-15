/**
 * Al-Quran Page placeholder
 */

export function render(container) {
    container.innerHTML = `
        <div class="quran-container" style="padding: var(--sp-6); text-align: center; color: var(--clr-text-primary);">
            <i class='bx bx-book-reader' style="font-size: 4rem; color: var(--clr-accent-500); margin-bottom: var(--sp-4);"></i>
            <h2 style="font-family: var(--ff-primary); font-weight: var(--fw-bold);">Al-Quran</h2>
            <p style="font-family: var(--ff-primary); color: var(--clr-text-secondary); margin-top: var(--sp-2);">Fitur ini akan segera hadir.</p>
        </div>
    `;
}

export function destroy() {
    // Cleanup if needed
}
