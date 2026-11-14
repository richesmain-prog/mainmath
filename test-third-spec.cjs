// Third-pass Spec Build audit: independent boundary algebra and rendered cash schedules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mod = { exports: {} };
new Function('module', html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
const E = mod.exports;
const near = (actual, expected, tolerance = 0.000001) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `expected ${expected}, got ${actual}`);
const freeLoan = { purchasePrice: 0, buildableSqft: 1000, buildCostPerSqft: 0, softCostPct: 0,
  contingencyPct: 0, permitFees: 0, buyClosingPct: 0, monthlyCarry: 0, useLoan: true,
  ltcPct: 100, maxLtvPct: 100, ratePct: 0, pointsPct: 0, lenderFee: 0,
  buildMonths: 12, sellMonths: 0, salePerSqft: 1e6, sellingCostPct: 0 };
function page(input, mode = 'full') {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://math.therichmain.com', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole, beforeParse(w) {
      w.fetch = () => { throw new Error('Network forbidden in Spec audit'); };
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { w.copiedText = text; } } });
      w.localStorage.setItem('dmp_last_v1', JSON.stringify(E.normalize(input)));
      w.localStorage.setItem('dmp_mode_v1', mode);
    } });
  return { dom, errors, get: id => dom.window.document.getElementById(id), window: dom.window };
}

test('fully financed decimal budgets require exactly zero equity and have no investor IRR', () => {
  for (const purchasePrice of [0, 123456.78, 456789.12, 3981423.007648512, 4000000.01, 810723.1234])
    for (const build of [0, 100000.01, 456789.12, 810723.1234]) {
      const r = E.run({ ...freeLoan, purchasePrice, buildCostPerSqft: build / 1000 });
      assert.ok(r.peakEquity === 0, `phantom equity for land ${purchasePrice}, build ${build}: ${r.peakEquity}`);
      assert.equal(r.irr, null); assert.equal(r.coc, null);
      assert.ok(r.opFlows.every(flow => flow === 0));
      near(r.flows.reduce((a, b) => a + b, 0), r.profit);
    }
  assert.equal(E.maxLandForIrr(freeLoan, 25), null);
});

test('IRR solver finds a narrow positive-equity window after the borrowing cap', () => {
  const tiny = { ...freeLoan, buildableSqft: 1, salePerSqft: 1, maxLtvPct: 99 };
  assert.ok(E.run({ ...tiny, purchasePrice: 0.9909 }).irr > 1000);
  // (sale - land) / (land - debt) = target return; solve this linear equation.
  near(E.maxLandForIrr(tiny, 1000), (1 + 10 * 0.99) / 11, 0.000000001);
  const large = { ...freeLoan, buildableSqft: 10000, salePerSqft: 2000,
    maxLtvPct: 80, sellingCostPct: 19.9999, hasPartner: true, myProfitShare: 0.6, myCashShare: 100 };
  assert.ok(E.run({ ...large, purchasePrice: 16000000.01 }).myIrr > 1000);
  const ceiling = (0.006 * 16000020 + 10 * 16000000) / (10 + 0.006);
  near(E.maxLandForIrr(large, 1000), ceiling);
  assert.equal(E.run({ ...large, purchasePrice: 16000000 }).myIrr, null);
});

test('32 zero-equity boundary ceilings agree with independent partner-return algebra', () => {
  for (const sale of [1, 1000, 20000000, 1e9]) for (const sellingCostPct of [0, 19.9999])
    for (const share of [1, 0.006]) for (const target of [25, 1000]) {
      const input = { ...freeLoan, buildableSqft: 10000, salePerSqft: sale / 10000,
        maxLtvPct: 80, sellingCostPct, hasPartner: true, myCashShare: 100, myProfitShare: share * 100 };
      const debt = sale * 0.8, netSale = sale * (1 - sellingCostPct / 100);
      const solve = rate => (share * netSale + rate * debt) / (share + rate);
      const actual = E.maxLandForIrr(input, target);
      // The solver explicitly permits one millionth of a percentage point at its boundary.
      assert.ok(actual !== null && actual >= solve(target / 100) - 0.000001
        && actual <= solve((target - 0.000002) / 100) + 0.000001,
      `sale ${sale}, share ${share}, target ${target}: expected ${solve(target / 100)}, got ${actual}`);
      const atTarget = E.run({ ...input, purchasePrice: actual });
      assert.ok(atTarget.myCash > 0 && atTarget.myIrr >= target - 0.000002);
    }
});

test('IRR solver never searches beyond the supported land-price ceiling', () => {
  const input = { ...freeLoan, buildableSqft: 10000, salePerSqft: 100005, maxLtvPct: 99.994 };
  assert.ok(E.run({ ...input, purchasePrice: E.MAX_LAND }).irr > 25);
  assert.equal(E.maxLandForIrr(input, 25), E.MAX_LAND);
  const sale = 1000050000, debt = sale * 0.99994;
  const expected = (sale + 10 * debt) / 11;
  const actual = E.maxLandForIrr(input, 1000);
  near(actual, expected, 0.001);
  assert.ok(actual < E.MAX_LAND);
  assert.ok(E.run({ ...input, purchasePrice: actual }).irr >= 999.999998);
});

test('no sale price is reported as missing input, not an excessive margin target', () => {
  const p = page({ salePerSqft: 0 });
  try {
    assert.match(p.get('heroPill').textContent, /No Sale Price/);
    assert.doesNotMatch(p.get('heroPill').textContent, /Target too high|tops out/);
    assert.deepEqual(p.errors, []);
  } finally { p.dom.window.close(); }
});

const hand = { purchasePrice: 100000, buildableSqft: 1000, buildCostPerSqft: 240,
  softCostPct: 0, contingencyPct: 0, permitFees: 0, buyClosingPct: 2, monthlyCarry: 1000,
  useLoan: false, ltcPct: 80, maxLtvPct: 100, ratePct: 12, pointsPct: 0, lenderFee: 0,
  buildMonths: 12, sellMonths: 0, salePerSqft: 500, sellingCostPct: 6 };

test('cost KPI and copied summary disclose exclusion of the $30000 selling cost', () => {
  const p = page(hand);
  try {
    assert.equal(p.get('kAllIn').textContent, '$355,000');
    assert.equal(p.get('kProfit').textContent, '$115,000');
    assert.equal(p.get('kAllIn').previousElementSibling.textContent, 'Cost before selling');
    assert.match(p.get('kAllInS').textContent, /\$355.*before selling costs/);
    p.get('btnCopy').click();
    assert.match(p.window.copiedText, /Cost before selling \$355,000/);
    assert.deepEqual(p.errors, []);
  } finally { p.dom.window.close(); }
});

test('all 39 displayed cash rows match hand-derived all-cash, draw and full-loan schedules', () => {
  const dollars = text => text === '—' ? 0 : Number(text.replace(/[^0-9.]/g, '')) * (/[−-]/.test(text) ? -1 : 1);
  for (const method of ['cash', 'draw', 'flat']) {
    const p = page({ ...hand, useLoan: method !== 'cash', interestMethod: method });
    try {
      const rows = [...p.get('schedule').querySelectorAll('tbody tr')];
      assert.equal(rows.length, 13);
      let cumulative = 0;
      rows.forEach((row, month) => {
        const cells = [...row.children].map(cell => cell.textContent);
        const draw = month && method !== 'cash' ? 16000 : 0;
        const interest = !month || method === 'cash' ? 0 : method === 'flat' ? 2720 : 800 + 160 * month;
        let cash = month ? draw - 20000 - 1000 - interest : method === 'cash' ? -103000 : -23000;
        if (month === 12) cash += method === 'cash' ? 470000 : 198000;
        cumulative += cash;
        assert.equal(Number(cells[0]), month); near(dollars(cells[2]), draw);
        near(dollars(cells[3]), interest); near(dollars(cells[4]), 1000);
        near(dollars(cells[5]), cash); near(dollars(cells[6]), cumulative);
      });
      near(cumulative, method === 'cash' ? 115000 : method === 'flat' ? 82360 : 92920);
      assert.deepEqual(p.errors, []);
    } finally { p.dom.window.close(); }
  }
});

test('Quick and Full switch between disclosed assumptions without losing partner or custom Full values', () => {
  const input = { ...hand, softCostPct: 20, contingencyPct: 9, permitFees: 3000, buyClosingPct: 3,
    monthlyCarry: 2500, sellingCostPct: 4, hasPartner: true, myProfitShare: 30, myCashShare: 70 };
  const p = page(input);
  try {
    near(p.window._last.r.profit, 27580);
    near(p.window._last.r.myProfit, 8274);
    assert.equal(p.get('sensTable').querySelectorAll('tbody tr')[2].children[3].textContent, '5.5%');
    p.window.document.querySelector('[data-mode="quick"]').click();
    near(p.window._last.r.profit, 53148); near(p.window._last.r.myProfit, 15944.4);
    assert.equal(p.get('sensTable').querySelectorAll('tbody tr')[2].children[3].textContent, '10.6%');
    assert.match(p.get('modeHint').textContent, /soft costs 8%.*Loan off.*30% profit \/ 70% cash/);
    assert.equal(p.window._last.input.useLoan, false);
    p.window.document.querySelector('[data-mode="full"]').click();
    near(p.window._last.r.profit, 27580);
    for (const key of ['softCostPct', 'contingencyPct', 'permitFees', 'buyClosingPct', 'monthlyCarry', 'sellingCostPct'])
      assert.equal(p.window._last.input[key], input[key]);
    assert.deepEqual(p.errors, []);
  } finally { p.dom.window.close(); }
});

test('three extra selling months cost exactly three full-draw interest and carry payments', () => {
  for (const interestMethod of ['flat', 'draw']) {
    const before = E.run({ ...hand, useLoan: true, interestMethod, sellMonths: 2 });
    const after = E.run({ ...hand, useLoan: true, interestMethod, sellMonths: 5 });
    near(before.profit - after.profit, 3 * (2720 + 1000));
    near(after.lines.interestTotal - before.lines.interestTotal, 3 * 2720);
    near(after.lines.carryTotal - before.lines.carryTotal, 3 * 1000);
    near(before.margin - after.margin, 2.232);
    assert.ok(after.irr < before.irr);
  }
});
