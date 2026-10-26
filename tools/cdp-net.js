// Capture a specific XHR/fetch from a page: prints request URL, postData and response body (base64 len + head).
// Usage: node cdp-net.js <urlSubstring> <urlKeyword> <waitMs>
const http = require('http');

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
  const urlFilter = process.argv[2] || 'gps51.com';
  const keyword = process.argv[3] || 'lastposition';
  const waitMs = parseInt(process.argv[4] || '40000', 10);

  const list = await getJSON('/json/list');
  const page = list.find((t) => t.type === 'page' && t.url.includes(urlFilter));
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  console.error('[target] ' + page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });

  const reqs = {};
  const hits = [];

  ws.addEventListener('message', async (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    const m = msg.method, p = msg.params || {};
    if (m === 'Network.requestWillBeSent' && /webapi/.test(p.request.url)) {
      reqs[p.requestId] = { url: p.request.url, method: p.request.method, postData: p.request.postData || '', headers: p.request.headers };
    }
    if (m === 'Network.responseReceived' && reqs[p.requestId] && reqs[p.requestId].url.includes(keyword)) {
      reqs[p.requestId].status = p.response.status;
      reqs[p.requestId].ctype = p.response.headers && p.response.headers['content-type'];
      reqs[p.requestId].len = p.response.headers && (p.response.headers['content-length'] || '');
      // fetch body
      send('Network.getResponseBody', { requestId: p.requestId }).then((r) => {
        const b = r.result && r.result.body;
        if (b) {
          const isB64 = r.result.base64Encoded;
          reqs[p.requestId].bodyB64 = isB64;
          reqs[p.requestId].bodyLen = b.length;
          reqs[p.requestId].bodyHead = b.slice(0, 600);
          hits.push(reqs[p.requestId]);
        }
      });
    }
  });

  ws.addEventListener('open', async () => {
    await send('Network.enable', {});
    // read token from page
    const tk = await send('Runtime.evaluate', { expression: "localStorage.getItem('token')", returnByValue: true });
    console.error('[token] ' + (tk.result && tk.result.result && tk.result.result.value));
    // trigger a refresh if possible
    await send('Runtime.evaluate', {
      expression: process.env.RELOAD ? 'location.reload()' : "(function(){try{var r=document.querySelector('#app').__vue__;var f=function(vm){if(!vm)return null;var n=(vm.$options&&(vm.$options.name||vm.$options._componentTag))||'';if(n==='Main'&&typeof vm.getLastPosition==='function')return vm;var c=vm.$children||[];for(var i=0;i<c.length;i++){var g=f(c[i]);if(g)return g;}return null;};var m=f(r);if(m){m.getLastPosition();return 'called';}return 'notfound';}catch(e){return 'ERR '+e.message;}})()",
      returnByValue: true,
    }).then((r) => console.error('[trigger] ' + JSON.stringify(r.result && r.result.result && r.result.result.value)));

    setTimeout(() => {
      console.log(JSON.stringify(hits.map((h) => ({ url: h.url, method: h.method, postData: h.postData, status: h.status, ctype: h.ctype, b64: h.bodyB64, bodyLen: h.bodyLen, bodyHead: h.bodyHead })), null, 2));
      ws.close(); process.exit(0);
    }, waitMs);
  });

  ws.addEventListener('error', (e) => { console.log('WS_ERR ' + (e.message || e)); process.exit(1); });
})();
