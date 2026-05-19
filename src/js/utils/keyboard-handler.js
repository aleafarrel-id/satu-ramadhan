import { Keyboard } from '@capacitor/keyboard';
import { isNative } from '../modules/system/platform.js';

export function initGlobalKeyboardHandler() {
    if (!isNative) return;

    Keyboard.addListener('keyboardWillShow', (info) => {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
        document.documentElement.classList.add('keyboard-open');
    });

    Keyboard.addListener('keyboardWillHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.documentElement.classList.remove('keyboard-open');
    });
}
