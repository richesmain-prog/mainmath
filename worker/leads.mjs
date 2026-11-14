const ORIGIN = 'https://math.therichmain.com';
const GOOGLE_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSfxLUhlAtO-GgRuLUBJytS20Zcj5Sq3-tmNhHQ-AQpZwS-BCQ/formResponse?hl=en';

// Consume whole tags, including quoted attributes, before considering visible confirmation text.
export function isGoogleConfirmation(html) {
  const stack = [];
  let position = 0;
  while ((position = html.indexOf('<', position)) !== -1) {
    if (html.startsWith('<!--', position)) {
      const end = html.indexOf('-->', position + 4);
      if (end < 0) return false;
      position = end + 3; continue;
    }
    let end = position + 1, quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) return false;
    const tag = /^\s*(\/?)([a-z][\w:-]*)(?=[\s/]|$)([\s\S]*)$/i.exec(html.slice(position + 1, end));
    position = end + 1;
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      const index = stack.findLastIndex(element => element.name === name);
      if (index >= 0 && !stack.slice(index + 1).some(element => element.name === 'template')) stack.length = index;
      continue;
    }
    if (/^(script|style|textarea|noscript|title|xmp|iframe)$/.test(name)) {
      const closing = new RegExp(`<\\/${name}\\s*>`, 'ig');
      closing.lastIndex = position;
      if (!closing.exec(html)) return false;
      position = closing.lastIndex; continue;
    }
    const attributes = {};
    for (const attribute of tag[3].matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const key = attribute[1].toLowerCase();
      if (!Object.hasOwn(attributes, key)) attributes[key] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    }
    const hidden = !!stack.at(-1)?.hidden || Object.hasOwn(attributes, 'hidden') || attributes['aria-hidden'] === 'true' ||
      /^(template|object)$/.test(name) ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i.test(attributes.style || '');
    const classes = (attributes.class || '').split(/\s+/);
    if (!hidden && name === 'div' && (classes.includes('vHW8K') || classes.includes('freebirdFormviewerViewResponseConfirmationMessage')) &&
        /^\s*Your response has been recorded\.\s*<\/div\s*>/i.test(html.slice(position))) return true;
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name)) stack.push({ name, hidden });
  }
  return false;
}

async function limitedText(body, limit) {
  if (!body) return '';
  const reader = body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

function validLead(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(k => !['id', 'name', 'email'].includes(k)) ||
      typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.email !== 'string') return null;
  const id = raw.id.toLowerCase(), name = raw.name.trim(), email = raw.email.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ||
      name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) || email.length > 254) return null;
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64 ||
      !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(parts[0]) || /^\.|\.$|\.\./.test(parts[0])) return null;
  const labels = parts[1].split('.');
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return { id, name, email };
}

async function forwardLead(env, lead) {
  let status = 'failed';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(GOOGLE_FORM, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'entry.2063287317': 'MainMath website', 'entry.525677922': lead.name, 'entry.940776747': lead.email })
    });
    if (response.status === 200 && !response.redirected) {
      const html = await limitedText(response.body, 256 * 1024);
      status = /^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '') && isGoogleConfirmation(html)
        ? 'confirmed' : 'unconfirmed';
    } else { await response.body?.cancel(); }
  } catch { /* The durable lead remains available regardless of Google's response. */ }
  finally { clearTimeout(timer); }
  try {
    await env.LEADS.prepare('UPDATE leads SET google_status = ? WHERE id = ?').bind(status, lead.id).run();
  } catch { /* Leave pending for manual review; never retry an ambiguous Google submission. */ }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin'), path = new URL(request.url).pathname;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin === ORIGIN) headers['Access-Control-Allow-Origin'] = ORIGIN;
    const reply = (status, body, extra = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    if (path === '/health' && request.method === 'GET') return reply(200, { ok: true });
    if (path !== '/leads') return reply(404, { ok: false, error: 'Not found' });
    if (origin !== ORIGIN) return reply(403, { ok: false, error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
      return reply(204, null, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
    }
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '') ||
        !['', 'identity'].includes(request.headers.get('Content-Encoding') || '')) return reply(415, { ok: false, error: 'Expected JSON' });
    if (Number(request.headers.get('Content-Length')) > 4096) return reply(413, { ok: false, error: 'Request too large' });
    try {
      const rate = await env.LEAD_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!rate.success) return reply(429, { ok: false, error: 'Try again later' }, { 'Retry-After': '60' });
    } catch { return reply(503, { ok: false, error: 'Please try again later' }); }
    let lead;
    try { lead = validLead(JSON.parse(await limitedText(request.body, 4096))); }
    catch (error) { return reply(error instanceof RangeError ? 413 : 400, { ok: false, error: 'Invalid request' }); }
    if (!lead) return reply(400, { ok: false, error: 'Check your name and email' });
    try {
      const inserted = await env.LEADS.prepare('INSERT INTO leads (id, name, email, created_at, google_status) VALUES (?, ?, ?, ?, \'pending\') ON CONFLICT(id) DO NOTHING')
        .bind(lead.id, lead.name, lead.email, new Date().toISOString()).run();
      if (!inserted.success || ![0, 1].includes(inserted.meta?.changes)) throw new Error('Storage unavailable');
      if (inserted.meta.changes === 0) {
        const saved = await env.LEADS.prepare('SELECT name, email FROM leads WHERE id = ?').bind(lead.id).first();
        if (!saved) throw new Error('Storage unavailable');
        if (saved.name !== lead.name || saved.email !== lead.email) return reply(409, { ok: false, error: 'Submission ID already used' });
      } else { ctx.waitUntil(forwardLead(env, lead)); }
    } catch { return reply(503, { ok: false, error: 'Could not save; please retry' }); }
    return reply(200, { ok: true, id: lead.id });
  }
};
