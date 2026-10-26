// Minimal CDP client: evaluate a JS expression in a page target.
// Usage: node cdp-eval.js <exprFile> [urlSubstring]
//   urlSubstring: pick the page target whose URL contains it (default: first page target)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const HOST = '127.0.0.1';

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
  const exprFile = process.argv[2] || path.join(__dirname, 'eval.js');
  const urlFilter = process.argv[3] || '';
  const typeFilter = (process.argv[4] || 'page,iframe').split(',');
  const expr = fs.readFileSync(exprFile, 'utf8');

  const list = await getJSON('/json/list');
  // 'iframe' targets are OOPIFs (cross-origin subframes) — they are scriptable too.
  // Prefer top-level 'page' targets when several URLs match the same substring.
  const pages = list.filter((t) => typeFilter.indexOf(t.type) >= 0);
  const hits = urlFilter ? pages.filter((t) => t.url.includes(urlFilter)) : pages;
  const page = urlFilter
    ? (hits.find((t) => t.type === 'page') || hits[0])
    : hits.find((t) => t.type === 'page');
  if (!page) { console.log('NO_PAGE_TARGET for ' + urlFilter); process.exit(1); }
  console.error('[target] ' + page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });

  ws.addEventListener('open', async () => {
    const res = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    const r = res.result || {};
    if (r.exceptionDetails) console.log('EXCEPTION: ' + JSON.stringify(r.exceptionDetails, null, 2));
    else {
      const v = r.result && r.result.value;
      console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
    }
    ws.close(); process.exit(0);
  });

  ws.addEventListener('error', (e) => { console.log('WS_ERROR ' + (e.message || e)); process.exit(1); });
})();
