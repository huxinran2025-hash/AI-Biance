#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FORBIDDEN_PATTERN = /(bg|text|border)-(slate|zinc|gray)-/g;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'cloud-backend/node_modules']);
const VALID_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);

const violations = [];

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkDir(entryPath);
      continue;
    }

    const ext = path.extname(entry.name);
    if (!VALID_EXTENSIONS.has(ext)) continue;

    const content = fs.readFileSync(entryPath, 'utf8');
    if (FORBIDDEN_PATTERN.test(content)) {
      violations.push(entryPath.replace(ROOT_DIR + path.sep, ''));
    }
  }
}

walkDir(ROOT_DIR);

if (violations.length > 0) {
  console.error('Found forbidden Tailwind dark classes in the following files:');
  violations.forEach((file) => console.error(` - ${file}`));
  process.exit(1);
}

console.log('Theme guard passed.');

