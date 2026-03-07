/**
 * Settings Panel Component
 * Renders the settings card with toggles
 */

export function render(container) {
    container.innerHTML = `
        <div class="card settings-card">
            <div class="settings-item">
                <div class="settings-item-info">
                    <i class='bx bx-bell'></i>
                    <span>Hidupkan Notifikasi</span>
                </div>
                <label class="switch-toggle" for="toggle-notification">
                    <input type="checkbox" id="toggle-notification" checked>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-item">
                <div class="settings-item-info">
                    <i class='bx bx-volume-full'></i>
                    <span>Hidupkan Suara Adzan</span>
                </div>
                <label class="switch-toggle" for="toggle-adzan">
                    <input type="checkbox" id="toggle-adzan" checked>
                    <span class="slider"></span>
                </label>
            </div>
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
