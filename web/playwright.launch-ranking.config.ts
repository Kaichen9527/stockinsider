import {defineConfig,devices} from '@playwright/test';
// Controlled existing Next process only: no dotenv, server start or source IO.
const baseURL=process.env.E2E_BASE_URL;
if(!baseURL||process.env.PLAYWRIGHT_SKIP_WEBSERVER!=='1')throw Error('external_loopback_next_server_required');
const target=new URL(baseURL);
if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw Error('loopback_browser_origin_required');
export default defineConfig({testDir:'./e2e',testMatch:['launch-ranking.spec.ts','launch-outcome.spec.ts'],fullyParallel:false,workers:1,retries:0,reporter:'list',
  outputDir:process.env.PLAYWRIGHT_OUTPUT_DIR||'../work/launch-ranking-browser-results',
  use:{baseURL,trace:'retain-on-failure',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}},projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'mobile',use:{...devices['Pixel 7']}}]});
