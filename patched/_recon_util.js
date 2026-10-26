/* _recon_util.js —— 侦察器共用的可靠词法工具（字符级扫描，不用正则剥注释）
   ★为什么必须是字符级：正则剥注释遇到「字符串里出现的块注释起符」，或「行注释里出现的块注释止符」
   会失同步；一失同步就把大段真代码当注释抹掉（或反过来），依赖清单会静默漏项。
   ★还必须认【正则字面量】：形如 /[\s"']/g 的正则里带引号，不认正则就会把它当字符串起点 ⇒ 全程失同步。
   实测（两道坑都踩过）：正则版漏掉 flowMapEnsureOcFrame 对 flowMapLog 的调用；
   不认正则时顶层声明数从 509 掉到 300。
   返回的 masked 与原文等长（换行保留），可直接做词边界匹配。
*/
'use strict';
const fs = require('fs');

const SP = 0x20, BT = 96, SQ_C = 39, DQ_C = 34, NL = 10, CR = 13, BS = 92;

function scan(src) {
  const n = src.length;
  const out = Buffer.alloc(n, SP);
  const S = 0, LINE = 1, BLOCK = 2, SQ = 3, DQ = 4, TQ = 5, RE = 6;
  let st = S, i = 0;
  let prevSig = 0;                       // 上一个有效代码字符的字符码（判断 / 是除号还是正则）
  const put = (k, ch) => { out[k] = ch > 255 ? SP : ch; };
  while (i < n) {
    const c = src[i], c2 = src[i + 1], cn = src.charCodeAt(i);
    if (st === S) {
      if (c === '/' && c2 === '/') { put(i, SP); put(i + 1, SP); st = LINE; i += 2; continue; }
      if (c === '/' && c2 === '*') { put(i, SP); put(i + 1, SP); st = BLOCK; i += 2; continue; }
      if (cn === DQ_C) { st = DQ; i++; continue; }
      if (cn === SQ_C) { st = SQ; i++; continue; }
      if (cn === BT) { st = TQ; i++; continue; }
      if (c === '/') {
        if (isRegexPos(prevSig, src, i)) { st = RE; prevSig = 0; i++; continue; }
        put(i, cn); prevSig = cn; i++; continue;                     // 除号
      }
      put(i, cn);
      if (cn > SP) prevSig = cn;
      i++; continue;
    }
    if (st === LINE) { if (cn === NL || cn === CR) { put(i, cn); st = S; } i++; continue; }
    if (st === BLOCK) {
      if (c === '*' && c2 === '/') { st = S; i += 2; continue; }
      if (cn === NL || cn === CR) put(i, cn);
      i++; continue;
    }
    if (st === RE) {
      if (cn === BS) { i += 2; continue; }
      if (cn === NL || cn === CR) { st = S; prevSig = 0; put(i, cn); i++; continue; }   // 未闭合：当除号收场，别拖死
      if (cn === 91) {                                            // [ 进入字符类；类内 / 不结束正则
        i++;
        while (i < n) {
          const d = src.charCodeAt(i);
          if (d === BS) { i += 2; continue; }
          if (d === 93) { i++; break; }
          if (d === NL || d === CR) break;
          i++;
        }
        continue;
      }
      if (c === '/') { i++; while (i < n && isAlpha(src[i])) i++; st = S; prevSig = 41; continue; }
      i++; continue;
    }
    if (st === SQ || st === DQ) {
      const qc = st === SQ ? SQ_C : DQ_C;
      if (cn === BS) { i += 2; continue; }
      if (cn === qc) { st = S; prevSig = qc; i++; continue; }
      if (cn === NL || cn === CR) put(i, cn);
      i++; continue;
    }
    if (st === TQ) {
      if (cn === BS) { i += 2; continue; }
      if (cn === BT) { st = S; prevSig = BT; i++; continue; }
      if (cn === NL || cn === CR) put(i, cn);
      i++; continue;
    }
  }
  const masked = out.toString('latin1');
  return { src, masked, lines: src.split('\n'), maskedLines: masked.split('\n') };
}

function isAlpha(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/* 关键字结尾 ⇒ 后面必然是正则；标识符/数字/) /] ⇒ 除号 */
const KW = ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'case', 'yield', 'await'];
const isIdc = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 36 || c === 95;

function lastWordBefore(src, i) {
  let j = i - 1;
  while (j >= 0 && (src[j] === ' ' || src[j] === 9)) j--;
  const end = j;
  while (j >= 0 && isIdc(src.charCodeAt(j))) j--;
  return src.slice(j + 1, end + 1);
}

function isRegexPos(p, src, i) {
  if (!p) return true;
  const ch = String.fromCharCode(p);
  if ('(,=:[!&|?{};+-*%~^'.indexOf(ch) >= 0) return true;
  if (p === 41 || p === 93 || p === BT) return false;            // ) ] ` ⇒ 除号
  if (p >= 48 && p <= 57) return false;                          // 数字 ⇒ 除号
  if (isIdc(p)) {
    // 标识符结尾：是关键字（return / typeof …）就当正则，否则当除号
    if (src) { const w = lastWordBefore(src, i); if (KW.indexOf(w) >= 0) return true; }
    return false;
  }
  return true;                                                   // 空白/其他标点 ⇒ 当正则起点
}

function load(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const r = scan(src);
  let bodyS = -1, bodyE = -1;
  for (let i = 0; i < r.lines.length; i++) {
    if (bodyS < 0 && /^\(function\s*\(/.test(r.lines[i])) bodyS = i;
    if (/^\}\)\(\);?\s*$/.test(r.lines[i])) bodyE = i;
  }
  r.bodyS = bodyS; r.bodyE = bodyE;
  return r;
}

/* 顶层声明（4 空格缩进的 function / var / const / let），带近似函数体区间
   ★必须支持「一行多名」：`var A = 1, B = 2;` 里 B 也是顶层声明。
     早先只认每行第一个名字 ⇒ 契约绑定块写成一行多名时，27 个成员在检查器里"不存在"，
     校验器直接给出 27 个假红（真实生成是对的）。
   ★必须支持 `async function NAME(...)`（见下面 D 正则里的 `(?:async\s+)?`）：
     漏了它，`async function flowFetchRowsRange(cfg)` 这类顶层声明就**整个隐形** ——
     闸 1（重名）/闸 2（契约覆盖）/闸 4（声明搬全）全都看不见它，
     于是它从面板搬到 base 之后没人提醒要进契约 ⇒ 真机 `ReferenceError`、地图整条链落到 catch。
     （v1.9.0 交付后正是被 `_test_flowboard_1643.js` 跑出来的；当时静态闸一片绿。） */
function declsOf(r) {
  const D = new RegExp('^ {4}(?:(?:async\\s+)?function\\s+([A-Za-z_$][\\w$]*)|(?:var|const|let)\\s+([A-Za-z_$][\\w$]*))');
  const list = [], seen = new Set();
  for (let i = r.bodyS; i <= r.bodyE; i++) {
    const m = D.exec(r.maskedLines[i]);
    if (!m) continue;
    if (m[1]) {
      if (!seen.has(m[1])) { seen.add(m[1]); list.push({ name: m[1], line: i + 1, kind: 'fn', text: r.lines[i].trim() }); }
      continue;
    }
    // var/const/let：把本行（可能跨行的声明只取首行）里所有「名字 =」都收进来
    const head = m[2];
    const rest = r.maskedLines[i].slice(4);
    const re = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g;
    let hit, got = false;
    while ((hit = re.exec(rest)) !== null) {
      const name = hit[1];
      got = true;
      if (seen.has(name)) continue;
      seen.add(name);
      list.push({ name, line: i + 1, kind: 'var', text: r.lines[i].trim() });
    }
    if (!got && !seen.has(head)) { seen.add(head); list.push({ name: head, line: i + 1, kind: 'var', text: r.lines[i].trim() }); }
  }
  list.sort((a, b) => a.line - b.line);
  for (let i = 0; i < list.length; i++) {
    list[i].from = list[i].line;
    list[i].to = (i + 1 < list.length) ? list[i + 1].line - 1 : r.bodyE + 1;
  }
  return list;
}

/* 正则元字符转义：不用正则字面量写（避免反斜杠在写入时被吞） */
function escapeRe(s) {
  const meta = '.+?^$()[]{}|' + String.fromCharCode(BS);
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    o += meta.indexOf(ch) >= 0 ? String.fromCharCode(BS) + ch : ch;
  }
  return o;
}

module.exports = { scan, load, declsOf, escapeRe };
