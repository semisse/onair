const zlib = require('zlib');
const fs = require('fs');
const sharp = require('sharp');

// ── PNG encoder ────────────────────────────────────────────────────────────────

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}

function makePNG(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const rowSize = size * 4;
  const raw = Buffer.alloc(size * (rowSize + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (rowSize + 1) + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── Seeded RNG (xorshift32) ────────────────────────────────────────────────────

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Palettes ───────────────────────────────────────────────────────────────────

const palettes = {
  red:  { bg: [10, 5, 5],   lo: [10, 5, 5],   hi: [230, 60, 50]  },
  teal: { bg: [15, 35, 32], lo: [15, 35, 32],  hi: [95, 200, 170] }
};

// ── Icon generator ─────────────────────────────────────────────────────────────

function generateIcon(size, palette, seed = 42, frame = -1, totalFrames = 8) {
  const rng = makeRng(seed);

  const margin = 3;
  const innerW = size - margin * 2;
  const innerH = size - margin * 2;
  const rows = 5;
  const gapV = 1;
  const gapH = 1;
  const cellH = Math.floor((innerH - gapV * (rows - 1)) / rows);
  const minBarW = Math.max(2, Math.floor(innerW * 0.12));
  const maxBarW = Math.floor(innerW * 0.52);

  // Pre-generate grid
  const grid = Array.from({ length: rows }, () => {
    const bars = [];
    let x = 0;
    while (x < innerW) {
      const remaining = innerW - x;
      if (remaining < minBarW) break;
      const barW = Math.min(remaining, minBarW + Math.floor(rng() * (maxBarW - minBarW)));
      const brightness = rng();
      bars.push({ x, barW, brightness });
      x += barW + gapH;
    }
    return bars;
  });

  // Pixel buffer (RGBA)
  const pixels = new Uint8Array(size * size * 4);

  // Background: transparente (o macOS renderiza o fundo da menubar)
  for (let i = 0; i < size * size * 4; i += 4) {
    pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0;
  }

  // Bars
  grid.forEach((bars, r) => {
    const y = margin + r * (cellH + gapV);
    for (const bar of bars) {
      const t = bar.brightness;
      // brightness wave: boost bars near the wave center for this frame
      let tb = t;
      if (frame >= 0) {
        const waveY = (frame / totalFrames) * innerH;
        const dist = Math.abs((y + cellH / 2) - waveY);
        const boost = Math.max(0, 1 - dist / (innerH * 0.35));
        tb = Math.min(1, t + boost * 0.3);
      }
      const cr = Math.round(palette.lo[0] + tb * (palette.hi[0] - palette.lo[0]));
      const cg = Math.round(palette.lo[1] + tb * (palette.hi[1] - palette.lo[1]));
      const cb = Math.round(palette.lo[2] + tb * (palette.hi[2] - palette.lo[2]));
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < bar.barW; dx++) {
          const px = margin + bar.x + dx;
          const py = y + dy;
          if (px < size && py < size) {
            const i = (py * size + px) * 4;
            pixels[i] = cr; pixels[i+1] = cg; pixels[i+2] = cb; pixels[i+3] = 255;
          }
        }
      }
    }
  });

  return pixels;
}

// ── Circle icon generator ─────────────────────────────────────────────────────

function drawBar(pixels, size, x, yStart, yEnd, w, color) {
  const x0 = Math.floor(x - w / 2);
  for (let py = Math.round(yStart); py < Math.round(yEnd); py++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x0 + dx;
      if (px < 0 || px >= size || py < 0 || py >= size) continue;
      const idx = (py * size + px) * 4;
      pixels[idx] = color[0]; pixels[idx+1] = color[1];
      pixels[idx+2] = color[2]; pixels[idx+3] = 255;
    }
  }
}

function circleBarData(size) {
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.46;
  const numBars = 6;
  const spacing = (radius * 2) / numBars;
  const rng = makeRng(7);
  const bars = [];
  for (let i = 0; i < numBars; i++) {
    const x = Math.round(cx - radius + (i + 0.5) * spacing);
    const dx = x - cx;
    if (Math.abs(dx) >= radius) continue;
    const chordHalf = Math.sqrt(radius * radius - dx * dx);
    const baseFrac = 0.3 + rng() * 0.4;
    bars.push({ x, cy, chordHalf, baseFrac, idx: i, numBars });
  }
  return bars;
}

function generateCircleIcon(size, frame = -1, totalFrames = 16) {
  const pixels = new Uint8Array(size * size * 4);
  const thinW = 2, thickW = 4;
  const colorThin  = [120, 30, 25];
  const colorThick = [230, 60, 50];

  for (const bar of circleBarData(size)) {
    const { x, cy, chordHalf, baseFrac, idx, numBars } = bar;
    const barTop = cy - chordHalf, barBottom = cy + chordHalf;
    let transY = barTop + (barBottom - barTop) * baseFrac;

    if (frame >= 0) {
      const phase = (idx / numBars) * Math.PI * 2;
      const t = (frame / totalFrames) * Math.PI * 2;
      transY += Math.sin(t + phase) * chordHalf * 0.15;
      transY = Math.min(barBottom - 2, Math.max(barTop + 2, transY));
    }

    drawBar(pixels, size, x, barTop,  transY,    thinW,  colorThin);
    drawBar(pixels, size, x, transY,  barBottom, thickW, colorThick);
  }
  return pixels;
}

// ── Config ────────────────────────────────────────────────────────────────────

const SIZE   = 44;  // @2x Retina — Electron renderiza a 22px lógicos
const FRAMES = 16;

// icon-off: círculo estático branco/preto
function generateCircleIconMono(size) {
  const pixels = new Uint8Array(size * size * 4);
  const thinW = 2, thickW = 4;

  for (const bar of circleBarData(size)) {
    const { x, cy, chordHalf, baseFrac } = bar;
    const barTop = cy - chordHalf, barBottom = cy + chordHalf;
    const transY = barTop + (barBottom - barTop) * baseFrac;
    drawBar(pixels, size, x, barTop, transY,    thinW,  [200, 200, 200]);
    drawBar(pixels, size, x, transY, barBottom, thickW, [255, 255, 255]);
  }
  return pixels;
}

// icon-on: frames animados (red)
for (let f = 0; f < FRAMES; f++) {
  fs.writeFileSync(`./icon-on-${f}.png`, makePNG(generateCircleIcon(SIZE, f, FRAMES), SIZE));
}
console.log(`icon-on-0..${FRAMES - 1}.png criados (circle animated red)`);

// icon-off: círculo estático branco/preto
fs.writeFileSync('./icon-off.png', makePNG(generateCircleIconMono(SIZE), SIZE));
console.log('icon-off.png criado (circle mono)');

// icon-teal: círculo estático teal (para menu "Turn Off Air")
function generateCircleIconTeal(size) {
  const pixels = new Uint8Array(size * size * 4);
  for (const bar of circleBarData(size)) {
    const { x, cy, chordHalf, baseFrac } = bar;
    const barTop = cy - chordHalf, barBottom = cy + chordHalf;
    const transY = barTop + (barBottom - barTop) * baseFrac;
    drawBar(pixels, size, x, barTop, transY,    2, [40, 120, 100]);
    drawBar(pixels, size, x, transY, barBottom, 4, [95, 200, 170]);
  }
  return pixels;
}
fs.writeFileSync('./icon-teal.png', makePNG(generateCircleIconTeal(SIZE), SIZE));
console.log('icon-teal.png criado');
