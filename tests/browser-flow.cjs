/* End-to-end Web-first browser test on local server (18971) and static export (18972).
   Run with NODE_PATH pointing to a Playwright install. AI calls are mocked. */
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');

const root = path.resolve(__dirname, '..');
const staticPath = process.env.REDPEN_STATIC_PATH || '/';
const dailyDate = '2026-01-03T12:00:00';
const screenshotDir = process.env.REDPEN_MIDLOOP_SCREENSHOTS;
const draft = JSON.parse(fs.readFileSync(path.join(root, 'demo/bank/cubic-lost-root.json')));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    let dailyIds;
    for (const port of [18971, 18972]) {
      for (const lang of ['', 'zh/']) {
        const capture = screenshotDir && port === 18972 && lang === 'zh/';
        const page = await browser.newPage(capture ? {
          viewport: { width: 375, height: 667 }, deviceScaleFactor: 2,
          isMobile: true, hasTouch: true,
        } : {});
        await page.clock.setFixedTime(new Date(dailyDate));
        const shot = async (name) => {
          if (!capture) return;
          await page.mouse.move(0, 0);
          await page.screenshot({
            path: path.join(screenshotDir, `midloop-mobile-zh-${name}.png`),
            animations: 'disabled',
          });
        };
        const opener = require(`../demo/packs/logic/${lang ? 'zh' : 'en'}/logic-chat-laundry-queue.json`);
        const hitLine = opener.flaws[0].segment_id;
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('https://**', (r) => r.abort());

        // 1. First-screen instant play: lands directly on a playable Daily puzzle, no API key wall.
        await page.goto(`http://127.0.0.1:${port}${port === 18972 ? staticPath : '/'}${lang}`);
        await page.locator('button.seg-btn[data-seg="1"]').waitFor();
        assert.equal(await page.locator('#live-form').count(), 0, 'API/live form must not block first screen');
        const slots = page.locator('.daily-slot');
        const ids = await slots.evaluateAll((buttons) => buttons.map((button) => button.dataset.dailyId));
        assert.equal(ids.length, 3, 'Daily must show three stamp slots');
        assert.equal(ids[0], opener.id, 'Pinned day must use a shipped opener');
        dailyIds ||= ids;
        assert.deepEqual(ids, dailyIds, 'Daily IDs must match across languages and hosts');
        assert.equal(await page.locator('.daily-count, .daily-slot.done, .retort-slip').count(), 0);
        await shot('first');

        // A single tap commits and reveals a qualitative verdict.
        await page.locator(`button.seg-btn[data-seg="${hitLine}"]`).click();
        await page.locator('.verdict-stamp').waitFor();
        await page.locator(`[data-seg-item="${hitLine}"] .ink-slash-svg`).waitFor();
        assert.equal(await page.locator('.verdict-stamp').textContent(), lang ? '一针见血' : 'Sharp catch');
        assert.ok(await page.locator('.seg-stamp').count() > 1);
        assert.equal(await page.locator('.score, .accuracy-pill, .choice-drawer').count(), 0);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('redpen:history')).at(-1).score), null);
        const next = page.locator('[data-next-id]');
        const invite = next.filter({ hasText: lang ? '尽管再来' : 'Bring it on' });
        await invite.waitFor();
        assert.equal(await next.count(), 2);
        assert.equal(await page.locator('.daily-slot.done, [data-share-daily]').count(), 0);
        if (capture) await invite.scrollIntoViewIfNeeded();
        await shot('attitude');

        await invite.click();
        await page.locator('.retort-slip + .evidence-chat').waitFor();
        assert.equal(await slots.nth(0).locator('.daily-slot-mark').textContent(), lang ? '一针见血' : 'Caught');
        assert.equal(await slots.nth(1).getAttribute('aria-current'), 'step');
        assert.equal(await page.locator('.daily-slot.done').count(), 1);
        await shot('slip');
        if (capture) {
          await page.setViewportSize({ width: 320, height: 667 });
          assert.ok(await slots.last().evaluate((slot) =>
            slot.closest('.top-inner').lastElementChild.getBoundingClientRect().right <= innerWidth));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.setViewportSize({ width: 375, height: 667 });
        }

        await page.locator('[data-act="toggle-clean"]').click();
        await next.first().waitFor();
        assert.match(await page.locator('.verdict-stamp').textContent(), lang ? /放虎归山|没上钩/ : /Let it slip|Saw through the bait/);
        assert.equal(await next.count(), 1);
        assert.match(await next.textContent(), lang ? /下一题/ : /Next/);
        assert.equal(await page.locator('.daily-slot.done, [data-share-daily]').count(), 1);

        await next.click();
        await page.locator('[data-act="toggle-clean"]').waitFor();
        assert.equal(await page.locator('.daily-slot.done').count(), 2);
        assert.equal(await page.locator('.retort-slip').count(), 0);
        await shot('slots');
        await page.locator('[data-act="toggle-clean"]').click();
        await page.locator('[data-share-daily]').first().waitFor();
        assert.equal(await page.locator('.daily-slot.done').count(), 3);
        const ticketLine = lang ? '请继续。红笔还没盖帽。' : 'Do go on. The pen is still uncapped.';
        assert.equal(await page.locator('.docket-verdict').textContent(), ticketLine);
        if (capture) await page.locator('.share-card').scrollIntoViewIfNeeded();
        await shot('ticket');

        // Copy a spoiler-free Daily ticket.
        assert.equal(await page.locator(".docket-mark").count(), 3);
        await page.locator('[data-share-daily]').first().click();
        await page.locator('.share-preview pre').waitFor();
        const shareCard = await page.locator('.share-preview pre').textContent();
        assert.match(shareCard, lang ? /今日红笔 #\d+/ : /RedPen Daily #\d+/);
        assert.ok(shareCard.includes(ticketLine));
        assert.doesNotMatch(shareCard, /Step \d|步骤 \d|\/100|Accuracy|准确度/i);

        // Code remains available as a pack with the same immediate verdict.
        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-filter="code"]').click();
        await page.locator('[data-id="code-clean-binary-search"]').click();
        await page.locator('[data-seg="1"]').click();
        assert.equal(await page.locator('.verdict-stamp').textContent(), lang ? '冤假错案' : 'False alarm');
        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-filter="all"]').click();

        // Math renders offline before and after a single tap in a pack.
        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-id="sine-substitution"]').click();
        await page.locator('.evidence-brief .katex').first().waitFor();
        await page.locator('.seg-body .katex').first().waitFor();
        await page.locator('.evidence-conclusion .katex').first().waitFor();
        await page.locator('[data-seg="2"]').click();
        await page.locator('.verdict-stamp').waitFor();
        await page.locator('.debrief-line .katex').first().waitFor();
        assert.equal(await page.locator('.katex-error').count(), 0);

        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-id="cubic-lost-root"]').click();
        await page.locator('[data-seg="2"]').click();
        assert.equal(await page.locator('.verdict-stamp').textContent(), lang ? '一针见血' : 'Sharp catch');

        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-id="logic-chat-cabin-split"]').click();
        await page.locator('button.seg-btn[data-seg="1"]').waitFor();
        assert.ok(await page.locator('button.seg-btn[data-seg]').count() >= 4);
        assert.equal(await page.locator('button.seg-btn[data-seg="4"]').count(), 1);
        if (!lang) {
          assert.match(await page.locator('[data-seg="1"]').textContent(), /\$600.*\$200/);
          assert.equal(await page.locator('[data-seg="1"] .katex').count(), 0);
        }

        // 2. Navigate to Packs -> open cubic-lost-root -> test Advanced Free-Text mode + verify + hint.
        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-id="cubic-lost-root"]').click();
        await page.locator('.stuck-menu > summary').click();
        await page.locator('[data-input-mode="text"]').click();
        await page.locator('[data-field=step]').selectOption('2');
        await page.locator('[data-field=wrong]').fill('Dividing by x loses the zero solution.');
        await page.locator('[data-field=fix]').fill('x=0 or x=2 or x=-2');
        await page.locator('[data-act=hint]').click();
        await page.locator('.hint').waitFor();
        await page.locator('[data-act=submit]').click();
        assert.equal(await page.locator('.verdict-stamp').textContent(), lang ? '一针见血' : 'Sharp catch');
        await page.locator('.more-details > summary').click();
        await page.locator('[data-act=verify]').click();
        await page.locator('.verify-status').waitFor({state: 'attached'});
        assert.match(await page.locator('.verify-status').textContent(), /commitment|承诺/);

        // 3. Test clean Level 0 round in Light Mode (definite-integral).
        await page.locator('[data-nav="packs"]').click();
        await page.locator('[data-id="definite-integral"]').click();
        await page.locator('[data-act="toggle-clean"]').click();
        assert.equal(await page.locator('.verdict-stamp').textContent(), lang ? '没上钩' : 'Saw through the bait');
        assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('redpen:history')).length >= 5));
        // A wrongful flag gets the other pair of choices and a slip, even with reduced motion.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(page.url().split('#')[0]);
        await page.locator('button.seg-btn[data-seg="1"]').click();
        await page.locator('[data-attitude="concede"]').waitFor();
        assert.equal(await page.locator('[data-next-id]').count(), 2);
        await page.locator('[data-attitude="shrug"]').click();
        await page.locator('.retort-slip').waitFor();
        assert.equal(await slots.nth(0).locator('.daily-slot-mark').textContent(), lang ? '冤假错案' : 'Alarm');
        assert.equal(await page.locator('.evidence-stack').evaluate((card) => getComputedStyle(card).animationName), 'none');

        assert.deepEqual(errors, []);
        await page.close();
        console.log(`PASS web-first daily, light mode, share card, packs, advanced mode: ${port}/${lang}`);
      }
    }

    // 4. Secondary Workshop flow: AI settings, upload, live custom round, math symbols, AI comparison.
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://**', (r) => r.abort());
    const calls = [];
    await page.route('https://mock.example/v1/chat/completions', async (route) => {
      const body = route.request().postDataJSON();
      const task = body.messages[1].content;
      calls.push(task);
      let content;
      if (task.startsWith('MODE: CLI-SETTER')) content = JSON.stringify(draft);
      else if (task.startsWith('MODE: CLI-HUNTER')) {
        assert(!task.includes('ANSWER KEY'));
        content = "Step 2\nWhat's wrong: division by x loses zero\nFix: x=0,2,-2";
      } else {
        content = JSON.stringify({
          errors: [{ found: true, diagnosis: 1, fix: 1, comment: 'Correct.' }],
          false_alarms: [],
          bounties: [],
          feedback: 'Check zero before dividing.',
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content } }] }),
      });
    });

    await page.goto(`http://127.0.0.1:18972${staticPath}zh/`);
    await page.locator('.daily-slot').first().waitFor();
    await page.locator('[data-nav="workshop"]').click();
    await page.locator('#ai-settings').click();
    await page.locator('#provider').selectOption('DeepSeek');
    assert.match(await page.locator('#base').inputValue(), /deepseek/);
    await page.locator('#provider').selectOption('Custom');
    await page.locator('#base').fill('https://mock.example/v1');
    await page.locator('#model').fill('mock');
    await page.locator('#key').fill('not-a-real-key');
    await page.locator('#save').click();
    await page.locator('.focus-options summary').click();
    await page.locator('#problem-file').setInputFiles({
      name: 'problem.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Solve x^3=4x'),
    });
    await page.waitForFunction(() => document.querySelector('[name=topic]').value === 'Solve x^3=4x');
    await page.locator('[name=level]').selectOption('1');
    await page.locator('[name=difficulty]').selectOption('intro');
    await page.locator('[name=answer]').fill('-2,0,2');
    await page.locator('[name=focus][value=division-by-zero]').check();
    await page.locator('#live-form button[type=submit]').click();
    await page.locator('[data-field=step]').waitFor();
    await page.reload();
    await page.locator('[data-field=step]').waitFor();
    assert(calls[0].includes('Reference answer: -2,0,2'));
    assert(calls[0].includes('Difficulty: intro'));
    await page.locator('[data-field=step]').selectOption('2');
    await page.locator('[data-field=wrong]').fill('除以x漏解，零也可以');
    await page.locator('[data-field=fix]').focus();
    await page.locator('[data-symbol]').first().click();
    assert.equal(await page.locator('[data-field=fix]').inputValue(), '\\(\\frac{a}{b}\\)');
    await page.locator('#math-preview .katex .mfrac').waitFor();
    await page.locator('[data-field=fix]').fill('x=0,2,-2');
    await page.locator('[data-act=submit]').click();
    await page.locator('.score').waitFor();
    assert.equal(await page.locator('.score').textContent(), '100/100');
    await page.locator('.more-details > summary').click();
    await page.locator('[data-act=ai]').click();
    await page.locator('.more-details pre').waitFor();
    assert.match(await page.locator('.more-details pre').textContent(), /Step 2/);
    assert.deepEqual(errors, []);
    console.log('PASS workshop AI settings, upload, live round, symbols, model grade, AI comparison');
    await page.close();

    // 5. Tamper rejection & mobile viewport (375x667) layout check (no horizontal overflow).
    const tamper = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await tamper.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
    await tamper.route('**/secrets/cubic-lost-root.json*', async (route) => {
      const data = { key: structuredClone(draft.key) };
      data.key.clean_final_answer += ' tampered';
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await tamper.goto(`http://127.0.0.1:18972${staticPath}zh/`);
    await tamper.locator('button.seg-btn[data-seg="1"]').waitFor();
    const holdBounds = await tamper.locator('[data-act="toggle-clean"]').boundingBox();
    assert(holdBounds && holdBounds.y + holdBounds.height <= 667, 'Hold should fit in the first viewport');
    assert(await tamper.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile first screen overflowed');
    await tamper.locator('button.seg-btn[data-seg="1"]').click();
    await tamper.locator('.verdict-stamp').waitFor();
    assert(await tamper.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile reveal overflowed');

    await tamper.locator('[data-nav="packs"]').click();
    await tamper.locator('[data-id="cubic-lost-root"]').click();
    await tamper.locator('button.seg-btn[data-seg="2"]').click();
    await tamper.locator('.error').waitFor();
    assert.match(await tamper.locator('.error').textContent(), /承诺/);
    assert.equal(await tamper.locator('.verdict-stamp').count(), 0);
    await tamper.close();
    console.log('PASS mobile layout (first screen + tap-to-reveal) and tamper rejection');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
