/* Run with NODE_PATH pointing to a Playwright install and the local/static servers
   at 18971/18972. AI responses are mocked: no credentials or paid calls required. */
const {chromium} = require('playwright');
const fs = require('fs');
const assert = require('assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '..');
const draft = JSON.parse(fs.readFileSync(path.join(root,'demo/bank/cubic-lost-root.json')));
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome', headless:true,args:['--no-sandbox']});
  try {
    for (const port of [18971,18972]) for (const lang of ['', 'zh/']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://cdn.jsdelivr.net/**', r => r.abort()); // Offline formulas remain readable.
      await page.goto(`http://127.0.0.1:${port}/${lang}`);
      await page.locator('[data-id="cubic-lost-root"]').click();
      await page.locator('[data-field=step]').selectOption('2');
      await page.locator('[data-field=wrong]').fill('Dividing by x loses the zero solution.');
      await page.locator('[data-field=fix]').fill('x=0 or x=2 or x=-2');
      await page.locator('[data-act=verify]').click();
      await page.getByRole('status').filter({hasText: /commitment|承诺/}).waitFor();
      assert.match(await page.locator('[data-field=fix]').inputValue(), /x=0/);
      await page.locator('[data-act=hint]').click();
      await page.locator('.hint').waitFor();
      await page.locator('[data-act=submit]').click();
      await page.locator('.score').waitFor();
      assert.match(await page.locator('.breakdown').nth(1).textContent(), /matches|一致/);
      await page.locator('[data-home]').first().click();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('redpen:history')).length), 1);
      await page.reload();
      await page.locator('[data-id="definite-integral"]').click();
      await page.locator('[data-field=step]').selectOption('clean');
      page.once('dialog', d => d.accept());
      await page.locator('[data-act=submit]').click();
      await page.locator('.score').waitFor();
      assert.equal(await page.locator('.score').textContent(), '100/100');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS built-in structured grading, hints, verify, clean, history: ${port}/${lang}`);
    }
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', r => r.abort());
    let calls = [];
    await page.route('https://mock.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      const task = body.messages[1].content;
      calls.push(task);
      let content;
      if (task.startsWith('MODE: CLI-SETTER')) content = JSON.stringify(draft);
      else if (task.startsWith('MODE: CLI-HUNTER')) {
        assert(!task.includes('ANSWER KEY')); content = "Step 2\nWhat's wrong: division by x loses zero\nFix: x=0,2,-2";
      } else content = JSON.stringify({errors:[{found:true,diagnosis:1,fix:1,comment:'Correct.'}],false_alarms:[],bounties:[],feedback:'Check zero before dividing.'});
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content}}]})});
    });
    await page.goto('http://127.0.0.1:18972/zh/');
    await page.locator('#ai-settings').click();
    await page.locator('#provider').selectOption('DeepSeek');
    assert.match(await page.locator('#base').inputValue(), /deepseek/);
    await page.locator('#provider').selectOption('Custom');
    await page.locator('#base').fill('https://mock.example/v1');
    await page.locator('#model').fill('mock');
    await page.locator('#key').fill('not-a-real-key');
    await page.locator('#save').click();
    await page.locator('#problem-file').setInputFiles({name:'problem.txt',mimeType:'text/plain',buffer:Buffer.from('Solve x^3=4x')});
    await page.waitForFunction(() => document.querySelector('[name=topic]').value === 'Solve x^3=4x');
    await page.locator('[name=level]').selectOption('1');
    await page.locator('[name=difficulty]').selectOption('intro');
    await page.locator('[name=answer]').fill('-2,0,2');
    await page.locator('.focus-options summary').click();
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
    assert.equal(await page.locator('[data-field=fix]').inputValue(), '$\\frac{a}{b}$');
    assert.match(await page.locator('#math-preview').textContent(), /frac/);
    await page.locator('[data-field=fix]').fill('x=0,2,-2');
    await page.locator('[data-act=submit]').click();
    await page.locator('.score').waitFor();
    assert.equal(await page.locator('.score').textContent(), '100/100');
    await page.locator('[data-act=ai]').click();
    await page.locator('pre').waitFor();
    assert.match(await page.locator('pre').textContent(), /Step 2/);
    assert.deepEqual(errors, []);
    console.log('PASS static custom AI settings, upload, difficulty, focus, reference, symbols, model grade, AI comparison');
    await page.close();
    const tamper = await browser.newPage({viewport:{width:390,height:844}});
    await tamper.route('https://cdn.jsdelivr.net/**', r => r.abort());
    await tamper.route('**/secrets/cubic-lost-root.json', async route => {
      const data = {key:structuredClone(draft.key)}; data.key.clean_final_answer += ' tampered';
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await tamper.goto('http://127.0.0.1:18972/zh/');
    await tamper.locator('[data-id="cubic-lost-root"]').click();
    await tamper.locator('[data-field=step]').selectOption('2');
    await tamper.locator('[data-field=wrong]').fill('division by zero');
    await tamper.locator('[data-act=submit]').click();
    await tamper.locator('.error').waitFor();
    assert.match(await tamper.locator('.error').textContent(), /承诺/);
    assert.equal(await tamper.locator('.score').count(), 0);
    assert(await tamper.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await tamper.close();
    console.log('PASS live-round refresh, tamper rejection and mobile layout');
    if (process.env.MATHJAX_DIR) {
      const math = await browser.newPage();
      await math.route('https://cdn.jsdelivr.net/npm/mathjax@3/es5/**', async route => {
        const relative = new URL(route.request().url()).pathname.split('/es5/')[1];
        await route.fulfill({path:path.join(process.env.MATHJAX_DIR,relative)});
      });
      await math.goto('http://127.0.0.1:18972/');
      await math.locator('[data-id="cubic-lost-root"]').click();
      await math.locator('[data-field=step]').selectOption('2');
      await math.locator('[data-field=fix]').focus();
      await math.locator('[data-symbol]').first().click();
      await math.locator('#math-preview mjx-container').waitFor();
      assert.equal(await math.locator('#math-preview mjx-mfrac').count(),1);
      await math.close();
      console.log('PASS actual MathJax fraction preview rendering');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
