import { boot } from './app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app element is missing');
boot(root);
