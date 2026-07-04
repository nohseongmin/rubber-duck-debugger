'use strict';
/*
 * 외부 의존성 없이 순수 Node(zlib)로 러버덕 아이콘 PNG를 생성한다.
 * 바이너리 애셋을 저장소에 커밋하지 않고 언제든 재생성할 수 있게 하기 위함.
 * 나중에 진짜 오리 스프라이트로 assets/icon.png, assets/tray.png를 교체하면 됨.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// draw(x, y, w, h) -> [r, g, b, a]
function makePng(size, draw) {
  const w = size, h = size;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const px = draw(x, y, w, h);
      const off = y * stride + 1 + x * 4;
      raw[off] = px[0];
      raw[off + 1] = px[1];
      raw[off + 2] = px[2];
      raw[off + 3] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// 노란 몸통 + 눈 + 주황 부리의 단순한 오리 원형
function duckDraw(x, y, w, h) {
  const fx = x / w, fy = y / h;

  // 몸통 (원)
  const cx = 0.48, cy = 0.54, r = 0.40;
  const dx = fx - cx, dy = fy - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // 부리 (오른쪽 삼각형)
  const beak =
    fx > 0.70 && fx < 0.95 &&
    fy > 0.50 && fy < 0.66 &&
    (fx - 0.70) * 0.9 > Math.abs(fy - 0.58);

  // 눈
  const eyeX = 0.58, eyeY = 0.44, eyeR = 0.055;
  const ed = Math.sqrt((fx - eyeX) ** 2 + (fy - eyeY) ** 2);

  if (ed < eyeR) return [40, 40, 40, 255];
  if (beak) return [244, 162, 60, 255];

  // 원 가장자리 안티앨리어싱
  const edge = (r - dist) * w;
  if (edge > 1) return [255, 210, 74, 255];
  if (edge > 0) return [255, 210, 74, Math.round(edge * 255)];
  return [0, 0, 0, 0];
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const targets = [
  { file: 'icon.png', size: 256 },
  { file: 'tray.png', size: 32 }
];

for (const t of targets) {
  const png = makePng(t.size, duckDraw);
  fs.writeFileSync(path.join(assetsDir, t.file), png);
  console.log(`generated assets/${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
