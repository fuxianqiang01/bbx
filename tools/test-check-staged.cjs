'use strict';
const assert = require('node:assert/strict');
const { inspect } = require('./check-staged.cjs');
let passed = 0;
function check(name, run) { run(); passed++; console.log('PASS ' + name); }
check('ordinary source is allowed', () => assert.deepEqual(inspect('scripts/example.user.js', Buffer.from('var enabled = false;')), []));
check('phone value is reported without echoing it', () => {
  const value = '1' + '38' + '0'.repeat(8);
  const findings = inspect('scripts/example.user.js', Buffer.from('var n = "' + value + '";'));
  assert.equal(findings[0].kind, 'phone-literal');
  assert.equal(findings[0].line, 1);
  assert.equal(JSON.stringify(findings).includes(value), false);
});
check('long identifiers require review', () => assert.equal(inspect('sample.js', Buffer.from('9'.repeat(20)))[0].kind, 'long-identifier-review'));
check('credential values require review', () => assert.equal(inspect('sample.js', Buffer.from('access_token = "' + 'x'.repeat(24) + '"'))[0].kind, 'credential-review'));
check('private runtime paths are blocked', () => {
  for (const file of ['.edge-debug/state', '.local-tools/tool.exe', 'private/config.json', '.env', 'artifacts/evidence.txt', 'imports/export.user.js', 'orders.csv']) {
    assert.equal(inspect(file, Buffer.from(''))[0].kind, 'private-or-runtime-file');
  }
});
check('import instructions and env template are allowed', () => {
  assert.deepEqual(inspect('imports/README.md', Buffer.from('Review exports first.')), []);
  assert.deepEqual(inspect('.env.example', Buffer.from('EXAMPLE=')), []);
});
console.log(passed + ' tests passed.');
