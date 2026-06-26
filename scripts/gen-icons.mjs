// Generates the PWA / Apple touch icons: a white checkmark on the indigo accent.
// Dependency-free PNG encoder (zlib only). Run: `node scripts/gen-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

// ── CRC32 ───────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Prepend a 0 (None) filter byte to each scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing ─────────────────────────────────────────────────────────
const BG = [99, 102, 241]; // #6366f1 indigo accent
const FG = [255, 255, 255]; // white check

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp01(t);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  // Checkmark control points in normalized [0,1] space.
  const P = [
    [0.27, 0.52],
    [0.43, 0.68],
    [0.75, 0.33],
  ];
  const half = 0.06; // half stroke width
  const edge = 1.5 / size; // ~1.5px anti-alias feather

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const d = Math.min(
        distToSeg(u, v, P[0][0], P[0][1], P[1][0], P[1][1]),
        distToSeg(u, v, P[1][0], P[1][1], P[2][0], P[2][1])
      );
      const alpha = 1 - smoothstep(half - edge, half + edge, d);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(BG[0] + (FG[0] - BG[0]) * alpha);
      rgba[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * alpha);
      rgba[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * alpha);
      rgba[i + 3] = 255; // fully opaque
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of targets) {
  writeFileSync(join(OUT_DIR, name), renderIcon(size));
  console.log(`wrote ${name} (${size}x${size})`);
}
