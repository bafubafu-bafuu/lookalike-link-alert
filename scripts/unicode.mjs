import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'https://www.unicode.org/Public/security/16.0.0/confusables.txt';
const response = await fetch(source);
if (!response.ok) throw new Error(`Unicode data download failed: ${response.status}`);
const text = await response.text();
if (!text.includes('# Version: 16.0.0')) throw new Error('Unexpected Unicode data version');
const mappings = {};
for (const line of text.split('\n')) {
  const fields = line.split('#')[0].trim().split(';').map((value) => value.trim());
  if (fields.length < 3) continue;
  const [from, to] = fields;
  const decode = (value) => String.fromCodePoint(...value.split(/\s+/).map((part) => Number.parseInt(part, 16)));
  mappings[decode(from)] = decode(to);
}
await mkdir('src/core', { recursive: true });
await mkdir('public/licenses', { recursive: true });
await writeFile('src/core/confusables.json', `${JSON.stringify(mappings)}\n`);
await writeFile('public/licenses/unicode-source.json', JSON.stringify({
  version: '16.0.0', source,
  sha256: createHash('sha256').update(text).digest('hex'),
  mappings: Object.keys(mappings).length,
}, null, 2) + '\n');
const license = await fetch('https://www.unicode.org/license.txt');
if (!license.ok) throw new Error(`Unicode license download failed: ${license.status}`);
await writeFile('public/licenses/UNICODE.txt', await license.text());
console.log(`Generated ${Object.keys(mappings).length} Unicode 16.0.0 confusable mappings.`);
