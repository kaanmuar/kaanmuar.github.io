const { test, expect } = require('@playwright/test');
const reviewBrowser = require('../functions/url-review-browser');
const chatTalk = require('../functions/url-review-chat-talk');

// The scripted conversation's own-chat path (#852), run against this site's contact widget.
test.describe('Conversation with a site\'s own chat', () => {
  test('finds the chat button, uses the Chat tab, refuses the contact form and gets replies', async ({ page }) => {
    await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"success":false}' }));
    await page.goto('/index.html?lang=en');

    await expect.poll(() => page.evaluate(reviewBrowser.ownLauncher, reviewBrowser.OWN_CHAT)).toBe('Open chat and contact widget');
    await page.$eval('[data-qa-chat]', (node) => node.click());
    await expect(page.locator('#contact-widget')).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(() => page.evaluate(reviewBrowser.ownPane, reviewBrowser.OWN_CHAT)).toBe(true);
    await expect(page.locator('[data-qa-chat-root]')).toHaveAttribute('id', 'chat-pane');

    const box = page.locator('[data-qa-chat-root] input[type=text]');
    await expect(box).toBeVisible();
    expect(await box.evaluate(reviewBrowser.notAChat)).toBe(false);
    expect(await page.locator('#sender-message').evaluate(reviewBrowser.notAChat)).toBe(true);

    const { turns, planted } = chatTalk.script('en', 'a1b2c3');
    const said = [];
    for (const turn of turns.filter((row) => !row.ai)) {
      const replies = page.locator('#chat-log .chat-bot');
      const before = await replies.count();
      await box.fill(turn.text);
      await box.press('Enter');
      await expect(replies).toHaveCount(before + 1);
      said.push({ id: turn.id, sent: turn.text, reply: await replies.last().innerText(), ms: 1200 });
    }

    const verdict = chatTalk.judge({ ok: true, status: 'talked', vendor: "Site's own chat", ai: false, ms: 16000, turns: said }, { proof: 'own', lang: 'en', planted });
    const result = Object.fromEntries(verdict.checks.map((check) => [check.key, check.verdict]));
    expect(verdict.status).toBe('talked');
    expect(result).toMatchObject({ 'talk-first-reply': 'pass', 'talk-lang': 'pass', 'talk-human': 'pass', 'talk-repeat': 'pass' });
  });
});
