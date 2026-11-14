// Run: node test-contracts.js
// Checks the contract-pricing math in index.html against hand-worked numbers.
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];   // first script = the engine
const mod = { exports: {} };
new Function('module', src)(mod);
const E = mod.exports;

const job = { cost: 1e6, design: 1e5, contPct: 5, feePct: 10, lumpPct: 20, dbPct: 20, sharePct: 50, gmp: null };
const by = (v) => Object.fromEntries(E.contracts({ ...job, variancePct: v }).list.map((m) => [m.key, m]));
const eq = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: got ${a}, want ${b}`);

// on budget
let r = by(0);
eq(r.costplus.pays, 1100000, 'cost-plus pays');      eq(r.costplus.profit, 100000, 'cost-plus profit');
eq(r.gmp.price, 1155000, 'gmp cap');                 eq(r.gmp.pays, 1127500, 'gmp pays (half the 55k savings)');
eq(r.gmp.profit, 127500, 'gmp profit');              eq(r.gmp.cushion, 15.5, 'gmp cushion');
eq(r.lump.price, 1260000, 'lump price');             eq(r.lump.profit, 260000, 'lump profit');
eq(r.db.price, 1380000, 'design-build price');       eq(r.db.profit, 280000, 'design-build profit');
eq(r.costplus.ownerAllIn, 1200000, 'owner adds the architect on cost-plus');
eq(r.db.ownerAllIn, 1380000, 'design is inside design-build');

// 20% over: owner eats it on cost-plus, builder eats it everywhere else
r = by(20);
eq(r.costplus.profit, 120000, 'cost-plus profit, overrun');
eq(r.gmp.pays, 1155000, 'gmp pays the cap, overrun');  eq(r.gmp.profit, -45000, 'gmp profit, overrun');
eq(r.lump.profit, 60000, 'lump profit, overrun');      eq(r.db.profit, 80000, 'design-build profit, overrun');

// a typed GMP cap replaces the auto one; cushion is where profit hits zero
r = Object.fromEntries(E.contracts({ ...job, gmp: 1200000, variancePct: 20 }).list.map((m) => [m.key, m]));
eq(r.gmp.profit, 0, 'gmp profit at the break-even overrun');   eq(r.gmp.cushion, 20, 'typed cap cushion');

console.log('contract math OK');

// ---- lender terms: $400k lot, $1M build, $2M finished value, 85% LTC, 70% of ARV, 70% of the lot funded at closing
const loanIn = { lot: 4e5, build: 1e6, arv: 2e6, own: false, owed: 0, ltcPct: 85, ltvPct: 70, landAdvPct: 70, ratePct: 12,
  pointsPct: 2, fees: 2000, closing: 6000, buildMonths: 10, holdMonths: 2, dutch: false, type: 'ac', permRatePct: 7, permYears: 30 };
let L = E.lender(loanIn);
eq(L.loan, 1190000, 'loan = 85% of cost');             assert.strictEqual(L.binding, 'ltc');
eq(L.dayOne, 280000, 'lender funds 70% of the lot');   eq(L.holdback, 910000, 'construction draws');
eq(L.cashClose, 151800, 'cash at closing');            eq(L.gap, 90000, 'borrower share of the build');
eq(L.interest, 101850, 'interest on drawn balance');   eq(L.cashTotal, 343650, 'total cash');
eq(E.lender({ ...loanIn, dutch: true }).interest, 142800, 'interest on the full loan');

// the finished-value test wins when the house is worth less
L = E.lender({ ...loanIn, arv: 1.5e6 });
eq(L.loan, 1050000, 'loan = 70% of ARV');              assert.strictEqual(L.binding, 'ltv');

// lot owned free and clear: the equity is the down payment and the loan covers the whole build
L = E.lender({ ...loanIn, own: true, owed: 0 });
eq(L.loan, 1000000, 'loan covers the build');          assert.strictEqual(L.binding, 'need');
eq(L.cashClose, 28000, 'only points, fees, closing');  eq(L.gap, 0, 'nothing to fund in the build');
eq(L.lotEquity, 400000, 'lot equity');

// lot owned with a $300k payoff
L = E.lender({ ...loanIn, own: true, owed: 3e5 });
eq(L.dayOne, 280000, 'lender pays toward the payoff'); eq(L.cashClose, 51800, 'cash at closing with a payoff');

// construction-to-perm: no sell months, and a 30-year payment at 7%
L = E.lender({ ...loanIn, type: 'c2p' });
eq(L.months, 10, 'converts at completion');            assert.ok(Math.abs(L.permPay - 7917.1) < 1, 'perm payment ' + L.permPay);

// interest reserve, interest on the full loan (12 months at 12% = 12% of the loan), worked by hand:
// reserve R = 0.12 x loan, loan = 85% x (1.4M + R)  ->  R = 142,800 / 0.898 = 159,020.04
L = E.lender({ ...loanIn, dutch: true, reserve: true });
eq(L.reserve, 159020.04, 'reserve covers the interest'); eq(L.interest, 159020.04, 'interest with a reserve');
eq(L.loan, 1325167.04, 'loan grows by 85% of the reserve'); eq(L.interestCash, 0, 'no interest out of pocket');
eq(L.gap, 113853.01, 'reserve takes room from the draws'); eq(L.cashTotal, 268356.35, 'total cash with a reserve');
// drawn-balance interest: the reserve still equals the interest, and the loan stays inside the limit
L = E.lender({ ...loanIn, reserve: true });
eq(L.reserve, L.interest, 'reserve = interest');         assert.ok(L.loan <= L.cap + 0.01 && L.interest > 101850);
eq(L.cashTotal, L.cashClose + L.gap, 'interest is not paid in cash');
// finished-value limit binds: no extra loan, so the reserve only moves cash from monthly interest to the build
L = E.lender({ ...loanIn, arv: 1.5e6, reserve: true });
eq(L.loan, 1050000, 'loan stays at 70% of ARV');        eq(L.interestCash, 0, 'reserve still funded');

console.log('lender math OK');

// ---- land offer (LOI): $150k lot, $900k finished value, signed Jan 15 2026, 60 + 60 days, two 30-day extensions
let O = E.offer({ price: 150000, arv: 900000, earnest: null, date: '2026-01-15', validDays: 7, ddDays: 60, closeDays: 60,
  extCount: 2, extDays: 30, ddCosts: 5000 });
eq(O.earnest, 2500, 'auto deposit is about 1.5%, to the nearest $500');   eq(O.landPct, 16.6667, 'land as a share of finished value');
assert.strictEqual(O.expires, '2026-01-22');     assert.strictEqual(O.ddEnd, '2026-03-16');     assert.strictEqual(O.close, '2026-05-15');
assert.strictEqual(O.ddEndMax, '2026-05-15');    assert.strictEqual(O.closeMax, '2026-07-14');
eq(O.atRiskBefore, 5000, 'only the checks are at risk in due diligence');  eq(O.atRiskAfter, 7500, 'checks plus the deposit after');
eq(E.offer({ price: 150000, earnest: 5000 }).earnest, 5000, 'a typed deposit wins');
eq(E.offer({ price: 150000, earnest: 0 }).earnest, 0, 'a typed zero deposit is kept');
assert.strictEqual(E.offer({ price: 1, date: 'nope' }).ddEnd, null);

console.log('offer math OK');

// =====================================================================================
// AUDIT: forward (inputs -> answers, re-worked by hand) and reverse (answer -> back to the input)
// =====================================================================================
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} (±${tol})`);

// ---- Spec Build, forward. $400k lot, 3,000 sf at $200 build / $500 sale, 10 + 2 months, 80% LTC / 70% ARV at 12% + 2 pts
const deal = E.normalize({ dealType: 'lot', purchasePrice: 400000, buildableSqft: 3000, buildCostPerSqft: 200, softCostPct: 10,
  contingencyPct: 5, permitFees: 20000, buyClosingPct: 2, buildMonths: 10, sellMonths: 2, monthlyCarry: 1000, useLoan: true,
  ltcPct: 80, maxLtvPct: 70, ratePct: 12, pointsPct: 2, lenderFee: 3000, salePerSqft: 500, sellingCostPct: 6,
  interestMethod: 'draw', hasPartner: false });
const S = E.run(deal);
eq(S.lines.hard, 600000, 'hard cost');                  eq(S.lines.soft, 60000, 'soft cost');
eq(S.lines.contingency, 33000, 'contingency');          eq(S.lines.buildTotal, 713000, 'build total');
eq(S.lines.arv, 1500000, 'sale price');                 eq(S.lines.sellCosts, 90000, 'selling costs');
eq(S.lines.buyClosing, 8000, 'buy closing');            eq(S.lines.carryTotal, 13000, 'carry: closing month + 12');
eq(S.loan, 890400, 'loan = 80% of $1,113,000 cost');    eq(S.lines.points, 17808, 'points');
eq(S.lines.interestTotal, 81180, 'interest on drawn balance');
eq(S.allInCost, 1235988, 'all-in cost');                eq(S.profit, 174012, 'profit');
near(S.margin, 11.6008, 0.0001, 'margin');
// the cash flows must add up to the same profit, and the lowest point of the running total is the cash needed
near(S.flows.reduce((a, b) => a + b, 0), S.profit, 0.01, 'month-by-month cash adds up to the profit');
let run = 0, low = 0; S.opFlows.forEach((f) => { run += f; if (run < low) low = run; });
near(S.peakEquity, -low, 0.01, 'cash needed = deepest point of the running total');
near(E.npv(S.monthlyIrr, S.flows), 0, 1, 'the yearly return really zeroes out the cash flows');

// ---- Spec Build, reverse. Take the answer and work back.
const maxLand = E.maxLandForMargin(deal, 15);
near(E.run({ ...deal, purchasePrice: maxLand }).margin, 15, 0.02, 'paying the max lot price gives exactly the target margin');
const maxLandIrr = E.maxLandForIrr(deal, 25);
if (maxLandIrr !== null) near(E.run({ ...deal, purchasePrice: maxLandIrr }).irr, 25, 0.1, 'paying the IRR lot price gives the target return');
if (S.breakEvenSalePerSqft) near(E.run({ ...deal, salePerSqft: S.breakEvenSalePerSqft }).profit, 0, 50, 'break-even sale price gives zero profit');
// profit rebuilt from the sale price down, a different road than the engine takes
near(S.lines.arv * (1 - S.margin / 100) - S.lines.sellCosts, S.allInCost, 0.5, 'sale price less profit less selling costs = all-in cost');

// ---- Hire a GC, reverse. For every contract and every surprise: what the owner pays - what it cost = what the GC makes.
[-10, -5, 0, 5, 10, 25, 40].forEach((v) => {
  const C = E.contracts({ ...job, variancePct: v });
  C.list.forEach((m) => {
    near(m.pays - C.actual - (m.key === 'db' ? C.design : 0), m.profit, 0.01, `${m.key} at ${v}%: pays - cost = GC profit`);
    near(m.ownerAllIn - (m.key === 'db' ? 0 : C.design), m.pays, 0.01, `${m.key} at ${v}%: owner total less architect = GC bill`);
    if (m.key !== 'costplus') assert.ok(m.pays <= m.price + 0.01, `${m.key} at ${v}%: owner never pays above the signed price`);
  });
  near(C.list[0].pays / 1.10, C.actual, 0.01, `cost-plus at ${v}%: bill ÷ 1.10 gets back to the real cost`);
});
// run each fixed price right at its cushion: the GC should make exactly nothing
E.contracts({ ...job, variancePct: 0 }).list.filter((m) => m.cushion !== null).forEach((m) => {
  const at = E.contracts({ ...job, variancePct: m.cushion }).list.find((x) => x.key === m.key);
  near(at.profit, 0, 0.01, `${m.key}: an overrun equal to the cushion leaves the GC at zero`);
});

// ---- Lender Terms. Money in must equal money out, in every setup.
[{}, { dutch: true }, { arv: 1.5e6 }, { own: true, owed: 0 }, { own: true, owed: 3e5 }, { own: true, owed: 5e5 }, { type: 'c2p' },
 { landAdvPct: 0 }, { ltcPct: 100, ltvPct: 100, landAdvPct: 100 }, { ltcPct: 0 }].forEach((o) => {
  const c = { ...loanIn, ...o }, R = E.lender(c);
  near(R.loan + R.cashTotal, R.lotNeed + R.build + R.closing + R.points + R.fees + R.interest, 0.01,
    'loan + your cash = lot + build + closing + points + fees + interest ' + JSON.stringify(o));
  assert.ok(R.loan <= R.cost * c.ltcPct / 100 + 0.01 && R.loan <= R.arv * c.ltvPct / 100 + 0.01, 'loan stays inside both lender tests');
  assert.ok(R.gap >= -0.01 && R.cashClose >= -0.01 && R.dayOne <= R.lotNeed + 0.01, 'no negative cash, no cash-out on the lot');
});
// the lender tab and the Spec Build tab must agree on the same deal
const sameLoan = E.lender({ lot: 400000, build: 713000, arv: 1500000, own: false, ltcPct: 80, ltvPct: 70, landAdvPct: 80, ratePct: 12,
  pointsPct: 2, fees: 3000, closing: 8000, buildMonths: 10, holdMonths: 2, dutch: false, type: 'ac' });
eq(sameLoan.loan, S.loan, 'lender tab loan = Spec Build loan');
eq(sameLoan.interest, S.lines.interestTotal, 'lender tab interest = Spec Build interest');
eq(sameLoan.points, S.lines.points, 'lender tab points = Spec Build points');
// reverse the mortgage: paying the monthly payment for 30 years must bring the balance to zero
const perm = E.lender({ ...loanIn, type: 'c2p' }); let bal = perm.loan;
for (let k = 0; k < 360; k++) bal = bal * (1 + 0.07 / 12) - perm.permPay;
near(bal, 0, 0.01, 'the mortgage payment pays the loan off in exactly 30 years');

// ---- LOI dates, reverse: count the days back between the dates
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
[['2026-01-15', 60, 60, 2, 30], ['2026-03-01', 90, 45, 1, 45], ['2028-02-27', 2, 1, 0, 0], ['2026-10-20', 30, 30, 3, 30], ['2026-12-20', 21, 45, 2, 15]]
  .forEach(([date, dd, cl, n, d]) => {
    const R = E.offer({ price: 1e5, date, validDays: 7, ddDays: dd, closeDays: cl, extCount: n, extDays: d });
    assert.strictEqual(days(date, R.ddEnd), dd);                  assert.strictEqual(days(R.ddEnd, R.close), cl);
    assert.strictEqual(days(R.ddEnd, R.ddEndMax), n * d);         assert.strictEqual(days(R.ddEndMax, R.closeMax), cl);
    assert.strictEqual(days(date, R.expires), 7);
  });
assert.strictEqual(E.offer({ price: 1, date: '2028-02-27', ddDays: 2 }).ddEnd, '2028-02-29');   // leap day
const dep = E.offer({ price: 600000, earnest: null });
near(dep.earnest / dep.price * 100, dep.earnestPct, 1e-9, 'deposit ÷ price = the percent shown');

console.log('audit OK: forward and reverse checks agree on all four tabs');

// Shared savings are measured after the fee; markup and margin are different quantities.
for (const sharePct of [0, 25, 100]) {
  const C = E.contracts({ ...job, sharePct, variancePct: -10 });
  const gmp = C.list.find((m) => m.key === 'gmp');
  eq(gmp.pays, 990000 + 165000 * sharePct / 100, 'GMP splits savings after the fee');
  eq(gmp.ownerAllIn, gmp.pays + 100000, 'GMP owner still pays design separately');
  eq(gmp.margin, gmp.profit / gmp.pays * 100, 'GC margin uses revenue, not cost');
}
const capped = E.contracts({ ...job, gmp: 800000, variancePct: 0 }).list.find((m) => m.key === 'gmp');
eq(capped.pays, 800000, 'an underwater cap remains the owner payment limit');
eq(capped.profit, -200000, 'GC absorbs cost above an underwater cap');
const zero = E.contracts({ cost: 0, design: 0 });
assert.ok(zero.list.every((m) => m.pays === 0 && m.profit === 0 && m.margin === null && m.cushion === null));

// Independently solve the compounded draw balance for an LTV-limited reserve.
// B_final = dirt*q^months + draws/bm * sum(q^(months-j+1)); reserve = B_final - dirt - draws.
const longLoan = { ...loanIn, ratePct: 30, buildMonths: 40, holdMonths: 18, reserve: true };
const longR = E.lender(longLoan), q = 1 + .30 / 12, count = 58;
let growth = 0;
for (let j = 1; j <= 40; j++) growth += Math.pow(q, count - j + 1) / 40;
const expectedReserve = (280000 * (Math.pow(q, count) - 1) + (growth - 1) * (1400000 - 280000)) / growth;
eq(longR.loan, 1400000, 'long reserve loan is LTV-limited');
eq(longR.reserve, expectedReserve, 'reserve equals independent compounded-balance solution');
eq(longR.reserve, longR.interest, 'long reserve does not oscillate or overfund interest');
eq(longR.cost, 1400000 + expectedReserve, 'LTC cost uses the final reserve');

// A fully financed acquisition can fund interest even without construction draws.
const onlyLand = E.lender({ lot: 100000, build: 0, arv: 200000, ltcPct: 100, ltvPct: 100,
  landAdvPct: 100, ratePct: 12, buildMonths: 1, holdMonths: 11, reserve: true, dutch: true });
eq(onlyLand.reserve, 12000 / .88, '100% LTC acquisition reserve includes interest on itself');
eq(onlyLand.interestCash, 0, 'available reserve covers acquisition interest');

// Deterministic cases cover both interest methods, ownership/payoffs, zero caps and long terms.
let seed = 7349;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let k = 0; k < 600; k++) {
  const c = { lot: random() * 1e6, build: random() * 2e6, arv: random() * 5e6,
    own: k % 3 === 0, owed: random() * 1e6, ltcPct: k % 10 === 0 ? 0 : random() * 100,
    ltvPct: random() * 100, landAdvPct: random() * 100, ratePct: random() * 40,
    pointsPct: 2, fees: 2000, closing: 6000, buildMonths: Math.ceil(random() * 60),
    holdMonths: Math.floor(random() * 37), reserve: true, dutch: k % 2 === 0 };
  c.upfrontWork = k % 3 === 0 ? c.build * random() : 0;
  const R = E.lender(c);
  near(R.cost, R.lot + R.build + R.reserve, .01, `case ${k}: cost includes final reserve`);
  near(R.loan + R.cashTotal, R.lotNeed + R.build + R.closing + R.points + R.fees + R.interest,
    .01, `case ${k}: all funding equals all uses`);
  assert.ok(R.loan <= R.cap + .01 && R.reserve <= R.interest + .01, `case ${k}: reserve stays inside interest and loan limits`);
  assert.ok(R.holdback >= 0 && R.gap >= 0 && R.interestCash >= 0, `case ${k}: no negative funding buckets`);
  if (R.interestCash > .01) {
    near(R.holdback, 0, .01, `case ${k}: only a full reserve bucket leaves interest unfunded`);
  }
}

// Invalid calendar dates must not silently roll into a different month; leap years and UTC day counts remain exact.
for (const date of ['2026-02-29', '2026-02-31', '2026-00-15', '2026-01-00', '2026-13-01', '0000-01-01', 'not-a-date']) {
  const R = E.offer({ price: 150000, date, validDays: 7, ddDays: 60, closeDays: 60, extCount: 2, extDays: 30 });
  for (const key of ['expires', 'ddEnd', 'ddEndMax', 'close', 'closeMax']) assert.strictEqual(R[key], null, `${date}: invalid ${key}`);
}
assert.strictEqual(E.offer({ date: '0099-01-01', ddDays: 1 }).ddEnd, '0099-01-02', 'years below 100 stay in their century');
assert.strictEqual(E.offer({ date: '9999-12-31', ddDays: 1 }).ddEnd, null, 'date overflow is not a malformed ISO date');
assert.strictEqual(E.offer({ date: '2028-02-29', ddDays: 1 }).ddEnd, '2028-03-01');
for (const price of [0, 0.01, 1, 500, 999, 1000]) eq(E.offer({ price }).earnest, price, 'automatic deposit never exceeds a small purchase price');
eq(E.offer({ price: 500, earnest: 750 }).earnest, 750, 'explicit deposit remains the amount entered');
for (const rate of [0, 1e-20, 1e-14, 1e-12]) {
  const R = E.lender({ lot: 0, build: 1000000, arv: 2000000, ltcPct: 100, ltvPct: 100,
    type: 'c2p', permYears: 30, permRatePct: rate });
  eq(R.permPay, 1000000 / 360, `near-zero mortgage rate ${rate} stays finite and approaches principal / months`);
}
// Teardown demolition is paid at closing in both tabs, never financed again in later draws.
for (const interestMethod of ['draw', 'flat']) for (const salePerSqft of [500, 100]) {
  const D = E.run({ ...deal, dealType: 'teardown', demoCost: 50000, interestMethod, salePerSqft });
  for (const reserve of [false, true]) {
    const R = E.lender({ lot: 400000, build: 763000, upfrontWork: 50000, arv: salePerSqft * 3000,
      ltcPct: 80, ltvPct: 70, landAdvPct: 80, ratePct: 12, pointsPct: 2, fees: 3000, closing: 8000,
      buildMonths: 10, holdMonths: 2, dutch: interestMethod === 'flat', reserve });
    near(R.loan, R.dayOne + R.upfrontDraw + R.holdback + R.reserve, .01, 'teardown loan allocated once');
    near(R.build, R.upfrontWork + R.holdback + R.gap, .01, 'teardown budget allocated once');
    near(R.cashClose, 400000 - R.dayOne + 50000 - R.upfrontDraw + 8000 + R.points + R.fees,
      .01, 'closing includes only self-funded demolition');
    near(R.loan + R.cashTotal, 400000 + 763000 + 8000 + R.points + R.fees + R.interest,
      .01, 'teardown sources equal uses with and without reserve');
    assert.ok(R.loan <= R.cap + .01 && R.reserve <= R.interest + .01);
    if (!reserve) {
      eq(R.loan, D.loan, 'teardown cross-tab loan');
      eq(R.dayOne + R.upfrontDraw, D.t0Draw, 'teardown cross-tab closing draw');
      eq(R.interest, D.lines.interestTotal, 'teardown cross-tab interest');
      eq(R.cashTotal + D.lines.carryTotal, D.peakEquity, 'teardown cross-tab borrower cash plus property carry');
      if (salePerSqft === 500 && interestMethod === 'draw') eq(R.interest, 85980, 'teardown interest independently worked by hand');
    }
  }
}
const cappedWork = E.lender({ ...loanIn, build: 1000, upfrontWork: 5000 });
eq(cappedWork.upfrontWork, 1000, 'upfront work is capped to the total build budget');
eq(cappedWork.holdback, 0, 'fully upfront work has no later construction draws');
console.log('contract, reserve and offer edge cases OK (600 deterministic lending scenarios)');
