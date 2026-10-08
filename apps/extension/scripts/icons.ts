/**
 * Programmatic icon rendering (no image dependencies): the Elevate mark — a dark rounded square,
 * a light "step" line rising left to right, a small green dot at its top-right end — rasterized
 * with 4×4 supersampling and written as RGBA PNG with node:zlib.
 */
import { deflateSync } from "node:zlib";

type RGB = [number, number, number];
const BG: RGB = [0x15, 0x14, 0x0f]; // --ink
const FG: RGB = [0xf4, 0xf2, 0xec]; // --paper
const DOT: RGB = [0x4c, 0xcf, 0x9c]; // dark-theme accent (reads on ink)

// Geometry in a 32-unit box, identical to the side panel's inline mark.
const STEP: [number, number][] = [[7, 23], [13, 23], [13, 18], [19, 18], [19, 13], [24, 13]];
const DOT_C: [number, number] = [25, 9];

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundedRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  return Math.hypot(x - cx, y - cy) <= r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function renderIcon(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const S = 4;
  // Thicker strokes at tiny sizes so the mark survives 16px.
  const stroke = size <= 16 ? 3.4 : size <= 32 ? 3 : 2.6;
  const dotR = size <= 16 ? 3.2 : 2.8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0, dot = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const ux = ((x + (sx + 0.5) / S) / size) * 32;
          const uy = ((y + (sy + 0.5) / S) / size) * 32;
          if (!insideRoundedRect(ux, uy, 1, 1, 31, 31, 8)) continue;
          if (Math.hypot(ux - DOT_C[0], uy - DOT_C[1]) <= dotR) { dot++; continue; }
          let d = Infinity;
          for (let i = 0; i < STEP.length - 1; i++) {
            const a = STEP[i]!, b = STEP[i + 1]!;
            d = Math.min(d, distToSegment(ux, uy, a[0], a[1], b[0], b[1]));
          }
          if (d <= stroke / 2) fg++;
          else bg++;
        }
      }
      const total = S * S;
      const covered = bg + fg + dot;
      const o = (y * size + x) * 4;
      if (!covered) continue;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round((BG[c]! * bg + FG[c]! * fg + DOT[c]! * dot) / covered);
      px[o + 3] = Math.round((covered / total) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))]);
}
