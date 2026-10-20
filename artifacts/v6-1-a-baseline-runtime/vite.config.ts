import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
// Serve the two touched runtime modules from HEAD without swapping live sources.
export default defineConfig({ root, plugins: [{ name: 'v6-baseline-runtime', enforce: 'pre', load(id) {
  for (const name of ['combat', 'run-flow']) {
    if (id.split('?')[0].replaceAll('\\', '/') === resolve(root, 'src', name+'.ts').replaceAll('\\', '/')) {
      return readFileSync(resolve(import.meta.dirname, name+'.txt'), 'utf8');
    }
  }
} }] });
