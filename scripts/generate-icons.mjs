// Generates Ringlet's icon sources without any image dependencies:
//   src-tauri/icons/source/app-icon.png  (1024², fed to `tauri icon`)
//   src-tauri/icons/tray-template.png    (macOS menu bar, template image)
//   src-tauri/icons/tray-color.png       (Windows notification area)
// Shapes are drawn with signed distance functions and 4×4 supersampling.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- SDF helpers (coordinates in 0..1 space) -------------------------------
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
// Ring arc starting at 12 o'clock, clockwise, `sweep` in turns, round caps.
const sdArc = (x, y, cx, cy, radius, half, sweep) => {
  const dx = x - cx;
  const dy = y - cy;
  let a = Math.atan2(dx, -dy); // 0 at top, clockwise positive
  if (a < 0) a += Math.PI * 2;
  const end = sweep * Math.PI * 2;
  if (a <= end) return Math.abs(Math.hypot(dx, dy) - radius) - half;
  const cap = (ang) => Math.hypot(x - (cx + Math.sin(ang) * radius), y - (cy - Math.cos(ang) * radius)) - half;
  return Math.min(cap(0), cap(end));
};
const sdRing = (x, y, cx, cy, radius, half) => Math.abs(Math.hypot(x - cx, y - cy) - radius) - half;

function render(size, shade) {
  const out = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size;
          const y = (py + (sy + 0.5) / S) / size;
          const [cr, cg, cb, ca] = shade(x, y);
          // Premultiplied accumulation.
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = S * S;
      const i = (py * size + px) * 4;
      out[i + 3] = Math.round((a / n) * 255);
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
    }
  }
  return out;
}

const mix = (a, b, t) => a + (b - a) * t;
const over = (top, bottom) => {
  const [tr, tg, tb, ta] = top;
  const [br, bg, bb, ba] = bottom;
  const oa = ta + ba * (1 - ta);
  if (oa === 0) return [0, 0, 0, 0];
  return [
    (tr * ta + br * ba * (1 - ta)) / oa,
    (tg * ta + bg * ba * (1 - ta)) / oa,
    (tb * ta + bb * ba * (1 - ta)) / oa,
    oa,
  ];
};

// --- App icon: coral squircle with a white progress ring -------------------
function appIcon(x, y) {
  const inside = sdRoundRect(x, y, 0.5, 0.5, 0.40, 0.40, 0.18) <= 0;
  if (!inside) return [0, 0, 0, 0];
  const t = y; // vertical gradient
  let px = [mix(255, 238, t), mix(140, 88, t), mix(118, 70, t), 1];
  // Faint top sheen.
  const sheen = Math.max(0, 0.16 - y * 0.25);
  px = over([255, 255, 255, sheen], px);
  const track = sdRing(x, y, 0.5, 0.5, 0.215, 0.034) <= 0;
  if (track) px = over([255, 255, 255, 0.3], px);
  const arc = sdArc(x, y, 0.5, 0.5, 0.215, 0.034, 0.72) <= 0;
  if (arc) px = over([255, 255, 255, 1], px);
  const dot = Math.hypot(x - 0.5, y - 0.5) <= 0.045;
  if (dot) px = over([255, 255, 255, 0.95], px);
  return px;
}

function trayTemplate(x, y) {
  let px = [0, 0, 0, 0];
  if (sdRing(x, y, 0.5, 0.5, 0.34, 0.075) <= 0) px = over([0, 0, 0, 0.35], px);
  if (sdArc(x, y, 0.5, 0.5, 0.34, 0.075, 0.72) <= 0) px = over([0, 0, 0, 1], px);
  if (Math.hypot(x - 0.5, y - 0.5) <= 0.085) px = over([0, 0, 0, 1], px);
  return px;
}

function trayColor(x, y) {
  let px = [0, 0, 0, 0];
  if (sdRing(x, y, 0.5, 0.5, 0.34, 0.085) <= 0) px = over([255, 114, 94, 0.35], px);
  if (sdArc(x, y, 0.5, 0.5, 0.34, 0.085, 0.72) <= 0) px = over([255, 114, 94, 1], px);
  if (Math.hypot(x - 0.5, y - 0.5) <= 0.09) px = over([255, 114, 94, 1], px);
  return px;
}

const write = (rel, size, shade) => {
  const file = resolve(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png(size, size, render(size, shade)));
  console.log("wrote", rel);
};

write("src-tauri/icons/source/app-icon.png", 1024, appIcon);
write("src-tauri/icons/tray-template.png", 44, trayTemplate);
write("src-tauri/icons/tray-color.png", 32, trayColor);
write("public/icon.png", 128, appIcon);
