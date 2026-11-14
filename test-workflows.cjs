// Run npm test, or node test-workflows.cjs after npm ci --ignore-scripts.
// Local DOM only: no network requests, emails, browser account, or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const sessions = [];
function boot(storage = {}) {
  const errors = [], blobs = [], copied = [], calls = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://math.therichmain.com/', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: console, beforeParse(w) {
      for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, JSON.stringify(value));
      w.HTMLElement.prototype.scrollIntoView = function() {};
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLAnchorElement.prototype.click = function() {};
      w.HTMLFormElement.prototype.submit = function() { calls.push('relay'); };
      w.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:local-test'; };
      w.URL.revokeObjectURL = () => {};
      w.print = () => calls.push('print');
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => copied.push(text) } });
    } });
  sessions.push(dom);
  const w = dom.window, doc = w.document, get = id => doc.getElementById(id);
  const input = (id, value) => {
    const el = get(id); el.focus(); el.value = String(value);
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    if (doc.activeElement === el) el.blur(); else el.dispatchEvent(new w.Event('blur'));
  };
  const click = id => get(id).click();
  const imported = async value => {
    const file = new w.File([JSON.stringify(value)], 'deal.json', { type: 'application/json' });
    Object.defineProperty(get('importFile'), 'files', { configurable: true, value: [file] });
    get('importFile').dispatchEvent(new w.Event('change'));
    await new Promise(resolve => w.setTimeout(resolve, 25));
  };
  const exported = async () => {
    click('btnExport');
    return new Promise((resolve, reject) => {
      const reader = new w.FileReader(); reader.onerror = reject;
      reader.onload = () => resolve(JSON.parse(reader.result)); reader.readAsText(blobs.at(-1));
    });
  };
  return { w, doc, get, input, click, imported, exported, errors, copied, calls };
}

(async () => {
  const b = boot(), { w, doc, get, input, click } = b;
  assert.deepEqual(b.errors, [], 'page boots without exceptions');
  for (const button of doc.querySelectorAll('[data-go], #segTab button')) {
    button.click();
    const target = button.dataset.go || button.dataset.tab;
    assert.equal(get(target + 'View').hidden, false, 'navigation opens ' + target);
    assert.equal(doc.querySelector('#segTab [data-tab="' + target + '"]').getAttribute('aria-pressed'), 'true');
  }
  for (const id of ['oBuyer', 'oSeller', 'oProp', 'oUse', 'oTitleCo', 'oDate']) assert.ok(get(id).labels.length, id + ' has an accessible label');
  for (const button of doc.querySelectorAll('.qh')) {
    assert.match(button.getAttribute('aria-label'), /^Explain \S/, 'help identifies its field');
    button.click(); assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(get(button.getAttribute('aria-controls')).hidden, false);
    button.click(); assert.equal(button.getAttribute('aria-expanded'), 'false');
  }
  for (const checkbox of doc.querySelectorAll('[role=checkbox]')) {
    const initial = checkbox.getAttribute('aria-checked'); checkbox.click();
    assert.notEqual(checkbox.getAttribute('aria-checked'), initial); checkbox.click();
    assert.equal(checkbox.getAttribute('aria-checked'), initial);
  }
  for (const button of doc.querySelectorAll('.trow .chip, .trow .vchip')) {
    button.click(); assert.equal(button.getAttribute('aria-pressed'), 'true');
  }
  click('btnReset');
  input('lMonths', 10.6); assert.equal(get('lMonths').value, '11');
  input('lPermYears', 30.5); assert.equal(get('lPermYears').value, '31');
  input('oExtN', 1.6); assert.equal(get('oExtN').value, '2');
  input('cHard', 1234.56); assert.equal(get('cHard').value, '1,234.56', 'keep entered cents');
  input('cGmp', 0); assert.equal(get('cGmpTag').textContent, 'auto'); assert.ok(Number(get('cGmp').value.replaceAll(',', '')) > 0);
  input('oDate', '2028-02-29'); input('oDate', '');
  assert.equal(get('oDate').value, '2028-02-29', 'blank date restores the date used by the letter');
  assert.match(get('oLetter').textContent, /Date: Feb 29, 2028/);
  assert.match(get('oHint').textContent, /purchase agreement/);
  assert.match(get('oOut').textContent, /Letter checklist/);
  assert.doesNotMatch(get('oOut').textContent, /Ready to send/);
  assert.equal(get('oLetter').tabIndex, 0, 'long letter is keyboard scrollable');
  assert.equal(get('oUnits').disabled, true); click('kDensity'); input('oUnits', 3);
  click('kDensity'); assert.equal(get('oUnits').disabled, true);
  click('kDensity'); assert.equal(get('oUnits').disabled, false); assert.equal(get('oUnits').value, '3');
  click('kExt'); assert.equal(get('oExtN').disabled, true); assert.equal(get('oExtDays').disabled, true);
  click('kExt'); assert.equal(get('oExtN').disabled, false); assert.equal(get('oExtN').value, '2');
  click('btnReset');
  doc.querySelector('[data-type=teardown]').click();
  assert.equal(Number(get('cHard').value.replaceAll(',', '')), w._last.r.lines.hard + w._last.r.lines.demo, 'GC includes demolition');
  doc.querySelector('[data-mode=full]').click(); click('swMethod');
  assert.equal(get('swDutch').getAttribute('aria-checked'), 'true', 'loan method inherits Spec');
  click('swDutch'); assert.equal(get('swDutch').getAttribute('aria-checked'), 'false', 'loan method accepts override');
  click('lRelink'); assert.equal(get('swDutch').getAttribute('aria-checked'), 'true', 'relink restores loan method');
  doc.querySelector('[data-loan=c2p]').click();
  assert.equal(get('lSellField').hidden, true); assert.equal(get('lPermBox').hidden, false);
  click('swOwn'); assert.equal(get('lOwedField').hidden, false);
  click('swReserve'); assert.equal(get('swReserve').getAttribute('aria-checked'), 'true');

  click('btnReset'); doc.querySelector('[data-mode=full]').click(); doc.querySelector('[data-type=teardown]').click();
  for (const [id, value] of Object.entries({ purchasePrice:400000, buildableSqft:3000, buildCostPerSqft:200,
    softCostPct:10, contingencyPct:5, permitFees:20000, demoCost:50000, salePerSqft:500,
    ltcPct:80, maxLtvPct:70, ratePct:12, pointsPct:2, lenderFee:3000, buyClosingPct:2, buildMonths:10, sellMonths:2 })) input(id, value);
  assert.equal(Math.round(w._last.r.lines.interestTotal), 85980, 'teardown fixture interest includes upfront demolition');
  assert.equal(get('lOut').querySelector('.kpis .kpi:nth-child(3) .v').textContent, '$85,980', 'linked lender view agrees with Spec interest');
  assert.match(get('lOut').textContent, /Demolition paid upfront/);

  click('btnReset'); input('dealName', 'Deal A'); input('cFeePct', 11); input('lRate', 8); input('oBuyer', 'Buyer A'); click('dd-comps'); click('btnSave');
  input('dealName', 'Deal B'); input('cFeePct', 22); input('lRate', 15); input('oBuyer', 'Buyer B'); click('dd-comps'); click('btnSave');
  click('btnSaved'); doc.querySelector('[data-load="1"]').click();
  const checkA = () => {
    assert.equal(get('dealName').value, 'Deal A'); assert.equal(get('cFeePct').value, '11');
    assert.equal(get('lRate').value, '8'); assert.equal(get('oBuyer').value, 'Buyer A');
    assert.equal(get('dd-comps').getAttribute('aria-checked'), 'true');
  };
  checkA(); const backup = await b.exported();
  assert.ok(backup.tools.contract && backup.tools.lender && backup.tools.offer, 'export includes all workflows');
  click('btnReset'); assert.equal(get('cFeePct').value, '15'); assert.equal(get('oBuyer').value, '');
  assert.equal(get('dd-comps').getAttribute('aria-checked'), 'false');
  await b.imported(backup); checkA();
  const previous = get('purchasePrice').value; await b.imported({ unknown: 1 });
  assert.equal(get('purchasePrice').value, previous, 'invalid import leaves deal unchanged');
  await b.imported({ purchasePrice: 250000 });
  assert.equal(get('purchasePrice').value, '250,000'); assert.equal(get('cFeePct').value, '15');
  assert.equal(get('oBuyer').value, '', 'legacy imports cannot retain another deal’s parties');
  click('btnCopy'); click('oCopy'); click('btnPrint');
  assert.equal(b.copied.length, 2); assert.ok(b.copied[0].includes('MainMath')); assert.ok(b.copied[1].includes('LETTER OF INTENT'));
  assert.ok(b.calls.includes('print')); assert.deepEqual(b.errors, [], 'all tested controls run without exceptions');

  click('btnReset');
  click('kDensity');
  const numeric = [...doc.querySelectorAll('input[inputmode=decimal]')];
  for (const el of numeric) {
    input(el.id, 1); assert.equal(Number(el.value.replaceAll(',', '')), 1, el.id + ' accepts a valid number');
    input(el.id, 'invalid'); assert.ok(Number.isFinite(Number(el.value.replaceAll(',', ''))), el.id + ' restores a usable number');
  }
  for (const el of doc.querySelectorAll('[role=switch]')) {
    const initial = el.getAttribute('aria-checked');
    el.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    assert.notEqual(el.getAttribute('aria-checked'), initial, el.id + ' works with the keyboard');
    el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(el.getAttribute('aria-checked'), initial);
  }
  assert.deepEqual(b.errors, [], 'every numeric field and switch runs without exceptions');

  const malformed = boot({ dmp_deals_v1: { bad: true }, mm_loi_v1: { oDate: '2026-02-31' }, mm_lender_v1: { lMonths: 10.6, dutch: false } });
  malformed.click('btnSave'); malformed.click('btnSaved');
  assert.deepEqual(malformed.errors, [], 'corrupt storage handled without runtime errors');
  assert.deepEqual(JSON.parse(malformed.w.localStorage.getItem('dmp_deals_v1')), { bad: true }, 'do not overwrite unreadable stored deals');
  assert.notEqual(malformed.get('oDate').value, '', 'invalid stored dates fall back to valid date');
  assert.equal(malformed.get('lMonths').value, '11', 'stored integer fields use engine rounding');
  assert.equal(malformed.get('swDutch').getAttribute('aria-checked'), 'false', 'stored false override survives');

  const gate = boot({ mm_trial_v1: Date.now() - 8 * 864e5 });
  const submit = () => gate.get('gateForm').dispatchEvent(new gate.w.Event('submit', { cancelable: true, bubbles: true }));
  assert.ok(gate.get('gate').classList.contains('show'), 'expired trial opens signup');
  gate.input('gName', 'A'); gate.input('gEmail', 'bad'); submit();
  assert.equal(gate.calls.includes('relay'), false, 'invalid lead is rejected');
  gate.input('gName', 'Test Buyer'); gate.input('gEmail', 'test@example.invalid');
  Object.defineProperty(gate.w.navigator, 'onLine', { configurable: true, value: false }); submit();
  assert.equal(gate.calls.includes('relay'), false, 'offline signup is not submitted');
  assert.equal(gate.w.localStorage.getItem('mm_lead_v1'), null, 'offline signup does not silently unlock');
  Object.defineProperty(gate.w.navigator, 'onLine', { configurable: true, value: true });
  gate.get('leadRelay').submit = () => { throw new Error('Submission unavailable'); }; submit();
  assert.equal(gate.w.localStorage.getItem('mm_lead_v1'), null, 'failed submission does not silently unlock');
  assert.ok(gate.get('gate').classList.contains('show'));
  gate.get('leadRelay').submit = () => gate.calls.push('relay'); gate.input('dealName', 'Private address'); submit();
  assert.ok(gate.calls.includes('relay')); assert.equal(gate.get('relaySource').value, 'MainMath website', 'signup excludes private deal names');
  assert.equal(gate.get('gate').classList.contains('show'), false); assert.deepEqual(gate.errors, []);
  console.log('workflow DOM checks passed: ' + numeric.length + ' numeric fields, navigation, help, checklists, keyboard switches, linked tools, persistence, import/export, copy, print, corrupt storage, signup failure handling');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => sessions.forEach(dom => dom.window.close()));
