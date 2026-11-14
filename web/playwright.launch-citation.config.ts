import {defineConfig} from '@playwright/test';
import base from './playwright.launch-ranking.config';
/** Same existing trusted Chromium/loopback validation; separate evidence suite. */
export default defineConfig({...base,testMatch:'launch-citation.spec.ts'});
