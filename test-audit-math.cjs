// Run: node --test test-audit-math.cjs
// Second-pass audit: independent closed-form math and rendered counterexamples.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const mod = { exports: {} };
new Function('module', html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
const E = mod.exports;
const near = (a, b, tolerance = 0.01) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `expected ${b}, got ${a}`);
function page(storage) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://math.therichmain.com', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole, beforeParse(w) {
      w.fetch = () => { throw new Error('No network allowed during math audit'); };
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, JSON.stringify(value));
    } });
  return { dom, errors, get: id => dom.window.document.getElementById(id) };
}

test('limited land advance never claims the bank covers the entire job', () => {
  const p = page({ mm_lender_v1: { lLot: 400000, lBuild: 100000, lArv: 1000000, lLtc: 80, lLtv: 70,
    lLandAdv: 0, lRate: 0, lPoints: 0, lFees: 0, lClosing: 0 } });
  try {
    const summary = p.get('lOut').querySelector('.solver').textContent;
    assert.match(summary, /Your loan\$100,000/);
    assert.match(p.get('lOut').querySelector('.grand').textContent, /\$400,000/);
    assert.doesNotMatch(summary, /covers everything the job needs/);
    assert.deepEqual(p.errors, []);
  } finally { p.dom.window.close(); }
});

test('valid dates before year 100 retain their year in the rendered offer and deadlines', () => {
  for (const year of ['0001', '0004', '0099', '0100']) {
    const p = page({ mm_loi_v1: { oDate: `${year}-01-01`, oValid: 7, oDD: 60, oClose: 60 } });
    try {
      assert.equal(p.get('oDate').value, `${year}-01-01`);
      assert.ok(p.get('oLetter').textContent.includes(`Date: Jan 1, ${Number(year)}\n`));
      assert.ok(p.get('oLetter').textContent.includes(`by Jan 8, ${Number(year)}.`));
      assert.deepEqual(p.errors, []);
    } finally { p.dom.window.close(); }
  }
});

test('zero profit is break-even, not a loss', () => {
  const r = E.run({ purchasePrice: 100000, buildableSqft: 1000, buildCostPerSqft: 0,
    softCostPct: 0, contingencyPct: 0, permitFees: 0, buyClosingPct: 0, monthlyCarry: 0,
    useLoan: false, buildMonths: 12, sellMonths: 0, salePerSqft: 100, sellingCostPct: 0 });
  near(r.profit, 0); near(r.margin, 0);
  assert.equal(r.verdict.label, 'Breaks Even');
});

test('offer letter preserves purchase and deposit cents while leaving whole dollars concise', () => {
  for (const [price, earnest, formattedPrice, formattedEarnest] of [
    [100.49, 1.49, '$100.49', '$1.49'], [100, 1, '$100', '$1'], [0.01, 0.01, '$0.01', '$0.01']
  ]) {
    const p = page({ mm_loi_v1: { oPrice: price, oEarnest: earnest } });
    try {
      const letter = p.get('oLetter').textContent;
      assert.ok(letter.includes(`Purchase price. ${formattedPrice}, paid at closing.`));
      assert.ok(letter.includes(`Earnest money. ${formattedEarnest}, deposited with `));
      assert.deepEqual(p.errors, []);
    } finally { p.dom.window.close(); }
  }
});

test('320 financing cases agree with closed-form draw interest, profit, cash and IRR discounting', () => {
  let count = 0;
  for (const buildMonths of [1, 2, 12, 60]) for (const sellMonths of [0, 24])
    for (const useLoan of [false, true]) for (const flat of [false, true])
      for (const salePerSqft of [0, 100, 300, 600, 1000]) for (const teardown of [false, true]) {
        const raw = { purchasePrice: 200000, buildableSqft: 1000, buildCostPerSqft: 200,
          softCostPct: 10, contingencyPct: 5, permitFees: 10000, buyClosingPct: 2,
          monthlyCarry: 1000, ltcPct: 90, maxLtvPct: 100, ratePct: 12, pointsPct: 2, lenderFee: 2000,
          buildMonths, sellMonths, useLoan, salePerSqft, sellingCostPct: 10,
          dealType: teardown ? 'teardown' : 'lot', demoCost: 50000, interestMethod: flat ? 'flat' : 'draw' };
        const r = E.core(E.normalize(raw)), months = buildMonths + sellMonths;
        const build = 241000, demo = teardown ? 50000 : 0, sale = salePerSqft * 1000;
        const loan = useLoan ? Math.min((200000 + demo + build) * 0.9, sale) : 0;
        const initial = Math.min(loan, (200000 + demo) * 0.9);
        // Sum of balances = fully drawn balance × months minus the triangular undrawn balance.
        const interest = 0.01 * (loan * months - (flat ? 0 : (loan - initial) * (buildMonths - 1) / 2));
        const allIn = 204000 + demo + build + 0.02 * loan + (loan > 0 ? 2000 : 0) + interest + (months + 1) * 1000;
        const profit = sale * 0.9 - allIn;
        near(r.loan, loan); near(r.lines.interestTotal, interest); near(r.profit, profit);
        near(r.peakEquity, Math.max(allIn - loan, -profit));
        if (r.monthlyIrr !== null) {
          const presentValue = r.flows.reduce((sum, flow, month) => sum + flow / (1 + r.monthlyIrr) ** month, 0);
          near(presentValue, 0, 0.05);
          assert.equal(Math.sign(r.irr), Math.sign(profit));
        }
        count++;
      }
  assert.equal(count, 320);
});

test('48 all-cash reverse solutions agree with direct target-margin and two-flow IRR algebra', () => {
  let count = 0;
  for (const months of [1, 12, 60, 84]) for (const target of [-50, 0, 25, 100]) for (const price of [100, 100000, 1e9]) {
    const i = { useLoan: false, purchasePrice: price, buildableSqft: 1000, buildCostPerSqft: 0,
      softCostPct: 0, contingencyPct: 0, permitFees: 0, monthlyCarry: 0, buyClosingPct: 0,
      buildMonths: Math.min(60, months), sellMonths: Math.max(0, months - 60),
      salePerSqft: Math.min(1e6, price / 1000), sellingCostPct: 0 };
    const expected = Math.min(E.MAX_LAND, price / ((1 + target / 100) ** (months / 12)));
    near(E.maxLandForIrr(i, target), expected, 0.000001 + expected * 0.0000002);
    near(E.maxLandForMargin(i, 20), price * 0.8, 0.01);
    count++;
  }
  assert.equal(count, 48);
});

test('162 contract cases reconcile owner bill, architect cost and builder profit at cap boundaries', () => {
  let count = 0;
  for (const variance of [-90, -10, 0, 10, 100, 300]) for (const fee of [0, 10, 100])
    for (const share of [0, 50, 100]) for (const gmp of [1, 100000, null]) {
      const r = E.contracts({ cost: 100000, design: 10000, contPct: 10, feePct: fee,
        lumpPct: 20, dbPct: 20, sharePct: share, variancePct: variance, gmp });
      for (const x of r.list) {
        near(x.ownerAllIn - (100000 * (1 + variance / 100) + 10000), x.profit);
        if (x.key !== 'costplus') assert.ok(x.pays <= x.price + 0.01);
      }
      count++;
    }
  assert.equal(count, 162);
});

test('36 lender reserves agree with geometric-series interest and borrowing-cap algebra', () => {
  let count = 0;
  for (const buildMonths of [1, 10, 60]) for (const holdMonths of [0, 2, 36])
    for (const dutch of [false, true]) for (const ratePct of [0, 12]) {
      const r = E.lender({ lot: 400000, build: 1000000, upfrontWork: 50000, arv: 100000000,
        own: false, ltcPct: 85, ltvPct: 70, landAdvPct: 70, ratePct, pointsPct: 0, fees: 0,
        closing: 0, buildMonths, holdMonths, dutch, reserve: true, type: 'ac' });
      const totalMonths = buildMonths + holdMonths, start = 322500, baseDraws = 867500;
      const capReserve = baseDraws / 0.15, q = 1 + ratePct / 1200;
      let expectedReserve = 0;
      if (ratePct) {
        if (dutch) {
          const rate = ratePct / 1200 * totalMonths;
          expectedReserve = Math.min(capReserve, 1190000 * rate / (1 - 0.85 * rate));
        } else {
          const interestOnDraws = q ** (holdMonths + 1) * (q ** buildMonths - 1) / (q - 1) - buildMonths;
          expectedReserve = (start * (q ** totalMonths - 1) + baseDraws / buildMonths * interestOnDraws)
            / (1 + 0.15 / buildMonths * interestOnDraws);
          expectedReserve = Math.min(capReserve, expectedReserve);
        }
      }
      near(r.reserve, expectedReserve);
      near(r.dayOne, 280000); near(r.upfrontDraw, 42500);
      near(r.loan, 1190000 + 0.85 * expectedReserve);
      assert.ok(r.reserve <= r.interest + 0.01);
      near(r.loan + r.cashTotal, 1400000 + r.interest);
      count++;
    }
  assert.equal(count, 36);
});

test('24 offer timelines preserve elapsed days across leap years, centuries and full extensions', () => {
  const day = 86400000;
  for (const date of ['0004-02-28', '0099-12-31', '1900-02-28', '2000-02-28', '2028-02-28', '2099-12-31'])
    for (const extra of [0, 1, 2, 12]) {
      const r = E.offer({ date, price: 100000, earnest: 0, validDays: 7, ddDays: 60, closeDays: 45,
        extCount: extra, extDays: 30, ddCosts: 1200 });
      const delta = (a, b) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / day;
      assert.equal(delta(date, r.expires), 7); assert.equal(delta(date, r.ddEnd), 60);
      assert.equal(delta(r.ddEnd, r.close), 45); assert.equal(delta(r.ddEnd, r.ddEndMax), extra * 30);
      assert.equal(delta(r.close, r.closeMax), extra * 30); near(r.atRiskAfter, 1200);
    }
});

test('9 owned-land construction-to-permanent cases reconcile equity, payoff, draws and amortization', () => {
  for (const [owed, loan, interest, cashClose] of [
    [0, 190000, 14550, 25000], [100000, 290000, 26550, 27000], [400000, 400000, 39750, 219200]
  ]) for (const permRatePct of [0, 6, 30]) {
    const r = E.lender({ lot: 300000, build: 200000, upfrontWork: 50000, arv: 1000000,
      own: true, owed, ltcPct: 80, ltvPct: 70, landAdvPct: 70, ratePct: 12,
      pointsPct: 2, fees: 1200, closing: 10000, buildMonths: 12, holdMonths: 36,
      dutch: false, reserve: false, type: 'c2p', permRatePct, permYears: 30 });
    near(r.loan, loan); near(r.interest, interest); near(r.cashClose, cashClose);
    near(r.cashTotal, cashClose + interest); near(r.lotEquity, 300000 - owed);
    near(r.months, 12); near(r.holdMonths, 0); near(r.gap, 0);
    near(r.loan + r.cashTotal + r.lotEquity, 500000 + interest + loan * 0.02 + 11200);
    const rate = permRatePct / 1200;
    near(r.permPay, rate ? loan * rate / (1 - (1 + rate) ** -360) : loan / 360);
  }
});
