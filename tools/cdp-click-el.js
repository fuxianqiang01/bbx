// 真·鼠标点击：按选择器定位元素，得到中心坐标后用 CDP 输入管线点击（走真实事件派发，能命中原生事件委托）。
// Usage: node cdp-click-el.js <selector> [urlSubstring]
const http = require('http');
const PORT = 9222, HOST = '127.0.0.1';
function getJSON(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path: p }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const sel = process.argv[2];
  const filter = process.argv[3] || '';
  if (!sel) { console.log('usage: node cdp-click-el.js <selector> [urlSubstring]'); process.exit(1); }
  const list = await getJSON('/json/list');
  const pages = list.filter((t) => t.type === 'page' || t.type === 'iframe');
  const hits = filter ? pages.filter((t) => t.url.includes(filter)) : pages;
  const page = hits.find((t) => t.type === 'page') || hits[0];
  if (!page) { console.log('NO_PAGE_TARGET'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  function send(m, p) { return new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); }); }
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true, includeCommandLineAPI: true });
    const rr = r.result || {};
    if (rr.exceptionDetails) return 'EXC:' + (rr.exceptionDetails.exception && rr.exceptionDetails.exception.description || rr.exceptionDetails.text);
    return rr.result && rr.result.value;
  }
  ws.addEventListener('open', async () => {
    const info = await ev(`(function(){var el=document.querySelector(${JSON.stringify(sel)});
      if(!el)return 'NO_EL';var b=el.getBoundingClientRect();
      return JSON.stringify({x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),w:Math.round(b.width),h:Math.round(b.height),t:(el.textContent||'').trim().slice(0,40)});})()`);
    if (info === 'NO_EL' || String(info).startsWith('EXC')) { console.log('RESOLVE_FAIL ' + info); process.exit(1); }
    const o = JSON.parse(info);
    console.log('EL ' + JSON.stringify(o));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: o.x, y: o.y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: o.x, y: o.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: o.x, y: o.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(2500);
    console.log('URL_NOW ' + await ev('location.href'));
    ws.close(); process.exit(0);
  });
  ws.addEventListener('error', (e) => { console.log('WS_ERROR ' + (e.message || e)); process.exit(1); });
})();
