/**
 * Generates favicon PNGs (no dependencies — pure Node.js).
 * Outputs: favicon-16.png, favicon-32.png, favicon-180.png, favicon-512.png
 * Design: black square, white capital M using 4 thick strokes.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'favicon-assets');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// ─── PNG encoder ──────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.alloc(4);  len.writeUInt32BE(d.length);
  const crc = Buffer.alloc(4);  crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}
function encodePng(size, pixels /* Uint8Array RGBA */) {
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const idat = zlib.deflateSync(Buffer.from(raw));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── ICO encoder (wraps one or more PNGs) ────────────────────────────────────

function encodeIco(pngBuffers) {
  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  // PNG data follows
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: ICO
  header.writeUInt16LE(count, 4); // image count

  let offset = headerSize;
  const entries = [];
  for (const png of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = 0; // width  (0 = 256)
    entry[1] = 0; // height (0 = 256)
    entry[2] = 0; // color count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4);         // planes
    entry.writeUInt16LE(32, 6);        // bit count
    entry.writeUInt32LE(png.length, 8); // size
    entry.writeUInt32LE(offset, 12);    // offset
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

// ─── M drawing ───────────────────────────────────────────────────────────────

function drawM(size) {
  const pixels = new Uint8Array(size * size * 4);
  // Fill black, alpha = 255
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 3] = 255;
  }

  function setWhite(x, y) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i+1] = pixels[i+2] = 255;
  }

  // Draw a thick line between (x0,y0) and (x1,y1) with given half-width
  function stroke(x0, y0, x1, y1, hw) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const xMin = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 1));
    const xMax = Math.min(size - 1, Math.ceil(Math.max(x0, x1) + hw + 1));
    const yMin = Math.max(0, Math.floor(Math.min(y0, y1) - hw - 1));
    const yMax = Math.min(size - 1, Math.ceil(Math.max(y0, y1) + hw + 1));

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        let dist;
        if (len2 < 0.001) {
          dist = Math.hypot(x - x0, y - y0);
        } else {
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
          dist = Math.hypot(x - x0 - t * dx, y - y0 - t * dy);
        }
        if (dist <= hw) setWhite(x, y);
      }
    }
  }

  // Scale geometry to this canvas size
  const s  = size / 32;
  const hw = 2.6 * s;           // half-stroke width
  const lx = 6.5 * s;           // left bar X
  const rx = 25.5 * s;          // right bar X
  const ty = 4 * s;             // top Y
  const by = 28 * s;            // bottom Y
  const mx = 16 * s;            // V-peak X (center)
  const my = 15 * s;            // V-peak Y

  stroke(lx, ty, lx, by, hw);  // left vertical
  stroke(rx, ty, rx, by, hw);  // right vertical
  stroke(lx, ty, mx, my, hw);  // left diagonal
  stroke(mx, my, rx, ty, hw);  // right diagonal

  return pixels;
}

// ─── Generate files ───────────────────────────────────────────────────────────

const sizes = [16, 32, 180, 512];
const pngs  = {};

for (const sz of sizes) {
  const pixels = drawM(sz);
  const buf    = encodePng(sz, pixels);
  pngs[sz]     = buf;
  const file   = path.join(OUT, `favicon-${sz}.png`);
  fs.writeFileSync(file, buf);
  console.log(`Written: ${path.relative(process.cwd(), file)}`);
}

// favicon.ico — embed 16x16 and 32x32
const ico = encodeIco([pngs[16], pngs[32]]);
fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
console.log('Written: favicon-assets/favicon.ico');

// SVG version (vector, scales perfectly)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#000"/>
  <text x="16" y="25" font-family="Georgia, serif" font-size="26" font-weight="bold"
        fill="#fff" text-anchor="middle">M</text>
</svg>`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg);
console.log('Written: favicon-assets/favicon.svg');

console.log('\nDone. Files are in favicon-assets/');
