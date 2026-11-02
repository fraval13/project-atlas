// Render the project's geometric SVG mark into a build icon without system tools.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const size = 512,
  scale = size / 32,
  segments = [
    [
      [16, 6],
      [27, 12],
    ],
    [
      [27, 12],
      [16, 18],
    ],
    [
      [16, 18],
      [5, 12],
    ],
    [
      [5, 12],
      [16, 6],
    ],
    [
      [5, 17],
      [16, 23],
    ],
    [
      [16, 23],
      [27, 17],
    ],
    [
      [5, 22],
      [16, 28],
    ],
    [
      [16, 28],
      [27, 22],
    ],
  ];
function distance(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
    );
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const px = (x + 0.5) / scale,
      py = (y + 0.5) / scale,
      d = Math.min(...segments.map(([a, b]) => distance(px, py, a, b))),
      edge = Math.max(0, Math.min(1, (0.7 - d) * scale + 0.5)),
      off = y * (size * 4 + 1) + 1 + x * 4;
    const radius = 5,
      cx = Math.max(radius, Math.min(32 - radius, px)),
      cy = Math.max(radius, Math.min(32 - radius, py)),
      alpha = Math.max(
        0,
        Math.min(1, (radius - Math.hypot(px - cx, py - cy)) * scale + 0.5),
      );
    for (let c = 0; c < 3; c++)
      raw[off + c] = Math.round(
        [13, 16, 24][c] * (1 - edge) + [112, 222, 195][c] * edge,
      );
    raw[off + 3] = Math.round(alpha * 255);
  }
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    head = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([head, t, data, sum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
fs.writeFileSync(
  path.join(__dirname, "../build/icon.png"),
  Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
