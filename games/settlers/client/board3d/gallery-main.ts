import { startGallery } from './gallery.ts';

declare global { interface Window { __FALLBACKS__?: Record<string, string> } }
startGallery({ root: document.getElementById('app')!, fallbackImages: window.__FALLBACKS__ ?? {} });
