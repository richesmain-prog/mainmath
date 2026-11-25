// GC agreement integration: local DOM, hand-computed terms, no external requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function boot(t, { local = {}, clipboard = true, delayedRead = false } = {}) {
  const errors = [], copied = [], downloads = [], blobs = [], prints = [], readers = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url:'https://math.therichmain.com/', runScripts:'dangerously', pretendToBeVisual:true,
    virtualConsole:vc, beforeParse(w) {
      for (const [key, value] of Object.entries(local)) w.localStorage.setItem(key, value);
      w.fetch = () => { throw new Error('External requests forbidden'); };
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
      w.HTMLAnchorElement.prototype.click = function() { downloads.push({ name:this.download, href:this.href }); };
      w.URL.createObjectURL = blob => { blobs.push(blob); return 'blob:local-' + blobs.length; };
      w.URL.revokeObjectURL = () => {};
      w.print = () => prints.push({ agreement:w.document.body.classList.contains('print-agreement'),
        text:w.document.getElementById('agreementPrint')?.textContent });
      if (clipboard !== 'absent') Object.defineProperty(w.navigator, 'clipboard', { value:{ writeText:async value => {
        if (!clipboard) throw new Error('Clipboard denied'); copied.push(value);
      } } });
      if (delayedRead) w.FileReader = class { readAsText() { readers.push(this); } };
    } });
  const w = dom.window, doc = w.document, get = id => doc.getElementById(id);
  t.after(() => { w.close(); assert.deepEqual(errors, [], 'no unhandled page exceptions'); });
  const input = (id, value) => { const el = get(id); el.value = String(value);
    el.dispatchEvent(new w.Event('input', { bubbles:true })); el.dispatchEvent(new w.Event('blur')); };
  const choose = type => { get('cAgreementType').value = type; get('cAgreementType').dispatchEvent(new w.Event('change', { bubbles:true })); };
  const importDeal = async data => {
    Object.defineProperty(get('importFile'), 'files', { configurable:true, value:[new w.File([JSON.stringify(data)], 'deal.json')] });
    get('importFile').dispatchEvent(new w.Event('change')); if (!delayedRead) await pause(30);
  };
  const readBlob = blob => new Promise(resolve => { const r = new w.FileReader(); r.onload = () => resolve(r.result); r.readAsText(blob); });
  doc.querySelector('[data-tab=contract]').click();
  return { w, doc, get, input, choose, importDeal, readBlob, readers, copied, downloads, blobs, prints,
    click:id => get(id).click(), text:() => get('cAgreementText').textContent,
    storage:() => Object.fromEntries(Object.keys(w.localStorage).map(key => [key, w.localStorage.getItem(key)])) };
}

function fixture(b) {
  for (const [id, value] of Object.entries({ dealName:'Juniper build', cHard:100000, cPermits:10000, cDesign:20000,
    cContPct:10, cFeePct:15, cSharePct:40, cLumpPct:20, cDbPct:25, cVar:0 })) b.input(id, value);
}

test('each GC card opens its named template and moves keyboard focus to a selectable preview', t => {
  const b = boot(t);
  assert.deepEqual([...b.get('cAgreementType').options].map(option => option.value), ['costplus','gmp','lump','db']);
  assert.ok(b.doc.querySelector('label[for=cAgreementType]'));
  assert.equal(b.get('cAgreementText').tabIndex, 0);
  assert.equal(b.get('cAgreementText').getAttribute('role'), 'region');
  assert.match(b.get('cAgreementText').getAttribute('aria-label'), /agreement.*preview/i);
  const names = new Set();
  for (const [type, title] of Object.entries({ costplus:'COST-PLUS CONSTRUCTION AGREEMENT',
    gmp:'GMP CONSTRUCTION AGREEMENT WITH SHARED SAVINGS', lump:'LUMP-SUM CONSTRUCTION AGREEMENT', db:'FIXED-PRICE DESIGN-BUILD AGREEMENT' })) {
    const button = b.doc.querySelector('#cCards [data-template="' + type + '"]');
    assert.ok(button); names.add(button.getAttribute('aria-label')); button.click();
    assert.equal(b.get('cAgreementType').value, type); assert.ok(b.text().startsWith(title));
    assert.equal(b.doc.activeElement, b.get('cAgreementText'));
    // Inputs reconstruct the cards; delegated actions must still work afterward.
    b.input('cFeePct', 13);
  }
  assert.equal(names.size, 4);
});

test('four agreement structures use hand-computed prices, fee, cap, savings split and design treatment', t => {
  const b = boot(t); fixture(b);
  for (const [type, limit] of Object.entries({ costplus:'No limit', gmp:'$139,150', lump:'$145,200', db:'$176,250' })) {
    const card = b.doc.querySelector('[data-template=' + type + ']').parentElement;
    const rows = [...card.querySelectorAll('.row')];
    const billing = rows.find(row => row.querySelector('.l').firstChild.textContent === 'GC billing limit');
    const design = rows.find(row => row.querySelector('.l').firstChild.textContent === 'Design');
    assert.equal(billing?.querySelector('.v').textContent, limit, type + ': limit covers GC compensation only');
    assert.equal(design?.querySelector('.v').textContent, type === 'db' ? 'Inside the price' : '$20,000');
    if (type !== 'db') assert.match(design.textContent, /separate estimate.*you hire the architect/);
    assert.doesNotMatch(card.textContent, /Most you can be billed/);
  }
  b.choose('costplus');
  assert.match(b.text(), /GC fee of 15% of that cost/);
  assert.match(b.text(), /Estimated Cost of Work: \$110,000\.00\. Estimated GC compensation including fee: \$126,500\.00/);
  assert.match(b.text(), /estimates, not a fixed price or guaranteed maximum/);
  assert.match(b.text(), /Design and engineering budget: \$20,000\.00.*outside GC compensation/);
  b.choose('gmp');
  assert.match(b.text(), /Proposed guaranteed maximum GC compensation: \$139,150\.00, including the fee and any savings award/);
  assert.match(b.text(), /GC fee: 15%.*GC share of savings: 40%; Owner retains the balance/);
  assert.ok(b.text().includes('Savings = max(0, G − C − F). Final GC compensation = min(G, C + F + savings × 40%)'));
  assert.match(b.text(), /outside GC compensation and outside the GMP cap/);
  // 110,000 × 1.15 + (139,150 − 126,500) × .4 = 131,560; design is separate.
  const gmpCard = b.doc.querySelector('[data-template=gmp]').parentElement.textContent;
  assert.match(gmpCard, /\$151,560/); assert.match(gmpCard, /To the GC.*\$131,560/);
  b.choose('lump');
  assert.match(b.text(), /Proposed fixed construction price: \$145,200\.00/);
  assert.match(b.text(), /20% markup/);
  assert.match(b.text(), /Do not add the cost-plus fee or another contingency charge/);
  assert.match(b.text(), /Design and engineering budget: \$20,000\.00.*outside GC compensation/);
  b.choose('db');
  assert.match(b.text(), /Proposed fixed design-build price: \$176,250\.00/);
  assert.match(b.text(), /25% markup/);
  assert.match(b.text(), /Design and engineering budget \$20,000\.00 is already included/);
  assert.match(b.text(), /Do not add the design budget, cost-plus fee or another contingency charge again/);
  for (const type of ['costplus','gmp','lump','db']) {
    b.choose(type);
    assert.match(b.text(), /work including contractor-paid permits \$110,000\.00; construction budget with contingency \$121,000\.00/);
    assert.match(b.text(), /DRAFT TEMPLATE — NOT READY TO SIGN/);
    assert.match(b.text(), /Project reference: Juniper build/);
    assert.match(b.text(), /Deposit: \$\[amount\]/);
    assert.match(b.text(), /Owner legal name: \[complete\]/);
  }
});

test('returning to Hire a GC refreshes a renamed or automatically named project without changing terms', t => {
  const b = boot(t); fixture(b); b.choose('gmp'); const original = b.text();
  b.doc.querySelector('[data-tab=spec]').click(); b.input('dealName', 'Renamed project');
  b.doc.querySelector('[data-tab=contract]').click();
  assert.equal(b.text(), original.replace('Project reference: Juniper build', 'Project reference: Renamed project'));
  assert.equal(b.get('cAgreementType').value, 'gmp');
  b.doc.querySelector('[data-tab=spec]').click(); b.input('dealName', ''); b.click('btnSave');
  const name = b.get('dealName').value; assert.ok(name);
  b.doc.querySelector('[data-tab=contract]').click();
  assert.equal(b.text(), original.replace('Project reference: Juniper build', 'Project reference: ' + name));
});

test('what-if overruns and savings change comparison payouts without rewriting any agreement terms', t => {
  const b = boot(t); fixture(b);
  for (const type of ['costplus','gmp','lump','db']) {
    b.choose(type); b.input('cVar', 0); const original = b.text(), card = b.get('cCards').textContent;
    for (const variance of [-90, -10, 10, 300]) {
      b.input('cVar', variance); assert.equal(b.text(), original, type + ': terms must not use stressed cost');
      assert.notEqual(b.get('cCards').textContent, card);
    }
  }
});

test('custom GMP and fractional-cent estimates display cents, zero remains valid, linked costs stay live', t => {
  const b = boot(t); fixture(b); const originalSpec = JSON.stringify(b.w._last.input);
  b.choose('gmp'); b.input('cGmp', 150000.125);
  assert.match(b.text(), /Proposed guaranteed maximum GC compensation: \$150,000\.13/);
  for (const [id, value] of Object.entries({ cHard:1.005, cPermits:0, cContPct:0, cDesign:10.075,
    cFeePct:0, cLumpPct:0, cDbPct:0, cGmp:0 })) b.input(id, value);
  b.choose('costplus'); assert.match(b.text(), /Estimated GC compensation including fee: \$1\.01/);
  assert.match(b.text(), /Design and engineering budget: \$10\.08/);
  b.choose('gmp'); assert.match(b.text(), /Proposed guaranteed maximum GC compensation: \$1\.01/);
  b.choose('db'); assert.match(b.text(), /Proposed fixed design-build price: \$11\.08/);
  b.input('cHard', 0); b.input('cDesign', 0);
  for (const [type, label] of Object.entries({ costplus:'Estimated GC compensation including fee',
    gmp:'Proposed guaranteed maximum GC compensation', lump:'Proposed fixed construction price', db:'Proposed fixed design-build price' })) {
    b.choose(type); assert.ok(b.text().includes(label + ': $0.00')); assert.doesNotMatch(b.text(), /NaN|Infinity|undefined/);
  }
  assert.equal(JSON.stringify(b.w._last.input), originalSpec, 'agreement actions and GC terms do not rewrite Spec inputs');
  b.choose('lump'); b.click('cRelink'); b.doc.querySelector('[data-mode=full]').click();
  b.input('buildableSqft', 1000); b.input('buildCostPerSqft', 100);
  b.input('permitFees', 5000); b.input('contingencyPct', 10); b.input('softCostPct', 20);
  assert.match(b.text(), /work including contractor-paid permits \$105,000\.00; construction budget with contingency \$115,500\.00/);
  assert.match(b.text(), /Design and engineering budget: \$20,000\.00/);
  b.click('cReset'); assert.equal(b.get('cAgreementType').value, 'lump');
  assert.match(b.text(), /Proposed fixed construction price: \$138,600\.00/);
});

test('selected template survives save, load, reload and JSON round-trip while reset and legacy data use defaults', async t => {
  const b = boot(t); fixture(b); b.choose('db'); const original = b.text();
  b.click('btnSave'); const saved = JSON.parse(b.w.localStorage.getItem('dmp_deals_v1'));
  assert.equal(saved[0].tools.contract.agreementType, 'db');
  const reloaded = boot(t, { local:b.storage() });
  assert.equal(reloaded.get('cAgreementType').value, 'db'); assert.equal(reloaded.text(), original);
  b.click('btnExport'); const exported = JSON.parse(await b.readBlob(b.blobs[0]));
  assert.equal(exported.tools.contract.agreementType, 'db');
  b.click('btnReset'); assert.equal(b.get('cAgreementType').value, 'costplus');
  b.click('btnSaved'); b.get('savedList').querySelector('[data-load]').click();
  assert.equal(b.get('cAgreementType').value, 'db'); assert.equal(b.text(), original);
  b.choose('gmp'); await b.importDeal(exported);
  assert.equal(b.get('cAgreementType').value, 'db'); assert.equal(b.text(), original);
  await b.importDeal({ inputs:{ purchasePrice:200000 } }); assert.equal(b.get('cAgreementType').value, 'costplus');
  await b.importDeal({ inputs:{ purchasePrice:200000 }, tools:{ contract:{ agreementType:'<script>invalid</script>' } } });
  assert.equal(b.get('cAgreementType').value, 'costplus'); assert.ok(b.text().startsWith('COST-PLUS'));
  const invalidLocal = boot(t, { local:{ mm_contract_v1:JSON.stringify({ agreementType:'__proto__' }) } });
  assert.equal(invalidLocal.get('cAgreementType').value, 'costplus');
});

test('choosing a template supersedes an older pending import', async t => {
  const b = boot(t, { delayedRead:true });
  await b.importDeal({ inputs:{ purchasePrice:123456 }, tools:{ contract:{ agreementType:'gmp' } } });
  b.choose('lump'); const original = b.text();
  b.readers[0].result = JSON.stringify({ inputs:{ purchasePrice:123456 }, tools:{ contract:{ agreementType:'gmp' } } });
  b.readers[0].onload(); assert.equal(b.get('cAgreementType').value, 'lump'); assert.equal(b.text(), original);
});

test('project text stays literal and download paths stay safe', async t => {
  const b = boot(t), hostile = '</pre><img id="gc-injected" src=x onerror="window.gcInjected=1"><script>window.gcInjected=2</script>';
  b.input('dealName', hostile); b.choose('gmp');
  assert.ok(b.text().includes(hostile)); assert.equal(b.get('gc-injected'), null); assert.equal(b.w.gcInjected, undefined);
  b.click('cAgreementPrint'); assert.ok(b.get('agreementPrint').textContent.includes(hostile)); assert.equal(b.get('gc-injected'), null);
  b.w.dispatchEvent(new b.w.Event('afterprint'));
  b.input('dealName', '🏠'); b.click('cAgreementDownload');
  assert.equal(b.downloads[0].name, 'mainmath-gmp-agreement-draft.txt');
  b.input('dealName', '../' + 'Ab'.repeat(100) + '/?'); b.click('cAgreementDownload');
  assert.equal(b.downloads[1].name, 'ab'.repeat(50) + '-gmp-agreement-draft.txt');
  assert.equal(b.blobs[1].type, 'text/plain;charset=utf-8');
  assert.equal(await b.readBlob(b.blobs[1]), b.text());
});

test('Copy and Download capture the selected preview exactly', async t => {
  const b = boot(t); fixture(b); b.choose('db'); const original = b.text();
  b.click('cAgreementCopy'); b.click('cAgreementDownload'); b.choose('gmp'); await pause(0);
  assert.deepEqual(b.copied, [original]);
  assert.equal(b.downloads[0].name, 'juniper-build-db-agreement-draft.txt');
  assert.equal(await b.readBlob(b.blobs[0]), original);
});

test('denied or unavailable clipboard opens the shared selectable manual-copy dialog', async t => {
  for (const clipboard of [false, 'absent']) {
    const b = boot(t, { clipboard }); fixture(b); b.choose('lump'); const original = b.text();
    b.click('cAgreementCopy'); await pause(0);
    assert.equal(b.get('copyDialog').open, true); assert.equal(b.get('copyText').value, original);
    assert.equal(b.doc.activeElement, b.get('copyText')); assert.equal(b.get('copyText').selectionStart, 0);
    assert.equal(b.get('copyText').selectionEnd, original.length);
  }
});

test('agreement print snapshots one document, clears after print or errors, and leaves normal print intact', t => {
  const b = boot(t); fixture(b); b.choose('gmp'); const original = b.text();
  b.click('cAgreementPrint'); assert.deepEqual(b.prints[0], { agreement:true, text:original });
  b.choose('db'); assert.equal(b.get('agreementPrint').textContent, original, 'print snapshot stays stable');
  b.w.dispatchEvent(new b.w.Event('afterprint'));
  assert.equal(b.doc.body.classList.contains('print-agreement'), false); assert.equal(b.get('agreementPrint').textContent, '');
  b.click('cAgreementPrint'); b.click('btnPrint');
  assert.equal(b.prints.at(-1).agreement, false); assert.equal(b.prints.at(-1).text, '');
  b.w.print = () => { throw new Error('Printer unavailable'); }; b.click('cAgreementPrint');
  assert.equal(b.doc.body.classList.contains('print-agreement'), false); assert.equal(b.get('agreementPrint').textContent, '');
  assert.match(b.get('toast').textContent, /Print unavailable.*copy or download/);
});
