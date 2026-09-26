// @ts-check
// Instrument definitions: which CC0 samples (VSCO 2 Community Edition, VCSL, both pinned to a commit) make up each
// playable articulation, how their file names map to key / velocity layer / round robin, and the SFZ opcodes the
// sampler uses. `node tools/music/instruments.mjs` writes tools/music/catalog.json (every sample file of every
// articulation, from the GitHub tree at the pinned commit) and tools/music/sfz/<id>.sfz (the full key maps).
// Only the regions a composition actually plays are downloaded (tools/music/build.mjs).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { libraryNoteToMidi } from './theory.mjs';

export const MUSIC = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(MUSIC, '..', '..');
export const SFZ_DIR = join(MUSIC, 'sfz');
export const CATALOG = join(MUSIC, 'catalog.json');

export const LIBS = Object.freeze({
  vsco: {
    repo: 'sgossner/VSCO-2-CE',
    commit: '440300901dfe9275fd84e0b7763af1f8443ae62e',
    title: 'VSCO 2 Community Edition',
    page: 'https://github.com/sgossner/VSCO-2-CE',
    authors: ['Versilian Studios / Sam Gossner', 'Ivy Audio / Simon Dalzell'],
  },
  vcsl: {
    repo: 'sgossner/VCSL',
    commit: 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e',
    title: 'Versilian Community Sample Library (VCSL)',
    page: 'https://github.com/sgossner/VCSL',
    authors: ['Versilian Studios / Sam Gossner', 'Ivy Audio / Simon Dalzell'],
  },
});

/**
 * @typedef {keyof typeof LIBS} LibId
 * @typedef {{ key?: number, keyFrom?: 'note' | 'pitch', vel?: [number, number] }} Rule
 * @typedef {{
 *   id: string, title: string, lib: LibId, folder: string, match: RegExp,
 *   layers?: Record<string, [number, number]>, xfade?: number,
 *   fixed?: { test: RegExp, key: number, lokey?: number, hikey?: number }[],
 *   pitched?: boolean, detectPitch?: boolean, keyRange?: [number, number], opcodes: Record<string, string | number>,
 *   trigger?: { test: RegExp, opcodes: Record<string, string | number> }[], layerMap?: Record<string, string>,
 *   includes?: string[], calibrateWith?: string
 * }} InstrumentDef
 */

const DYN = /** @type {Record<string, number>} */ ({ pppp: 1, ppp: 2, pp: 3, p: 4, mp: 5, mf: 6, f: 7, ff: 8, fff: 9 });

/** @type {InstrumentDef[]} */
export const INSTRUMENTS = [
  // ------------------------------------------------------------------------------------------ keys
  {
    id: 'piano',
    title: 'Upright piano (Knight), sustains',
    lib: 'vcsl',
    folder: 'Chordophones/Zithers/Upright Piano, Knight/Sustains',
    match: /^Player_vl(?<vel>\d)_rr(?<rr>\d)_(?<note>[A-G]#?-?\d)\.wav$/,
    layers: { 1: [1, 88], 2: [89, 127] },
    xfade: 14,
    opcodes: { ampeg_attack: 0.001, ampeg_release: 0.5, amp_veltrack: 72, fil_type: 'lpf_2p', cutoff: 5200, fil_veltrack: 4200 },
    includes: ['piano-pedal'],
  },
  {
    id: 'piano-pedal',
    title: 'Upright piano (Knight), pedal noise',
    lib: 'vcsl',
    folder: 'Chordophones/Zithers/Upright Piano, Knight/Pedal',
    match: /^(?:On|Off)\/Player_Ped(?<kind>On|Off)_(?<rr>\d+)\.wav$/,
    pitched: false,
    calibrateWith: 'piano',
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.3, loop_mode: 'one_shot', volume: -6 },
    trigger: [
      { test: /PedOn/, opcodes: { on_locc64: 64, on_hicc64: 127 } },
      { test: /PedOff/, opcodes: { on_locc64: 0, on_hicc64: 63 } },
    ],
  },
  // ------------------------------------------------------------------------------------------ strings (VSCO 2 CE)
  {
    id: 'violins-sus',
    title: 'Violin section, sustain vibrato',
    lib: 'vsco',
    folder: 'Strings/Violin Section/susVib',
    match: /^VlnEns_susVib_(?<note>[A-G]#?\d)_v(?<vel>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.18, ampeg_release: 0.7, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'violins-trem',
    title: 'Violin section, tremolo',
    lib: 'vsco',
    folder: 'Strings/Violin Section/Trem',
    match: /^VlnEns_Trem_(?<note>[A-G]#?\d)_v(?<vel>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.05, ampeg_release: 0.45, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'violins-spic',
    title: 'Violin section, spiccato',
    lib: 'vsco',
    folder: 'Strings/Violin Section/Spic',
    match: /^VlnEns_Spic_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 90], 2: [91, 127] },
    opcodes: { ampeg_release: 0.12, amp_veltrack: 55, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'violins-pizz',
    title: 'Violin section, pizzicato',
    lib: 'vsco',
    folder: 'Strings/Violin Section/Pizz',
    match: /^VlnEns_Pizz_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 88], 2: [89, 127] },
    opcodes: { ampeg_release: 0.25, amp_veltrack: 60, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'violas-sus',
    title: 'Viola section, sustain vibrato',
    lib: 'vsco',
    folder: 'Strings/Viola Section/susvib',
    match: /^ViolaEns_susvib_(?<note>[A-G]#?\d)_v(?<vel>\d)_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.2, ampeg_release: 0.7, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'violas-spic',
    title: 'Viola section, spiccato',
    lib: 'vsco',
    folder: 'Strings/Viola Section/spic',
    match: /^Violas_spic_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 90], 2: [91, 127] },
    opcodes: { ampeg_release: 0.12, amp_veltrack: 55, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'celli-sus',
    title: 'Cello section, sustain vibrato',
    lib: 'vsco',
    folder: 'Strings/Cello Section/susvib',
    match: /^susvib_(?<note>[A-G]#?\d)_v(?<vel>\d)_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 3: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.2, ampeg_release: 0.8, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'celli-trem',
    title: 'Cello section, tremolo',
    lib: 'vsco',
    folder: 'Strings/Cello Section/trem',
    match: /^trem_(?<note>[A-G]#?\d)_v(?<vel>\d)_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.05, ampeg_release: 0.5, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'celli-spic',
    title: 'Cello section, spiccato',
    lib: 'vsco',
    folder: 'Strings/Cello Section/spic',
    match: /^spic_(?<note>[A-G]#?\d)_v(?<vel>\d)_RR(?<rr>\d)\.wav$/,
    layers: { 1: [1, 90], 2: [91, 127] },
    opcodes: { ampeg_release: 0.14, amp_veltrack: 55, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'celli-pizz',
    title: 'Cello section, pizzicato',
    lib: 'vsco',
    folder: 'Strings/Cello Section/pizzT',
    match: /^pizzT_(?<note>[A-G]#?\d)_v(?<vel>\d)_RR(?<rr>\d)\.wav$/,
    layers: { 1: [1, 88], 2: [89, 127] },
    opcodes: { ampeg_release: 0.3, amp_veltrack: 60, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'basses-sus',
    title: 'Contrabass, sustain (no vibrato)',
    lib: 'vsco',
    folder: 'Strings/Solo Contrabass/SusNV',
    match: /^BKCtbss_SusNV_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 3: [85, 127] },
    xfade: 24,
    opcodes: { ampeg_attack: 0.2, ampeg_release: 0.8, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'basses-spic',
    title: 'Contrabass, spiccato',
    lib: 'vsco',
    folder: 'Strings/Solo Contrabass/Spic',
    match: /^BKCtbss_Spic_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 90], 3: [91, 127] },
    opcodes: { ampeg_release: 0.14, amp_veltrack: 55, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'basses-pizz',
    title: 'Contrabass, pizzicato',
    lib: 'vsco',
    folder: 'Strings/Solo Contrabass/Pizz',
    match: /^BKCtbss_Pizz_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 96], 3: [97, 127] },
    opcodes: { ampeg_release: 0.35, amp_veltrack: 60, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'harp',
    title: 'Concert harp',
    lib: 'vsco',
    folder: 'Strings/Harp',
    match: /^KSHarp_(?<note>[A-G]#?\d)_(?:mp|mf|f)\.wav$/,
    opcodes: { ampeg_release: 0.9, amp_veltrack: 70, loop_mode: 'one_shot', fil_type: 'lpf_2p', cutoff: 6000, fil_veltrack: 3600, offset_auto: 1 },
  },
  // ------------------------------------------------------------------------------------------ brass
  {
    id: 'horn-sus',
    title: 'French horn, sustain',
    lib: 'vsco',
    folder: 'Brass/F Horn/sus',
    match: /^MOHorn_sus_(?<note>[A-G]#?\d)_v(?<vel>[123])_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 64], 2: [65, 96], 3: [97, 127] },
    xfade: 16,
    opcodes: { ampeg_attack: 0.08, ampeg_release: 0.6, amp_veltrack: 45, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'horn-stac',
    title: 'French horn, staccato',
    lib: 'vsco',
    folder: 'Brass/F Horn/stac',
    match: /^MOHorn_stac_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 72], 2: [73, 104], 3: [105, 127] },
    opcodes: { ampeg_release: 0.18, amp_veltrack: 50, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'trombone-sus',
    title: 'Tenor trombone, sustain',
    lib: 'vsco',
    folder: 'Brass/Tenor Trombone/sus',
    match: /^tenortbn_sus_(?<note>[A-G]#?\d)_v(?<vel>\d)_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 64], 2: [65, 96], 3: [97, 127] },
    xfade: 16,
    opcodes: { ampeg_attack: 0.06, ampeg_release: 0.55, amp_veltrack: 45, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'trombone-stac',
    title: 'Tenor trombone, staccato',
    lib: 'vsco',
    folder: 'Brass/Tenor Trombone/stac',
    match: /^tenortbn_stac_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr?(?<rr>\d)\.wav$/,
    layers: { 1: [1, 56], 2: [57, 84], 3: [85, 108], 4: [109, 127] },
    opcodes: { ampeg_release: 0.18, amp_veltrack: 50, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'tuba-stac',
    title: 'Tuba, staccato',
    lib: 'vsco',
    folder: 'Brass/Tuba/stac',
    match: /^Tuba3_stac_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)_Sum\.wav$/,
    layers: { 1: [1, 90], 2: [91, 127] },
    opcodes: { ampeg_release: 0.2, amp_veltrack: 50, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'tuba-sus',
    title: 'Tuba, sustain',
    lib: 'vsco',
    folder: 'Brass/Tuba/sus',
    match: /^Tuba3_sus_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)_Mid\.wav$/,
    layers: { 1: [1, 64], 2: [65, 96], 3: [97, 127] },
    xfade: 16,
    opcodes: { ampeg_attack: 0.08, ampeg_release: 0.6, amp_veltrack: 45, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  // ------------------------------------------------------------------------------------------ woodwinds
  {
    id: 'clarinet-sus',
    title: 'Clarinet, long sustain',
    lib: 'vsco',
    folder: 'Woodwinds/Clarinet/susLong',
    match: /^DCClar_susLong_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)_sum\.wav$/,
    layers: { 1: [1, 64], 2: [65, 96], 3: [97, 127] },
    xfade: 16,
    opcodes: { ampeg_attack: 0.05, ampeg_release: 0.4, amp_veltrack: 45, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  {
    id: 'clarinet-stac',
    title: 'Clarinet, staccato',
    lib: 'vsco',
    folder: 'Woodwinds/Clarinet/stac',
    match: /^DCClar_stac_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)_sum\.wav$/,
    layers: { 1: [1, 64], 2: [65, 96], 3: [97, 127] },
    opcodes: { ampeg_release: 0.12, amp_veltrack: 50, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'bassoon-stac',
    title: 'Bassoon, staccato',
    lib: 'vsco',
    folder: 'Woodwinds/Bassoon/stac',
    match: /^PSBassoon_(?<note>[A-G]#?\d)_v(?<vel>\d)_rr(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 127] },
    opcodes: { ampeg_release: 0.12, amp_veltrack: 50, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'flute-sus',
    title: 'Flute, sustain (no vibrato)',
    lib: 'vsco',
    folder: 'Woodwinds/Flute/susNV',
    match: /^LDFlute_susNV_(?<note>[A-G]#?\d)_v(?<vel>\d)_(?<rr>\d)\.wav$/,
    layers: { 1: [1, 84], 2: [85, 104], 3: [105, 127] },
    xfade: 16,
    opcodes: { ampeg_attack: 0.06, ampeg_release: 0.4, amp_veltrack: 45, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  // ------------------------------------------------------------------------------------------ tuned percussion
  {
    id: 'glockenspiel',
    title: 'Glockenspiel',
    lib: 'vsco',
    folder: 'Percussion/Glock',
    match: /^glock_medium_(?<note>[A-G]#?\d)\.wav$/,
    opcodes: { ampeg_release: 1.2, amp_veltrack: 70, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'marimba',
    title: 'Marimba',
    lib: 'vsco',
    folder: 'Percussion/Marimba',
    match: /^Marimba_hit_Outrigger_(?<note>[A-G]#?\d)_loud_01\.wav$/,
    opcodes: { ampeg_release: 0.6, amp_veltrack: 75, loop_mode: 'one_shot', fil_type: 'lpf_2p', cutoff: 3000, fil_veltrack: 4000, offset_auto: 1 },
  },
  {
    id: 'xylophone',
    title: 'Xylophone',
    lib: 'vsco',
    folder: 'Percussion/Xylo',
    match: /^Xylo_Medium_(?<note>[A-G]#?\d)_ff_01_far\.wav$/,
    opcodes: { ampeg_release: 0.4, amp_veltrack: 75, loop_mode: 'one_shot', fil_type: 'lpf_2p', cutoff: 4000, fil_veltrack: 5000, offset_auto: 1 },
  },
  {
    id: 'bowed-vibraphone',
    title: 'Vibraphone, bowed',
    lib: 'vcsl',
    folder: 'Idiophones/Struck Idiophones/Vibraphone/Bowed',
    match: /^Vibes_bowed_(?<note>[A-G]#?\d)_rr(?<rr>\d)_Main\.wav$/,
    opcodes: { ampeg_attack: 0.4, ampeg_release: 2.5, amp_veltrack: 40, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'timpani',
    title: 'Timpani, hits',
    lib: 'vsco',
    folder: 'Percussion/Timpani',
    match: /^Timpani(?<drum>\d)_Hit_v(?<vel>\d)_rr(?<rr>\d)_Sum\.wav$/,
    detectPitch: true,
    layers: { 1: [1, 72], 3: [73, 108], 4: [109, 127] },
    opcodes: { ampeg_release: 1.5, amp_veltrack: 65, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'timpani-roll',
    title: 'Timpani, rolls',
    lib: 'vsco',
    folder: 'Percussion/Timpani/Rolls',
    match: /^Timpani(?<drum>\d)_Roll_v(?<vel>\d)_rr(?<rr>\d)_Sum\.wav$/,
    detectPitch: true,
    layers: { 3: [1, 96], 5: [97, 127] },
    layerMap: { 4: '5' },
    xfade: 20,
    opcodes: { ampeg_attack: 0.3, ampeg_release: 1.2, amp_veltrack: 40, loop_mode: 'loop_continuous', offset_auto: 1 },
  },
  // ------------------------------------------------------------------------------------------ drums and metals
  {
    id: 'bass-drum',
    title: 'Concert bass drum',
    lib: 'vcsl',
    folder: 'Membranophones/Struck Membranophones/Bass Drum 2',
    match: /^bassdrum_(?<kind>hit|cresc|roll)_(?<dyn>pp|mp|mf|ff|f|med|short)(?<rr>\d)?\.wav$/,
    pitched: false,
    fixed: [
      { test: /_hit_/, key: 36 },
      { test: /_cresc_short/, key: 33 },
      { test: /_cresc_med/, key: 34 },
    ],
    layers: { 1: [1, 127], 3: [1, 40], 5: [41, 70], 6: [71, 95], 7: [96, 112], 8: [113, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 1.2, amp_veltrack: 80, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'toms',
    title: 'Concert toms, mallets',
    lib: 'vcsl',
    folder: 'Membranophones/Struck Membranophones',
    match: /^Tom (?<drum>[12])\/Mallet\/Tom(?<hl>[HL])_HitM_v(?<vel>\d)_rr(?<rr>\d)_Mid\.wav$/,
    pitched: false,
    fixed: [
      { test: /^Tom 1\//, key: 47 },
      { test: /^Tom 2\//, key: 43 },
    ],
    layers: { 2: [1, 80], 3: [81, 108], 4: [109, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.6, amp_veltrack: 70, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'snare',
    title: 'Snare drum, snares on',
    lib: 'vsco',
    folder: 'Percussion',
    match: /^Snare2-HitSN_v(?<vel>\d)_rr(?<rr>\d)_Sum\.wav$/,
    pitched: false,
    fixed: [{ test: /./, key: 38 }],
    layers: { 1: [1, 30], 3: [31, 60], 5: [61, 90], 7: [91, 110], 9: [111, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.3, amp_veltrack: 60, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'claves',
    title: 'Claves',
    lib: 'vsco',
    folder: 'Percussion',
    match: /^Claves1_Hit_v(?<vel>\d)_rr(?<rr>\d)_Sum\.wav$/,
    pitched: false,
    fixed: [{ test: /./, key: 75 }],
    layers: { 1: [1, 60], 2: [61, 100], 3: [101, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.2, amp_veltrack: 60, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'anvil',
    title: 'Anvil',
    lib: 'vcsl',
    folder: 'Idiophones/Struck Idiophones/Anvil',
    match: /^Anvil_Hit(?<rr>\d)_v(?<vel>\d)_rr1_Mid\.wav$/,
    pitched: false,
    fixed: [{ test: /./, key: 76 }],
    layers: { 1: [1, 70], 2: [71, 105], 3: [106, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.5, amp_veltrack: 70, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'brake-drum',
    title: 'Brake drum, hammer',
    lib: 'vcsl',
    folder: 'Idiophones/Struck Idiophones/Brake Drum',
    match: /^BrakeDrum(?<drum>[12])_Hammer(?<rr>\d)?_v(?<vel>\d)_rr1_Mid\.wav$/,
    pitched: false,
    fixed: [
      { test: /^BrakeDrum1_/, key: 77 },
      { test: /^BrakeDrum2_/, key: 78 },
    ],
    layers: { 1: [1, 70], 2: [71, 105], 3: [106, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 0.4, amp_veltrack: 70, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'cymbal',
    title: 'Suspended cymbal: hits, swells, rolls',
    lib: 'vcsl',
    folder: 'Idiophones/Struck Idiophones/Suspended Cymbal 1',
    match: /^susCymb1_(?<kind>hit|cresc|roll)_(?<dyn>[a-z0-9.]+?)(?<rr>\d)?(?:_nloop|s)?\.wav$/,
    pitched: false,
    fixed: [
      { test: /_hit_pp1/, key: 49 },
      { test: /_hit_mp1/, key: 49 },
      { test: /_hit_f1/, key: 49 },
      { test: /_hit_fff1/, key: 49 },
      { test: /_cresc_1\.5s/, key: 52 },
      { test: /_cresc_2s/, key: 53 },
      { test: /_cresc_4s/, key: 54 },
      { test: /_cresc_7\.5s/, key: 55 },
    ],
    layers: { 1: [1, 127], 3: [1, 50], 5: [51, 85], 7: [86, 112], 9: [113, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 2.5, amp_veltrack: 70, loop_mode: 'one_shot', offset_auto: 1 },
  },
  {
    id: 'gong',
    title: 'Tam-tam (gong)',
    lib: 'vcsl',
    folder: 'Idiophones/Struck Idiophones/Gong 1',
    match: /^gong_(?<dyn>p|mf|f|fff)\.wav$/,
    pitched: false,
    fixed: [{ test: /./, key: 57 }],
    layers: { 4: [1, 60], 6: [61, 90], 7: [91, 112], 9: [113, 127] },
    opcodes: { pitch_keytrack: 0, ampeg_release: 4, amp_veltrack: 75, loop_mode: 'one_shot', offset_auto: 1 },
  },
];

/** @param {string} id */
export function instrument(id) {
  const d = INSTRUMENTS.find((i) => i.id === id);
  if (!d) throw new Error(`unknown instrument ${id}`);
  return d;
}

/**
 * @typedef {{ file: string, path: string, bytes: number, key: number | null, layer: string, rr: number, dyn?: string }} CatalogSample
 * @typedef {Record<string, CatalogSample[]>} Catalog
 */

/** @param {InstrumentDef} def @param {string} name @param {number} bytes @param {string} path @returns {CatalogSample | null} */
function parseSample(def, name, bytes, path) {
  const m = def.match.exec(name);
  if (!m?.groups) return null;
  const g = m.groups;
  let key = null;
  if (g.note && def.pitched !== false) key = libraryNoteToMidi(g.note);
  const fixed = def.fixed?.find((f) => f.test.test(name));
  if (fixed) key = fixed.key;
  if (def.fixed && !fixed && !def.detectPitch) return null;
  const trig = def.trigger?.findIndex((t) => t.test.test(name)) ?? -1;
  if (trig >= 0) key = -1 - trig; // CC-triggered: a negative key no note reaches, one per trigger kind
  const dyn = g.dyn ?? g.kind;
  const raw = g.vel ?? (g.dyn && DYN[g.dyn] ? String(DYN[g.dyn]) : '1');
  const layer = def.layerMap?.[raw] ?? raw;
  return { file: name, path, bytes, key, layer, rr: g.rr ? Number(g.rr) : 1, ...(dyn ? { dyn } : {}) };
}

/** Builds the catalog from the GitHub trees of the pinned commits. */
export async function buildCatalog() {
  /** @type {Record<string, any>} */
  const trees = {};
  for (const [id, lib] of Object.entries(LIBS)) {
    const cache = join(MUSIC, '.build', `tree-${id}-${lib.commit.slice(0, 10)}.json`);
    if (existsSync(cache)) trees[id] = JSON.parse(readFileSync(cache, 'utf8'));
    else {
      const res = await fetch(`https://api.github.com/repos/${lib.repo}/git/trees/${lib.commit}?recursive=1`, { headers: { 'user-agent': 'SurvivalLogs-music' } });
      if (!res.ok) throw new Error(`GitHub tree ${lib.repo}: HTTP ${res.status}`);
      trees[id] = await res.json();
      mkdirSync(dirname(cache), { recursive: true });
      writeFileSync(cache, JSON.stringify(trees[id]));
    }
  }
  /** @type {Catalog} */
  const catalog = {};
  for (const def of INSTRUMENTS) {
    const prefix = `${def.folder}/`;
    /** @type {CatalogSample[]} */
    const out = [];
    for (const e of trees[def.lib].tree) {
      if (e.type !== 'blob' || !e.path.startsWith(prefix)) continue;
      const s = parseSample(def, e.path.slice(prefix.length), e.size, e.path);
      if (s) out.push(s);
    }
    if (!out.length) throw new Error(`${def.id}: no samples matched in ${def.folder}`);
    out.sort((a, b) => (a.key ?? 0) - (b.key ?? 0) || a.layer.localeCompare(b.layer) || a.rr - b.rr || a.file.localeCompare(b.file));
    catalog[def.id] = out;
  }
  return catalog;
}

/** @returns {Catalog} */
export function readCatalog() {
  return JSON.parse(readFileSync(CATALOG, 'utf8'));
}

/** Lock source id of an instrument's samples. @param {InstrumentDef} def */
export const sourceId = (def) => `${def.lib === 'vsco' ? 'vsco2ce' : 'vcsl'}/${def.id}`;

/** Cache folder (relative to the repo) that holds an instrument's samples. @param {InstrumentDef} def */
export const sampleDir = (def) => join('assets', 'cache', ...sourceId(def).split('/'));

/** Local cache file name of a sample (flat: slashes of sub-folders become '__'). @param {CatalogSample} s */
export const cacheName = (s) => s.file.replace(/\//g, '__');

/**
 * Key ranges: each sample covers the keys up to half-way to its neighbours (per velocity layer).
 * @param {InstrumentDef} def
 * @param {CatalogSample[]} samples  with keys (pitch-detected ones filled in)
 * @returns {{ sample: CatalogSample, lokey: number, hikey: number, lovel: number, hivel: number, seqLength: number, seqPosition: number,
 *   xf?: { in: [number, number] | null, out: [number, number] | null } }[]}
 */
export function regions(def, samples) {
  const layerIds = [...new Set(samples.map((s) => s.layer))].sort((a, b) => Number(a) - Number(b));
  const [lo, hi] = def.keyRange ?? [0, 127];
  /** @type {ReturnType<typeof regions>} */
  const out = [];
  for (const layer of layerIds) {
    const inLayer = samples.filter((s) => s.layer === layer && s.key != null);
    const vr = def.layers?.[layer] ?? [1, 127];
    const li = layerIds.indexOf(layer);
    const xf = def.xfade ?? 0;
    const keys = [...new Set(inLayer.map((s) => /** @type {number} */ (s.key)))].sort((a, b) => a - b);
    keys.forEach((k, i) => {
      const fixed = def.fixed?.find((f) => inLayer.some((s) => s.key === k && f.test.test(s.file)));
      const lokey = def.pitched === false || fixed || k < 0 ? k : i === 0 ? lo : Math.floor((keys[i - 1] + k) / 2) + 1;
      const hikey = def.pitched === false || fixed || k < 0 ? k : i === keys.length - 1 ? hi : Math.floor((k + keys[i + 1]) / 2);
      const rrs = inLayer.filter((s) => s.key === k);
      for (const [seq, s] of rrs.entries()) {
        const xin = xf && li > 0 ? /** @type {[number, number]} */ ([vr[0] - xf, vr[0] + xf]) : null;
        const xout = xf && li < layerIds.length - 1 ? /** @type {[number, number]} */ ([vr[1] - xf, vr[1] + xf]) : null;
        out.push({
          sample: s,
          lokey,
          hikey,
          lovel: xin ? Math.max(1, xin[0]) : vr[0],
          hivel: xout ? Math.min(127, xout[1]) : vr[1],
          seqLength: rrs.length,
          seqPosition: seq + 1,
          xf: { in: xin, out: xout },
        });
      }
    });
  }
  return out;
}

/**
 * The calibration reference of an instrument: a sample of its loudest layer near the middle of its range.
 * @param {InstrumentDef} def
 * @param {CatalogSample[]} samples
 */
export function calibrationSample(def, samples) {
  const layers = [...new Set(samples.map((s) => s.layer))].sort((a, b) => Number(a) - Number(b));
  const loud = samples.filter((s) => s.layer === layers[layers.length - 1] && (s.key ?? 0) >= 0);
  const keys = loud.map((s) => s.key ?? 60).sort((a, b) => a - b);
  const mid = keys[Math.floor(keys.length / 2)];
  return loud.reduce((best, s) => (Math.abs((s.key ?? 60) - mid) < Math.abs((best.key ?? 60) - mid) ? s : best), loud[0]);
}

/**
 * SFZ text for an instrument.
 * @param {InstrumentDef} def
 * @param {CatalogSample[]} samples
 * @param {{ volumeDb: number, reference: string, measured: number } | null} [cal]  gain staging (see build.mjs)
 */
export function sfzText(def, samples, cal = null) {
  const lib = LIBS[def.lib];
  const opcodes = { ...def.opcodes };
  if (cal) opcodes.volume = Math.round(((Number(opcodes.volume) || 0) + cal.volumeDb) * 10) / 10;
  const lines = [
    `// ${def.title}: ${lib.title} (CC0), ${lib.repo}@${lib.commit.slice(0, 10)}, folder '${def.folder}'.`,
    `// Written by tools/music/build.mjs (tools/music/instruments.mjs); played by tools/music/sampler.mjs.`,
    cal
      ? `// Gain staging: loudest layer calibrated to -20 LUFS-M on ${cal.reference} (measured ${cal.measured.toFixed(1)}).`
      : '// Gain staging: not calibrated (no composition plays this instrument yet).',
    `<control> default_path=${relative(SFZ_DIR, join(ROOT, sampleDir(def))).split('\\').join('/')}/`,
    `<global> ${Object.entries(opcodes)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  ];
  let lastLayer = '';
  for (const r of regions(def, samples)) {
    if (r.sample.layer !== lastLayer) {
      lines.push(`<group> lovel=${r.lovel} hivel=${r.hivel}${r.xf?.in ? ` xfin_lovel=${r.xf.in[0]} xfin_hivel=${r.xf.in[1]}` : ''}${r.xf?.out ? ` xfout_lovel=${r.xf.out[0]} xfout_hivel=${r.xf.out[1]}` : ''}`);
      lastLayer = r.sample.layer;
    }
    const trig = def.trigger?.find((t) => t.test.test(r.sample.file));
    const parts = [`lokey=${r.lokey}`, `hikey=${r.hikey}`, `pitch_keycenter=${r.sample.key}`];
    if (r.seqLength > 1) parts.push(`seq_length=${r.seqLength}`, `seq_position=${r.seqPosition}`);
    if (trig) parts.push(...Object.entries(trig.opcodes).map(([k, v]) => `${k}=${v}`));
    lines.push(`<region> ${parts.join(' ')} sample=${cacheName(r.sample)}`);
  }
  for (const inc of def.includes ?? []) lines.push(`#include "${inc}.sfz"`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const catalog = await buildCatalog();
  writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 1)}\n`);
  const total = Object.values(catalog).reduce((a, s) => a + s.length, 0);
  console.log(`catalog: ${INSTRUMENTS.length} articulations, ${total} samples (SFZ files are written by tools/music/build.mjs)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
