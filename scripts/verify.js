const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git', '.vercel']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(root);
let failed = false;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed = true;
    process.stderr.write(`Syntax error: ${path.relative(root, file)}\n`);
    process.stderr.write(String(error.stderr || error.message));
    process.stderr.write('\n');
  }
}

if (failed) process.exit(1);
console.log(`VEXORA verification passed: ${files.length} JavaScript files checked.`);
