import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config';

export default defineConfig({ ...base, testDir: '../../tests', outputDir: 'test-results', reporter: 'line',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5183' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5183 --strictPort --config artifacts/v6-1-a-baseline-runtime/vite.config.ts',
    cwd: resolve(import.meta.dirname, '../..'), url: 'http://127.0.0.1:5183', reuseExistingServer: false },
});
