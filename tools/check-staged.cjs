'use strict';
// Read-only review of newly staged file contents; never print matching values.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');

function inspect(file, content) {
  const findings = [];
  const normalized = '/' + file.replace(/\\/g, '/');
  if (/(?:^|\/)(?:\.edge-debug|\.local-tools|\.local|private|artifacts|node_modules)(?:\/|$)/i.test(normalized)
      || /(?:^|\/)\.env(?:\.|$)/i.test(normalized) && !normalized.endsWith('/.env.example')
      || /\.(?:har|csv|png|jpe?g|webp|gif|mp4|zip|pem|key|log|out)$/i.test(normalized)
      || normalized.startsWith('/imports/') && normalized !== '/imports/README.md') {
    findings.push({ line: 0, kind: 'private-or-runtime-file' });
  }
  const lines = content.toString('utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/(?<![\dA-Za-z])1[3-9]\d{9}(?!\d)/.test(line)) findings.push({ line: index + 1, kind: 'phone-literal' });
    if (/(?<!\d)\d{17,}(?!\d)/.test(line)) findings.push({ line: index + 1, kind: 'long-identifier-review' });
    if (/\b(?:password|passwd|authorization|cookie|access[_-]?token|api[_-]?key)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i.test(line)
        || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)
        || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/.test(line)) {
      findings.push({ line: index + 1, kind: 'credential-review' });
    }
  });
  return findings;
}

function main() {
  const localGit = path.join(root, '.local-tools', 'git', 'cmd', 'git.exe');
  const git = process.env.BBX_GIT || (fs.existsSync(localGit) ? localGit : 'git');
  const invoke = args => cp.execFileSync(git, args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const files = invoke(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8').split('\0').filter(Boolean);
  let count = 0;
  for (const file of files) {
    const content = invoke(['show', ':' + file]);
    const findings = inspect(file, content);
    for (const finding of findings) {
      console.error(file + (finding.line ? ':' + finding.line : '') + ' [' + finding.kind + ']');
      count++;
    }
  }
  console.log('Staged review: ' + files.length + ' files, ' + count + ' findings.');
  if (count) console.error('Review findings before committing; matching values are intentionally omitted.');
  return count ? 1 : 0;
}
module.exports = { inspect, main };
if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error('Staged review failed: ' + error.message); process.exitCode = 2; }
}
