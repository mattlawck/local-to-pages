// Generates a 64x64 PNG icon with a purple background and white lightning bolt
// Uses only Node.js built-ins (zlib) — no external dependencies
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 64;

// Build raw RGBA pixel data
const pixels = Buffer.alloc(SIZE * SIZE * 4);

// Lightning bolt vertices (scaled to 64x64)
// Path: M38 8 L22 34 L30 34 L26 56 L44 28 L36 28 Z
function pointInLightning(x, y) {
  // Simple polygon fill check for the lightning bolt shape
  const poly = [
    [38, 8], [22, 34], [30, 34], [26, 56], [44, 28], [36, 28]
  ];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function roundedRectMask(x, y, radius) {
  const cx = SIZE / 2, cy = SIZE / 2;
  const half = SIZE / 2 - 0.5;
  const dx = Math.max(Math.abs(x - cx) - half + radius, 0);
  const dy = Math.max(Math.abs(y - cy) - half + radius, 0);
  return dx * dx + dy * dy <= radius * radius;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;
    const inRect = roundedRectMask(x, y, 12);

    if (!inRect) {
      // Transparent outside rounded rect
      pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0;
    } else if (pointInLightning(x, y)) {
      // White lightning bolt
      pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 242;
    } else {
      // Purple gradient background: top #7b61ff → bottom #4f3fd4
      const t = y / SIZE;
      const r = Math.round(0x7b + t * (0x4f - 0x7b));
      const g = Math.round(0x61 + t * (0x3f - 0x61));
      const b = Math.round(0xff + t * (0xd4 - 0xff));
      pixels[idx] = r; pixels[idx+1] = g; pixels[idx+2] = b; pixels[idx+3] = 255;
    }
  }
}

// Build PNG file
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// IDAT — raw scanlines with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const compressed = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(outPath, png);
console.log('icon.png written to', outPath);
