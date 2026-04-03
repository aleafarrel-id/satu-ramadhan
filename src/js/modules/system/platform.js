/**
 * Platform Detection Module
 * Single source of truth for platform checking across the app.
 */

import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isWeb = !isNative;
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
