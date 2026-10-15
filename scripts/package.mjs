import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('dist');
const allowed = /^(?:manifest\.json|(?:popup|options|warning)\.html|(?:background|content|popup|options|warning)\.js|assets\/[\w.-]+\.(?:js|css)|icons\/(?:16|32|48|128)\.png|licenses\/[\w.-]+\.(?:txt|json)|(?:LICENSE|PRIVACY|THIRD-PARTY-NOTICES)\.txt)$/;
async function list(path) {
  const files = [];
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = join(path, item.name);
    if (item.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${relative(root, full)}`);
    if (item.isDirectory()) files.push(...await list(full));
    else files.push(relative(root, full).split('\\').join('/'));
  }
  return files;
}
const files = (await list(root)).sort();
for (const file of files) if (!allowed.test(file)) throw new Error(`Unexpected distribution file: ${file}`);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== pkg.version || manifest.manifest_version !== 3) throw new Error('Manifest version mismatch');
const required = [
  'manifest.json', 'background.js', 'content.js', 'popup.html', 'options.html', 'warning.html',
  'LICENSE.txt', 'PRIVACY.txt', 'THIRD-PARTY-NOTICES.txt',
  'licenses/UNICODE.txt', 'licenses/unicode-source.json', 'licenses/MPL-2.0.txt',
  'licenses/tldts.txt', 'licenses/tldts-core.txt', 'licenses/punycode.txt',
  ...Object.values(manifest.icons),
];
for (const file of required) if (!files.includes(file)) throw new Error(`Missing distribution file: ${file}`);
const permissions = ['storage', 'declarativeNetRequest', 'webNavigation', 'alarms'];
if (manifest.permissions.length !== permissions.length || manifest.permissions.some((item) => !permissions.includes(item))) {
  throw new Error('Unexpected extension permissions');
}
if (!manifest.content_security_policy.extension_pages.includes("connect-src 'none'")) throw new Error('Network CSP missing');
if (!manifest.content_security_policy.extension_pages.includes("frame-ancestors 'none'")) throw new Error('Framing CSP missing');
if (manifest.web_accessible_resources.length !== 1 ||
    JSON.stringify(manifest.web_accessible_resources[0].resources) !== '["warning.html"]') throw new Error('Unexpected public resources');
for (const file of files.filter((name) => /\.(js|css|html)$/.test(name))) {
  const text = await readFile(join(root, file), 'utf8');
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) throw new Error(`Dynamic code execution in ${file}`);
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(text)) throw new Error(`Network API in ${file}`);
  if (file.endsWith('.html')) {
    for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const asset = match[1].replace(/^\//, '');
      if (!files.includes(asset)) throw new Error(`Non-local or missing HTML resource: ${asset}`);
    }
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text) || /\bon\w+=/i.test(text)) throw new Error(`Inline executable HTML in ${file}`);
  }
  if (file.endsWith('.css') && /@import|url\(["']?https?:/i.test(text)) throw new Error(`Remote CSS resource in ${file}`);
}
console.log(`Distribution validated: ${files.length} allowlisted files, local assets and licenses present.`);
if (!process.argv.includes('--check')) {
  await mkdir('artifacts', { recursive: true });
  const target = resolve(`artifacts/lookalike-link-alert-${manifest.version}.zip`);
  await rm(target, { force: true });
  const result = spawnSync('zip', ['-X', '-q', target, ...files], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('ZIP creation failed');
  console.log(`Created ${target}`);
}
