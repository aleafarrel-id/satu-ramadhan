/**
 * Haptic Feedback Module
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Check if haptics are available (native only)
 */
function isNative() {
    try {
        return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();
    } catch {
        return false;
    }
}

/**
 * Trigger impact haptic feedback
 * @param {'light'|'medium'|'heavy'} style
 */
export async function impact(style = 'light') {
    if (!isNative()) return;
    try {
        const styleMap = {
            light: ImpactStyle.Light,
            medium: ImpactStyle.Medium,
            heavy: ImpactStyle.Heavy,
        };
        await Haptics.impact({ style: styleMap[style] || ImpactStyle.Light });
    } catch (e) {
        console.warn('Haptic impact failed:', e);
    }
}

/**
 * Trigger notification haptic feedback
 * @param {'success'|'warning'|'error'} type
 */
export async function notification(type = 'success') {
    if (!isNative()) return;
    try {
        const typeMap = {
            success: NotificationType.Success,
            warning: NotificationType.Warning,
            error: NotificationType.Error,
        };
        await Haptics.notification({ type: typeMap[type] || NotificationType.Success });
    } catch (e) {
        console.warn('Haptic notification failed:', e);
    }
}

/**
 * Trigger selection haptic (for selection changes)
 */
export async function selectionChanged() {
    if (!isNative()) return;
    try {
        await Haptics.selectionChanged();
    } catch (e) {
        console.warn('Haptic selection failed:', e);
    }
}

/**
 * Trigger a simple vibration
 * @param {number} duration - duration in ms (default 300)
 */
export async function vibrate(duration = 300) {
    if (!isNative()) return;
    try {
        await Haptics.vibrate({ duration });
    } catch (e) {
        console.warn('Haptic vibrate failed:', e);
    }
}

/**
 * Trigger a double-pulse vibration for qibla alignment feedback.
 * Uses Capacitor Haptics on native, falls back to Web Vibration API on browser.
 */
export async function doubleVibrate() {
    if (isNative()) {
        try {
            await Haptics.vibrate({ duration: 100 });
            await new Promise(r => setTimeout(r, 150));
            await Haptics.vibrate({ duration: 100 });
        } catch (e) {
            console.warn('Haptic doubleVibrate failed:', e);
        }
        return;
    }

    // Web Vibration API fallback (Android Chrome, etc.)
    if (navigator.vibrate) {
        navigator.vibrate([100, 150, 100]);
    }
}
