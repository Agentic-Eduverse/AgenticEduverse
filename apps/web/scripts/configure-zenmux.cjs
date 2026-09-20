'use strict';
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const envPath = path.resolve(__dirname, '../.env');

function updateEnv(text, key, model) {
  if (!key || /[\s"'`#\\]/.test(key)) throw new Error('Invalid API key: empty or contains unsafe characters.');
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(model)) throw new Error('Invalid model ID.');
  const values = { ZENMUX_API_KEY: key, ZENMUX_MODEL: model };
  const seen = new Set();
  const lines = text.split(/\r?\n/).filter(line => {
    const match = line.match(/^\s*(?:export\s+)?(ZENMUX_API_KEY|ZENMUX_MODEL)\s*=/);
    if (!match) return true;
    if (seen.has(match[1])) return false;
    seen.add(match[1]);
    return true;
  }).map(line => {
    const match = line.match(/^\s*(?:export\s+)?(ZENMUX_API_KEY|ZENMUX_MODEL)\s*=/);
    return match ? `${match[1]}=${values[match[1]]}` : line;
  });
  for (const name of Object.keys(values)) if (!seen.has(name)) lines.push(`${name}=${values[name]}`);
  return lines.join('\n').replace(/\n*$/, '\n');
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this command in a local interactive terminal.');
  if (!fs.existsSync(envPath)) throw new Error('Web .env is missing. No changes made.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const model = (await new Promise(resolve => rl.question('ZenMux model ID [openai/gpt-5]: ', resolve))).trim() || 'openai/gpt-5';
  rl.close();
  process.stdout.write('Paste ZenMux API key (hidden), then Enter: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let key = '';
  await new Promise(resolve => {
    const handler = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', handler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve();
          return;
        }
        if (char === '\u007f' || char === '\b') key = key.slice(0, -1);
        else if (char >= ' ') key += char;
      }
    };
    process.stdin.on('data', handler);
  });
  const original = fs.readFileSync(envPath, 'utf8');
  const next = updateEnv(original, key.trim(), model);
  // Atomic replacement; never print the secret or create extra secret-bearing backups.
  const temporary = envPath + '.zenmux.tmp';
  fs.writeFileSync(temporary, next, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, envPath);
  process.stdout.write('\nSaved to apps/web/.env. Restart the web server, then refresh the tutor page.\n');
}
module.exports = { updateEnv };
if (require.main === module) main().catch(error => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  console.error('\nConfiguration not completed: ' + error.message);
  process.exitCode = 1;
});
