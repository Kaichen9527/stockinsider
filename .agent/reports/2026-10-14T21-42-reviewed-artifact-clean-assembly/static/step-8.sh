node web/scripts/sync-official-authority.mjs --check
npm run test:tw-entry-plan
node --test scripts/package-standalone-release.test.mjs
npm --prefix web run typecheck
npm --prefix web run lint
git diff --exit-code

