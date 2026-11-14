// Third-pass workflows: independent end-to-end expectations, no external requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function boot(t, { delayedRead = false } = {}) {
  const errors = [], readers = [], exports = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url:'https://math.therichmain.com/', runScripts:'dangerously', pretendToBeVisual:true,
    virtualConsole, beforeParse(w) {
      w.fetch = () => { throw new Error('External requests forbidden'); };
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLAnchorElement.prototype.click = () => {};
      w.URL.createObjectURL = blob => { exports.push(blob); return 'blob:local'; };
      w.URL.revokeObjectURL = () => {};
      if (delayedRead) w.FileReader = class { readAsText() { readers.push(this); } };
    } });
  const w = dom.window, get = id => w.document.getElementById(id);
  t.after(() => { w.close(); assert.deepEqual(errors, []); });
  const input = (id, value) => {
    const el = get(id); el.value = String(value); el.dispatchEvent(new w.Event('input', { bubbles:true })); el.dispatchEvent(new w.Event('blur'));
  };
  const selectImport = value => {
    Object.defineProperty(get('importFile'), 'files', { configurable:true, value:[new w.File([JSON.stringify(value)], 'deal.json')] });
    get('importFile').dispatchEvent(new w.Event('change'));
  };
  const finishRead = (at, value) => { readers[at].result = JSON.stringify(value); readers[at].onload(); };
  const readBlob = blob => new Promise(resolve => { const reader = new w.FileReader(); reader.onload = () => resolve(JSON.parse(reader.result)); reader.readAsText(blob); });
  return { w, get, input, click:id => get(id).click(), selectImport, finishRead, readers, exports, readBlob };
}

test('LOI letter, dates and diligence exposure reconcile one complete leap-year offer', t => {
  const b = boot(t);
  const data = { oBuyer:'Buyer LLC', oSeller:'Seller LLC', oProp:'Parcel 123', oUse:'two homes', oTitleCo:'Escrow Co',
    oPrice:400000.25, oEarnest:10000.75, oDate:'2028-02-29', oValid:14, oDD:45, oClose:30, oExtN:2, oExtDays:15,
    oSurvey:1500, oSoil:2500, oEnviro:3000, oOther:7500 };
  for (const [id, value] of Object.entries(data)) b.input(id, value);
  const letter = b.get('oLetter').textContent, result = b.get('oOut').textContent;
  assert.match(letter, /Purchase price\. \$400,000\.25, paid at closing/);
  assert.match(letter, /Earnest money\. \$10,000\.75/);
  assert.match(letter, /45 days from the date a purchase agreement is signed/);
  assert.match(letter, /2 times by 15 days each/);
  assert.match(letter, /Within 30 days after the due diligence period ends/);
  assert.match(letter, /by Mar 14, 2028/);
  for (const date of ['Apr 14, 2028', 'May 14, 2028', 'Jun 13, 2028']) assert.ok(result.includes(date));
  assert.match(result, /At risk before the deposit goes hard\$14,500/);
  assert.match(result, /At risk after\$24,501/);
  assert.match(result, /9 of 9 must-haves/);
  b.click('kExt');
  assert.doesNotMatch(b.get('oLetter').textContent, /Extensions\./);
  assert.doesNotMatch(b.get('oOut').textContent, /Jun 13, 2028/);
});

test('LOI purchase and deposit are whole cents across engine, typing, import and linked Spec values', async t => {
  const b = boot(t), mod = { exports:{} };
  new Function('module', html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
  for (const [raw, cents] of [[1.005, 1.01], [10.075, 10.08], [0.0049, 0], [0.005, 0.01], [1e-7, 0], [999999999.995, 1000000000]]) {
    const result = mod.exports.offer({ price:raw, earnest:raw });
    assert.equal(result.price, cents); assert.equal(result.earnest, cents);
    b.input('oPrice', raw); b.input('oEarnest', raw);
    assert.equal(Number(b.get('oPrice').value.replaceAll(',', '')), cents);
    assert.equal(Number(b.get('oEarnest').value.replaceAll(',', '')), cents);
    const literal = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:Number.isInteger(cents) ? 0 : 2 }).format(cents);
    assert.ok(b.get('oLetter').textContent.includes('Purchase price. ' + literal));
    assert.ok(b.get('oLetter').textContent.includes('Earnest money. ' + literal));
  }
  for (const id of ['oBuyer', 'oSeller', 'oProp', 'oTitleCo']) b.input(id, 'Complete');
  b.input('oPrice', 0.0049); b.input('oEarnest', 0.0049);
  assert.match(b.get('oOut').textContent, /7 of 9 must-haves/);
  assert.match(b.get('oOut').textContent, /offer price, earnest money/);
  b.selectImport({ inputs:{ purchasePrice:1.005 }, tools:{ offer:{ oPrice:10.075, oEarnest:1.005 } } }); await pause(30);
  assert.equal(b.get('oPrice').value, '10.08'); assert.equal(b.get('oEarnest').value, '1.01');
  b.click('oRelink'); assert.equal(b.get('purchasePrice').value, '1.005');
  assert.equal(b.get('oPrice').value, '1.01'); assert.equal(b.get('oEarnest').value, '1.01');
  b.input('lRate', 7.1234); b.input('cFeePct', 12.1234);
  assert.equal(b.get('lRate').value, '7.1234'); assert.equal(b.get('cFeePct').value, '12.1234');
});

test('LOI land-to-value ratio accepts the full linked Spec range and diligence sum fits its inputs', t => {
  const b = boot(t), mod = { exports:{} };
  new Function('module', html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
  b.input('purchasePrice', 1000000000); b.input('buildableSqft', 10000000); b.input('salePerSqft', 1000000);
  assert.equal(b.w._last.r.lines.arv, 10000000000000);
  assert.equal(mod.exports.offer({ price:1000000000, arv:b.w._last.r.lines.arv }).landPct, 0.01);
  assert.match(b.get('oOut').textContent, /Land vs\. finished value0\.0%/);
  for (const id of ['oSurvey', 'oSoil', 'oEnviro']) b.input(id, 10000000);
  b.input('oOther', 100000000);
  assert.match(b.get('oOut').textContent, /At risk before the deposit goes hard\$130,000,000/);
});

test('an older asynchronous import cannot overwrite a newer selected file', t => {
  const b = boot(t, { delayedRead:true });
  const older = { name:'Older', inputs:{ purchasePrice:100000 } }, newer = { name:'Newer', inputs:{ purchasePrice:200000 } };
  b.selectImport(older); b.selectImport(newer);
  b.finishRead(1, newer); b.finishRead(0, older);
  assert.equal(b.get('dealName').value, 'Newer'); assert.equal(b.get('purchasePrice').value, '200,000');
});

test('Reset supersedes a still-reading import rather than losing the new draft', t => {
  const b = boot(t, { delayedRead:true }), older = { name:'Older', inputs:{ purchasePrice:100000 } };
  b.selectImport(older); b.click('btnReset'); b.input('purchasePrice', 200000); b.finishRead(0, older);
  assert.equal(b.get('dealName').value, ''); assert.equal(b.get('purchasePrice').value, '200,000');
});

test('newer Spec, name, GC, lender, LOI and mode edits supersede pending imports and stale read errors', t => {
  const b = boot(t, { delayedRead:true }), older = { name:'Older file', inputs:{ purchasePrice:100000 } };
  const edits = [
    () => b.input('purchasePrice', 200000),
    () => b.input('dealName', 'Newer name'),
    () => b.input('cFeePct', 23),
    () => b.input('oBuyer', 'Newer buyer'),
    () => b.click('dd-comps'),
    () => b.input('lRate', 8),
    () => b.w.document.querySelector('[data-mode=full]').click()
  ];
  const readDraft = () => [b.get('purchasePrice').value, b.get('dealName').value, b.get('cFeePct').value,
    b.get('oBuyer').value, b.get('dd-comps').getAttribute('aria-checked'), b.get('lRate').value,
    b.w.document.querySelector('[data-mode=full]').getAttribute('aria-pressed')];
  for (const edit of edits) {
    b.selectImport(older); const reader = b.readers.length - 1;
    edit(); const draft = readDraft(), feedback = b.get('toast').textContent;
    b.finishRead(reader, older);
    assert.deepEqual(readDraft(), draft, 'newer field edits must not be erased by an older import');
    b.readers[reader].onerror(); assert.equal(b.get('toast').textContent, feedback);
  }
});

test('Load supersedes a still-reading import and stale read errors do not replace newer feedback', t => {
  const b = boot(t, { delayedRead:true }), older = { name:'Older', inputs:{ purchasePrice:100000 } };
  b.input('dealName', 'Saved choice'); b.input('purchasePrice', 200000); b.click('btnSave');
  b.selectImport(older); b.click('btnReset'); b.click('btnSaved');
  b.get('savedList').querySelector('[data-load]').click();
  b.finishRead(0, older);
  assert.equal(b.get('dealName').value, 'Saved choice'); assert.equal(b.get('purchasePrice').value, '200,000');
  const feedback = b.get('toast').textContent; b.readers[0].onerror();
  assert.equal(b.get('toast').textContent, feedback);
  b.selectImport(older); b.selectImport(older);
  b.readers[1].onerror(); assert.equal(b.get('toast').textContent, feedback);
  b.readers[2].onerror(); assert.match(b.get('toast').textContent, /Could not read/);
});

test('arbitrary user-entered deal names round-trip through the app own export', async t => {
  const b = boot(t), name = 'Property '.repeat(40);
  b.input('dealName', name); b.click('btnExport'); const exported = await b.readBlob(b.exports[0]);
  b.click('btnReset'); b.selectImport(exported); await pause(30);
  assert.equal(b.get('dealName').value, name.trim());
});

test('every secondary number, option and checkbox survives export/import with identical outputs', async t => {
  const b = boot(t);
  b.w.document.querySelector('[data-mode=full]').click();
  b.input('dealName', 'All fields'); b.input('purchasePrice', 345678.25); b.input('buildCostPerSqft', 234.56);
  const contract = { cHard:456789.1234, cPermits:25000.25, cContPct:4.4444, cDesign:35000.5, cFeePct:12.3456,
    cSharePct:65.4321, cGmp:750000.25, cLumpPct:18.7654, cDbPct:17.2345, cVar:-7.6543 };
  const lender = { lLot:345678.25, lOwed:12345.67, lBuild:567890.12, lArv:1234567.89, lMonths:13, lSell:4,
    lLtc:76.5432, lLtv:68.7654, lLandAdv:65.4321, lRate:9.8765, lPoints:1.2345, lFees:4321.25,
    lClosing:1234.56, lPermRate:6.5432, lPermYears:27 };
  const offer = { oPrice:345678.25, oEarnest:4567.89, oValid:11, oDD:53, oClose:37, oUnits:9, oExtN:3,
    oExtDays:17, oExcl:47, oSurvey:1234.56, oSoil:2345.67, oEnviro:3456.78, oOther:4567.89,
    oBuyer:'Stored Buyer', oSeller:'Stored Seller', oProp:'Stored Parcel', oUse:'nine homes', oTitleCo:'Stored Escrow', oDate:'2028-02-29' };
  b.click('kDensity');
  for (const [id, value] of Object.entries({ ...contract, ...lender, ...offer })) b.input(id, value);
  b.w.document.querySelector('[data-loan=c2p]').click(); b.click('swOwn'); b.click('swReserve');
  b.click('swMethod'); b.click('swDutch'); // save explicit false against linked flat-interest true
  for (const checkbox of b.w.document.querySelectorAll('#ddList [role=checkbox]')) checkbox.click();
  b.click('kAccess'); b.click('kCoop'); b.click('kDocs'); b.click('kAssign');
  const panels = ['cCards', 'lOut', 'oOut', 'oLetter'];
  const before = panels.map(id => b.get(id).textContent);
  b.click('btnExport'); const exported = await b.readBlob(b.exports[0]);
  assert.equal(exported.tools.lender.dutch, false); assert.equal(exported.tools.offer.kAccess, false);
  b.click('btnReset'); b.selectImport(exported); await pause(30);
  assert.deepEqual(panels.map(id => b.get(id).textContent), before);
  for (const [id, value] of Object.entries({ ...contract, ...lender })) assert.equal(Number(b.get(id).value.replaceAll(',', '')), value, id);
  for (const [id, value] of Object.entries(offer)) assert.equal(typeof value === 'number' ? Number(b.get(id).value.replaceAll(',', '')) : b.get(id).value, value, id);
  assert.equal(b.get('swDutch').getAttribute('aria-checked'), 'false');
  assert.equal(b.get('swOwn').getAttribute('aria-checked'), 'true');
  assert.equal(b.get('swReserve').getAttribute('aria-checked'), 'true');
  assert.equal([...b.w.document.querySelectorAll('#ddList [role=checkbox]')].every(el => el.getAttribute('aria-checked') === 'true'), true);
  b.click('cRelink'); b.click('lRelink'); b.click('oRelink'); b.click('btnExport');
  const linked = await b.readBlob(b.exports[1]);
  for (const [tool, field] of [['contract', 'cHard'], ['lender', 'lRate'], ['offer', 'oPrice']]) assert.equal(linked.tools[tool][field], null);
  b.click('btnReset'); b.selectImport(linked); await pause(30); b.input('purchasePrice', 456789);
  assert.equal(b.get('lLot').value, '456,789'); assert.equal(b.get('oPrice').value, '456,789');
  assert.equal(b.get('cFeePct').value, '12.3456', 'relink retains independent contract terms');
});
