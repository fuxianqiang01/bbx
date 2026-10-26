// Capture page console + exceptions over a reload.
// Usage: RELOAD=1 node cdp-console.js <urlSubstring> [seconds]
const http = require('http');
const PORT = 9222, HOST = '127.0.0.1';

function getJSON(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path: p }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const urlFilter = process.argv[2] || '';
  const waitS = Number(process.argv[3] || 12);
  const list = await getJSON('/json/list');
  const page = list.filter((t) => t.type === 'page').find((t) => t.url.includes(urlFilter));
  if (!page) { console.log('NO_PAGE_TARGET'); process.exit(1); }
  console.error('[target] ' + page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  function send(m, p) {
    return new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  }
  const lines = [];
  const seen = new Set();
  function push(s) { s = String(s).replace(/\s+/g, ' ').trim(); if (!s || s.length < 2) return; const k = s.slice(0, 120); if (seen.has(k)) return; seen.add(k); lines.push(s); }

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map((a) => (a.value !== undefined ? a.value : (a.description || a.type))).join(' ');
      push('[console.' + m.params.type + '] ' + args.slice(0, 400));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      const ex = d.exception || {};
      push('[EXCEPTION] ' + String(ex.description || ex.value || d.text || '').slice(0, 500));
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry || {};
      push('[log.' + e.level + '] ' + String(e.text || '').slice(0, 400));
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Runtime.evaluate', { expression: "console.log('__CAPTURE_SELFTEST__ ' + location.host)" });
  if (process.env.RELOAD === '1') { await send('Page.enable'); await send('Page.reload', { ignoreCache: false }); }
  await new Promise((r) => setTimeout(r, waitS * 1000));
  console.log(lines.join('\n') || '(no console output captured)');
  ws.close(); process.exit(0);
})();
