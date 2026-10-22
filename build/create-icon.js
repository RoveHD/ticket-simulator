'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256;
// The 32-pixel arcade tile keeps the T silhouette with hard, integer blocks.
const background = [22, 19, 41];
const cream = [244, 229, 191], coral = [228, 107, 89], teal = [88, 183, 161];
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
const pixels = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const gx = Math.floor(x / 8), gy = Math.floor(y / 8);
  const inside = gx >= 1 && gx <= 30 && gy >= 3 && gy <= 28 || gx >= 3 && gx <= 28 && gy >= 1 && gy <= 30;
  const letterAt = (px, py) => px >= 7 && px <= 24 && py >= 7 && py <= 11 || px >= 13 && px <= 18 && py >= 12 && py <= 24;
  const letter = letterAt(gx, gy), shadow = letterAt(gx - 1, gy - 2);
  const offset = y * (size * 4 + 1) + 1 + x * 4;
  const rim = gx === 3 || gx === 28 || gy === 3 || gy === 28;
  const color = letter ? cream : shadow ? coral : rim ? teal : background;
  pixels.set([...color, inside ? 255 : 0], offset);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const icoHeader = Buffer.alloc(22); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4); icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12); icoHeader.writeUInt32LE(png.length, 14); icoHeader.writeUInt32LE(22, 18);
const dir = path.join(__dirname, '..', 'assets'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png); fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([icoHeader, png]));
