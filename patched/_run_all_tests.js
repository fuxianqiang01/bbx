/* _run_all_tests.js —— 全量回归批量运行器（只读，不改任何脚本）
   跑 patched/ 与仓库根下所有 _test_*.js，逐个捕获 "N 通过 / M 失败" 行并汇总。
   用法: node patched/_run_all_tests.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const NODE = process.execPath;
const root = path.resolve(__dirname, '..');
const dirs = [__dirname, root];
const seen = new Set();
const files = [];
for (const d of dirs) {
    for (const f of fs.readdirSync(d)) {
        if (!/^_test_.*\.js$/.test(f)) continue;
        if (f === '_test_linkstate_1822.js' && d !== __dirname) continue;
        const full = path.join(d, f);
        if (seen.has(full)) continue;
        seen.add(full); files.push(full);
    }
}

let totalPass = 0, totalFail = 0; const bad = [];
let seq = 0;
for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    let out = '';
    const errFile = path.join(require('os').tmpdir(), 'bbx_test_err_' + process.pid + '_' + (seq++) + '.txt');
    try {
        /* ★两路输出都要收：部分套件（new_customer_gate / station_match）的汇总行走 console.error(stderr)，
           而 execFileSync 成功时只返回 stdout ⇒ 会漏掉汇总。
           做法：stdout 走管道、stderr 重定向到临时文件，跑完把文件内容并回来。
           （不用 shell 的 2>&1：本机 node 走 shell 会 EBUSY / 引号不稳。） */
        const fd = fs.openSync(errFile, 'w');
        try {
            out = cp.execFileSync(NODE, [f], {
                cwd: path.dirname(f), encoding: 'utf8', timeout: 180000,
                stdio: ['ignore', 'pipe', fd], maxBuffer: 64 * 1024 * 1024
            });
        } finally { try { fs.closeSync(fd); } catch (e) {} }
        try { out += fs.readFileSync(errFile, 'utf8'); } catch (e) {}
    } catch (e) {
        out = String((e.stdout || '') + (e.stderr || ''));
        try { out += fs.readFileSync(errFile, 'utf8'); } catch (e2) {}
    } finally { try { fs.unlinkSync(errFile); } catch (e) {} }
    const m = /(\d+)\s*通过\s*\/\s*(\d+)\s*失败/.exec(out)
        || /通过\s*(\d+)\s*\/\s*失败\s*(\d+)/.exec(out)
        || /PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)/i.exec(out)
        || /通过\s+(\d+)\s*项[，,]\s*失败\s+(\d+)\s*项/.exec(out)
        || /总结[:：]\s*(\d+)\s*通过\s*[,，]\s*(\d+)\s*失败/.exec(out)
        || /通过[:：]\s*(\d+)\s+失败[:：]\s*(\d+)/.exec(out)
        || /通过\s*(\d+)\s*\/\s*失败\s*(\d+)/.exec(out)
        || (/断言\s*(\d+)\s*条[：:]\s*通过\s*\1\s*\/\s*失败\s*0/.test(out)
            ? [null, RegExp.$1, '0'] : null)
        || (/(\d+)\s*项断言全部通过/.test(out) ? [null, RegExp.$1, '0'] : null)
        || /JS_SUMMARY\s+PASS=(\d+)\s+FAIL=(\d+)/.exec(out)
        || /JS_SUMMARY[^\n]*?pass=(\d+)\s+fail=(\d+)/.exec(out)
        || (/总体:\s*ALL PASS/.test(out)
            ? [null, String((out.match(/(?:^|\n)[^\n]*:\s*PASS/g) || []).length), '0']
            : null);
    if (!m) {
        bad.push(rel + '  <无结果行，可能崩溃>');
        console.log('  ?  ' + rel + '   (no summary)');
        continue;
    }
    const p = +m[1], fl = +m[2];
    totalPass += p; totalFail += fl;
    console.log('  ' + (fl ? '\u2717' : '\u2713') + '  ' + rel.padEnd(42) + ' ' + p + ' / ' + fl);
    if (fl) bad.push(rel + '  (' + fl + ' 失败)');
}
console.log('\n================ 全量汇总 ================');
console.log('套件数: ' + files.length + '    断言: ' + totalPass + ' 通过 / ' + totalFail + ' 失败');
if (bad.length) { console.log('有问题的套件:'); bad.forEach(b => console.log('   - ' + b)); }
process.exit((totalFail || bad.length) ? 1 : 0);
