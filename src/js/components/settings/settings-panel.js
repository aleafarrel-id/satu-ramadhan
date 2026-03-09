/**
 * Settings Panel Component
 * Renders the settings card with toggles
 */

export function render(container) {
    container.innerHTML = `
        <div class="card settings-card">
            <label class="settings-item" for="toggle-notification">
                <div class="settings-item-info">
                    <i class='bx bx-bell'></i>
                    <span>Hidupkan Notifikasi</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-notification" checked>
                    <span class="slider"></span>
                </div>
            </label>
            <div class="settings-divider"></div>
            <label class="settings-item" for="toggle-adzan">
                <div class="settings-item-info">
                    <i class='bx bx-volume-full'></i>
                    <span>Hidupkan Suara Adzan</span>
                </div>
                <div class="switch-toggle">
                    <input type="checkbox" id="toggle-adzan" checked>
                    <span class="slider"></span>
                </div>
            </label>
        </div>
    `;

    // Listeners for toggles
    const notificationToggle = document.getElementById('toggle-notification');
    const adzanToggle = document.getElementById('toggle-adzan');

    // Load saved preferences if any
    const savedNotif = localStorage.getItem('satu_ramadhan_notif');
    if (savedNotif !== null) {
        notificationToggle.checked = savedNotif === 'true';
    }

    const savedAdzan = localStorage.getItem('satu_ramadhan_adzan');
    if (savedAdzan !== null) {
        adzanToggle.checked = savedAdzan === 'true';
    }

    notificationToggle?.addEventListener('change', (e) => {
        localStorage.setItem('satu_ramadhan_notif', e.target.checked);
    });

    adzanToggle?.addEventListener('change', (e) => {
        localStorage.setItem('satu_ramadhan_adzan', e.target.checked);
    });
}

export function destroy() {
    // Cleanup if needed
}
