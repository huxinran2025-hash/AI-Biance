#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const I18N_PATH = path.resolve(__dirname, '..', 'src', 'i18n.ts');

function main() {
  let fileContent;
  try {
    fileContent = fs.readFileSync(I18N_PATH, 'utf8');
  } catch (error) {
    console.error(`[i18n:check] Unable to read ${I18N_PATH}:`, error.message);
    process.exit(1);
  }

  const match = fileContent.match(/export const messages\s*=\s*(\{[\s\S]*?\n\});?/);
  if (!match) {
    console.error('[i18n:check] Could not locate messages map in src/i18n.ts');
    process.exit(1);
  }

  let messages;
  try {
    messages = new Function(`return ${match[1]};`)();
  } catch (error) {
    console.error('[i18n:check] Failed to parse messages map:', error.message);
    process.exit(1);
  }

  const seen = new Set();
  const duplicates = [];

  Object.keys(messages).forEach((key) => {
    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }
  });

  if (duplicates.length > 0) {
    console.error('Duplicated i18n keys:\n- ' + duplicates.join('\n- '));
    process.exit(1);
  }

  console.log('No duplicates.');
}

main();

