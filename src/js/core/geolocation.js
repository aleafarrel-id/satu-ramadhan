/**
 * Geolocation Service
 * Capacitor Geolocation + Haversine centroid matching to nearest regency/province
 */

import { Geolocation } from '@capacitor/geolocation';
import { getRegencies, getProvinceById } from './database.js';
import * as storage from './storage.js';

const STORAGE_KEY = 'user_location';

/**
 * Calculate Haversine distance between two coordinates (in km)
 */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Find nearest regency to given coordinates
 */
export function findNearestRegency(lat, lng) {
    const regencies = getRegencies();
    let nearest = null;
    let minDist = Infinity;

    for (const reg of regencies) {
        const dist = haversine(lat, lng, reg.latitude, reg.longitude);
        if (dist < minDist) {
            minDist = dist;
            nearest = reg;
        }
    }

    if (nearest) {
        const province = getProvinceById(nearest.province_id);
        return {
            regency: nearest,
            province: province,
            distance: minDist
        };
    }

    return null;
}

/**
 * Get user's current GPS position via Capacitor Geolocation
 */
export async function getCurrentPosition() {
    try {
        // Request permission first (required on native)
        const permStatus = await Geolocation.checkPermissions();

        if (permStatus.location === 'denied') {
            const reqResult = await Geolocation.requestPermissions();
            if (reqResult.location === 'denied') {
                throw new Error('Location permission denied');
            }
        }

        const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
        });

        return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
        };
    } catch (error) {
        console.warn('Capacitor Geolocation failed, trying browser fallback:', error.message);

        // Fallback to browser API
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (err) => reject(err),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000
                }
            );
        });
    }
}

/**
 * Detect location and find nearest regency
 * Returns cached result if available (unless forceRefresh is true), otherwise fetches GPS
 * @param {boolean} forceRefresh - If true, skips cache and forces new GPS fetch.
 */
export async function detectLocation(forceRefresh = false) {
    if (!forceRefresh) {
        // Check cache first
        const cached = await storage.get(STORAGE_KEY);
        if (cached) return cached;
    }

    try {
        const coords = await getCurrentPosition();
        const result = findNearestRegency(coords.latitude, coords.longitude);

        if (result) {
            const location = {
                regencyId: result.regency.id,
                regencyName: result.regency.name,
                provinceId: result.province?.id,
                provinceName: result.province?.name,
                latitude: coords.latitude,
                longitude: coords.longitude
            };
            await storage.set(STORAGE_KEY, location);
            return location;
        }
    } catch (error) {
        console.warn('Geolocation failed:', error.message);
    }

    return null;
}

/**
 * Check if Device GPS/Location Services is enabled using cordova-plugin-diagnostic
 * Returns true if enabled or on platform without plugin, false if disabled.
 */
export async function checkGpsEnabled() {
    if (!window.cordova || !window.cordova.plugins || !window.cordova.plugins.diagnostic) {
        return true;
    }

    return new Promise((resolve) => {
        window.cordova.plugins.diagnostic.isLocationEnabled(
            (enabled) => resolve(enabled),
            (error) => {
                console.warn('Diagnostic check failed:', error);
                resolve(true); // Default to true on error so it attempts to fetch anyway
            }
        );
    });
}

/**
 * Open Device Location Settings
 */
export function openLocationSettings() {
    if (window.cordova?.plugins?.diagnostic) {
        window.cordova.plugins.diagnostic.switchToLocationSettings();
    }
}

/**
 * Manually set location
 */
export async function setManualLocation(regencyId, regencyName, provinceId, provinceName) {
    const location = { regencyId, regencyName, provinceId, provinceName };
    await storage.set(STORAGE_KEY, location);
    return location;
}

/**
 * Get saved location (from cache only, no GPS)
 */
export async function getSavedLocation() {
    return await storage.get(STORAGE_KEY);
}
