import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'iphone-app.spec.ts',workers:1,timeout:90000,
 use:{baseURL:'http://127.0.0.1:5183',viewport:{width:844,height:390},hasTouch:true,deviceScaleFactor:2,actionTimeout:10000},
 projects:[{name:'webkit',use:{browserName:'webkit'}},{name:'chromium',use:{browserName:'chromium',launchOptions:{args:['--enable-unsafe-swiftshader']}}}],
 reporter:'list',outputDir:'artifacts/iphone-test-output',
 webServer:{command:'node scripts/serve-iphone.mjs',env:{IPHONE_PREVIEW_PORT:'5183'},url:'http://127.0.0.1:5183/MonsterBonk-Mobile/',reuseExistingServer:false}});
