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

        var isDarkTheme = theme === 'dark';

        if (theme === 'auto') {
            var cachedTimingsStr = localStorage.getItem('satu_ramadhan_timings_cache');
            if (cachedTimingsStr) {
                var cachedTimings = JSON.parse(cachedTimingsStr);
                
                // Only use cache if it belongs to today
                if (cachedTimings.date === new Date().toDateString()) {
                    var now = new Date();
                    
                    var magribTime = new Date();
                    var mParts = cachedTimings.magrib.replace(/\s*\(.*\)/, '').split(':');
                    magribTime.setHours(parseInt(mParts[0], 10), parseInt(mParts[1], 10), 0, 0);

                    var terbitTime = new Date();
                    var tParts = cachedTimings.terbit.replace(/\s*\(.*\)/, '').split(':');
                    terbitTime.setHours(parseInt(tParts[0], 10), parseInt(tParts[1], 10), 0, 0);

                    if (now >= magribTime || now < terbitTime) {
                        isDarkTheme = true;
                    }
                }
            }
        }

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
