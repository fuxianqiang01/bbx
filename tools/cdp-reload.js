const http=require('http');const PORT=9222,HOST='127.0.0.1';
function getJSON(p){return new Promise((res,rej)=>{http.get({host:HOST,port:PORT,path:p},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)})}
(async()=>{
  const list=await getJSON('/json/list');
  const sub=process.argv[2]||'';
  const t=list.find(x=>x.type==='page'&&x.url.includes(sub));
  if(!t){console.log('no target');process.exit(1)}
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  let id=0;const pending=new Map();
  function send(m,p){return new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p||{}}))})}
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}});
  await new Promise(r=>ws.addEventListener('open',r));
  console.log(JSON.stringify((await send('Page.reload',{ignoreCache:true})).result||{}));
  ws.close();process.exit(0);
})()
