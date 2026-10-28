const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPNG(width, height, drawFn, samples = 4) {
  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);
  const inv = 1 / (samples * samples);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const [r, g, b, a] = drawFn(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, width, height);
          const an = a / 255;
          rSum += r * an;
          gSum += g * an;
          bSum += b * an;
          aSum += a;
        }
      }
      const a = Math.round(aSum * inv);
      let r = 0, g = 0, b = 0;
      if (a > 0) {
        r = Math.min(255, Math.round((rSum * inv) / (a / 255)));
        g = Math.min(255, Math.round((gSum * inv) / (a / 255)));
        b = Math.min(255, Math.round((bSum * inv) / (a / 255)));
      }
      const o = rowOffset + 1 + x * 4;
      rawData[o] = r;
      rawData[o + 1] = g;
      rawData[o + 2] = b;
      rawData[o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(rawData)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function inRoundedRect(px, py, rx, ry, rw, rh, rad) {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false;
  const il = rx + rad, ir = rx + rw - rad;
  const it = ry + rad, ib = ry + rh - rad;
  if (px >= il && px <= ir) return true;
  if (py >= it && py <= ib) return true;
  const dx = px < il ? px - il : px - ir;
  const dy = py < it ? py - it : py - ib;
  return dx * dx + dy * dy <= rad * rad;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function rotatePoint(px, py, cx, cy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const dx = px - cx, dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

// Graduation cap + open book on a navy -> indigo tile
function drawLogo(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  if (!inRoundedRect(nx, ny, 0.02, 0.02, 0.96, 0.96, 0.235)) return [0, 0, 0, 0];

  const t = Math.max(0, Math.min(1, nx * 0.62 + ny * 0.38));
  let r = lerp(18, 70, t);
  let g = lerp(38, 58, t);
  let b = lerp(74, 205, t);

  // soft top-left sheen for depth
  const sheen = 1 - Math.min(1, Math.hypot(nx - 0.18, ny - 0.1) / 0.55);
  const lift = Math.round(sheen * sheen * 16);
  r += lift;
  g += lift;
  b += lift + 4;

  const small = w < 44;

  // tassel cord hanging from the cap's right tip
  if (!small) {
    if (distToSegment(nx, ny, 0.775, 0.385, 0.815, 0.58) <= 0.019 ||
        Math.hypot(nx - 0.815, (ny - 0.612) * 0.92) <= 0.035) {
      return [226, 166, 42, 255];
    }
  }

  // mortarboard diamond
  const dx = (nx - 0.495) / 0.297;
  const dy = (ny - 0.368) / 0.158;
  if (Math.pow(Math.abs(dx), 1.12) + Math.pow(Math.abs(dy), 1.12) <= 1) {
    const shade = Math.max(0, Math.min(1, (ny - 0.21) / 0.32));
    return [lerp(250, 233, shade), lerp(205, 168, shade), lerp(80, 44, shade), 255];
  }

  // open book: two pages tilted towards the spine
  const white = [250, 252, 255, 255];
  if (small) {
    if (inRoundedRect(nx, ny, 0.28, 0.665, 0.44, 0.108, 0.03)) return white;
  } else {
    const tilt = 0.1;
    const [lx, ly] = rotatePoint(nx, ny, 0.389, 0.712, -tilt);
    if (inRoundedRect(lx, ly, 0.389 - 0.111, 0.712 - 0.059, 0.222, 0.118, 0.026)) return white;
    const [rx, ry] = rotatePoint(nx, ny, 0.611, 0.712, tilt);
    if (inRoundedRect(rx, ry, 0.611 - 0.111, 0.712 - 0.059, 0.222, 0.118, 0.026)) return white;
  }

  return [r, g, b, 255];
}

function drawPreview(x, y, w, h) {
  if (y < h / 2) return [246, 247, 251, 255];
  if (y < h / 2 + 1) return [214, 218, 228, 255];
  return [16, 24, 40, 255];
}

const PREVIEW_W = 480;
const PREVIEW_H = 340;
const slots = [
  { size: 16, x: 26 },
  { size: 32, x: 70 },
  { size: 48, x: 130 },
  { size: 128, x: 210 }
];
const bands = [34, 180];

function previewPixel(px, py, w, h) {
  for (const bandTop of bands) {
    for (const s of slots) {
      const ix = s.x + (s.size === 128 ? 0 : 0);
      const iy = bandTop + (128 - s.size) / 2;
      if (px >= ix && px < ix + s.size && py >= iy && py < iy + s.size) {
        return drawLogo(px - ix, py - iy, s.size, s.size);
      }
    }
  }
  return drawPreview(px, py, w, h);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), createPNG(size, size, drawLogo));
  console.log(`icons/icon${size}.png`);
}
fs.writeFileSync(path.join(__dirname, 'preview.png'), createPNG(PREVIEW_W, PREVIEW_H, previewPixel));
console.log('tools/preview.png');
