/* _targets.js —— 测试套件的**目标文件解析器**（唯一来源，别再往测试里写死路径）
   ★背景（踩过的坑）：各 _test_flow_18xx.js 原来把默认目标写成
     'C:/Users/Administrator/Desktop/客户来电-流水·订单情况面板_v1.8.19.js' ——
     而桌面那份**文件名滞后、内部 @version 实为 1.8.55**（用户的工作副本）。
     于是"1.8.5x 专项"实际上一直在测 1.8.55，改了新版也照样绿 ⇒ 典型的假绿。
   ★另外：早先的测试**互相之间没对齐**（1856 自己写了一套 resolveFile，1851 又写死桌面），
     改一处忘了另一处就会静默回退。现在统一走这里。

   两个入口：
     flowFile() —— 「流水面板-地图」脚本（bbx_flow_orderboard）。★v1.9.0 起它**只有地图**。
     baseFile() —— 「客户来电-自动查询+拨号」脚本（bbx_auto_call_query）。★v1.9.0 起含两块面板。
   两者都取「候选里 @version 最高」的那份；候选只取本仓库 outputs/ + patched/。
   不再读取桌面或历史工作区，避免测试被仓库外文件污染。
*/
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'outputs');

function versionOf(p) {
  try { return ((/@version\s+([0-9.]+)/.exec(fs.readFileSync(p, 'utf8')) || [])[1]) || ''; }
  catch (e) { return ''; }
}
function seg(s) { return String(s).split('.').map(n => parseInt(n, 10) || 0); }
function cmpVer(a, b) {
  const A = seg(a), B = seg(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d;
  }
  return 0;
}
function pick(list) {
  const cands = list.filter(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
  let best = null, bv = '';
  for (const f of cands) {
    const v = versionOf(f);
    if (!v) continue;
    if (!best || cmpVer(v, bv) > 0) { best = f; bv = v; }
  }
  return best || cands[0] || null;
}
function dirFiles(d, re) {
  try { return fs.readdirSync(d).filter(f => re.test(f)).map(f => path.join(d, f)); } catch (e) { return []; }
}

/* 「流水面板-地图」脚本候选：仅本仓库 outputs 与 patched。 */
function flowCands() {
  return [].concat(
    dirFiles(OUT, /^bbx_flow_orderboard_v[0-9.]+\.user\.js$/),
    [path.join(__dirname, 'bbx_flow_orderboard.user.js')]
  );
}
/* 「客户来电」脚本候选：outputs 的 bbx_auto_call_query_v*、patched 里的固定名 */
function baseCands() {
  return [].concat(
    dirFiles(OUT, /^bbx_auto_call_query_v[0-9.]+\.user\.js$/),
    [path.join(__dirname, 'bbx_auto_call_query.user.js')]
  );
}

/* ★环境变量覆盖（只用于**版本对比**，默认行为一字不改）：
   升版后想复跑"上一版到底红在哪几条"，不必改文件、不必来回覆盖 outputs：
     BBX_FLOW_FILE=outputs/bbx_flow_orderboard_v1.9.1.user.js node patched/_test_flowboard_1643.js
   ⚠ 只在文件存在时生效（写错路径 ⇒ 静默回落到正常选路，不制造"文件不存在"的新故障）。 */
function envOverride(name) {
  const v = process.env[name];
  if (!v) return null;
  try { return fs.statSync(v).isFile() ? v : null; } catch (e) { return null; }
}
function flowFile() { return envOverride('BBX_FLOW_FILE') || pick(flowCands()); }
function baseFile() { return envOverride('BBX_BASE_FILE') || pick(baseCands()); }

/* ───────────────── 合成「同页双脚本」源码（供合体套件用） ─────────────────
   ★为什么需要：`_test_flowboard_1643.js` 那类套件**同时**断言面板与地图（1042 条），
     而 v1.9.0 起这两块分居两个脚本。真机运行态是「同一页、同一个 window 里两份脚本共存」，
     所以最忠实的被测物就是把两份**直接拼在一起**（base 的函数在里面，地图代码自然能直接看到，
     不需要走 window.__bbxAq 契约）—— 与拆分前那份合体脚本在结构上等价。
   ⚠ 必须拼进 base 的 IIFE **内部**（在它最后的 `})();` 之前），否则地图代码看不到 base 的局部函数。
   ⚠ 四个「会被整体重赋」的状态在 flow 里走取值函数（flowAqXxx）：合成文件里补 4 行 shim。 */
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

/* ───────────────── 全库文本（供静态/正则类断言用） ─────────────────
   ★重新定义（v1.9.0 第二次修正）：这里原来返回的是「base 全文 + flow 的**地图段**」拼成的
     **同作用域**源码（当时是为了让 1643 的探针能同时看到面板与地图）。
     但运行时已经改成"base + 地图脚本原样"两个 IIFE（真机形态），合成源不再被执行；
     剩下要它的人全是**静态文本断言**（找常量块、横幅沿革、用户原话、函数签名…），
     而它们要的是"**整个代码库里有没有这段字**" ⇒ 只取地图段会把 flow 的**文件头横幅**
     （★1.8.x 全部沿革条目、用户原话留档）漏掉 ⇒ 一批"文本在场"断言假红。
   ★所以现在 = **base 全文 + flow 全文**（纯文本拼接，不做任何作用域改造）。
     ⚠ 反面话术类断言（"某脚本里不许有 X"）**必须显式指定** `SRC_FLOW` / `SRC_BASE`，
       不能再对 `SRC` 用 `!/X/` —— 那等于问"全库有没有 X"，几乎恒为真。 */
function combinedText() {
  return readText(baseFile()) + '\n' + readText(flowFile());
}

/* ───────────────── 宿主常量环境（自动派生，供「弹窗 JS 夹具」用） ─────────────────
   ★为什么需要它（这是本项目的老账，非本次拆分引入）：
     `_test_flowboard_1643.js` 的夹具用一份**手工维护**的常量白名单（CNAMES + deps）
     把宿主常量当参数注入到抽出来的弹窗 JS 里。那份清单停在 ~v1.8.20，
     而 v1.8.30~1.8.56 陆续往弹窗里内联了 40+ 个新常量（FLOW_MAP_GPS_* 一族等）
     ⇒ 一 `new Function` 就 `ReferenceError: FLOW_MAP_GPS_BG is not defined`，
     整段行为夹具连带崩掉（看着像产品缺陷，其实是夹具没跟上）。
   ★修法：不再"记得才加"，而是**从源码自动发现全大写宿主常量并按依赖顺序求值**：
     用字符级扫描器（_recon_util）拿到「注释/字符串已抹白」的等长掩码 ⇒ 找 `var NAME = …;`
     的位置绝对可靠（字符串里的假 `var x = 1;` 不会误命中）；表达式文本再从原文同一区间切回来
     （掩码把字符串内容也抹了，所以值必须取原文）。
     然后**不动点迭代**：反复用"已求出的常量"当参数去 eval 未求出的，直到一轮没有任何进展
     （`FLOW_MAP_GPS_OFF_Y = -(SPD_H + GAP_Y + round(CAR_H/2))` 这种引用式赋值靠迭代自动排好序，
     不用手工维护"先分量后结果"的次序）。
   ★只收**全大写**名（`/^[A-Z][A-Z0-9_]*$/`）：宿主常量都是这个约定，同时避开 `var i` / `var d`
     这类嵌套局部变量污染参数表。 */
function hostConstEnv(src) {
  const recon = require('./_recon_util.js');
  const r = recon.scan(src);
  const masked = r.masked;
  let bS = -1, bE = -1;
  for (let i = 0; i < r.lines.length; i++) {
    if (bS < 0 && /^\(function\s*\(/.test(r.lines[i])) bS = i;
    if (/^\}\)\(\);?\s*$/.test(r.lines[i])) bE = i;
  }
  if (bS < 0) bS = 0;
  if (bE < 0) bE = r.lines.length - 1;
  r.bodyS = bS; r.bodyE = bE;

  // 行首绝对偏移（masked 与原文等长 ⇒ 两边通用）
  const off = new Array(r.lines.length);
  { let p = 0; for (let i = 0; i < r.lines.length; i++) { off[i] = p; p += r.lines[i].length + 1; } }

  const DECL = /^var\s+([A-Z][A-Z0-9_]*)\s*=/;
  const raw = [], seen = new Set();
  for (const d of recon.declsOf(r)) {
    if (d.kind !== 'var') continue;
    const i = d.line - 1;
    if (i < 0 || i >= r.lines.length) continue;
    const m = DECL.exec(r.maskedLines[i].slice(4));
    if (!m || m[1] !== d.name) continue;          // 一行多名：只认行首那个，其余交给 seen 去重
    if (seen.has(d.name)) continue;
    const eq = off[i] + 4 + m[0].length - 1;      // '=' 的绝对下标
    const semi = masked.indexOf(';', eq);
    if (semi < 0 || semi - eq > 6000) continue;   // 找不到分号 / 跨度过大 ⇒ 放弃（不是常量）
    const expr = src.slice(eq + 1, semi).trim();
    if (!expr) continue;
    seen.add(d.name);
    raw.push([d.name, expr]);
  }

  // ★语法预筛：`var F = function () { a; b; };` 这种会被"第一个分号"切坏 ⇒ 表达式非法。
  //   而 `Function(code)` 是**整体编译**的：一条非法就把整块炸掉（实测 env 直接空表）。
  //   `new Function` 在构造期就编译 ⇒ 构造不抛 = 语法合法（引用未定义是**运行期**才报）。
  const okExpr = [];
  for (const [n, e] of raw) {
    try { new Function('return (' + e + ');'); okExpr.push([n, e]); } catch (_e) { /* 非常量，跳过 */ }
  }

  // 不动点迭代求值
  const env = Object.create(null);
  let pending = okExpr;
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const keys = Object.keys(env);
    const bodyLines = pending.map(([n, e]) => 'var ' + n + '; try { ' + n + ' = (' + e + '); } catch (_e) {}');
    const code = bodyLines.join('\n') + '\nreturn {' + pending.map(([n]) => n + ':' + n).join(',') + '};';
    let got;
    try { got = Function.apply(null, keys.concat(code)).apply(null, keys.map(k => env[k])); }
    catch (e) { break; }                          // 参数名冲突等 ⇒ 收手
    let progress = 0;
    const next = [];
    for (const [n, e] of pending) {
      if (got[n] !== undefined) { env[n] = got[n]; progress++; } else { next.push([n, e]); }
    }
    if (!progress) break;
    pending = next;
  }
  return env;
}

/* ───────────────── 弹窗 JS 里的「顶层函数表」+「缺失依赖补齐」 ─────────────────
   ★为什么需要（也是老账）：`_test_flowboard_1643.js` 把弹窗里的几个函数
     （drvRows / selList / selCount / assignTo）**整段抠出来**再 `new Function` 重跑。
     它只把"当时那几个函数依赖的东西"手工列进了参数表。后来版本一重构
     （★1.8.29 把载客文案抽成 `selBatchOf()` / `drvCapText(d,add)` / `drvBatchText(d)`、
     ★1.8.10 加 `refreshAll()` …），被抠出来的函数就调用了**没被注入**的名字 ⇒ `ReferenceError`；
     更糟的是这类错常常落在 fetch 链的 `.catch` 里 ⇒ 界面被刷成"请求失败"，
     测试看着像"产品缺陷"，其实是夹具没跟上。
   ★修法：按**调用依赖闭包**自动补齐 —— 从抠出来的函数出发，凡用到的名字若在弹窗 JS 里
     真有 `function NAME(...)` 定义、又没被夹具显式当参数注入，就把它的源码一起带上；
     迭代到不动点。显式注入的名字**永远优先**（桩不能被真实现抢走）。
   括号配对在「字符级掩码」上做 ⇒ 字符串/注释里的花括号不会数错（_recon_util 的 masked 与原文等长）。 */
function topFns(code) {
  const recon = require('./_recon_util.js');
  const r = recon.scan(code);
  const m = r.masked;
  const re = /(^|\n)[ \t]*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const out = new Map();
  let hit;
  while ((hit = re.exec(m)) !== null) {
    const name = hit[2];
    const brace = m.indexOf('{', hit.index + hit[0].length);
    if (brace < 0) continue;
    let d = 0, j = brace;
    for (; j < m.length; j++) {
      const c = m[j];
      if (c === '{') d++;
      else if (c === '}') { d--; if (!d) break; }
    }
    if (d !== 0) continue;
    const start = hit.index + hit[1].length;
    if (!out.has(name)) out.set(name, code.slice(start, j + 1));
    re.lastIndex = j;                    // 跳过整个函数体：只要顶层
  }
  return out;
}

function missingHelpers(code, seedTexts, injected) {
  const fns = topFns(code);
  const have = new Set(injected || []);
  const picked = [], got = new Set();
  for (const s of seedTexts) {
    const m = /^[ \t]*function\s+([A-Za-z_$][\w$]*)/.exec(s);
    if (m) got.add(m[1]);                // 种子自己已经在 body 里，别重复定义
  }
  const queue = seedTexts.slice();
  for (let qi = 0; qi < queue.length; qi++) {
    const ids = queue[qi].match(/[A-Za-z_$][\w$]*/g) || [];
    for (const id of ids) {
      if (got.has(id) || have.has(id)) continue;
      if (!fns.has(id)) continue;        // 不是弹窗里的函数 ⇒ 交给参数/全局
      got.add(id);
      const src = fns.get(id);
      picked.push(src);
      queue.push(src);
    }
  }
  return picked.join('\n');
}

/* ─────────── ★1.9.22【位置判定：老夹具的沙箱依赖自适应注入】 ───────────
   1.9.22 起 `segOf()` 里「预排班」的方向**不再纯推断** —— 先问位置：
     posSideOf(e,s) → GPS 车位（__bbxMapGpsAll 推来的 GPOS）→ 名册第 8 格「当前位置」（e.q[s].loc）
                     → 两路都判不出 ⇒ 返回 "" ⇒ 回退原推断 r。
   凡把 segOf / drvRows 抠进沙箱**真跑**的老专项（1915 / 1918 / 1920 / 1921），
   夹具必须跟着补这几个函数，否则 `ReferenceError: posSideOf is not defined`
   （★静态闸看不见这种事：它只检查语法。血案同 `declsOf` 漏 `async function`）。

   ★自适应口径（别再逐版手改老夹具）：产物里**有全套 5 个**函数才注入；
     老产物（1.9.21 及以前根本没这套实现）⇒ 只注入常量行 ⇒ 夹具行为一字不变。
   ★为什么注入后老断言仍全绿：夹具既不设 `GPOS`（无车位）、名册行也不给 `loc`
     ⇒ `gposOf` 恒 null、`sideByText("")` 恒 "" ⇒ `posSideOf` 恒返回 ""
     ⇒ 判定**自动退化**为 1.9.21 口径。要真验位置判向的，请到 `_test_flow_1922.js`。
   ★AN/BN **不从弹窗里抠**：弹窗那句 `,AN=...` 的值由 `ctx.aName` 注入，
     静态重建（_pjs）时恒为空串 ⇒ 只能由调用方按自己夹具的线路给。 */
function posPrelude(pop, an, bn) {
  const head = 'var AN=' + JSON.stringify(an || '莒县') + ',BN=' + JSON.stringify(bn || '日照')
    + ',PT={},GPOS={};';
  /* ★1.9.23【同一纪律的第二例】`drvAgg()` 新增了「第 4 步 · 按车牌兜底补名」的姓名来源 `PNAMES`
     —— 凡是把 `drvAgg` 抠进沙箱真跑的老夹具（如 `_test_flow_1915.js`），产物一升到 1.9.23
     就会 `ReferenceError: PNAMES is not defined`（与 1.9.22 `posSideOf` 完全同型）。
     照 1.9.22 的规矩办：**产物里声明了才注入**；老产物不注入 ⇒ 夹具行为一字不变。
     夹具不设 PNAMES ⇒ 第 4 步恒不命中 ⇒ 判定自动退化回 1.9.22 口径。 */
  const pn = /var PNAMES=\{\};/.test(String(pop || '')) ? '\nvar PNAMES={};' : '';
  const names = ['plateKey', 'gposOf', 'sideByText', 'sideByCoord', 'posSideOf'];
  const fns = topFns(pop);
  const got = names.map(n => fns.get(n));
  if (got.some(s => !s)) return head + pn;      // 老产物 ⇒ 只给常量
  return head + pn + '\n' + got.join('\n');
}

module.exports = { readText, flowFile, baseFile, combinedText, hostConstEnv, topFns, missingHelpers, posPrelude, versionOf, cmpVer, flowCands, baseCands };

if (require.main === module) {
  console.log('flowFile() =', flowFile(), '  @version', versionOf(flowFile()));
  console.log('baseFile() =', baseFile(), '  @version', versionOf(baseFile()));
}
