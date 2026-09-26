// @ts-check
// Standard MIDI File (SMF format 1) writer and reader. The compositions are written as .mid files
// (assets/audio/music/midi/) and the sampler renders from those files, so the MIDI is the real score, openable in
// any DAW or notation program.

/**
 * @typedef {{ tick: number, type: 'on' | 'off', ch: number, key: number, vel: number }} NoteEvent
 * @typedef {{ tick: number, type: 'cc', ch: number, cc: number, value: number }} CcEvent
 * @typedef {{ tick: number, type: 'program', ch: number, program: number }} ProgramEvent
 * @typedef {{ tick: number, type: 'tempo', usPerQuarter: number }} TempoEvent
 * @typedef {{ tick: number, type: 'meter', num: number, den: number }} MeterEvent
 * @typedef {{ tick: number, type: 'name', text: string }} NameEvent
 * @typedef {{ tick: number, type: 'marker', text: string }} MarkerEvent
 * @typedef {NoteEvent | CcEvent | ProgramEvent | TempoEvent | MeterEvent | NameEvent | MarkerEvent} MidiEvent
 * @typedef {{ name: string, events: MidiEvent[] }} MidiTrack
 * @typedef {{ ppq: number, tracks: MidiTrack[] }} MidiFile
 */

/** @param {number} v @param {number[]} out */
function vlq(v, out) {
  const bytes = [v & 0x7f];
  v >>>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(...bytes);
}

/** @param {MidiEvent} e */
const order = (e) => (e.type === 'name' ? 0 : e.type === 'tempo' || e.type === 'meter' || e.type === 'marker' ? 1 : e.type === 'program' ? 2 : e.type === 'cc' ? 3 : e.type === 'off' ? 4 : 5);

/**
 * @param {MidiFile} file
 * @returns {Buffer}
 */
export function writeMidi(file) {
  const chunks = [];
  const header = Buffer.alloc(14);
  header.write('MThd', 0, 'ascii');
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(file.tracks.length, 10);
  header.writeUInt16BE(file.ppq, 12);
  chunks.push(header);
  for (const track of file.tracks) {
    /** @type {number[]} */
    const data = [];
    const events = [{ tick: 0, type: 'name', text: track.name }, ...track.events.filter((e) => e.type !== 'name')].sort(
      (a, b) => a.tick - b.tick || order(/** @type {MidiEvent} */ (a)) - order(/** @type {MidiEvent} */ (b)),
    );
    let last = 0;
    for (const ev of /** @type {MidiEvent[]} */ (events)) {
      const tick = Math.max(0, Math.round(ev.tick));
      vlq(tick - last, data);
      last = tick;
      switch (ev.type) {
        case 'name':
        case 'marker': {
          const text = Buffer.from(ev.text, 'utf8');
          data.push(0xff, ev.type === 'name' ? 0x03 : 0x06);
          vlq(text.length, data);
          data.push(...text);
          break;
        }
        case 'tempo':
          data.push(0xff, 0x51, 0x03, (ev.usPerQuarter >> 16) & 0xff, (ev.usPerQuarter >> 8) & 0xff, ev.usPerQuarter & 0xff);
          break;
        case 'meter':
          data.push(0xff, 0x58, 0x04, ev.num, Math.log2(ev.den), 24, 8);
          break;
        case 'program':
          data.push(0xc0 | ev.ch, ev.program & 0x7f);
          break;
        case 'cc':
          data.push(0xb0 | ev.ch, ev.cc & 0x7f, Math.max(0, Math.min(127, Math.round(ev.value))));
          break;
        case 'on':
          data.push(0x90 | ev.ch, ev.key & 0x7f, Math.max(1, Math.min(127, Math.round(ev.vel))));
          break;
        case 'off':
          data.push(0x80 | ev.ch, ev.key & 0x7f, 64);
          break;
      }
    }
    vlq(0, data);
    data.push(0xff, 0x2f, 0x00);
    const head = Buffer.alloc(8);
    head.write('MTrk', 0, 'ascii');
    head.writeUInt32BE(data.length, 4);
    chunks.push(head, Buffer.from(data));
  }
  return Buffer.concat(chunks);
}

/**
 * @param {Buffer} buf
 * @returns {MidiFile}
 */
export function readMidi(buf) {
  if (buf.toString('ascii', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntracks = buf.readUInt16BE(10);
  const ppq = buf.readUInt16BE(12);
  if (ppq & 0x8000) throw new Error('SMPTE time division is not supported');
  let p = 8 + buf.readUInt32BE(4);
  /** @type {MidiTrack[]} */
  const tracks = [];
  for (let t = 0; t < ntracks; t++) {
    if (buf.toString('ascii', p, p + 4) !== 'MTrk') throw new Error(`track ${t}: bad chunk`);
    const end = p + 8 + buf.readUInt32BE(p + 4);
    p += 8;
    /** @type {MidiEvent[]} */
    const events = [];
    let tick = 0;
    let status = 0;
    let name = '';
    const readVlq = () => {
      let v = 0;
      for (;;) {
        const b = buf[p++];
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
    };
    while (p < end) {
      tick += readVlq();
      if (buf[p] & 0x80) {
        status = buf[p];
        p++;
      }
      if (status === 0xff) {
        const type = buf[p++];
        const len = readVlq();
        const body = buf.subarray(p, p + len);
        p += len;
        if (type === 0x03) {
          name = body.toString('utf8');
          events.push({ tick, type: 'name', text: name });
        } else if (type === 0x06) events.push({ tick, type: 'marker', text: body.toString('utf8') });
        else if (type === 0x51) events.push({ tick, type: 'tempo', usPerQuarter: (body[0] << 16) | (body[1] << 8) | body[2] });
        else if (type === 0x58) events.push({ tick, type: 'meter', num: body[0], den: 2 ** body[1] });
        else if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += readVlq();
        continue;
      }
      const kind = status & 0xf0;
      const ch = status & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        const d1 = buf[p++];
        if (kind === 0xc0) events.push({ tick, type: 'program', ch, program: d1 });
        continue;
      }
      const d1 = buf[p++];
      const d2 = buf[p++];
      if (kind === 0x90 && d2 > 0) events.push({ tick, type: 'on', ch, key: d1, vel: d2 });
      else if (kind === 0x80 || kind === 0x90) events.push({ tick, type: 'off', ch, key: d1, vel: 0 });
      else if (kind === 0xb0) events.push({ tick, type: 'cc', ch, cc: d1, value: d2 });
    }
    p = end;
    tracks.push({ name, events });
  }
  return { ppq, tracks };
}

/**
 * Tick -> seconds converter from the tempo events of a file (track 0 by convention, all tracks scanned).
 * @param {MidiFile} file
 */
export function tempoMap(file) {
  /** @type {{ tick: number, us: number }[]} */
  const tempos = [];
  for (const t of file.tracks) for (const e of t.events) if (e.type === 'tempo') tempos.push({ tick: e.tick, us: e.usPerQuarter });
  tempos.sort((a, b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  /** @type {{ tick: number, us: number, sec: number }[]} */
  const segs = [];
  let sec = 0;
  for (let i = 0; i < tempos.length; i++) {
    if (i > 0) sec += ((tempos[i].tick - tempos[i - 1].tick) * tempos[i - 1].us) / 1e6 / file.ppq;
    segs.push({ ...tempos[i], sec });
  }
  /** @param {number} tick */
  return (tick) => {
    let s = segs[0];
    for (const x of segs) if (x.tick <= tick) s = x;
    return s.sec + ((tick - s.tick) * s.us) / 1e6 / file.ppq;
  };
}
