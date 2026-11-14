// Isolated browser check; every HTTP request is intercepted. No production writes.
// Optional PLAYWRIGHT_MODULE and CHROME_EXECUTABLE select installed tools; default is Playwright's Chromium.
// PDF text/image inspection uses macOS Swift + PDFKit. This script is optional, outside npm test.
// --save-race-only refreshes that regression in results JSON without regenerating PDFs/screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'));
const saveRaceOnly = process.argv.includes('--save-race-only');
const evidence = { started: new Date().toISOString(), sourceSha256: crypto.createHash('sha256').update(html).digest('hex'),
  errors: [], consoleErrors: [], blockedRequests: [], downloads: [], imports: [], prints: [] };
const target = 'https://math.therichmain.com/';
const field = async (page, id, value) => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab'); };
const state = page => page.evaluate(() => ({
  price: window._last.input.purchasePrice,
  name: document.querySelector('#dealName').value,
  mode: document.querySelector('#segMode .on').dataset.mode,
  contract: JSON.parse(localStorage.getItem('mm_contract_v1')),
  lender: JSON.parse(localStorage.getItem('mm_lender_v1')),
  offer: JSON.parse(localStorage.getItem('mm_loi_v1'))
}));
async function saveRace(page) {
  const result = evidence.saveRace = { started: new Date().toISOString(), sourceSha256: evidence.sourceSha256,
    browser: evidence.browser, status: 'running', lock: 'mainmath-saved-deals' };
  assert.equal(await page.evaluate(() => !!navigator.locks?.request), true);
  await field(page, 'dealName', '');
  await field(page, 'purchasePrice', 100000);
  await page.evaluate(() => {
    navigator.locks.request('mainmath-saved-deals', () => new Promise(resolve => { window.auditReleaseSaveLock = resolve; }));
  });
  await page.waitForFunction(() => typeof window.auditReleaseSaveLock === 'function');
  await page.locator('#btnSave').click();
  await page.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === 'mainmath-saved-deals'));
  await page.locator('#btnReset').click();
  await field(page, 'purchasePrice', 200000);
  assert.equal(await page.locator('#dealName').inputValue(), '');
  await page.evaluate(() => { window.auditReleaseSaveLock(); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('dmp_deals_v1') || '[]').length === 1);
  assert.equal(await page.locator('#dealName').inputValue(), '', 'Old save must not rename the reset draft');
  assert.equal((await state(page)).price, 200000);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dmp_deals_v1'))[0].inputs.purchasePrice), 100000);
  result.draftNameAfterOldSave = '';
  await page.locator('#btnSave').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('dmp_deals_v1') || '[]').length === 2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dmp_deals_v1')));
  assert.deepEqual(saved.map(deal => deal.inputs.purchasePrice).sort((a, b) => a - b), [100000, 200000]);
  assert.equal(new Set(saved.map(deal => deal.name)).size, 2);
  result.savedDeals = saved.map(deal => ({ name: deal.name, price: deal.inputs.purchasePrice }));
  result.status = 'passed'; result.finished = new Date().toISOString();
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || undefined,
    headless: true, args: ['--no-first-run'] });
  evidence.browser = browser.version();
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      if (route.request().url() === target) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      evidence.blockedRequests.push({ method: route.request().method(), url: route.request().url() });
      return route.fulfill({ status: 204, body: '' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
    await page.goto(target);
    await saveRace(page);
    if (saveRaceOnly) {
      assert.deepEqual(evidence.errors, []);
      assert.deepEqual(evidence.consoleErrors, []);
      assert.equal(evidence.blockedRequests.some(r => r.method === 'POST'), false);
      await context.close();
      return;
    }
    await page.locator('[data-mode="full"]').click();
    await field(page, 'dealName', 'Local Chrome Audit');
    await field(page, 'purchasePrice', 123456.78);
    await page.locator('[data-tab="contract"]').click();
    await field(page, 'cHard', 456789.12);
    await page.locator('[data-tab="lender"]').click();
    await field(page, 'lLot', 234567.89);
    await page.locator('[data-tab="loi"]').click();
    await field(page, 'oPrice', 100.49);
    await field(page, 'oEarnest', 1.49);
    await field(page, 'oBuyer', 'Audit Buyer LLC');
    await field(page, 'oSeller', 'Audit Seller LLC');
    await field(page, 'oProp', 'Fictional audit parcel');
    await field(page, 'oTitleCo', 'Audit Title');
    await page.locator('[data-tab="spec"]').click();
    const original = await state(page);
    assert.equal(original.price, 123456.78);
    const received = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const download = await received;
    const filename = download.suggestedFilename();
    assert.equal(filename, 'local-chrome-audit.json');
    const savedPath = path.join(__dirname, filename);
    await download.saveAs(savedPath);
    assert.equal(await download.failure(), null);
    const exported = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.equal(exported.inputs.purchasePrice, 123456.78);
    assert.equal(exported.effective.purchasePrice, 123456.78);
    assert.equal(exported.tools.contract.cHard, 456789.12);
    assert.equal(exported.tools.lender.lLot, 234567.89);
    assert.equal(exported.tools.offer.oPrice, 100.49);
    assert.equal(exported.tools.offer.oEarnest, 1.49);
    evidence.downloads.push({ filename, bytes: fs.statSync(savedPath).size, price: exported.inputs.purchasePrice, failure: null });
    await field(page, 'purchasePrice', 999999.99);
    await field(page, 'dealName', 'Changed after download');
    await page.locator('[data-tab="contract"]').click(); await field(page, 'cHard', 888888);
    await page.locator('[data-tab="lender"]').click(); await field(page, 'lLot', 777777);
    await page.locator('[data-tab="loi"]').click(); await field(page, 'oPrice', 666666);
    await page.locator('[data-tab="spec"]').click();
    const chooserReady = page.waitForEvent('filechooser');
    await page.locator('#btnImport').click();
    await (await chooserReady).setFiles(savedPath);
    await page.waitForFunction(() => window._last.input.purchasePrice === 123456.78);
    assert.deepEqual(await state(page), original);
    evidence.imports.push({ kind: 'downloaded export', restoredAllFourTools: true, price: 123456.78 });
    for (const [filename, contents] of [['malformed.json', '{not json'], ['unrelated.json', '{"hello":"world"}']]) {
      await page.locator('#importFile').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(contents) });
      await page.waitForFunction(() => document.querySelector('.toast').textContent.includes('not a MainMath export'));
      assert.deepEqual(await state(page), original);
      evidence.imports.push({ kind: filename, preservedAllFourTools: true });
      await page.evaluate(() => document.querySelector('.toast').textContent = '');
    }
    await page.waitForFunction(() => !document.querySelector('canvas'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, 'local-desktop-1440.png') });
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 375, height: 812 });
    await mobile.goto(target);
    await mobile.screenshot({ path: path.join(__dirname, 'local-mobile-375.png') });
    await mobile.close();
    for (const tab of ['spec', 'contract', 'lender', 'loi']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const filename = `local-print-${tab}.pdf`;
      await page.pdf({ path: path.join(__dirname, filename), format: 'Letter', printBackground: true,
        margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' } });
      evidence.prints.push({ tab, filename, bytes: fs.statSync(path.join(__dirname, filename)).size });
    }
    const inspection = JSON.parse(execFileSync('swift', [path.join(__dirname, 'inspect-pdfs.swift'),
      ...evidence.prints.map(p => path.join(__dirname, p.filename))], { encoding: 'utf8' }));
    fs.writeFileSync(path.join(__dirname, 'local-print-content.json'), JSON.stringify(inspection, null, 2));
    for (let i = 0; i < inspection.length; i++) {
      const document = inspection[i], text = document.pages.map(p => p.text).join('\n');
      assert.ok(document.pages[0].characters > 100, `${evidence.prints[i].tab}: header-only first page`);
      assert.ok(document.pages.every(p => p.characters > 50), `${evidence.prints[i].tab}: blank printed page`);
      assert.match(text, /MainMath.*Local Chrome Audit/);
      evidence.prints[i].pages = document.pageCount;
      evidence.prints[i].firstPageCharacters = document.pages[0].characters;
      if (evidence.prints[i].tab === 'spec') assert.match(text, /\$123,457/);
      if (evidence.prints[i].tab === 'loi') {
        assert.match(text, /Purchase price\. \$100\.49, paid at closing\./);
        assert.match(text, /Earnest money\. \$1\.49, deposited with Audit Title/);
        assert.match(text, /SELLER: Audit Seller LLC/);
      }
    }
    await page.evaluate(() => { window.auditPrintCount = 0; window.addEventListener('beforeprint', () => window.auditPrintCount++); });
    await page.locator('#btnPrint').click();
    await page.waitForFunction(() => window.auditPrintCount > 0);
    evidence.printButtonTriggered = true;
    assert.deepEqual(evidence.errors, []);
    assert.equal(evidence.blockedRequests.some(r => r.method === 'POST'), false);
    await context.close();
  } finally {
    await browser.close();
    evidence.finished = new Date().toISOString();
    const resultsPath = path.join(__dirname, 'local-chrome-results.json');
    const results = saveRaceOnly ? { ...JSON.parse(fs.readFileSync(resultsPath, 'utf8')), saveRace: evidence.saveRace } : evidence;
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    if (saveRaceOnly) console.log(JSON.stringify(evidence.saveRace, null, 2));
  }
  console.log(JSON.stringify(evidence, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
