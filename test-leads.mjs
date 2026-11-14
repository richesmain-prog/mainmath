// All upstream calls and database operations are mocked; this file never submits a live form.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import worker, { isGoogleConfirmation } from './worker/leads.mjs';

const ORIGIN = 'https://math.therichmain.com';
const lead = { id: '7f886a87-e12b-4ddd-b6a8-236e80b32999', name: 'Test Builder', email: 'builder@example.invalid' };
const confirmation = '<!doctype html><html><body><div class="vHW8K">Your response has been recorded.</div></body></html>';
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Live requests are prohibited in tests'); };
after(() => { globalThis.fetch = originalFetch; });

function request(payload = lead, overrides = {}) {
  return new Request('https://leads.example.invalid/leads', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(payload), ...overrides
  });
}

function harness(options = {}) {
  const records = new Map(), calls = [], statements = [], tasks = [], rateKeys = [];
  const env = {
    LEAD_RATE_LIMITER: { async limit({ key }) {
      rateKeys.push(key);
      if (options.rateError) throw new Error('Private limiter error');
      return { success: options.allowed !== false };
    } },
    LEADS: { prepare(sql) {
      return { bind(...args) {
        return {
          async run() {
            statements.push({ sql, args });
            if (sql.startsWith('INSERT')) {
              if (options.insertGate) await options.insertGate;
              if (options.insertError) throw new Error('Private database error');
              if (options.insertFailure) return { success: false };
              const [id, name, email, created_at] = args;
              const changes = records.has(id) ? 0 : 1;
              if (changes) records.set(id, { id, name, email, created_at, google_status: 'pending' });
              return { success: true, meta: { changes } };
            }
            assert.match(sql, /^UPDATE leads SET google_status/);
            if (options.updateError) throw new Error('Private status update error');
            records.get(args[1]).google_status = args[0];
            return { success: true, meta: { changes: 1 } };
          },
          async first() {
            statements.push({ sql, args });
            assert.match(sql, /^SELECT name, email FROM leads/);
            return records.get(args[0]) || null;
          }
        };
      } };
    } }
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    return new Response(options.html ?? confirmation, { status: options.status ?? 200,
      headers: { 'content-type': options.contentType ?? 'text/html; charset=utf-8' } });
  };
  const ctx = { waitUntil(promise) { tasks.push(promise); } };
  return { env, ctx, records, calls, statements, rateKeys, tasks,
    send: req => worker.fetch(req || request(), env, ctx),
    finish: () => Promise.all(tasks) };
}

test('health is public, does not expose bindings, and unsupported routes/methods fail', async () => {
  const health = await worker.fetch(new Request('https://leads.example.invalid/health'), {}, {});
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
  const h = harness();
  assert.equal((await h.send(new Request('https://leads.example.invalid/nope'))).status, 404);
  assert.equal((await h.send(request(undefined, { method: 'PUT' }))).status, 405);
  assert.equal(h.statements.length, 0); assert.equal(h.calls.length, 0);
});

test('CORS permits only exact production origin and POST preflight', async () => {
  const h = harness();
  for (const origin of ['', 'null', 'https://evil.example', `${ORIGIN}.evil.example`, `${ORIGIN}/`]) {
    const r = await h.send(request(lead, { headers: { Origin: origin, 'Content-Type': 'application/json' } }));
    assert.equal(r.status, 403); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  }
  const preflight = await h.send(new Request('https://leads.example.invalid/leads', {
    method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' }
  }));
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(h.statements.length, 0); assert.equal(h.rateKeys.length, 0);
});

test('content type, declared oversized bodies, and rate limits fail before storage', async () => {
  const h = harness();
  for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }]) {
    assert.equal((await h.send(request(lead, { headers: { Origin: ORIGIN, ...headers } }))).status, 415);
  }
  assert.equal((await h.send(request(lead, { headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'Content-Length': '4097' } }))).status, 413);
  assert.equal(h.statements.length, 0);
  const denied = harness({ allowed: false });
  const r = await denied.send();
  assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), '60');
  assert.deepEqual(denied.rateKeys, ['192.0.2.1']); assert.equal(denied.statements.length, 0);
  const unavailable = harness({ rateError: true });
  assert.equal((await unavailable.send()).status, 503); assert.equal(unavailable.statements.length, 0);
});

test('stream limit counts actual bytes, accepts 4096 and cancels above 4096 despite smaller content length', async () => {
  const raw = JSON.stringify(lead), h = harness();
  const exact = await h.send(request(lead, { body: raw.padEnd(4096) }));
  assert.equal(exact.status, 200); await h.finish();
  let cancelled = false;
  const bytes = new TextEncoder().encode(raw.padEnd(4097));
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 2000)); controller.enqueue(bytes.slice(2000));
  }, cancel() { cancelled = true; } });
  const overflow = harness();
  const response = await overflow.send(request(lead, { body, duplex: 'half', headers: {
    Origin: ORIGIN, 'Content-Type': 'application/json', 'Content-Length': '10'
  } }));
  assert.equal(response.status, 413); assert.equal(cancelled, true); assert.equal(overflow.statements.length, 0);
  const unicode = harness();
  assert.equal((await unicode.send(request(lead, { body: JSON.stringify({ ...lead, name: 'é'.repeat(2100) }) }))).status, 413);
});

test('malformed UTF-8/JSON and invalid identity fields never reach D1', async () => {
  const h = harness();
  for (const payload of [null, [], {}, { ...lead, id: 'not-a-uuid' }, { ...lead, name: '' }, { ...lead, name: 'x' }, { ...lead, name: 'x'.repeat(121) },
    { ...lead, name: 'bad\nname' }, { ...lead, email: 'a..b@example.com' }, { ...lead, email: 'a@-bad.com' },
    { ...lead, email: 'a@localhost' }, { ...lead, email: 'x'.repeat(65) + '@example.com' }, { ...lead, source: 'spoofed' }]) {
    assert.equal((await h.send(request(payload))).status, 400);
  }
  for (const body of ['{', new Uint8Array([0xff, 0xfe])]) assert.equal((await h.send(request(lead, { body }))).status, 400);
  assert.equal(h.statements.length, 0); assert.equal(h.calls.length, 0);
});

test('acknowledgment waits for durable insert, then returns without waiting for Google', async () => {
  let releaseInsert, releaseGoogle, settled = false;
  const insertGate = new Promise(resolve => { releaseInsert = resolve; });
  const googleGate = new Promise(resolve => { releaseGoogle = resolve; });
  const h = harness({ insertGate, fetch: () => googleGate });
  const pending = h.send().then(response => { settled = true; return response; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.equal(h.records.size, 0); assert.equal(h.calls.length, 0);
  releaseInsert();
  const response = await pending;
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, id: lead.id });
  assert.equal(h.records.get(lead.id).google_status, 'pending'); assert.equal(h.tasks.length, 1);
  assert.match(h.statements[0].sql, /ON CONFLICT\(id\) DO NOTHING/);
  releaseGoogle(new Response(confirmation, { headers: { 'content-type': 'text/html' } }));
  await h.finish(); assert.equal(h.records.get(lead.id).google_status, 'confirmed');
});

test('database exceptions and unsuccessful inserts never acknowledge success or call Google', async () => {
  for (const option of ['insertError', 'insertFailure']) {
    const h = harness({ [option]: true }), response = await h.send();
    assert.equal(response.status, 503); assert.equal((await response.json()).ok, false);
    assert.equal(h.calls.length, 0); assert.equal(h.records.size, 0);
  }
});

test('same id and normalized details are idempotent; conflicting reuse returns 409 without forwarding', async () => {
  const h = harness();
  assert.equal((await h.send(request({ ...lead, name: ' Test Builder ', email: 'BUILDER@EXAMPLE.INVALID' }))).status, 200);
  await h.finish();
  assert.equal((await h.send()).status, 200);
  assert.equal((await h.send(request({ ...lead, name: 'Different Builder' }))).status, 409);
  assert.equal((await h.send(request({ ...lead, email: 'someone@example.invalid' }))).status, 409);
  assert.equal(h.records.size, 1); assert.equal(h.calls.length, 1); assert.equal(h.tasks.length, 1);
});

test('concurrent same-id submissions insert and forward exactly once', async () => {
  const h = harness();
  const responses = await Promise.all([h.send(), h.send()]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  await h.finish(); assert.equal(h.calls.length, 1); assert.equal(h.records.size, 1);
});

test('Google forwarding uses fixed source, English locale, manual redirects and bounded cancellation', async () => {
  const h = harness(); await h.send(); await h.finish();
  const { url, init } = h.calls[0];
  assert.equal(new URL(url).searchParams.get('hl'), 'en'); assert.equal(new URL(url).hostname, 'docs.google.com');
  assert.equal(init.redirect, 'manual'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.body.get('entry.2063287317'), 'MainMath website');
  assert.equal(init.body.get('entry.525677922'), lead.name); assert.equal(init.body.get('entry.940776747'), lead.email);
});

test('confirmation classifier rejects reflected phrases, escaped markup, inert markup and fake class attributes', () => {
  assert.equal(isGoogleConfirmation(confirmation), true);
  assert.equal(isGoogleConfirmation('<div class="freebirdFormviewerViewResponseConfirmationMessage">Your response has been recorded.</div>'), true);
  const fragment = '<div class="vHW8K">Your response has been recorded.</div>';
  for (const html of [
    '<form><input value="Your response has been recorded."><p>This is required</p></form>',
    '&lt;div class="vHW8K"&gt;Your response has been recorded.&lt;/div&gt;',
    `<script>const echoed = '${fragment}'</script>`, `<textarea>${fragment}</textarea>`, `<!--${fragment}-->`, `<template>${fragment}</template>`,
    `<section><script>const escaped = '</section>${fragment}'</script></section>`,
    `<div><script>const s="</div><div class='vHW8K'>Your response has been recorded.</div>";</script></div>`,
    `<section><template></section>${fragment}</template></section>`,
    `<input value="<div class='vHW8K'>Your response has been recorded.</div>">`,
    `<div title="<div class='vHW8K'>Your response has been recorded.</div>">Other text</div>`,
    `<section hidden>${fragment}</section>`, `<section aria-hidden="true"><main>${fragment}</main></section>`,
    `<section style="display: none">${fragment}</section>`, `<section style="color:red; visibility: hidden !important;">${fragment}</section>`,
    '<div hidden class="vHW8K">Your response has been recorded.</div>',
    '<div data-class="vHW8K">Your response has been recorded.</div>',
    '<div class="vHW8K-invalid">Your response has been recorded.</div>', '<div class="other" class="vHW8K">Your response has been recorded.</div>',
    '<div data-note=\'class="vHW8K"\'>Your response has been recorded.</div>',
    '<div>Your response has been recorded.</div>', '<div class="vHW8K">There was an error.</div>'
  ]) assert.equal(isGoogleConfirmation(html), false, html);
  assert.equal(isGoogleConfirmation(`<section hidden>hidden text</section>${fragment}`), true, 'hidden siblings do not hide the real receipt');
  assert.equal(isGoogleConfirmation(`<div title="quoted > sign">${fragment}</div>`), true, 'quoted greater-than does not end a tag');
});

test('HTTP 200 validation pages and echoed success words remain unconfirmed', async () => {
  for (const html of ['<form><input required><p>This is a required question</p></form>',
    '<form><input value="Your response has been recorded."></form>']) {
    const h = harness({ html }), response = await h.send();
    assert.equal(response.status, 200); await h.finish(); assert.equal(h.records.get(lead.id).google_status, 'unconfirmed');
    assert.equal((await h.send()).status, 200); assert.equal(h.calls.length, 1);
  }
  const notHtml = harness({ contentType: 'application/json' });
  await notHtml.send(); await notHtml.finish(); assert.equal(notHtml.records.get(lead.id).google_status, 'unconfirmed');
});

test('upstream redirects, errors and network failures preserve durable leads and never retry', async () => {
  for (const options of [{ status: 302 }, { status: 500 }, { fetch: async () => { throw new Error('Network failed'); } }]) {
    const h = harness(options), response = await h.send();
    assert.equal(response.status, 200); await h.finish(); assert.equal(h.records.get(lead.id).google_status, 'failed');
    assert.equal((await h.send()).status, 200); assert.equal(h.calls.length, 1); assert.equal(h.records.size, 1);
  }
});

test('upstream timeout aborts the one attempt; status-write failure still preserves the lead', async t => {
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => { assert.equal(ms, 8000); return realSetTimeout(fn, 1); });
  const h = harness({ fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }) });
  assert.equal((await h.send()).status, 200); await h.finish();
  assert.equal(h.records.get(lead.id).google_status, 'failed'); assert.equal(h.calls.length, 1);
  t.mock.restoreAll();
  const statusFailure = harness({ updateError: true });
  assert.equal((await statusFailure.send()).status, 200); await statusFailure.finish();
  assert.equal(statusFailure.records.get(lead.id).google_status, 'pending');
  await statusFailure.send(); assert.equal(statusFailure.calls.length, 1);
});

test('SQL-shaped names stay bound data and receipts expose neither contact details nor database errors', async () => {
  const h = harness(), name = "Robert'); DROP TABLE leads;--", payload = { ...lead, name };
  const response = await h.send(request(payload)), receipt = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(receipt), { ok: true, id: lead.id });
  assert.equal(receipt.includes(name), false); assert.equal(receipt.includes(lead.email), false);
  assert.equal(h.statements[0].sql.includes(name), false);
  assert.equal(h.statements[0].args[1], name); assert.equal(h.records.get(lead.id).name, name);
  await h.finish();
  const failure = harness({ insertError: true });
  const failed = await failure.send(request(payload));
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /Private database error|DROP TABLE|builder@example/);
});

test('mass assignment and prototype properties are rejected; only edge IP selects the rate bucket', async () => {
  const h = harness();
  for (const extra of [{ google_status: 'confirmed' }, { created_at: '2000-01-01' }, { role: 'admin' },
    JSON.parse('{"__proto__":{"polluted":true}}')]) {
    const response = await h.send(request({ ...lead, ...extra }));
    assert.equal(response.status, 400);
  }
  assert.equal({}.polluted, undefined); assert.equal(h.statements.length, 0);
  await h.send(request(lead, { headers: { Origin: ORIGIN, 'Content-Type': 'application/json',
    'CF-Connecting-IP': '192.0.2.2', 'X-Forwarded-For': '203.0.113.99' } }));
  assert.equal(h.rateKeys.at(-1), '192.0.2.2'); await h.finish();
  const missingEdge = harness();
  await missingEdge.send(request(lead, { headers: { Origin: ORIGIN, 'Content-Type': 'application/json',
    'X-Forwarded-For': '203.0.113.99' } }));
  assert.deepEqual(missingEdge.rateKeys, ['unknown']); await missingEdge.finish();
});

test('oversized upstream HTML cannot consume unbounded body storage or lose the saved lead', async () => {
  const h = harness({ html: ' '.repeat(256 * 1024 + 1) + confirmation });
  assert.equal((await h.send()).status, 200); await h.finish();
  assert.equal(h.records.get(lead.id).google_status, 'failed'); assert.equal(h.records.size, 1);
  assert.equal((await h.send()).status, 200); assert.equal(h.calls.length, 1);
});
