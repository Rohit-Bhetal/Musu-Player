/**
 * Generates everything binary this repo needs, so none of it has to be committed:
 *   public/icons/*.png   app + maskable + apple-touch icons
 *   public/mock/*.wav    6 royalty-free generated tone tracks
 *   public/mock/*.png    generated abstract cover art
 *   public/mock/*.lrc    sample synced lyrics (+ one plain .txt)
 *   public/mock/catalog.json
 * Run by `predev` / `prebuild`. No dependencies: PNG and WAV are written by hand.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = join(ROOT, 'public', 'icons')
const MOCK = join(ROOT, 'public', 'mock')

/* ---------------------------------------------------------------- PNG ---- */

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** @param {number} w @param {number} h @param {Buffer} rgba */
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** @param {number} size @param {(x:number,y:number)=>[number,number,number]} shade */
function paint(size, shade) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, y / size)
      const i = (y * size + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))

/** hsl -> rgb, h in turns */
function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/* ------------------------------------------------------------- icons ---- */

// A music note drawn with plain pixel maths; `inset` shrinks it into the
// maskable safe zone (centre 80%).
function noteIcon(size, inset) {
  const bg0 = [0x0b, 0x0b, 0x0f]
  const bg1 = [0x1b, 0x24, 0x4a]
  const fg = [0x61, 0x8d, 0xff]
  return paint(size, (u, v) => {
    const bg = mix(bg0, bg1, u * 0.5 + v * 0.8)
    // map into glyph space
    const gx = (u - 0.5) / inset + 0.5
    const gy = (v - 0.5) / inset + 0.5
    const head = Math.hypot((gx - 0.38) * 1.0, (gy - 0.70) * 1.15) < 0.155
    const stem = gx > 0.515 && gx < 0.575 && gy > 0.24 && gy < 0.70
    const flagT = (gy - 0.24) / 0.20
    const flag = gy > 0.24 && gy < 0.44 && gx > 0.515 + flagT * 0.10 && gx < 0.515 + flagT * 0.10 + 0.115
    return head || stem || flag ? fg : bg
  })
}

/* ------------------------------------------------------------- audio ---- */

/** @param {Float32Array} samples */
function encodeWav(samples, sampleRate) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2)
  }
  return buf
}

const RATE = 22050
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16]

/** Deterministic pseudo-random so every run produces identical files. */
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function renderTrack(seed, rootMidi, bpm, seconds) {
  const rand = rng(seed)
  const total = Math.round(seconds * RATE)
  const out = new Float32Array(total)
  const beat = (60 / bpm) * RATE
  for (let i = 0; i * beat < total; i++) {
    const step = PENTATONIC[Math.floor(rand() * PENTATONIC.length)]
    const midi = rootMidi + step - (rand() < 0.25 ? 12 : 0)
    const freq = 440 * Math.pow(2, (midi - 69) / 12)
    const start = Math.round(i * beat)
    const len = Math.min(Math.round(beat * 1.6), total - start)
    for (let j = 0; j < len; j++) {
      const t = j / RATE
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 3.2)
      const phase = 2 * Math.PI * freq * t
      out[start + j] +=
        env * 0.28 * (Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.12 * Math.sin(phase * 3))
      out[start + j] += env * 0.10 * Math.sin(phase / 2) // sub octave for body
    }
  }
  // gentle fade in/out so nothing clicks
  const fade = Math.round(0.15 * RATE)
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade
    out[total - 1 - i] *= i / fade
  }
  return encodeWav(out, RATE)
}

/* ------------------------------------------------------------ tracks ---- */

const TRACKS = [
  { id: 'mock-1', title: 'Morning Static', artist: 'Mock Ensemble', album: 'Test Tones Vol. 1', hue: 0.03, root: 60, bpm: 104, sec: 21 },
  { id: 'mock-2', title: 'Blue Hour', artist: 'Sine Collective', album: 'Test Tones Vol. 1', hue: 0.58, root: 57, bpm: 88, sec: 24 },
  { id: 'mock-3', title: 'Paper Lanterns', artist: 'Mock Ensemble', album: 'Test Tones Vol. 1', hue: 0.12, root: 62, bpm: 120, sec: 19 },
  { id: 'mock-4', title: 'Gravity Well', artist: 'Null Pointer', album: 'Signal Paths', hue: 0.75, root: 55, bpm: 76, sec: 26 },
  { id: 'mock-5', title: 'Slow Tide', artist: 'Sine Collective', album: 'Signal Paths', hue: 0.45, root: 59, bpm: 92, sec: 23 },
  { id: 'mock-6', title: 'Night Bus', artist: 'Null Pointer', album: 'Signal Paths', hue: 0.88, root: 64, bpm: 132, sec: 18 },
]

const LYRIC_LINES = [
  'This is a generated test track',
  'No copyrighted words here',
  'Just sine waves and silence',
  'Counting every second now',
  'Scroll along with the line',
  'Tap a line to seek to it',
  'The chorus goes like this',
  'Offline and still singing',
  'Nothing streams from anywhere',
  'Stored inside your phone',
]

const stamp = (t) =>
  `[${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}]`

function makeLrc(track) {
  const lines = [`[ti:${track.title}]`, `[ar:${track.artist}]`, `[al:${track.album}]`, '[offset:0]']
  const gap = track.sec / (LYRIC_LINES.length + 2)
  // the title line is repeated at the start and near the end: two timestamps, one line
  lines.push(`${stamp(0.4)}${stamp(track.sec - gap)}${track.title}`)
  LYRIC_LINES.forEach((text, i) => lines.push(`${stamp(gap * (i + 1))}${text}`))
  return lines.join('\n') + '\n'
}

function cover(track) {
  const a = hsl(track.hue, 0.72, 0.52)
  const b = hsl((track.hue + 0.14) % 1, 0.65, 0.22)
  const c = hsl((track.hue + 0.5) % 1, 0.8, 0.62)
  return paint(512, (u, v) => {
    let col = mix(a, b, u * 0.45 + v * 0.85)
    const d = Math.hypot(u - 0.3, v - 0.32)
    if (d < 0.26) col = mix(col, c, 1 - d / 0.26)
    const band = (u * 0.8 + v * 1.4) % 0.34
    if (band < 0.055) col = mix(col, [255, 255, 255], 0.14)
    return col
  })
}

/* --------------------------------------------------------------- run ---- */

mkdirSync(ICONS, { recursive: true })
mkdirSync(MOCK, { recursive: true })

writeFileSync(join(ICONS, 'icon-192.png'), noteIcon(192, 1))
writeFileSync(join(ICONS, 'icon-512.png'), noteIcon(512, 1))
writeFileSync(join(ICONS, 'maskable-512.png'), noteIcon(512, 0.72))
writeFileSync(join(ICONS, 'apple-touch-icon.png'), noteIcon(180, 1))

for (const t of TRACKS) {
  writeFileSync(join(MOCK, `${t.id}.wav`), renderTrack(parseInt(t.id.slice(5), 10) * 7919, t.root, t.bpm, t.sec))
  writeFileSync(join(MOCK, `${t.id}.png`), cover(t))
  // mock-6 ships plain text instead of LRC so the plain-lyrics path is covered
  if (t.id === 'mock-6') writeFileSync(join(MOCK, `${t.id}.txt`), LYRIC_LINES.join('\n') + '\n')
  else writeFileSync(join(MOCK, `${t.id}.lrc`), makeLrc(t))
}

writeFileSync(
  join(MOCK, 'catalog.json'),
  JSON.stringify(
    {
      tracks: TRACKS.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        durationSec: t.sec,
        artworkUrl: `/mock/${t.id}.png`,
        streamUrl: `/mock/${t.id}.wav`,
        lyricsUrl: t.id === 'mock-6' ? `/mock/${t.id}.txt` : `/mock/${t.id}.lrc`,
      })),
      albums: [
        { id: 'test-tones-vol-1', name: 'Test Tones Vol. 1', trackIds: ['mock-1', 'mock-2', 'mock-3'] },
        { id: 'signal-paths', name: 'Signal Paths', trackIds: ['mock-4', 'mock-5', 'mock-6'] },
      ],
    },
    null,
    2,
  ) + '\n',
)

console.log(`generated ${TRACKS.length} mock tracks + icons`)
