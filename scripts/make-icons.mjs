// 앱 아이콘 생성. node scripts/make-icons.mjs
// 시안 팔레트만 쓰는 사각형 몇 개라 이미지 라이브러리를 넣지 않고 PNG를 직접 쓴다.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const INK = [0x34, 0x17, 0x0d]
const CREAM = [0xf7, 0xf4, 0xed]
const TAN = [0xc8, 0xa9, 0x6b]

const CRC = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 스캔라인마다 필터 바이트 0을 앞에 붙인다.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function canvas(size, bg) {
  const px = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg[0]
    px[i * 4 + 1] = bg[1]
    px[i * 4 + 2] = bg[2]
    px[i * 4 + 3] = 255
  }
  return px
}

function rect(px, size, x0, y0, w, h, color) {
  const x1 = Math.min(size, Math.round(x0 + w))
  const y1 = Math.min(size, Math.round(y0 + h))
  for (let y = Math.max(0, Math.round(y0)); y < y1; y++) {
    for (let x = Math.max(0, Math.round(x0)); x < x1; x++) {
      const i = (y * size + x) * 4
      px[i] = color[0]
      px[i + 1] = color[1]
      px[i + 2] = color[2]
      px[i + 3] = 255
    }
  }
}

/**
 * 시안의 하드 섀도우 모티프 그대로: 크림 바탕 위에 ink 그림자(블러 0)를 깔고
 * 그 위에 tan 면을 얹은 뒤 ink 테두리를 두른다.
 * frame=false 는 maskable 용 — 바깥 프레임을 빼고 안전영역 안으로 줄인다.
 */
function icon(size, frame) {
  const px = canvas(size, CREAM)
  const u = size / 100
  if (frame) {
    const t = 6 * u
    rect(px, size, 0, 0, size, t, INK)
    rect(px, size, 0, size - t, size, t, INK)
    rect(px, size, 0, 0, t, size, INK)
    rect(px, size, size - t, 0, t, size, INK)
  }
  const m = frame ? 24 * u : 30 * u // maskable 은 안쪽 80% 안에 들어가야 한다
  const s = size - m * 2
  const d = 7 * u // 하드 섀도우 오프셋
  const b = 5 * u // 테두리 두께
  rect(px, size, m + d, m + d, s, s, INK) // 그림자
  rect(px, size, m, m, s, s, INK) // 테두리
  rect(px, size, m + b, m + b, s - b * 2, s - b * 2, TAN) // 면
  return png(size, px)
}

const OUT = [
  ['public/icon-192.png', icon(192, true)],
  ['public/icon-512.png', icon(512, true)],
  ['public/maskable-512.png', icon(512, false)],
  ['public/apple-touch-icon.png', icon(180, true)],
]

for (const [path, buf] of OUT) {
  writeFileSync(path, buf)
  console.log(path, buf.length, 'bytes')
}
