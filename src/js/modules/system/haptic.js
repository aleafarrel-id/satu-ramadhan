/**
 * Haptic Feedback Module
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { isNative } from './platform.js';

const IMPACT_STYLE_MAP = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
};

/**
 * Trigger impact haptic feedback.
 *
 * Fire-and-forget: dispatches the native bridge call immediately without
 * awaiting the response. This eliminates haptic lag during rapid successive
 * taps — each call goes straight to the native layer without queuing behind
 * the previous one's round-trip.
 *
 * @param {'light'|'medium'|'heavy'} style
 */
export function impact(style = 'light') {
    if (!isNative) return;
    Haptics.impact({ style: IMPACT_STYLE_MAP[style] || ImpactStyle.Light })
        .catch(e => console.warn('Haptic impact failed:', e));
}

/**
 * Trigger notification haptic feedback
 * @param {'success'|'warning'|'error'} type
 */
const NOTIFICATION_TYPE_MAP = {
    success: NotificationType.Success,
    warning: NotificationType.Warning,
    error: NotificationType.Error,
};

export function notification(type = 'success') {
    if (!isNative) return;
    Haptics.notification({ type: NOTIFICATION_TYPE_MAP[type] || NotificationType.Success })
        .catch(e => console.warn('Haptic notification failed:', e));
}

/**
 * Trigger selection haptic (for selection changes)
 */
export function selectionChanged() {
    if (!isNative) return;
    Haptics.selectionChanged()
        .catch(e => console.warn('Haptic selection failed:', e));
}

/**
 * Trigger a simple vibration
 * @param {number} duration - duration in ms (default 300)
 */
export async function vibrate(duration = 300) {
    if (!isNative) return;
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
    if (isNative) {
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

/**
 * Trigger a distinctive "locked" feedback pattern.
 * Medium tap + short pause + light tap — clearly different from:
 *   - Normal count: single light impact
 *   - Round complete: double equal-length vibration
 * Web fallback: [80ms vibrate, 60ms pause, 30ms vibrate]
 */
export async function lockVibrate() {
    if (isNative) {
        try {
            await Haptics.impact({ style: ImpactStyle.Medium });
            await new Promise(r => setTimeout(r, 60));
            await Haptics.impact({ style: ImpactStyle.Light });
        } catch (e) {
            console.warn('Haptic lockVibrate failed:', e);
        }
        return;
    }

    // Web Vibration API fallback
    if (navigator.vibrate) {
        navigator.vibrate([80, 60, 30]);
    }
}
