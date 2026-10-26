// CDP screenshot of a page target.
// Usage: node cdp-shot.js <outfile.png> [full] [urlSubstring]
const http = require('http');
const fs = require('fs');

const PORT = 9222, HOST = '127.0.0.1';
function getJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: HOST, port: PORT, path: p }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  const out = process.argv[2] || 'shot.png';
  const full = process.argv[3] === 'full';
  const urlFilter = process.argv[4] || '';
  const list = await getJSON('/json/list');
  const pages = list.filter((t) => t.type === 'page');
  const page = urlFilter ? pages.find((t) => t.url.includes(urlFilter)) : pages[0];
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  console.error('[target] ' + page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  ws.addEventListener('open', async () => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full });
    if (shot.result && shot.result.data) {
      fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
      console.log('SAVED ' + out + ' ' + fs.statSync(out).size);
    } else console.log('ERR ' + JSON.stringify(shot).slice(0, 300));
    ws.close(); process.exit(0);
  });
  ws.addEventListener('error', (e) => { console.log('WS_ERR ' + (e.message || e)); process.exit(1); });
})();
