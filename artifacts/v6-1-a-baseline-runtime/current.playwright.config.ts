import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../playwright.config';

export default defineConfig({ ...base, testDir: '../../tests', outputDir: 'test-results/current', reporter: 'line',
  webServer: { ...base.webServer, cwd: resolve(import.meta.dirname, '../..') },
});
