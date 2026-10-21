'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256;
// Match the app's operations palette while retaining the original T silhouette.
const background = [16, 26, 48];
const violet = [180, 151, 255];
const cyan = [66, 221, 227];
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
  const dx = Math.max(33 - x, x - 222, 0), dy = Math.max(33 - y, y - 222, 0);
  const inside = dx * dx + dy * dy <= 33 * 33;
  const letter = (x >= 55 && x <= 199 && y >= 62 && y <= 103) || (x >= 107 && x <= 147 && y >= 95 && y <= 198);
  const offset = y * (size * 4 + 1) + 1 + x * 4;
  const progress = Math.max(0, Math.min(1, (y - 62) / (198 - 62)));
  const foreground = violet.map((channel, index) => Math.round(channel + (cyan[index] - channel) * progress));
  pixels.set(letter ? [...foreground, 255] : [...background, inside ? 255 : 0], offset);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const icoHeader = Buffer.alloc(22); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4); icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12); icoHeader.writeUInt32LE(png.length, 14); icoHeader.writeUInt32LE(22, 18);
const dir = path.join(__dirname, '..', 'assets'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png); fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([icoHeader, png]));
