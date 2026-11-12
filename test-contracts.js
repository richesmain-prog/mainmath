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
