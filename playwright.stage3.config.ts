import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'behavior-relics.spec.ts',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:5180',viewport:{width:844,height:390},browserName:'chromium',launchOptions:{args:['--enable-unsafe-swiftshader']}},
  reporter:'list',outputDir:'artifacts/stage3-test-output',
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180',url:'http://127.0.0.1:5180',reuseExistingServer:false}});
