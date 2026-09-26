// @ts-check
// Fixture build: rebuilds one asset from the locked pattern source, deterministically.
//   node tools/fixture/build.mjs --only <a | b | c | tone>
// a, b, c: 64 × 64 RGBA textures in assets/textures/; tone: a 1.5 s 48 kHz mono WAV in assets/sounds/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// tools/lib/ is copied in when the fixture checkout is assembled (make-repo.mjs), so it is imported by URL
const { encodePng } = await import(new URL('../lib/png.mjs', import.meta.url).href);

const name = process.argv[process.argv.indexOf('--only') + 1];
const [freq, stripes] = readFileSync('assets/cache/pattern.txt', 'utf8').trim().split(/\s+/).map(Number);

if (name === 'tone') {
  const rate = 48000;
  const n = Math.round(1.5 * rate);
  const wav = Buffer.alloc(44 + n * 2);
  wav.write('RIFF', 0, 'latin1');
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write('WAVEfmt ', 8, 'latin1');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'latin1');
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 20, (1.5 - t) * 20);
    const v = env * (0.4 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2.5 * t * (1 + t)));
    wav.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  mkdirSync('assets/sounds', { recursive: true });
  writeFileSync('assets/sounds/tone.wav', wav);
} else if (['a', 'b', 'c'].includes(name)) {
  const k = name.charCodeAt(0) - 96;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const band = Math.floor((x + y * k) / stripes) % 2;
      data[o] = 40 + band * 150 + ((x * 7 + y * 3 * k) % 40);
      data[o + 1] = 90 + Math.round(60 * Math.sin((x * k) / 6) * Math.cos(y / 9));
      data[o + 2] = (x * y * k) % 200;
      data[o + 3] = 255 - ((x + y) % 32);
    }
  }
  mkdirSync('assets/textures', { recursive: true });
  writeFileSync(`assets/textures/${name}.png`, encodePng({ width: size, height: size, channels: 4, data }));
} else {
  console.error(`unknown asset '${name}'`);
  process.exit(2);
}
