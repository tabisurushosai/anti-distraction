// Generates icon16.png, icon48.png, icon128.png with no external deps.
// Design: rounded-square teal background + a simple white "focus" target (ring + dot).
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, pixels) {
  // pixels: Uint8Array of length size*size*4 (RGBA)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // filter byte 0 at start of every row
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const corner = size * 0.22;            // rounded-square corner radius
  const bg = [13, 148, 136];             // teal-600
  const ring = [255, 255, 255];          // white
  const dot = [255, 255, 255];
  const ringOuter = size * 0.36;
  const ringInner = size * 0.26;
  const dotR = size * 0.10;

  function inRoundedSquare(x, y) {
    const half = (size - 1) / 2;
    const dx = Math.abs(x - half) - (half - corner);
    const dy = Math.abs(y - half) - (half - corner);
    if (dx <= 0 || dy <= 0) return true;
    return dx * dx + dy * dy <= corner * corner;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedSquare(x, y)) {
        px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
        continue;
      }
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let r = bg[0], g = bg[1], b = bg[2];
      if (d <= dotR) { r = dot[0]; g = dot[1]; b = dot[2]; }
      else if (d >= ringInner && d <= ringOuter) { r = ring[0]; g = ring[1]; b = ring[2]; }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return px;
}

for (const size of [16, 48, 128]) {
  const png = makePng(size, render(size));
  writeFileSync(new URL(`./icon${size}.png`, import.meta.url), png);
  console.log(`wrote icon${size}.png (${png.length} bytes)`);
}
