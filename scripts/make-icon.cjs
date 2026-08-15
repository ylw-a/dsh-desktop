// Generate build/icon.ico + build/icon.png from the DSH whale favicon.
// Usage: node scripts/make-icon.cjs
'use strict';

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join('node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'favicon.svg');
const BRAND = '#4D6BFE'; // DeepSeek whale blue

let svg = fs.readFileSync(SRC, 'utf8');
svg = svg
  .replace(/<svg([^>]*)\sfill="none"([^>]*)>/i, '<svg$1$2>') // drop fill="none" on root
  .replace(/<style>[\s\S]*?<\/style>/i, '') // drop prefers-color-scheme style
  .replace(/width="50\.000000"\s+height="50\.000000"/i, 'width="256" height="256"') // render at 256
  .replace(/fill="#000"/i, 'fill="' + BRAND + '"'); // recolor whale from black to brand blue

(async () => {
  fs.mkdirSync('build', { recursive: true });

  const png256 = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(path.join('build', 'icon.png'), png256);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const s of sizes) {
    const buf = s === 256 ? png256 : await sharp(png256).resize(s, s).png().toBuffer();
    buffers.push({ size: s, buf });
  }

  // Assemble a multi-size ICO (PNG-compressed entries, Vista+).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(buffers.length, 4); // count

  let offset = 6 + 16 * buffers.length;
  const entries = buffers.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size === 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8); // bytes in resource
    e.writeUInt32LE(offset, 12); // offset
    offset += buf.length;
    return e;
  });

  const ico = Buffer.concat([header, ...entries, ...buffers.map((b) => b.buf)]);
  fs.writeFileSync(path.join('build', 'icon.ico'), ico);

  console.log('wrote build/icon.ico (' + ico.length + ' bytes), build/icon.png (' + png256.length + ' bytes)');
})().catch((err) => {
  console.error('icon generation failed:', err);
  process.exit(1);
});
