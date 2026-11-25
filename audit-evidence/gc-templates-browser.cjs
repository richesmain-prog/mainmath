// Optional native Chrome QA. Set PLAYWRIGHT_MODULE and CHROME_EXECUTABLE; --live verifies published HTML.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'));
const live = process.argv.includes('--live'), url = 'https://math.therichmain.com/';
const output = path.join(os.tmpdir(), 'mainmath-gc-templates'); fs.mkdirSync(output, { recursive:true });
const evidence = { time:new Date().toISOString(), live, sourceSha256:crypto.createHash('sha256').update(html).digest('hex'), errors:[], posts:[], types:[], widths:[] };
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_EXECUTABLE || undefined });
  try {
    const context = await browser.newContext({ acceptDownloads:true, viewport:{ width:1440, height:1000 } });
    await context.route('**/*', route => {
      if (route.request().method() === 'POST') { evidence.posts.push(route.request().url()); return route.abort(); }
      if (!live && route.request().url() === url) return route.fulfill({ status:200, contentType:'text/html', body:html });
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', e => evidence.errors.push(e.message));
    const response = await page.goto(url, { waitUntil:'networkidle' }); assert.equal(response.status(), 200);
    if (live) assert.equal(crypto.createHash('sha256').update(await response.body()).digest('hex'), evidence.sourceSha256);
    await page.locator('#dealName').fill('GC template QA');
    await page.locator('#segTab [data-tab="contract"]').click();
    for (const [id, value] of Object.entries({ cHard:100000, cPermits:10000, cDesign:20000, cContPct:10, cFeePct:15, cSharePct:40, cLumpPct:20, cDbPct:25 })) {
      await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).blur();
    }
    // Browser clicks with isolated clipboard/print sinks; downloads and PDF rendering are real.
    await page.evaluate(() => {
      navigator.clipboard.writeText = async text => { window.copiedAgreement = text; };
      window.print = () => { window.printSnapshot = document.getElementById('agreementPrint').textContent; };
    });
    const expected = { costplus:'Estimated GC compensation including fee: $126,500.00', gmp:'Proposed guaranteed maximum GC compensation: $139,150.00', lump:'Proposed fixed construction price: $145,200.00', db:'Proposed fixed design-build price: $176,250.00' };
    for (const type of Object.keys(expected)) {
      await page.locator(`[data-template="${type}"]`).click();
      assert.equal(await page.locator('#cAgreementType').inputValue(), type);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'cAgreementText');
      const text = await page.locator('#cAgreementText').textContent();
      assert.ok(text.includes(expected[type])); assert.ok(text.includes('Project reference: GC template QA'));
      await page.locator('[data-v="10"]').click(); assert.equal(await page.locator('#cAgreementText').textContent(), text);
      await page.locator('#cAgreementCopy').click(); assert.equal(await page.evaluate(() => window.copiedAgreement), text);
      const pending = page.waitForEvent('download'); await page.locator('#cAgreementDownload').click(); const download = await pending;
      assert.equal(fs.readFileSync(await download.path(), 'utf8'), text);
      assert.equal(download.suggestedFilename(), `gc-template-qa-${type}-agreement-draft.txt`);
      await page.locator('#cAgreementPrint').click(); assert.equal(await page.evaluate(() => window.printSnapshot), text);
      await page.emulateMedia({ media:'print' });
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).paddingBottom), '0px');
      assert.equal(await page.locator('#agreementPrint').isVisible(), true); assert.equal(await page.locator('#cCards').isVisible(), false);
      await page.pdf({ path:path.join(output, `${type}.pdf`), format:'Letter', margin:{ top:'0.5in', right:'0.5in', bottom:'0.5in', left:'0.5in' } });
      await page.evaluate(() => dispatchEvent(new Event('afterprint'))); await page.emulateMedia({ media:'screen' });
      assert.equal(await page.evaluate(() => document.body.classList.contains('print-agreement')), false);
      evidence.types.push({ type, price:expected[type], characters:text.length, download:download.suggestedFilename(), printOnly:true });
    }
    await page.reload({ waitUntil:'networkidle' }); assert.equal(await page.locator('#cAgreementType').inputValue(), 'db');
    await page.locator('#segTab [data-tab="spec"]').click(); await page.locator('#dealName').fill('Renamed project');
    await page.locator('#segTab [data-tab="contract"]').click(); assert.match(await page.locator('#cAgreementText').textContent(), /Project reference: Renamed project/);
    // Actual export/import preserves template selection along with all existing terms.
    await page.locator('#segTab [data-tab="spec"]').click();
    const pending = page.waitForEvent('download'); await page.locator('#btnExport').click(); const download = await pending;
    const bytes = fs.readFileSync(await download.path()); assert.equal(JSON.parse(bytes).tools.contract.agreementType, 'db');
    await page.locator('#btnReset').click(); await page.locator('#importFile').setInputFiles({ name:'deal.json', mimeType:'application/json', buffer:bytes });
    await page.waitForFunction(() => document.getElementById('dealName').value === 'Renamed project');
    await page.locator('#segTab [data-tab="contract"]').click(); assert.equal(await page.locator('#cAgreementType').inputValue(), 'db');
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height:1000 }); await page.locator('#cAgreementPanel').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path:path.join(output, `gc-${width}.png`) }); evidence.widths.push(width);
    }
    assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.posts, []); evidence.passed = true;
  } finally {
    await browser.close(); fs.writeFileSync(path.join(__dirname, live ? 'gc-templates-live.json' : 'gc-templates-local.json'), JSON.stringify(evidence, null, 2));
  }
  console.log(JSON.stringify(evidence, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
