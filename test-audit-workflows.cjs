// Fresh adversarial workflow audit. Run: node --test test-audit-workflows.cjs
// All HTML and storage are local. Network, downloads, clipboard and print are mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const snapshot = storage => Object.fromEntries(Object.keys(storage).map(key => [key, storage.getItem(key)]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function boot(t, { local = {}, session = {}, fetch = async () => { throw new Error('No network'); }, clipboard = true, locks } = {}) {
  const errors = [], downloads = [], requests = [], copied = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url:'https://math.therichmain.com/', runScripts:'dangerously', pretendToBeVisual:true,
    virtualConsole:vc, beforeParse(w) {
      for (const [key, value] of Object.entries(local)) w.localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(session)) w.sessionStorage.setItem(key, value);
      w.HTMLElement.prototype.scrollIntoView = function() {};
      w.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLFormElement.prototype.submit = () => { throw new Error('Unexpected form submission'); };
      w.HTMLAnchorElement.prototype.click = function() { downloads.push({ name:this.download, href:this.href }); };
      w.URL.createObjectURL = () => 'blob:local'; w.URL.revokeObjectURL = () => {};
      w.print = () => {};
      w.fetch = async (url, options) => { const request = { url, ...options, data:JSON.parse(options.body) }; requests.push(request); return fetch(request); };
      w.document.execCommand = () => false;
      if (locks) Object.defineProperty(w.navigator, 'locks', { value:locks });
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => {
        if (!clipboard) throw new Error('Clipboard denied'); copied.push(value);
      } } });
    } });
  const w = dom.window, doc = w.document, get = id => doc.getElementById(id);
  t.after(() => { dom.window.close(); assert.deepEqual(errors, [], 'no unhandled page exceptions'); });
  const click = id => get(id).click();
  const input = (id, value) => {
    const el = get(id); el.value = String(value);
    el.dispatchEvent(new w.Event('input', { bubbles:true })); el.dispatchEvent(new w.Event('blur'));
  };
  const saved = () => JSON.parse(w.localStorage.getItem('dmp_deals_v1') || '[]');
  const save = (name, price) => { input('dealName', name); input('purchasePrice', price); click('btnSave'); };
  const imported = async data => {
    Object.defineProperty(get('importFile'), 'files', { configurable:true, value:[new w.File([JSON.stringify(data)], 'audit.json')] });
    get('importFile').dispatchEvent(new w.Event('change')); await pause(30);
  };
  return { w, doc, get, click, input, save, saved, imported, downloads, requests, copied };
}

test('two unnamed deals saved on the same day remain separate', t => {
  const b = boot(t); b.save('', 100000); b.click('btnReset'); b.save('', 200000);
  assert.equal(b.saved().length, 2, 'automatic names must not overwrite earlier deals');
  assert.deepEqual(b.saved().map(d => d.inputs.purchasePrice).sort(), [100000, 200000]);
});

test('an automatic saved name populates the draft and later Save updates that same deal', t => {
  const b = boot(t); b.save('', 100000);
  const name = b.get('dealName').value; assert.ok(name);
  b.input('purchasePrice', 150000); b.click('btnSave');
  assert.equal(b.saved().length, 1); assert.equal(b.saved()[0].name, name);
  assert.equal(b.saved()[0].inputs.purchasePrice, 150000);
});

test('saving an explicitly named deal updates that deal only', t => {
  const b = boot(t); b.save('A', 100000); b.save('B', 200000); b.save('A', 300000);
  assert.equal(b.saved().length, 2);
  assert.equal(b.saved().find(d => d.name === 'A').inputs.purchasePrice, 300000);
  assert.equal(b.saved().find(d => d.name === 'B').inputs.purchasePrice, 200000);
});

test('Delete targets the displayed deal after another tab prepends a saved deal', t => {
  const b = boot(t); b.save('A', 100000); b.save('B', 200000); b.click('btnSaved');
  const before = b.saved(), external = { ...before[0], name:'C', ts:Date.now() + 1, inputs:{ ...before[0].inputs, purchasePrice:300000 } };
  b.w.localStorage.setItem('dmp_deals_v1', JSON.stringify([external, ...before]));
  b.get('savedList').querySelector('.deal button[data-del]').click();
  assert.deepEqual(b.saved().map(d => d.name), ['C', 'A'], 'delete B, preserving newly saved C');
});

test('Load targets the displayed deal after another tab prepends a saved deal', t => {
  const b = boot(t); b.save('A', 100000); b.save('B', 200000); b.click('btnSaved');
  const before = b.saved(), external = { ...before[0], name:'C', ts:Date.now() + 1, inputs:{ ...before[0].inputs, purchasePrice:300000 } };
  b.w.localStorage.setItem('dmp_deals_v1', JSON.stringify([external, ...before]));
  b.get('savedList').querySelector('.deal button[data-load]').click();
  assert.equal(b.get('dealName').value, 'B'); assert.equal(b.get('purchasePrice').value, '200,000');
});

test('a stale modal refuses to load or delete a deal changed in another tab', t => {
  const b = boot(t); b.save('A', 100000); b.save('B', 200000);
  for (const action of ['load', 'del']) {
    b.click('btnSaved'); const list = b.saved();
    list[0].ts += 10; list[0].inputs.purchasePrice += 100;
    const raw = JSON.stringify(list); b.w.localStorage.setItem('dmp_deals_v1', raw);
    b.get('savedList').querySelector('[data-' + action + ']').click();
    assert.equal(b.w.localStorage.getItem('dmp_deals_v1'), raw);
    assert.match(b.get('toast').textContent, /changed in another tab/);
    assert.equal(b.get('purchasePrice').value, '200,000');
  }
});

test('queued save captures the clicked draft and keeps newer name edits while rereading storage inside lock', async t => {
  const queue = [], locks = { request(name, callback) {
    assert.equal(name, 'mainmath-saved-deals'); return new Promise((resolve, reject) => queue.push(() => {
      try { resolve(callback()); } catch (error) { reject(error); }
    }));
  } };
  const b = boot(t, { locks }); b.input('cFeePct', 12); b.save('Clicked draft', 100000);
  assert.equal(queue.length, 1); assert.equal(b.saved().length, 0, 'storage mutation waits for lock');
  b.input('dealName', 'Newer draft'); b.input('purchasePrice', 200000); b.input('cFeePct', 25);
  const external = { version:2, name:'Another tab', ts:Date.now(), mode:'quick', inputs:{ purchasePrice:300000 }, snap:{ margin:0, profit:0, cash:0, score:0 } };
  b.w.localStorage.setItem('dmp_deals_v1', JSON.stringify([external]));
  queue.shift()(); await pause(0);
  assert.equal(b.saved().length, 2, 'preserves write made before lock acquired');
  const clicked = b.saved().find(d => d.name === 'Clicked draft');
  assert.equal(clicked.inputs.purchasePrice, 100000); assert.equal(clicked.tools.contract.cFeePct, 12);
  assert.equal(b.get('dealName').value, 'Newer draft'); assert.equal(b.get('purchasePrice').value, '200,000');
  b.click('btnSaved'); b.get('savedList').querySelector('[data-del]').click();
  assert.equal(queue.length, 1, 'Delete uses the same storage lock');
  b.w.localStorage.setItem('dmp_deals_v1', JSON.stringify([{ ...external, name:'Newest tab', ts:Date.now()+5 }, ...b.saved()]));
  queue.shift()(); await pause(0);
  assert.deepEqual(b.saved().map(d => d.name), ['Newest tab', 'Another tab']);
});

test('storage lock failure reports failure without silently changing saved data', async t => {
  const b = boot(t, { locks:{ request:async () => { throw new Error('Lock unavailable'); } } });
  b.save('A', 100000); await pause(0);
  assert.equal(b.saved().length, 0); assert.match(b.get('toast').textContent, /Could not update saved deals/);
});

test('queued unnamed save cannot name a reset or imported draft and overwrite it on the next save', async t => {
  for (const replacement of ['reset', 'import']) {
    const queue = [], locks = { request:(_name, callback) => new Promise(resolve => queue.push(() => resolve(callback()))) };
    const b = boot(t, { locks }); b.save('', 100000);
    assert.equal(queue.length, 1);
    if (replacement === 'reset') { b.click('btnReset'); b.input('purchasePrice', 200000); }
    else await b.imported({ inputs:{ purchasePrice:200000 } });
    queue.shift()(); await pause(0);
    assert.equal(b.get('dealName').value, '', 'previous save completion must not name the ' + replacement + ' draft');
    assert.equal(b.get('purchasePrice').value, '200,000');
    assert.equal(b.saved().length, 1); assert.equal(b.saved()[0].inputs.purchasePrice, 100000);
    b.click('btnSave'); queue.shift()(); await pause(0);
    assert.equal(b.saved().length, 2);
    assert.deepEqual(b.saved().map(d => d.inputs.purchasePrice).sort(), [100000, 200000]);
    assert.notEqual(b.saved()[0].name, b.saved()[1].name);
  }
});

test('invalid nonempty linked input preserves its last explicit value; empty input relinks', t => {
  const b = boot(t);
  for (const [id, value, key] of [['cHard', 123456, 'mm_contract_v1'], ['lRate', 8.5, 'mm_lender_v1'], ['oPrice', 234567, 'mm_loi_v1']]) {
    b.input(id, value); b.input(id, 'invalid');
    assert.equal(JSON.parse(b.w.localStorage.getItem(key))[id], value, id + ' invalid text cannot erase override');
    b.input(id, ''); assert.equal(JSON.parse(b.w.localStorage.getItem(key))[id], null, id + ' clears intentionally to linked');
  }
});

test('secondary inputs use the same precision shown in their boxes, including imported values', async t => {
  const b = boot(t);
  for (const [id, key] of [['cFeePct', 'mm_contract_v1'], ['lRate', 'mm_lender_v1'], ['oEarnest', 'mm_loi_v1']]) {
    b.input(id, 1.234567);
    assert.equal(JSON.parse(b.w.localStorage.getItem(key))[id], Number(b.get(id).value.replaceAll(',', '')));
  }
  b.input('lRate', 0.00001);
  assert.equal(b.get('lRate').value, '0'); assert.equal(JSON.parse(b.w.localStorage.getItem('mm_lender_v1')).lRate, 0);
  await b.imported({ version:2, inputs:{ purchasePrice:100000 }, tools:{ lender:{ lRate:0.00001 }, contract:{ cFeePct:1.234567 } } });
  assert.equal(JSON.parse(b.w.localStorage.getItem('mm_lender_v1')).lRate, 0);
  assert.equal(JSON.parse(b.w.localStorage.getItem('mm_contract_v1')).cFeePct, 1.2346);
});

test('export filenames retain a usable basename for emoji and non-Latin deal names', t => {
  const b = boot(t);
  for (const name of ['🏠', '凤凰城', '!!!']) {
    b.input('dealName', name); b.click('btnExport');
    assert.match(b.downloads.at(-1).name, /^[^.].*\.json$/, 'usable filename for ' + name);
  }
});

test('save quota failure preserves earlier deals and reports the failure', t => {
  const b = boot(t); b.save('A', 100000); const original = b.w.localStorage.getItem('dmp_deals_v1');
  const set = b.w.Storage.prototype.setItem;
  b.w.Storage.prototype.setItem = function(key, value) { if (key === 'dmp_deals_v1') throw new b.w.DOMException('Full', 'QuotaExceededError'); return set.call(this, key, value); };
  b.save('B', 200000);
  assert.equal(b.w.localStorage.getItem('dmp_deals_v1'), original);
  assert.match(b.get('toast').textContent, /Could not save/);
});

test('modal Close and backdrop dismissal restore focus to the opener', async t => {
  const b = boot(t); b.save('A', 100000); b.get('btnSaved').focus(); b.click('btnSaved'); await pause(45);
  b.get('closeSaved').focus(); b.click('closeSaved');
  assert.equal(b.doc.activeElement.id, 'btnSaved', 'Close restores focus');
  b.click('btnSaved'); await pause(45); b.get('modalSaved').click();
  assert.equal(b.doc.activeElement.id, 'btnSaved', 'backdrop restores focus');
});

test('rapid saved-modal dismissal cannot leave focus in a closed modal', async t => {
  const b = boot(t); b.click('btnSaved'); b.click('closeSaved'); await pause(50);
  assert.equal(b.get('modalSaved').classList.contains('show'), false);
  assert.equal(b.doc.activeElement.id, 'btnSaved');
});

test('modal Escape and tab wrap keep keyboard navigation usable', async t => {
  const b = boot(t); b.save('A', 100000); b.click('btnSaved'); await pause(45);
  const buttons = [...b.get('modalSaved').querySelectorAll('button')];
  buttons.at(-1).focus(); b.doc.dispatchEvent(new b.w.KeyboardEvent('keydown', { key:'Tab', bubbles:true, cancelable:true }));
  assert.equal(b.doc.activeElement, buttons[0]);
  b.doc.dispatchEvent(new b.w.KeyboardEvent('keydown', { key:'Tab', shiftKey:true, bubbles:true, cancelable:true }));
  assert.equal(b.doc.activeElement, buttons.at(-1));
  b.doc.dispatchEvent(new b.w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  assert.equal(b.get('modalSaved').classList.contains('show'), false); assert.equal(b.doc.activeElement.id, 'btnSaved');
});

test('imported names and LOI text cannot inject HTML into saved list, print heading or letter', async t => {
  const b = boot(t), payload = '<img src=x onerror="window.auditXss=1">';
  await b.imported({ version:2, name:payload, mode:'full', inputs:{ purchasePrice:123000 }, tools:{ offer:{ oBuyer:payload, oSeller:payload, oProp:payload } } });
  b.click('btnSave'); b.click('btnSaved');
  assert.equal(b.get('savedList').querySelector('img'), null); assert.equal(b.get('printHead').querySelector('img'), null);
  assert.equal(b.get('oLetter').querySelector('img'), null); assert.ok(b.get('oLetter').textContent.includes(payload));
  assert.equal(b.w.auditXss, undefined);
});

test('quick/full changes preserve full assumptions, and reload restores every tab', t => {
  const b = boot(t); b.doc.querySelector('[data-mode=full]').click(); b.input('ratePct', 7.25); b.input('demoCost', 45000);
  b.input('cFeePct', 12); b.input('lRate', 9); b.input('oBuyer', 'Stored buyer'); b.click('dd-comps');
  b.doc.querySelector('[data-mode=quick]').click(); assert.equal(b.w._last.input.ratePct, 10.5);
  b.doc.querySelector('[data-mode=full]').click(); assert.equal(b.w._last.input.ratePct, 7.25);
  const reloaded = boot(t, { local:snapshot(b.w.localStorage) });
  assert.equal(reloaded.w._last.input.ratePct, 7.25); assert.equal(reloaded.get('demoCost').value, '45,000');
  assert.equal(reloaded.get('cFeePct').value, '12'); assert.equal(reloaded.get('lRate').value, '9');
  assert.equal(reloaded.get('oBuyer').value, 'Stored buyer'); assert.equal(reloaded.get('dd-comps').getAttribute('aria-checked'), 'true');
});

test('specific relink/reset/clear controls change their intended scope only', t => {
  const b = boot(t); b.input('cHard', 123000); b.input('cFeePct', 22); b.click('cReset');
  assert.equal(b.get('cHard').value, '123,000'); assert.equal(b.get('cFeePct').value, '15');
  b.click('cRelink'); assert.equal(Number(b.get('cHard').value.replaceAll(',', '')), b.w._last.r.lines.hard);
  b.input('oBuyer', 'Buyer'); b.input('oPrice', 250000); b.click('oClear');
  assert.equal(b.get('oBuyer').value, ''); assert.equal(b.get('oPrice').value, '250,000');
  b.click('oRelink'); assert.equal(Number(b.get('oPrice').value.replaceAll(',', '')), b.w._last.input.purchasePrice);
});

test('letter checklist rejects deposits above price and deadline overflow without silently changing the draft', t => {
  const b = boot(t);
  for (const id of ['oBuyer', 'oSeller', 'oProp', 'oTitleCo']) b.input(id, 'Completed ' + id);
  b.input('oPrice', 100000); b.input('oEarnest', 200000);
  assert.match(b.get('oOut').textContent, /8 of 9 must-haves/);
  assert.match(b.get('oOut').textContent, /deposit no greater than offer price/);
  assert.equal(b.get('oEarnest').value, '200,000');
  b.input('oEarnest', 5000); assert.match(b.get('oOut').textContent, /9 of 9 must-haves/);
  b.input('oDate', '9999-12-31');
  assert.equal(b.get('oDate').value, '9999-12-31');
  assert.match(b.get('oOut').textContent, /8 of 9 must-haves/);
  assert.match(b.get('oOut').textContent, /dates within supported calendar range/);
  b.input('oDate', '2028-02-29'); assert.match(b.get('oOut').textContent, /9 of 9 must-haves/);
});

test('pending signup identity survives a lost receipt and page reload', async t => {
  const local = { mm_trial_v1:String(Date.now() - 8 * 864e5) };
  const lost = boot(t, { local }); lost.input('gName', 'Test Buyer'); lost.input('gEmail', 'test@example.invalid');
  lost.get('gateForm').dispatchEvent(new lost.w.Event('submit', { bubbles:true, cancelable:true })); await pause(5);
  assert.equal(lost.requests.length, 1); assert.equal(lost.w.localStorage.getItem('mm_lead_v1'), null);
  const reloaded = boot(t, { local:snapshot(lost.w.localStorage), session:snapshot(lost.w.sessionStorage) });
  reloaded.input('gName', 'Test Buyer'); reloaded.input('gEmail', 'test@example.invalid');
  reloaded.get('gateForm').dispatchEvent(new reloaded.w.Event('submit', { bubbles:true, cancelable:true })); await pause(5);
  assert.equal(reloaded.requests.length, 1);
  assert.equal(reloaded.requests[0].data.id, lost.requests[0].data.id, 'retry after reload reuses original durable id');
});

test('confirmed signup clears pending attempt and persists the acknowledged identity', async t => {
  const b = boot(t, { local:{ mm_trial_v1:String(Date.now() - 8*864e5) }, fetch:async request => ({ ok:true, json:async () => ({ ok:true, id:request.data.id }) }) });
  b.input('gName', 'Test Buyer'); b.input('gEmail', 'test@example.invalid');
  b.get('gateForm').dispatchEvent(new b.w.Event('submit', { bubbles:true, cancelable:true })); await pause(5);
  assert.equal(b.w.sessionStorage.getItem('mm_lead_attempt_v1'), null);
  assert.equal(JSON.parse(b.w.localStorage.getItem('mm_lead_v1')).id, b.requests[0].data.id);
});

test('server-rejected email gives correction guidance and allows an edited retry to succeed', async t => {
  const b = boot(t, { local:{ mm_trial_v1:String(Date.now() - 8*864e5) }, fetch:async request =>
    request.data.email === 'a..b@example.com'
      ? { ok:false, status:400, json:async () => { throw new Error('Error bodies need not be JSON'); } }
      : { ok:true, status:200, json:async () => ({ ok:true, id:request.data.id }) }
  });
  const submit = () => b.get('gateForm').dispatchEvent(new b.w.Event('submit', { bubbles:true, cancelable:true }));
  b.input('gName', 'Test Buyer'); b.input('gEmail', 'a..b@example.com'); submit(); await pause(5);
  assert.match(b.get('gErr').textContent, /Check your name and email address, correct any typos/);
  assert.equal(b.get('gEmail').value, 'a..b@example.com'); assert.equal(b.get('gName').value, 'Test Buyer');
  assert.equal(b.get('gate').classList.contains('show'), true);
  assert.equal(b.get('gateForm').querySelector('button[type=submit]').disabled, false);
  assert.equal(b.w.localStorage.getItem('mm_lead_v1'), null);
  b.input('gEmail', 'a.b@example.com'); submit(); await pause(5);
  assert.equal(b.requests.length, 2); assert.notEqual(b.requests[1].data.id, b.requests[0].data.id);
  assert.equal(b.get('gate').classList.contains('show'), false);
  assert.equal(JSON.parse(b.w.localStorage.getItem('mm_lead_v1')).email, 'a.b@example.com');
  assert.equal(b.w.sessionStorage.getItem('mm_lead_attempt_v1'), null);
});

test('denied clipboard exposes a reusable visible selectable summary and letter', async t => {
  const b = boot(t, { clipboard:false }); b.save('Copy audit', 123000);
  const count = b.doc.querySelectorAll('textarea').length;
  b.click('btnCopy'); await pause(0);
  const dialog = b.get('copyDialog'), box = b.get('copyText');
  assert.equal(dialog.open, true); assert.equal(box.readOnly, true); assert.equal(b.doc.activeElement, box);
  assert.match(box.value, /^Copy audit — MainMath/); assert.equal(box.selectionEnd - box.selectionStart, box.value.length);
  dialog.close(); b.click('oCopy'); await pause(0);
  assert.equal(dialog.open, true); assert.equal(box.value, b.get('oLetter').textContent);
  assert.equal(box.selectionEnd - box.selectionStart, box.value.length);
  b.click('btnCopy'); await pause(0);
  assert.equal(b.doc.querySelectorAll('textarea').length, count, 'no abandoned offscreen textareas');
});
