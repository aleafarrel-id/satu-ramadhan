/**
 * Main JS Entry Point
 * Bootstrap the application with security boundary.
 */

// Install global error boundary FIRST (synchronous) —
// catches any uncaught exceptions from module evaluation onwards.
import { installGlobalErrorBoundary } from './js/utils/error-boundary.js';
installGlobalErrorBoundary();

import { initApp } from './js/app.js';

initApp();
