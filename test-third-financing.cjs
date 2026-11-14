// Third-pass regressions: displayed inputs must drive the quoted contract and financing amounts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dollars = n => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n);
const numeric = text => Number(text.replaceAll(',', ''));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function page(t, spec, lender = {}, contract = {}) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url:'https://math.therichmain.com', runScripts:'dangerously', pretendToBeVisual:true,
    virtualConsole:vc, beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.fetch = () => { throw new Error('No network in financing tests'); };
      w.localStorage.setItem('dmp_mode_v1', 'full');
      for (const [key, value] of Object.entries({ dmp_last_v1:spec, mm_lender_v1:lender, mm_contract_v1:contract }))
        w.localStorage.setItem(key, JSON.stringify(value));
    } });
  const w = dom.window, get = id => w.document.getElementById(id);
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  const input = (id, value) => {
    get(id).value = String(value);
    get(id).dispatchEvent(new w.Event('input', { bubbles:true }));
    get(id).dispatchEvent(new w.Event('blur'));
  };
  const row = label => [...get('lOut').querySelectorAll('.row')]
    .find(el => el.querySelector('.l').firstChild.textContent === label).querySelector('.v').textContent;
  return { w, get, input, row };
}

test('maximum supported Spec amounts remain the amounts shown and calculated in GC and Lender', t => {
  const b = page(t, { dealType:'teardown', purchasePrice:1e9, buildableSqft:1e7, buildCostPerSqft:1e6,
    salePerSqft:1e6, softCostPct:100, contingencyPct:100, permitFees:1e9, demoCost:1e9,
    buyClosingPct:0, monthlyCarry:0, ratePct:0, pointsPct:0, lenderFee:0, ltcPct:100, maxLtvPct:100 },
    {}, { cFeePct:100, cSharePct:50, cLumpPct:100, cDbPct:100 });
  const work = 1e13 + 2e9, design = 1e13, construction = 4e13 + 2e9;
  assert.equal(numeric(b.get('cHard').value), 1e13 + 1e9);
  assert.equal(numeric(b.get('cDesign').value), design);
  assert.equal(b.get('cActual').textContent, dollars(work));
  const ownerBills = [2 * work + design, 3 * work + design, 4 * work + design, 4 * work + 2 * design];
  [...b.get('cCards').children].forEach((card, i) => {
    assert.equal(card.querySelector(':scope > .v').firstChild.textContent.trim(), dollars(ownerBills[i]));
  });
  assert.equal(numeric(b.get('lBuild').value), construction);
  assert.equal(numeric(b.get('lArv').value), 1e13);
  assert.equal(b.row('Construction budget'), dollars(construction));
  assert.equal(b.get('lOut').querySelector('.solver > .v').textContent, dollars(1e13));
  assert.equal(b.get('lOut').querySelector('.grand b').textContent, dollars(3e13 + 3e9));

  // Turning a linked amount into an explicit override must not silently shrink the shown value.
  for (const id of ['cHard', 'cPermits', 'cDesign', 'cGmp', 'lBuild', 'lArv']) {
    const shown = numeric(b.get(id).value);
    b.input(id, shown);
    assert.equal(numeric(b.get(id).value), shown, id + ' preserves the linked amount when typed');
  }
  assert.equal(b.get('cActual').textContent, dollars(work));
  assert.equal(b.row('Construction budget'), dollars(construction));
});

test('whole-build celebration requires funding upfront demolition as well as later construction', async t => {
  const b = page(t, { dealType:'teardown', purchasePrice:1000000, buildableSqft:1000, buildCostPerSqft:100,
    salePerSqft:1000, softCostPct:0, contingencyPct:0, permitFees:0, demoCost:100000 },
    { own:true, lLtc:0, lRate:0, lPoints:0, lFees:0 });
  b.w.document.querySelector('[data-tab="lender"]').click();
  b.input('lLtc', 80);
  assert.equal(b.row('The bank pays in draws'), dollars(100000));
  assert.equal(b.row('The bank funds demolition'), '+' + dollars(80000));
  assert.equal(b.row('Cash you bring to closing'), dollars(20000));
  await pause(650);
  assert.doesNotMatch(b.get('toast').textContent, /bank covers the whole build/);

  b.input('lLtc', 100);
  assert.equal(b.row('Cash you bring to closing'), dollars(0));
  await pause(650);
  assert.match(b.get('toast').textContent, /bank covers the whole build/);
});

test('partial interest reserves disclose remaining interest paid by the borrower', t => {
  const b = page(t, {}, { lLot:100000, lBuild:100000, lArv:120000, lLtc:100, lLtv:100,
    lLandAdv:100, lRate:12, lPoints:0, lFees:0, lClosing:0, lMonths:12, lSell:12, dutch:true, reserve:true });
  assert.equal(b.row('Interest reserve'), dollars(20000));
  assert.equal(b.row('Total interest'), dollars(28800));
  assert.equal(b.row('Interest you still pay'), dollars(8800));
  assert.equal(b.get('lOut').querySelector('.grand b').textContent, dollars(108800));
  assert.match(b.get('lOut').querySelectorAll('.kpis .s')[2].textContent, /partly paid from the reserve/);
});
