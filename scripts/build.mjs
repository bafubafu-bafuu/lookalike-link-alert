import { build } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await build({
  build: {
    outDir: 'dist', emptyOutDir: true, modulePreload: false,
    rollupOptions: {
      input: {
        popup: 'popup.html', options: 'options.html', warning: 'warning.html',
        background: 'src/background/index.ts',
      },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    },
  },
});
await build({
  publicDir: false,
  build: {
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: 'src/content/index.ts', name: 'LookalikeLinkAlertContent', formats: ['iife'], fileName: () => 'content.js' },
  },
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, crc]);
}
await mkdir('dist/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size, dy = (y + 0.5) / size;
      const shield = dy > 0.12 && dy < 0.9 && Math.abs(dx - 0.5) < (dy < 0.55 ? 0.32 : (0.92 - dy) * 0.87);
      const mark = (Math.abs(dx - 0.5) < 0.035 && dy > 0.3 && dy < 0.55) ||
        (Math.abs(dx - 0.5) < 0.035 && dy > 0.64 && dy < 0.71);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set(shield ? mark ? [255, 255, 255, 255] : [26, 95, 91, 255] : [0, 0, 0, 0], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  await writeFile(`dist/icons/${size}.png`, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
for (const [name, path] of [
  ['tldts', 'node_modules/tldts/LICENSE'], ['tldts-core', 'node_modules/tldts-core/LICENSE'],
  ['punycode', 'node_modules/punycode/LICENSE-MIT.txt'],
]) {
  await writeFile(`dist/licenses/${name}.txt`, await readFile(path));
}
for (const [source, target] of [
  ['LICENSE', 'LICENSE.txt'], ['PRIVACY.md', 'PRIVACY.txt'], ['THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.txt'],
]) {
  await writeFile(`dist/${target}`, await readFile(source));
}
