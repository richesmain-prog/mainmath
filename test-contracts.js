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
