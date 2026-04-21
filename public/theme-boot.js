(function () {
    try {
        var rawStr = localStorage.getItem('CapacitorStorage.satu_ramadhan_app_state');
        var theme = 'auto'; // Default state

        if (rawStr) {
            var state = JSON.parse(rawStr);
            // Strict parsing to prevent injection or corruption bugs
            if (state && state.settings && typeof state.settings.theme === 'string') {
                var extracted = state.settings.theme;
                if (extracted === 'dark' || extracted === 'teal' || extracted === 'auto') {
                    theme = extracted;
                }
            }
        }

        var osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var isDarkTheme = theme === 'dark' || (theme === 'auto' && osDark);

        if (isDarkTheme) {
            // Apply DOM attribute for CSS engine
            document.documentElement.setAttribute('data-theme', 'dark');
            
            // Sync Status Bar & PWA Theme Color (Enterprise standard critical path)
            var metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', '#031013');
            }
        }
    } catch (e) {
        // Fail silently in boot sequence to allow default teal render
    }
})();
