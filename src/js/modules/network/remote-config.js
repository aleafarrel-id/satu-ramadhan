/**
 * Remote Config Service
 *
 * Fetches the latest ramadhan.json from Cloudflare Pages and caches it
 * locally. The app will use the remote data on the next full startup
 * after a successful fetch, allowing OTA updates without an APK release.
 *
 * Priority chain:
 *   Remote (CF Pages) → persisted in storage → used by getRamadhanConfig()
 *   Local  (public/data/ramadhan.json) → bundled fallback, always available
 */

import * as storage from '../../core/storage.js';
import { logError } from '../../utils/error-boundary.js';

const REMOTE_URL = 'https://saturamadhan-web.pages.dev/data/ramadhan.json';
const CACHE_KEY = 'remote_ramadhan_config';
const LAST_FETCH_KEY = 'remote_ramadhan_last_fetch';
const FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch the remote ramadhan config and persist it to storage.
 * Rate-limited to once per 24 hours. Fails silently on network errors.
 *
 * Call this fire-and-forget from app startup and app resume.
 * The updated config will be used on the next call to getRamadhanConfig().
 */
export async function syncRemoteConfig() {
    if (!navigator.onLine) return;

    // Rate-limit: skip if fetched recently
    const lastFetch = await storage.get(LAST_FETCH_KEY);
    if (lastFetch && Date.now() - lastFetch < FETCH_INTERVAL_MS) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const res = await fetch(REMOTE_URL, {
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timeoutId);

        if (!res.ok) return;

        const data = await res.json();

        // Basic shape validation before persisting
        if (!data?.tahunHijriah || !Array.isArray(data?.presets)) return;

        await storage.set(CACHE_KEY, data);
        await storage.set(LAST_FETCH_KEY, Date.now());
    } catch (e) {
        // Network errors, timeouts, JSON parse errors — all fail silently
        logError('[RemoteConfig]', e);
    }
}

/**
 * Get the cached remote config from storage, if available.
 * Returns null if no remote data has been fetched yet.
 *
 * @returns {Promise<object|null>}
 */
export async function getCachedRemoteConfig() {
    return await storage.get(CACHE_KEY);
}
