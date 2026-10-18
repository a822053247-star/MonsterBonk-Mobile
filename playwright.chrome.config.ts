import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({...config,projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome',launchOptions:{args:['--enable-unsafe-swiftshader']}}}]});
