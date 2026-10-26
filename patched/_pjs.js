/* _pjs.js —— 从宿主脚本里**重建弹窗内联脚本**（供 syntax check / 行为测试用）
   原理：flowMapPopupJs(ak,grp,ctx) 体内是 `var L = [ '...' , ... ]; return L.join('\n');`
         ⇒ 把宿主脚本里所有 `var NAME = <expr>;` 顶层常量声明先求值进沙箱，
            再把那个数组字面量整段求值 ⇒ join 就是弹窗里真正跑的那份 JS。
   ⚠ 常量求值失败不报错（有些常量依赖函数，本项目里不影响弹窗那份字符串的拼装），
     但会在结果里带上统计，便于判断"是不是因为常量缺值导致拼出来的串不可信"。 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const _t = require('./_targets.js');

/* ★1.9.0【先灌 "不动点迭代" 求出来的常量表，再逐行补漏】
   本文件原来是**按文件顺序**逐条 `var NAME = <expr>;` 求值 —— 只要某条引用了
   "在它之后才声明"的另一条常量（本项目大量如此，`var A = B + 1;` 写在 `var B = …` 前面），
   那条就必然失败；失败又会让**依赖它的下一条**继续失败 ⇒ 成片假失败。
   实测（同一份 flow 脚本）：老写法 285 成功 / 177 失败；其中相当一部分是"本可以算出来"的。
   ⇒ 改成：① 先用 `_targets.hostConstEnv()`（字符级掩码定位 + 语法预筛 + 不动点迭代，
        直到没有新名字可解）把**全大写常量**一次性求出；② 再把它们灌进沙箱；
        ③ 剩下的（非全大写、或依赖函数的）仍走原来的逐行兜底。
     这样"常量注入失败数"才是一个**真信号**（真依赖函数），而不是顺序噪声。 */
function seedConstants(sandbox, src, baseSrc) {
    let KV = {};
    try { KV = _t.hostConstEnv(src) || {}; } catch (e) { KV = {}; }
    const nFlow = Object.keys(KV).length;
    /* ★1.9.0【从 base 给"ctx 绑定占位"补真值】
       flow 里凡是"从 ctx 绑过来"的常量，一律先写成 `var X = null;` 占位，运行时再 `X = a.X`
       （真字面量在 base 的导出里）。对**静态重建**弹窗脚本来说，那个 null 是假的：
       实测 `FLOW_MAP_AKPAGE` 在弹窗的排查文案里会拼成 `null`（旧版是 '/orderCenterNew.do'），
       于是新旧弹窗脚本"差 28 字节"，看着像内容变了、其实是夹具没接上。
       ⇒ 用 base 里的真值补位（只补"flow 解出 null/undefined"的那些，不覆盖 flow 的真值）。 */
    let filled = 0;
    if (baseSrc) {
        let KB = {};
        try { KB = _t.hostConstEnv(baseSrc) || {}; } catch (e) { KB = {}; }
        Object.keys(KB).forEach(function (k) {
            if ((KV[k] === null || KV[k] === undefined) && KB[k] !== null && KB[k] !== undefined) { KV[k] = KB[k]; filled++; }
        });
    }
    Object.keys(KV).forEach(function (k) { sandbox[k] = KV[k]; });
    return { flow: nFlow, filled: filled, total: Object.keys(KV).length };
}

function buildPopupJs(file, baseFile) {
    const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    let baseSrc = '';
    if (baseFile) { try { baseSrc = fs.readFileSync(baseFile, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { baseSrc = ''; } }
    const lines = src.split('\n');
    /* ---- 1. 定位 `function flowMapPopupJs(...) {` → 数组 `var L = [` → `];` ---- */
    let f0 = -1, i0 = -1, i1 = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*function flowMapPopupJs\(/.test(lines[i])) f0 = i;
        if (f0 >= 0 && /^\s*var L = \[/.test(lines[i])) { i0 = i; break; }
    }
    if (i0 < 0) i0 = lines.findIndex(l => /^\s*var L = \[/.test(l));
    for (let i = i0; i < lines.length; i++) if (/^\s*\];\s*$/.test(lines[i])) { i1 = i; break; }
    if (i0 < 0 || i1 < 0) throw new Error('找不到弹窗脚本数组（var L = [ ... ];）');
    /* 函数前奏（`var C = ctx || {};` … 至数组前一行）：里面的局部别名（FS/FTIME/FM/CKW/…）
       被数组体引用 ⇒ 必须一起求值，否则拼出来的串是 `undefined` 而不是真实尺寸。 */
    const prelude = f0 >= 0 ? lines.slice(f0 + 1, i0).join('\n') : '';
    const body = lines.slice(i0, i1 + 1).join('\n')
        .replace(/^\s*var L = \[/, '[')
        .replace(/\]\s*;\s*$/, ']');

    /* ---- 2. 沙箱：先塞标准内置，再逐条求值宿主常量 ---- */
    const sandbox = vm.createContext({
        Math: Math, JSON: JSON, String: String, Number: Number, Date: Date,
        Array: Array, Object: Object, Boolean: Boolean, parseInt: parseInt,
        parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite, RegExp: RegExp,
        setTimeout: function () { }, console: console
    });
    const decls = [];
    /* 逐行扫描 `var NAME = ...;`：① 允许行尾 `// 注释`；② 允许声明跨多行（续行直到出现收尾 `;`）。
       ⚠ 不用单行正则 —— 本项目常量几乎每条都带中文行尾注释，单行正则会把它们**全部漏掉**，
         那样拼出来的串里处处是 `undefined`，语法检查就失去意义了。 */
    for (let i = 0; i < lines.length; i++) {
        const m = /^[ \t]*var[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*(.*)$/.exec(lines[i]);
        if (!m) continue;
        let expr = m[2], j = i, guard = 0;
        while (!/;[ \t]*(?:\/\/[^\n]*)?$/.test(expr) && j + 1 < lines.length && guard++ < 20) {
            j++; expr += ' ' + lines[j].trim();
        }
        expr = expr.replace(/;[ \t]*(?:\/\/[^\n]*)?$/, '');
        decls.push([m[1], expr]);
        i = j;
    }
    /* ★1.9.0：先把不动点解出来的全大写常量灌进去（见上面 seedConstants 的说明） */
    const seeded = seedConstants(sandbox, src, baseSrc);
    let okC = 0, badC = 0;
    decls.forEach(function (p) {
        if (typeof sandbox[p[0]] !== 'undefined') return;
        try { vm.runInContext('var ' + p[0] + '=' + p[1] + ';', sandbox, { timeout: 2000 }); okC++; }
        catch (e) { badC++; }
    });

    /* ---- 3. 补上函数形参与局部上下文，再求值数组 → join ---- */
    let L;
    try {
        vm.runInContext("var ak='AK',grp='GRP',ctx={};" + prelude, sandbox, { timeout: 4000 });
        L = vm.runInContext('(' + body + ')', sandbox, { timeout: 8000 });
    }
    catch (e) {
        const err = new Error('数组求值失败：' + e.message);
        err.constOk = okC; err.constBad = badC;
        err.at = (function () { try { return e.stack.split('\n')[1]; } catch (e2) { return ''; } })();
        throw err;
    }
    return { js: L.join('\n'), n: L.length, constOk: okC, constBad: badC, seeded: seeded };
}

module.exports = { buildPopupJs: buildPopupJs };

if (require.main === module) {
    /* ★1.9.0：不给参数就默认当前 flow 脚本（这道闸的日常用法就是"验一下刚生成的那份"） */
    const file = process.argv[2] || _t.flowFile();
    const baseFile = process.argv[3] || (process.argv[2] ? null : _t.baseFile());
    console.log('■ 被测：' + file + (baseFile ? ('\n■ 补值来源：' + baseFile) : ''));
    const r = buildPopupJs(file, baseFile);
    console.log('元素数=' + r.n + '  常量：不动点灌入 flow ' + r.seeded.flow + ' 个'
        + (r.seeded.filled ? ('（另从 base 补 ' + r.seeded.filled + ' 个 ctx 占位）') : '')
        + '，逐行补 ok=' + r.constOk + '/失败=' + r.constBad);
    console.log('弹窗脚本长度=' + r.js.length + ' B  行数=' + r.js.split('\n').length);
    /* ★顺带报一下"拼出来的串里还有多少个 undefined" —— 这才是这道闸的真价值：
       常量缺值会让弹窗里的尺寸/颜色变成 undefined，而**语法仍然合法**（`top:undefined;` 能编译），
       所以只看"语法 OK"会漏。 */
    const undef = (r.js.match(/\bundefined\b/g) || []).length;
    console.log('拼装串里的 undefined 次数=' + undef + (undef ? '  ← 常量缺值（不影响语法检查，但会影响真机尺寸）' : ''));
    try { new Function(r.js); console.log('弹窗脚本语法: OK'); }
    catch (e) { console.log('弹窗脚本语法错误: ' + e.message); process.exitCode = 1; }
}
