import { readFile, appendFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const source = parseEnv(await readFile(process.argv[2] || '../pitstop-scraper/.env', 'utf8'));
const current = parseEnv(await readFile('.env', 'utf8'));
const lines = [];
for (const key of ['PITSTOP_URL', 'PITSTOP_USER', 'PITSTOP_PASS']) {
  if (current[key]) continue;
  if (!source[key]) throw new Error(`Missing ${key} in original scraper configuration`);
  const value = source[key];
  const candidates = [JSON.stringify(value), ...["'", '`'].filter(quote => !value.includes(quote)).map(quote => `${quote}${value}${quote}`)];
  const encoded = candidates.find(candidate => parseEnv(`${key}=${candidate}`)[key] === value);
  if (!encoded) throw new Error(`Copy ${key} manually; unable to safely serialize its value`);
  lines.push(`${key}=${encoded}`);
}
if (lines.length) await appendFile('.env', `\n# Integrated legacy PitStop scraper\n${lines.join('\n')}\n`);
console.info(`Configured ${lines.length} scraper environment values. Existing nonempty values and original files were preserved.`);
