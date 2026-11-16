/*
 * Lets Playwright run from a Cursor agent shell on macOS.
 *
 * Inside the sandbox, Chromium (and the system Chrome) segfault on launch
 * under seatbelt, so stop early and say to run the command outside it instead
 * of Playwright's "Executable doesn't exist ... npx playwright install".
 *
 * Outside it, the agent shell keeps the sandbox's PLAYWRIGHT_BROWSERS_PATH,
 * an empty per-sandbox cache, after any sandboxed command has run. Dropping it
 * sends Playwright back to the user cache where the browsers are installed.
 *
 * Load it before playwright, which reads the path once on import:
 *   require('./scripts/playwright-sandbox');
 */
if (process.env.CURSOR_SANDBOX === 'seatbelt') {
  console.error([
    'Playwright cannot launch a browser inside the Cursor agent sandbox: Chromium segfaults on start.',
    'Re-run this command outside the sandbox (required_permissions: ["all"]).',
    'Do not run `npx playwright install`: the browsers are already in ~/Library/Caches/ms-playwright.'
  ].join('\n'));
  process.exit(1);
}

if ((process.env.PLAYWRIGHT_BROWSERS_PATH || '').includes('cursor-sandbox-cache')) {
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
}
