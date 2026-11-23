/**
 * Generates everything binary this repo needs, so none of it has to be committed:
 *   public/icons/*.png   app + maskable + apple-touch icons
 *   public/mock/*.wav    6 royalty-free generated tone tracks
 *   public/mock/*.png    generated abstract cover art
 *   public/mock/*.lrc    sample synced lyrics (+ one plain .txt)
 *   public/mock/catalog.json
 * Run by `predev` / `prebuild`. No dependencies: PNG and WAV are written by hand.
 *
 * The app icons are downscaled from assets/logo.png — the brand mark. It lives
 * outside public/ on purpose: at 1.1 MB it must never reach the service worker
 * precache, which only globs what is actually served.
 */
import { deflateSync, inflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = join(ROOT, 'public', 'icons')
const MOCK = join(ROOT, 'public', 'mock')
const LOGO = join(ROOT, 'assets', 'logo.png')

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

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Per-scanline adaptive filtering, picked by the spec's minimum-sum-of-absolute-
 * differences heuristic. Filter 0 alone leaves the smooth logo gradients almost
 * incompressible — this is what keeps the precached icons at tens of KB.
 * @param {Buffer} raw @param {Buffer} prev @param {number} stride
 */
function filterRow(raw, prev, stride) {
  let best = null
  let bestScore = Infinity
  for (let type = 0; type <= 4; type++) {
    const out = Buffer.alloc(stride)
    let score = 0
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? raw[i - 4] : 0
      const b = prev[i]
      const c = i >= 4 ? prev[i - 4] : 0
      const sub = type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : type === 4 ? paeth(a, b, c) : 0
      const v = (raw[i] - sub) & 0xff
      out[i] = v
      score += v < 128 ? v : 256 - v
    }
    if (score < bestScore) {
      bestScore = score
      best = { type, out }
    }
  }
  return best
}

/** @param {number} w @param {number} h @param {Buffer} rgba */
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride)
    const { type, out } = filterRow(row, prev, stride)
    raw[y * (stride + 1)] = type
    out.copy(raw, y * (stride + 1) + 1)
    prev = row
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

/**
 * Minimal PNG reader: 8-bit RGBA, non-interlaced — which is what assets/logo.png
 * is, and all this needs to read. Anything else throws rather than decode wrong.
 * @param {Buffer} buf
 */
function decodePng(buf) {
  let w = 0
  let h = 0
  const idat = []
  for (let i = 8; i < buf.length; ) {
    const len = buf.readUInt32BE(i)
    const type = buf.toString('latin1', i + 4, i + 8)
    const data = buf.subarray(i + 8, i + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('gen-assets: logo.png must be 8-bit RGBA and non-interlaced')
      }
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    i += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  const rgba = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const type = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? rgba[y * stride + i - 4] : 0
      const b = y > 0 ? rgba[(y - 1) * stride + i] : 0
      const c = y > 0 && i >= 4 ? rgba[(y - 1) * stride + i - 4] : 0
      const add = type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : type === 4 ? paeth(a, b, c) : 0
      rgba[y * stride + i] = (src[i] + add) & 0xff
    }
  }
  return { w, h, rgba }
}

/**
 * Box-average downscale. Colour is weighted by alpha so the transparent margin
 * around the mark cannot bleed black into its antialiased edge.
 */
function resize(img, size) {
  const out = Buffer.alloc(size * size * 4)
  const scale = img.w / size
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scale)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale))
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scale)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.w + sx) * 4
          const al = img.rgba[i + 3]
          r += img.rgba[i] * al
          g += img.rgba[i + 1] * al
          b += img.rgba[i + 2] * al
          a += al
          n++
        }
      }
      const o = (y * size + x) * 4
      out[o] = a ? Math.round(r / a) : 0
      out[o + 1] = a ? Math.round(g / a) : 0
      out[o + 2] = a ? Math.round(b / a) : 0
      out[o + 3] = Math.round(a / n)
    }
  }
  return { w: size, h: size, rgba: out }
}

/* ------------------------------------------------------------- icons ---- */

// Light, faintly violet. The mark's three waves are knockouts, not white
// strokes, so whatever sits behind the disc is what they read as — on a dark
// ground they disappear into it.
const BRAND_BG_0 = [0xff, 0xff, 0xff]
const BRAND_BG_1 = [0xf1, 0xe7, 0xfd]

/**
 * The brand mark on the app's own gradient. `inset` is the fraction of the
 * canvas the mark occupies — 0.62 pulls it into the maskable safe zone (centre
 * 80%), 0.86 leaves a normal icon a little breathing room.
 */
function logoIcon(src, size, inset, transparent = false) {
  const mark = resize(src, Math.round(size * inset))
  const off = Math.round((size - mark.w) / 2)
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4
      const mx = x - off
      const my = y - off
      const inMark = mx >= 0 && my >= 0 && mx < mark.w && my < mark.h
      const m = inMark ? (my * mark.w + mx) * 4 : -1
      const alpha = m >= 0 ? mark.rgba[m + 3] / 255 : 0
      if (transparent) {
        if (m >= 0) mark.rgba.copy(rgba, o, m, m + 4)
        continue
      }
      const bg = mix(BRAND_BG_0, BRAND_BG_1, (x / size) * 0.45 + (y / size) * 0.85)
      for (let k = 0; k < 3; k++) {
        rgba[o + k] = Math.round(bg[k] + ((m >= 0 ? mark.rgba[m + k] : 0) - bg[k]) * alpha)
      }
      rgba[o + 3] = 255
    }
  }
  // A smooth gradient at 512px is nearly incompressible: every scanline differs
  // from the last, so no filter finds a run. Dropping the bottom two bits is
  // invisible at icon scale and roughly halves the file — which matters because
  // vite-plugin-pwa precaches every icon the webmanifest names, including the
  // 512s that only the install prompt and the launcher ever read.
  if (size >= 256) for (let i = 0; i < rgba.length; i++) rgba[i] &= 0xfc
  return encodePng(size, size, rgba)
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

const logo = decodePng(readFileSync(LOGO))

// Transparent: the mark is already a circle with its own alpha edge (same
// source logo-128 uses below), so painting a flat square behind it — the old
// behaviour — left a visible light rectangle around the disc in any browser
// chrome that isn't pure white. A favicon has no canvas to be square *on*.
writeFileSync(join(ICONS, 'icon-192.png'), logoIcon(logo, 192, 0.94, true))
writeFileSync(join(ICONS, 'icon-512.png'), logoIcon(logo, 512, 0.94, true))
// Maskable and apple-touch-icon must stay full-bleed squares: the OS applies
// its own shape mask to them and relies on the square filling the canvas.
writeFileSync(join(ICONS, 'maskable-512.png'), logoIcon(logo, 512, 0.62))
writeFileSync(join(ICONS, 'apple-touch-icon.png'), logoIcon(logo, 180, 0.86))
// The in-app brand mark: transparent, so it sits on either theme. Drawn no
// larger than 44 CSS px, so 128 covers a 3x screen.
writeFileSync(join(ICONS, 'logo-128.png'), logoIcon(logo, 128, 1, true))

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
