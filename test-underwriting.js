// Run: node --test test-underwriting.js
// Independent dollar fixtures, discounted cash flows, and reverse-solver checks.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const mod = { exports: {} };
new Function('module', fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
const E = mod.exports;
const near = (actual, expected, tolerance = 0.01) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `got ${actual}, expected ${expected} ± ${tolerance}`);
};
const deal = {
  dealType: 'lot', purchasePrice: 400000, buildableSqft: 3000, buildCostPerSqft: 200,
  softCostPct: 10, contingencyPct: 5, permitFees: 20000, buyClosingPct: 2,
  buildMonths: 10, sellMonths: 2, monthlyCarry: 1000, useLoan: true,
  ltcPct: 80, maxLtvPct: 70, ratePct: 12, pointsPct: 2, lenderFee: 3000,
  salePerSqft: 500, sellingCostPct: 6, interestMethod: 'draw', hasPartner: false,
};
const simple = {
  ...deal, purchasePrice: 100000, buildableSqft: 1000, buildCostPerSqft: 0,
  softCostPct: 0, contingencyPct: 0, permitFees: 0, buyClosingPct: 0,
  buildMonths: 12, sellMonths: 0, monthlyCarry: 0, useLoan: false,
  salePerSqft: 125, sellingCostPct: 0,
};
// Direct discounting is deliberately separate from the engine's Horner NPV.
const pv = (rate, flows) => flows.reduce((sum, flow, month) => sum + flow / (1 + rate) ** month, 0);
const annualReturn = (flows) => {
  let low = -0.999, high = 100;
  for (let n = 0; n < 150; n++) {
    const mid = (low + high) / 2;
    if (pv(mid, flows) > 0) low = mid; else high = mid;
  }
  return ((1 + (low + high) / 2) ** 12 - 1) * 100;
};

test('draw loan: each cost, draw, payment, profit, return, and cash requirement matches hand math', () => {
  const r = E.run(deal);
  const expected = { hard: 600000, soft: 60000, contingency: 33000, buildTotal: 713000,
    demo: 0, buyClosing: 8000, arv: 1500000, sellCosts: 90000, carryTotal: 13000,
    points: 17808, fee: 3000, interestTotal: 81180 };
  for (const [key, amount] of Object.entries(expected)) near(r.lines[key], amount);
  near(r.loanBasis, 1113000); near(r.loan, 890400); near(r.t0Draw, 320000); near(r.drawPerMonth, 57040);
  near(r.interestByMonth[0], 3770.4); near(r.interestByMonth[9], 8904); near(r.interestByMonth[11], 8904);
  near(r.allInCost, 1235988); near(r.totalCost, 1325988); near(r.profit, 174012);
  near(r.margin, 11.6008); near(r.peakEquity, 345588); near(r.cashInvested, 345588);
  near(r.coc, 174012 / 345588 * 100); near(r.multiple, 519600 / 345588);
  near(r.allInPerSqft, 411.996); near(r.spreadPerSqft, 88.004); near(r.landPctOfArv, 400000 / 1500000 * 100);
  near(r.loanToArv, 890400 / 1500000 * 100); near(r.profitPerMonth, 14501);
  near(r.irr, 82.4466651586, 1e-7); near(r.irr, annualReturn(r.flows), 1e-7);
});

test('full-loan interest is paid monthly: no fictitious interest deferral inflating IRR', () => {
  const r = E.run({ ...deal, interestMethod: 'flat' });
  for (const interest of r.interestByMonth) near(interest, 8904);
  const expectedFlows = [-109808, ...Array(10).fill(-24164), -9904, 509696];
  r.flows.forEach((flow, n) => near(flow, expectedFlows[n]));
  near(r.lines.interestTotal, 106848); near(r.profit, 148344); near(r.peakEquity, 371256);
  near(r.irr, 64.5325803024, 1e-7); near(r.irr, annualReturn(expectedFlows), 1e-7);
});

test('all cash removes every financing cost; teardown adds demolition and financing basis', () => {
  const cash = E.run({ ...deal, useLoan: false });
  near(cash.loan, 0); near(cash.lines.points, 0); near(cash.lines.fee, 0); near(cash.lines.interestTotal, 0);
  near(cash.profit, 276000); near(cash.peakEquity, 1134000); assert.equal(cash.bindingCap, 'cash');
  const demo = E.run({ ...deal, dealType: 'teardown', demoCost: 50000 });
  near(demo.lines.demo, 50000); near(demo.loanBasis, 1163000); near(demo.loan, 930400);
  near(demo.t0Draw, 360000); near(demo.lines.interestTotal, 85980); near(demo.profit, 118412);
});

test('LTV binding, no proceeds, and zero funding obey both loan limits', () => {
  const lowSale = E.run({ ...deal, salePerSqft: 400 });
  near(lowSale.loan, 840000); near(lowSale.profit, -103200); assert.equal(lowSale.bindingCap, 'ltv');
  for (const overrides of [{ salePerSqft: 0 }, { ltcPct: 0 }, { maxLtvPct: 0 }]) {
    const r = E.run({ ...deal, ...overrides });
    near(r.loan, 0); near(r.lines.points, 0); near(r.lines.fee, 0); near(r.lines.interestTotal, 0);
  }
});

test('partner cash and profit shares affect different amounts and the personal IRR', () => {
  const r = E.run({ ...deal, hasPartner: true, myCashShare: 20, myProfitShare: 70 });
  near(r.myCash, 69117.6); near(r.myProfit, 121808.4); near(r.myCoc, 121808.4 / 69117.6 * 100);
  const flows = r.opFlows.map((amount) => amount * 0.2);
  flows[r.months] += 69117.6 + 121808.4;
  near(r.myIrr, annualReturn(flows), 1e-6); near(r.myIrr, 312.7560485634, 1e-6);
  const zeroCash = E.run({ ...deal, hasPartner: true, myCashShare: 0, myProfitShare: 20 });
  assert.equal(zeroCash.myIrr, null); assert.equal(zeroCash.myCoc, null); assert.equal(zeroCash.multiple, null);
  assert.equal(E.maxLandForIrr(zeroCash.inputs), null);
  near(E.run({ ...deal, hasPartner: true, myCashShare: 20, myProfitShare: 0 }).myIrr, 0, 1e-6);
});

test('cash required includes money needed to cover the loan payoff at sale', () => {
  const r = E.run({ ...simple, useLoan: true, ltcPct: 100, maxLtvPct: 100,
    ratePct: 0, pointsPct: 0, lenderFee: 0, salePerSqft: 100, sellingCostPct: 6 });
  near(r.loan, 100000); near(r.profit, -6000);
  near(r.peakEquity, 6000); near(r.cashInvested, 6000); near(r.myCash, 6000);
  near(r.coc, -100); near(r.multiple, 0);
});

test('partner cash required includes an exit loss larger than the original contribution', () => {
  const r = E.run({ ...simple, salePerSqft: 50, sellingCostPct: 6,
    hasPartner: true, myCashShare: 10, myProfitShare: 90 });
  near(r.profit, -53000); near(r.myProfit, -47700);
  near(r.myCash, 47700); near(r.myCoc, -100); near(r.multiple, 0);
  assert.equal(r.myIrr, null);
});

test('IRR recognizes simple annual returns, losses, long holds, and no capital at risk', () => {
  near(E.run(simple).irr, 25, 1e-7);
  near(E.run({ ...simple, salePerSqft: 50 }).irr, -50, 1e-7);
  near(E.run({ ...simple, buildMonths: 60, sellMonths: 24 }).irr, (1.25 ** (1 / 7) - 1) * 100, 1e-7);
  assert.equal(E.run({ ...simple, purchasePrice: 0 }).irr, null);
  assert.equal(E.run({ ...simple, salePerSqft: 0 }).irr, null);
  assert.equal(E.monthlyIrr([0, 0, 0]), null);
  assert.equal(E.monthlyIrr([-100, -100]), null);
  near(E.annualize(E.monthlyIrr([-100, 0, 121])), (1.1 ** 12 - 1) * 100, 1e-6);
});

test('a deal with no sale price cannot receive a usable deal score', () => {
  const r = E.run({ ...simple, salePerSqft: 0 });
  assert.equal(r.margin, null); assert.equal(r.verdict.label, 'No Sale Price');
  assert.deepEqual(r.score, { points: 0, grade: 'F' });
});

test('zero-cost break-even is zero; all-cash break-even matches algebra', () => {
  near(E.run({ ...simple, purchasePrice: 0 }).breakEvenSalePerSqft, 0);
  near(E.run(simple).breakEvenSalePerSqft, 100);
  near(E.run({ ...deal, useLoan: false }).breakEvenSalePerSqft, 1134000 / 0.94 / 3000);
});

test('break-even recomputes the loan when the future sale price changes its binding cap', () => {
  for (const overrides of [{}, { salePerSqft: 400 }, { maxLtvPct: 50 }, { interestMethod: 'flat' }, { dealType: 'teardown' }]) {
    const input = { ...deal, ...overrides }, r = E.run(input), be = r.breakEvenSalePerSqft;
    assert.notEqual(be, null);
    near(E.run({ ...input, salePerSqft: be }).profit, 0);
    assert.ok(E.run({ ...input, salePerSqft: be + 0.01 }).profit > 0);
    assert.ok(E.run({ ...input, salePerSqft: be - 0.01 }).profit < 0);
  }
  assert.equal(E.run({ ...simple, purchasePrice: 1e9, buildableSqft: 1 }).breakEvenSalePerSqft, null);
});

test('max land for margin matches independent algebra, binds at target, and rejects impossible targets', () => {
  near(E.maxLandForMargin(simple, 20), 100000);
  near(E.maxLandForMargin({ ...deal, useLoan: false }, 20),
    (1500000 * 0.8 - 90000 - 713000 - 13000) / 1.02);
  for (const overrides of [{}, { maxLtvPct: 50 }, { interestMethod: 'flat' }, { dealType: 'teardown' }]) {
    const input = { ...deal, ...overrides }, land = E.maxLandForMargin(input, 20);
    assert.notEqual(land, null);
    near(E.run({ ...input, purchasePrice: land }).margin, 20, 1e-7);
    assert.ok(E.run({ ...input, purchasePrice: land + 1 }).margin < 20);
  }
  assert.equal(E.maxLandForMargin({ ...deal, salePerSqft: 100 }, 20), null);
  assert.equal(E.maxLandForMargin({ ...deal, salePerSqft: 0 }, 0), null);
  near(E.maxLandForMargin({ ...simple, buildableSqft: 1e7, salePerSqft: 1e6 }, 0), E.MAX_LAND);
});

test('max land for IRR returns the highest qualifying price and handles partner returns', () => {
  near(E.maxLandForIrr(simple, 25), 100000);
  for (const overrides of [{}, { maxLtvPct: 50 }, { interestMethod: 'flat' },
    { hasPartner: true, myCashShare: 20, myProfitShare: 70 }, { buildMonths: 60, sellMonths: 24 }]) {
    const input = { ...deal, ...overrides }, land = E.maxLandForIrr(input, 25);
    if (land === null) {
      assert.ok(E.run({ ...input, purchasePrice: 0 }).irr < 25);
      continue;
    }
    const r = E.run({ ...input, purchasePrice: land });
    near(input.hasPartner ? r.myIrr : r.irr, 25, 0.00001);
    const over = E.run({ ...input, purchasePrice: land + 1 });
    assert.ok((input.hasPartner ? over.myIrr : over.irr) < 25);
  }
  assert.equal(E.maxLandForIrr({ ...deal, salePerSqft: 0 }, 25), null);
  near(E.maxLandForIrr({ ...simple, buildableSqft: 1e7, salePerSqft: 1e6 }, 25), E.MAX_LAND);
});

test('IRR max-land solver accepts decimal-dollar prices and investment below one dollar', () => {
  const tiny = { ...simple, buildableSqft: 1, salePerSqft: 1, purchasePrice: 0.5 };
  near(E.run(tiny).irr, 100, 1e-7);
  near(E.maxLandForIrr(tiny, 25), 0.8, 1e-7);
});

test('normalization clamps every monetary and percentage boundary to finite supported values', () => {
  const inputs = E.normalize({ purchasePrice: -1, buildableSqft: 0, buildCostPerSqft: -1, softCostPct: -1,
    contingencyPct: -1, permitFees: -1, buyClosingPct: -1, demoCost: -1, buildMonths: 0,
    sellMonths: -1, monthlyCarry: -1, lenderFee: -1, ratePct: -1, pointsPct: -1,
    ltcPct: -1, maxLtvPct: -1, salePerSqft: -1, sellingCostPct: -1, myCashShare: -1, myProfitShare: -1 });
  for (const key of ['purchasePrice', 'buildCostPerSqft', 'softCostPct', 'contingencyPct', 'permitFees',
    'buyClosingPct', 'demoCost', 'sellMonths', 'monthlyCarry', 'lenderFee', 'ratePct', 'pointsPct',
    'ltcPct', 'maxLtvPct', 'salePerSqft', 'sellingCostPct', 'myCashShare', 'myProfitShare']) assert.equal(inputs[key], 0);
  assert.equal(inputs.buildMonths, 1); assert.equal(inputs.buildableSqft, 1);
  const high = E.normalize({ buildMonths: 999, sellMonths: 999, purchasePrice: 1e20, ratePct: 999,
    myCashShare: 999, buildCostPerSqft: Infinity, salePerSqft: NaN });
  assert.equal(high.buildMonths, 60); assert.equal(high.sellMonths, 24); assert.equal(high.purchasePrice, 1e9);
  assert.equal(high.ratePct, 30); assert.equal(high.myCashShare, 100);
  assert.equal(high.buildCostPerSqft, 0); assert.equal(high.salePerSqft, 0);
});

test('all 25 sensitivity cells use the stated sale and build dollars; center equals the deal', () => {
  const table = E.sensitivity(deal, 10);
  assert.deepEqual(table.sales, [450, 475, 500, 525, 550]);
  table.rows.forEach((row, n) => near(row.build, 180 + n * 10));
  for (const row of table.rows) row.cells.forEach((margin, col) => {
    near(margin, E.run({ ...deal, buildCostPerSqft: row.build, salePerSqft: table.sales[col] }).margin, 1e-9);
  });
  near(table.rows[2].cells[2], 11.6008, 1e-7);
  for (const row of E.sensitivity({ ...deal, salePerSqft: 0 }).rows) assert.ok(row.cells.every((cell) => cell === null));
});

test('cash conservation, financing limits, and personal profit hold across 96 financing/timing combinations', () => {
  for (const useLoan of [false, true]) for (const interestMethod of ['draw', 'flat'])
    for (const includeCarryInBasis of [false, true]) for (const salePerSqft of [0, 300, 700])
      for (const buildMonths of [1, 60]) for (const sellMonths of [0, 24]) {
        const input = { ...deal, useLoan, interestMethod, includeCarryInBasis, salePerSqft, buildMonths, sellMonths,
          hasPartner: true, myCashShare: 20, myProfitShare: 70 };
        const r = E.run(input);
        near(r.flows.reduce((sum, flow) => sum + flow, 0), r.profit);
        near(r.interestByMonth.reduce((sum, due) => sum + due, 0), r.lines.interestTotal);
        near(r.t0Draw + r.drawPerMonth * buildMonths, r.loan);
        near(r.myProfit, r.profit * 0.7);
        assert.ok(r.loan <= r.loanBasis * 0.8 + 0.01 && r.loan <= r.lines.arv * 0.7 + 0.01);
        assert.ok(r.peakEquity >= 0 && r.lines.interestTotal >= 0);
        let balance = 0, lowest = 0;
        for (const flow of r.opFlows) { balance += flow; lowest = Math.min(lowest, balance); }
        near(r.peakEquity, Math.max(-lowest, -r.profit));
        near(r.myCash, Math.max(-lowest * 0.2, -r.myProfit));
        if (r.irr !== null) near(pv(r.monthlyIrr, r.flows), 0, 0.05);
      }
});
