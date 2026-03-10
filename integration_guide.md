# Integration Guide: Manual Location Search & Local DB Refactor

This guide details the steps to implement a clean, maintainable, and high-quality manual location search feature that prioritizes local offline databases but gracefully falls back to the Nominatim API for international/unlisted locations. It also includes steps to move the static local JSON databases to the `public/` folder to improve the Webpack/Vite build process and memory footprint.

## 1. Problem Analysis & Current State

Currently, the app (`satu-ramadhan`) uses Capacitor Geolocation (`@capacitor/geolocation`) combined with a browser-based fallback to get the user's coordinates.
It then uses a local SQLite-like JSON database loaded directly via ES Modules (`import provinceData from '../../data/province.json'`) in `src/js/core/database.js` to run a Haversine formula and find the nearest Indonesian regency.

*   **Issue 1: Bundle Size & Memory.** Importing large JSON files (`regency.json`) directly into the JS bundle increases the initial load time and memory usage. Since they are static datasets, they should be fetched asynchronously when needed.
*   **Issue 2: Offline-only Constraint.** The current system *only* supports Indonesian locations present in the JSON. If a user manually searches for "Tokyo" or "London", it will fail.
*   **Issue 3: Manual Search implementation.** The current manual search UI (`src/js/components/modal/location-search-modal.js`) is just a mockup. It needs real logic.

## 2. Architecture & Design Principles

*   **DRY & Responsibilities:** Create a dedicated `location-service.js` or update `geolocation.js` to handle all location-related business logic (fetching local DB, calling Nominatim, normalizing data). The UI (`location-search-modal.js`) should *only* handle rendering and debounced input events.
*   **Prioritization:** The search logic must query the local database *first*. If no satisfactory results are found (or if we want to provide international options immediately based on query heuristics), we query Nominatim.
*   **Normalization:** Both the local DB and Nominatim will return data in different shapes. We must create a standard `Location` object model that the rest of the application (like `app.js` and `api.js`) can consume seamlessly.

---

## 3. Step-by-Step Implementation Plan

### Phase 1: Move Databases to `public/`

1.  **Move the files:**
    *   Move `src/data/province.json` to `public/data/province.json`.
    *   Move `src/data/regency.json` to `public/data/regency.json`.
    *   *Note: Check if `ramadhan.json` should also be moved. If so, apply same logic.*
2.  **Refactor `src/js/core/database.js`:**
    *   Remove the static `import` statements at the top.
    *   Implement an asynchronous fetch mechanism. Since the files are in `public/`, they can be fetched via relative URL (`./data/province.json`).
    *   **Crucial:** Use memoization/caching. Once fetched, store them in memory (`let _provinces = null;`) so subsequent calls don't trigger new network requests.
    *   *Example Change:*
        ```javascript
        // OLD
        // export function getProvinces() { return _provinces || provinceData; }

        // NEW
        let _provinces = null;
        export async function fetchProvinces() {
            if (_provinces) return _provinces;
            try {
                const res = await fetch('./data/province.json');
                _provinces = await res.json();
                return _provinces;
            } catch (e) {
                console.error("Failed to load provinces", e);
                return [];
            }
        }
        ```
3.  **Update Dependents:**
    *   Update `src/js/core/geolocation.js` (`findNearestRegency`) to be asynchronous, as it now needs to `await fetchRegencies()`.
    *   Update any UI that calls `getProvinceById` or `getRegenciesByProvinceId` to handle Promises.

### Phase 2: Implement Nominatim API Fallback

1.  **Create `src/js/core/nominatim.js` (or add to `api.js`):**
    *   Implement a function to search Nominatim: `https://nominatim.openstreetmap.org/search?q={query}&format=json&addressdetails=1&limit=5`
    *   **Important:** Nominatim requires a user-agent. Ensure you set a descriptive `User-Agent` header (e.g., `satu-ramadhan-app/1.0`).
    *   Implement debounce and timeout handling similar to how `api.js` handles Aladhan requests.
2.  **Normalize Data:**
    *   Create a factory function to convert Nominatim results into the standard app format:
        ```javascript
        {
            regencyId: 'custom_' + Date.now(), // Or derived from lat/lng
            regencyName: result.address.city || result.address.town || result.name,
            provinceId: null,
            provinceName: result.address.state || result.address.country,
            latitude: parseFloat(result.lat),
            longitude: parseFloat(result.lon)
        }
        ```

### Phase 3: Build the Unified Search Logic

1.  **Update `geolocation.js` (or a new `search.js`):**
    *   Create a function: `async function searchLocation(query)`
    *   **Step A (Local DB):** Filter `_regencies` where name matches `query` (case-insensitive).
    *   **Step B (Nominatim):** If network is available, concurrently (or sequentially if local yields 0 results) call Nominatim.
    *   **Step C (Merge & Deduplicate):** Combine local results and Nominatim results. Favor local results if the names and coordinates are very close (to avoid duplicates of Indonesian cities).

### Phase 4: Wire up the UI (`location-search-modal.js`)

1.  **Add Debouncing:**
    *   Wrap the `searchInput` event listener in a debounce function (e.g., 500ms) to prevent spamming the search function while the user types.
2.  **Handle Loading States:**
    *   Show a loading spinner in `.loc-search-results` while `searchLocation(query)` is resolving.
3.  **Render Results:**
    *   Iterate over the returned normalized Location objects and render them as `.loc-search-item`.
4.  **Handle Selection:**
    *   When an item is clicked, call `setManualLocation()` (from `geolocation.js`) with the selected data.
    *   Call `hideModal()` and trigger a global event or callback so `app.js` knows to fetch new prayer times for the new coordinates.

## 4. Verification & Testing (Manual)

1.  **Database Migration Check:** Completely clear browser cache/storage. Disconnect internet. Open the app. It should still load the default app frame. Verify in Network tab that `province.json` is fetched cleanly.
2.  **Local Search Check:** Open the location modal. Type "Bandung". Ensure the results appear instantly (pulled from local DB). Select it and verify prayer times update.
3.  **Nominatim Fallback Check:** Type "Tokyo". Wait for the debounce. Ensure Nominatim results appear. Select Tokyo and verify prayer times match Tokyo's timezone/location.
4.  **Error Handling Check:** Disconnect internet. Type "London". Ensure the UI gracefully shows "No results found" or "Network error" instead of crashing.
5.  **Build Check:** Run `npm run build` (or `vite build`). Verify that `province.json` and `regency.json` are properly copied to the `dist/public/data` directory and are *not* bundled into the massive JS file.
