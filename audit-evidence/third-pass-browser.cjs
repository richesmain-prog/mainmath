// Optional real-browser end-to-end audit. Requires an installed Playwright and Chrome.
// PLAYWRIGHT_MODULE / CHROME_EXECUTABLE select installed tools. --live loads published HTML.
// Each run uses a fresh browser context and blocks all POST requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'index.html'));
const live = process.argv.includes('--live'), url = 'https://math.therichmain.com/';
const evidence = { time: new Date().toISOString(), live, sourceSha256: crypto.createHash('sha256').update(html).digest('hex'), errors: [], posts: [], checks: [] };
const num = s => Number(s.replace(/[^\d.\-]/g, ''));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.51, `${message}: ${actual} != ${expected}`);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => {
      if (route.request().method() === 'POST') { evidence.posts.push(route.request().url()); return route.abort(); }
      if (!live && route.request().url() === url) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', e => evidence.errors.push(e.message));
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    if (live) assert.equal(crypto.createHash('sha256').update(await response.body()).digest('hex'), evidence.sourceSha256);
    const tab = async id => page.locator(`#segTab [data-tab="${id}"]`).click();
    const field = async (id, value) => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).blur(); };
    const value = async id => num(await page.locator('#' + id).inputValue());
    const textNumber = async id => num(await page.locator('#' + id).textContent());
    await page.locator('#segMode [data-mode="full"]').click();
    await page.locator('details:visible').evaluateAll(ds => ds.forEach(d => d.open = true));
    const spec = { purchasePrice: 100000, buildableSqft: 1000, buildCostPerSqft: 200, salePerSqft: 500,
      softCostPct: 10, contingencyPct: 5, permitFees: 9000, buyClosingPct: 2, monthlyCarry: 1000,
      buildMonths: 10, sellMonths: 2, sellingCostPct: 6, ltcPct: 80, maxLtvPct: 72, ratePct: 12, pointsPct: 2, lenderFee: 3000 };
    for (const [id, amount] of Object.entries(spec)) await field(id, amount);
    await page.locator('#swLoan').click(); // cash acquisition fixture
    const expectedBuild = 200000 + 20000 + 11000 + 9000;
    near(await textNumber('kAllIn'), 100000 + expectedBuild + 2000 + 13000, 'Spec cost before selling');
    near(await textNumber('kProfit'), 115000, 'Spec sale less all costs');
    near(await textNumber('kCash'), 355000, 'Spec cash before sale');
    near(await textNumber('solveLand'), (500000 * 0.8 - expectedBuild - 13000 - 30000) / 1.02, '20% margin land ceiling');
    evidence.checks.push({ workflow: 'Spec acquisition → cost → profit → cash → max offer', profit: 115000, cash: 355000 });

    await tab('contract');
    near(await value('cHard'), 200000, 'GC linked hard cost'); near(await value('cDesign'), 20000, 'GC linked design allowance');
    near(await value('cPermits'), 9000, 'GC linked permits');
    await field('cFeePct', 10);
    const bills = await page.locator('#cCards > .kpi > .v').allTextContents();
    const work = 209000, budget = work * 1.05, design = 20000;
    const expected = [work * 1.1 + design, work * 1.1 + (budget * 1.1 - work * 1.1) * 0.5 + design, budget * 1.2 + design, (budget + design) * 1.2];
    assert.equal(bills.length, 4); bills.forEach((s, i) => near(num(s), expected[i], 'GC owner bill ' + i));
    await field('cHard', 300000); await tab('spec'); near(await textNumber('kProfit'), 115000, 'GC comparison must not silently rewrite Spec');
    await tab('contract'); await page.locator('#cRelink').click(); near(await value('cHard'), 200000, 'GC relink'); near(await value('cFeePct'), 10, 'GC relink preserves terms');
    evidence.checks.push({ workflow: 'GC linked costs → four owner bills → override → relink', ownerBills: expected });

    await tab('lender');
    near(await value('lLot'), 100000, 'Lender linked lot'); near(await value('lBuild'), expectedBuild, 'Lender linked total build');
    near(num(await page.locator('#lOut > .solver > .v').textContent()), 272000, 'Lender min(LTC,LTV)');
    const lenderKpis = await page.locator('#lOut > .kpis > .kpi > .v').allTextContents();
    [30440, 48000, 24000, 32440].forEach((n, i) => near(num(lenderKpis[i]), n, 'Lender KPI ' + i));
    near(num(await page.locator('#lOut > .grand > b').textContent()), 102440, 'Lender borrower cash');
    await page.locator('#segLoan [data-loan="c2p"]').click();
    const mortgageRow = page.locator('#lOut .row').filter({ hasText: 'Monthly payment' });
    const rate = 0.07 / 12, payment = 272000 * rate / (1 - (1 + rate) ** -360);
    near(num(await mortgageRow.locator('.v').textContent()), payment, 'Permanent mortgage payment');
    assert.equal(await page.locator('#lSell').isVisible(), false);
    await page.locator('#segLoan [data-loan="ac"]').click();
    evidence.checks.push({ workflow: 'Lender linked budget → loan/cash/interest → permanent payment', loan: 272000, cash: 102440, payment });

    await tab('loi'); near(await value('oPrice'), 100000, 'LOI linked purchase price'); near(await value('oEarnest'), 1500, 'LOI automatic deposit');
    for (const [id, text] of Object.entries({ oBuyer: 'Third Audit Buyer', oSeller: 'Third Audit Seller', oProp: 'Fictional audit parcel', oTitleCo: 'Audit Title', oDate: '2028-02-01' })) await field(id, text);
    await field('oDD', 28); await field('oClose', 10); await field('oExtN', 2); await field('oExtDays', 15);
    const letter = await page.locator('#oLetter').textContent(); assert.ok(letter.includes('$100,000')); assert.ok(letter.includes('$1,500'));
    assert.match(await page.locator('#oOut').textContent(), /9 of 9/);
    assert.match(await page.locator('#oOut').textContent(), /Feb 29, 2028/);
    assert.match(await page.locator('#oOut').textContent(), /Mar 30, 2028/);
    const diligence = await page.locator('#ddList [role="checkbox"]').all(); assert.equal(diligence.length, 17); for (const box of diligence) await box.click(); assert.match(await page.locator('#ddHint').textContent(), /17 of 17/);
    evidence.checks.push({ workflow: 'LOI linked offer → names → leap-year dates → usable letter', price: 100000, earnest: 1500 });

    await tab('spec'); await field('dealName', 'Third-pass complete journey'); await page.locator('#btnSave').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('dmp_deals_v1') || '[]').length === 1);
    const dp = page.waitForEvent('download'); await page.locator('#btnExport').click(); const download = await dp;
    const bytes = fs.readFileSync(await download.path()); const exported = JSON.parse(bytes); assert.equal(exported.tools.offer.oBuyer, 'Third Audit Buyer');
    await page.locator('#btnReset').click(); await page.locator('#btnSaved').click(); await page.locator('[data-load="0"]').click();
    near(await textNumber('kProfit'), 115000, 'Saved Spec restored'); await tab('loi'); assert.equal(await page.locator('#oBuyer').inputValue(), 'Third Audit Buyer');
    await tab('spec'); await page.locator('#btnReset').click(); await page.locator('#importFile').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes });
    await page.waitForFunction(() => document.querySelector('#dealName').value === 'Third-pass complete journey');
    await page.reload({ waitUntil: 'networkidle' }); await tab('contract'); near(await value('cFeePct'), 10, 'GC term survives import/reload');
    await tab('loi'); assert.equal(await page.locator('#oBuyer').inputValue(), 'Third Audit Buyer'); near(await value('oDD'), 28, 'LOI term survives import/reload');
    evidence.checks.push({ workflow: 'Four-tool deal → Save → Reset → Load → Export → Reset → Import → Reload', filename: download.suggestedFilename() });
    for (const width of [375, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); for (const id of ['spec', 'contract', 'lender', 'loi']) { await tab(id); await page.locator('details:visible').evaluateAll(ds => ds.forEach(d => d.open = true)); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); } }
    assert.deepEqual(evidence.errors, []); assert.deepEqual(evidence.posts, []); evidence.passed = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(__dirname, live ? 'third-pass-live.json' : 'third-pass-browser.json'), JSON.stringify(evidence, null, 2)); }
  console.log(JSON.stringify(evidence, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
