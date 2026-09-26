# Audio

How the game's sound is made: music composed in code and played by our own sampler, foley and SFX from CC0
recordings and synthesis, one processing chain for all of it, five buses with ducking, and the 60-second test that
exercises the whole pipeline (WP-P0-06). Everything here is rebuilt from scripts and pinned sources; nothing is made
in a DAW.

```sh
node tools/audio/build.mjs            # music, SFX, room IRs, the 60-second test, credits (about 3 minutes)
node tools/audio/build.mjs --frozen   # the same, refusing any download that is not in the lock
node tools/audio/fetch.mjs            # restore and verify the locked sources in assets/cache/ (--offline: verify only)
node --test tests/audio-assets.test.js
python3 -m http.server 5206           # then open http://127.0.0.1:5206/pages/audio-test.html (Vite on 5206 later)
```

## Layout and naming

| Path | What |
| --- | --- |
| `assets/audio/manifest.json` | the audio asset manifest (`survival-logs/asset-manifest@1`, see `src/contracts/assets.js`) |
| `assets/audio/music/<layer>.ogg` | music stems, Ogg Vorbis q6, 48 kHz stereo, −16 LUFS; `music.json` = tempo grid, loop points, samples used |
| `assets/audio/music/midi/<layer>.mid` | the scores as Standard MIDI Files (format 1); the renderer reads these files |
| `assets/audio/sfx/<family>/<family>-NN.ogg` | in-world one-shots and loops (mono when spatialized) |
| `assets/audio/ui/<family>/<family>-NN.ogg` | interface sounds |
| `assets/audio/amb/<family>/<family>-NN.ogg` | ambience beds, rain and thunder (stereo) |
| `assets/audio/ir/<space>.wav` | room impulse responses, stereo float 48 kHz, unit energy |
| `assets/audio/test/audio-test-60s.{ogg,json}` | the 60-second test render and its scene (cue sheet) |
| `tools/music/` | score DSL, MIDI writer/reader, SFZ instruments, sampler, compositions, music build |
| `tools/audio/` | DSP library, synthesis, the processing chain, fetch/lock, SFX / IR builds, mixer, analysis |

Names are lowercase kebab-case. A family is `<thing>-<kind>` (`footstep-wood`, `door-bang`, `ui-error`); its takes are
numbered from `01` (`door-bang-03.ogg`); beds start with `amb-`. Manifest ids are `audio/<family>`,
`audio/music-<layer>`, `audio/ir-<space>` and `audio/test-60s`. Every file carries Vorbis comments (title, maker,
the recipe it was made from).

## The processing chain

One chain (`tools/audio/chain.mjs`) for every sound, offline and live:

1. **Clean**: 20 Hz high-pass (DC, rumble), silence trimmed off one-shots, raised-cosine edge fades (at most 20 % of a
   very short sound). Loops are filtered circularly (twice in a row, second pass kept) so no filter state breaks the
   seam.
2. **EQ**: the family's biquad chain. Filters use the exact `BiquadFilterNode` formulas of the Web Audio spec (Q in dB
   for low-/high-pass, shelves with S = 1), so the same numbers render identically in `tools/audio/mix.mjs` and in the
   page.
3. **Space**: room reverb per space by convolution with `assets/audio/ir/<space>.wav`. Assets ship dry and the mixer
   adds the room; sounds that only exist in a place (thunder, the crowd in the street) bake the street in. A source in
   another room reaches the listener through a *portal* (low-pass + attenuation): its direct sound and its room's
   reverb both pass through it. Reverb sends are high-passed so the low end never booms in a tail.
4. **Loudness**: normalization to the category target (below), then an offline true-peak limiter (4× oversampled
   detection, look-ahead backwards pass, hold and release forwards; circular for loops). The encoded file is measured
   with ffmpeg `ebur128`; if Vorbis overshoot or loudness drift misses the target, the stage re-renders with a lower
   ceiling or corrected gain.

### Spaces

| Space | Model | RT60 125 Hz … 8 kHz (s) | Wet send | Send HP | Portal from the apartment |
| --- | --- | --- | --- | --- | --- |
| apartment | furnished living room 5.2 × 4.0 × 2.6 m, axial modes | 0.62 0.55 0.48 0.44 0.40 0.34 0.26 | −14 dB | 160 Hz | — (listener's room) |
| stairwell | concrete, 3 × 6 m, 12 m high, flutter echo | 2.4 2.7 2.6 2.4 2.1 1.7 1.2 | −4 dB | 220 Hz | front door: LP 1.1 kHz, −9 dB |
| shop | corner shop 16 × 11 × 3.6 m | 1.05 1.0 0.92 0.86 0.80 0.70 0.55 | −10 dB | 180 Hz | — |
| basement | concrete 9 × 7 m, 2.3 m ceiling, strong modes | 1.7 1.55 1.35 1.15 0.95 0.75 0.52 | −8 dB | 120 Hz | floor: LP 700 Hz, −14 dB |
| outdoors | street between blocks: facade slap-backs, open tail | 0.9 0.8 0.7 0.55 0.45 0.35 0.25 | −10 dB | 200 Hz | closed window: LP 3 kHz, −5 dB |

The IRs are synthesized (`tools/audio/spaces.mjs`): image-source early reflections of a shoebox room (each bounce
darker), a late tail of decorrelated noise decaying per octave band at the RT60 above (measured back within ~0.1 s
by Schroeder integration), axial room modes, flutter echo, slap-backs, unit energy.

## Buses, ducking, master

`voice → gain envelope → [portal] → PannerNode → bus`, `voice → send → high-pass → ConvolverNode → [portal] → bus`,
`bus → fader → duck → master → static gain → safety limiter`.

| Bus | Level | Carries |
| --- | --- | --- |
| master | 0 dB, + the static gain that lands the mix on its target | everything |
| music | −5 dB | stems |
| sfx | +2 dB | foley, impacts, voices, in-world loops |
| ambience | −1.5 dB | room tone, rain, thunder, street, crowd |
| ui | −3 dB | interface |

Ducking is voice-activity ducking (like Wwise auto-ducking): while a voice tagged on the trigger bus sounds, the
target bus is pulled down, with one-pole attack and release (`setTargetAtTime` time constants). Several rules on one
bus take the deepest.

| Target | Trigger | Tag | Depth | Attack / release |
| --- | --- | --- | --- | --- |
| music | sfx | impact (knocks, bangs) | −4 dB | 20 ms / 350 ms |
| music | sfx | voice (groans) | −2 dB | 80 ms / 500 ms |
| ambience | music | horde (the horde layer) | −3 dB | 0.5 s / 2 s |
| music | ui | ui | −1.5 dB | 20 ms / 250 ms |

For a scripted scene the mixer computes the ducking curves (100 Hz) and stores them in the scene file; the page plays
the same curves with `setValueCurveAtTime`. The test mix has a bus EQ (low shelf −2.5 dB at 110 Hz) before the master
gain. Live, the master ends in a `DynamicsCompressorNode` (its spec makeup gain compensated) and a 4×-oversampled soft
clip that only touches the last dB before full scale.

## Loudness targets

Measured with ffmpeg `ebur128` (BS.1770-4) on the encoded files; `tools/audio/lib/loudness.mjs` agrees within ~0.1 LU.
Mono files are normalized as dual mono (as they sound centred in a stereo mix).

| Category | Target | True peak |
| --- | --- | --- |
| Music stems | −16 LUFS integrated ± 1 | ≤ −1 dBTP |
| The 60-second test mix | −16 LUFS integrated ± 1 | ≤ −1 dBTP |
| Beds and loops (rain −24, generator −24, sizzle −26, crowd −22, street −30, room tone −40) | integrated | ≤ −1 dBTP |
| One-shots (door bang −15, knock −18, groan −18, thunder −14 … −21 by distance, pickup −22, UI confirm/error −21, UI click −24, tile steps −25, wood steps −26) | momentary max (LUFS-M) | ≤ −1 dBTP |

Very peaky one-shots (bangs, some clicks) hit the true-peak ceiling before their loudness target and stay a little
quieter; the ceiling always wins.

## Variant rules

Every repeated sound has at least three takes, and every play varies (the manifest carries the rules, the mixer and the
page apply them):

- **Takes**: a shuffled bag per family; a take is not played twice in a row (`noRepeat`).
- **Pitch and gain**: uniform within ±`pitchCents` and ±`gainDb` of the family, drawn per play.
- **Voices**: at most `maxVoices` of a family at once and at least `cooldown` seconds between starts. This is also
  the rule that keeps defence loops (chainsaws, electric nets) from stacking louder and louder, which the original
  game fixed in a patch.
- **Loops** stop with their cause (a crisis ending stops its siege loop, a new cycle stops everything). The Steam patch
  notes show both as bugs players reported.

| Family | Takes | Pitch ± | Gain ± | Voices / cooldown | Made from |
| --- | --- | --- | --- | --- | --- |
| footstep-wood | 8 | 80 ¢ | 2.5 dB | 4 / 0.08 s | Kenney Impact Sounds wood steps, 3 with a creaking floorboard (Kenney RPG Audio) |
| footstep-tile | 6 | 70 ¢ | 2.5 dB | 4 / 0.08 s | Kenney concrete steps + a ceramic tick (impactPlate) |
| door-knock | 5 | 50 ¢ | 2 dB | 2 / 0.4 s | Kenney wood impacts ringing a modal hollow-core door, latch rattle |
| door-bang | 5 | 60 ¢ | 2.5 dB | 3 / 0.25 s | Kenney heavy wood + punch impacts, door modes, frame rattle, creak, thump |
| zombie-groan | 6 | 150 ¢ | 3 dB | 4 / 0.6 s | source-filter voice synthesis (glottal pulses, fry, growl, formants, wet throat) |
| cooking-sizzle | 3 loops | 60 ¢ | 2 dB | 1 | synthesized hiss, crackle, oil bubbles and spits |
| rain | 3 loops | 40 ¢ | 1.5 dB | 2 | synthesized wash, drop patter, puddle plinks, gutter drips |
| thunder | 5 | 100 ¢ | 2 dB | 2 / 4 s | physical model: tortuous channel of N-waves + in-cloud discharge, street acoustics |
| generator | 3 loops | 40 ¢ | 1.5 dB | 1 | synthesized single-cylinder four-stroke (exhaust, valves, rattle, fan, whine) |
| ui-click | 5 | 40 ¢ | 1.5 dB | 2 / 0.03 s | Kenney UI Audio |
| ui-confirm | 4 | 30 ¢ | 1 dB | 1 / 0.1 s | Kenney Interface Sounds |
| ui-error | 4 | 30 ¢ | 1 dB | 1 / 0.2 s | Kenney Interface Sounds |
| pickup | 5 | 60 ¢ | 2 dB | 2 / 0.05 s | Kenney RPG Audio cloth and handling + the item (bag, tin, board, coins) |
| amb-roomtone | 3 loops | — | 1 dB | 1 | fridge hum family on 50 Hz with duty cycle, air, the building settling |
| amb-night-street | 3 loops | — | 1 dB | 1 | wind gusts, far-off synthesized moans in the street |
| amb-horde-crowd | 3 loops | — | 1.5 dB | 2 | 12–20 synthesized voices at 4–30 m, shuffling feet, street acoustics |

## Music

Seven cues, composed as code (`tools/music/compositions/*.mjs`) with a small score DSL, written as MIDI and rendered
by the sampler. Loops are rendered twice and the second pass kept, so their reverb and release tails wrap around the
seam. Round robins and random draws restart at the loop point, so both passes are identical. Master EQ, glue
compression and limiting run on the whole render before the loop is cut out.

| Layer | File | Key, tempo | Length | Instruments |
| --- | --- | --- | --- | --- |
| pre-outbreak | `pre-outbreak.ogg` | D minor → F, 120 BPM | 16 bars, 32 s loop | claves clock, celli + violins pizzicato, marimba, clarinet and bassoon staccato, xylophone, snare, glockenspiel |
| day | `day.ogg` | F major, 80 BPM | 16 bars, 48 s loop | piano, harp, clarinet, flute, violas, celli, bass pizzicato, glockenspiel |
| night | `night.ogg` | D minor, 64 BPM | 16 bars, 60 s loop | upright piano (two hands), celli, violas, violins, contrabass, bowed vibraphone, timpani heartbeat |
| horde | `horde.ogg` | D minor / Phrygian, 128 BPM | 16 bars, 30 s loop | spiccato strings ostinato, horns, trombones, tuba, timpani, bass drum, toms, anvil, brake drum, snare, cymbal, piano |
| transition | `night-to-horde.ogg` | 128 BPM | 2 bars + hit + tail (7.25 s) | tremolo strings, timpani roll, cymbal swell, brass cluster; the hit on D |
| transition | `horde-end.ogg` | 128 BPM | the last blow + 6 s of decay | tam-tam, bass drum, timpani, brass, low strings, piano |
| ending | `ending.ogg` | D minor → D major, 72 BPM with ritardando | 18 bars (66.6 s) | piano, full strings, horns, timpani roll, cymbal, glockenspiel |

**Sync grid.** Night bars are 3.75 s and hold exactly two horde bars, so the horde layer can enter on any night bar
line. The transition is two horde bars long and its hit lands on the downbeat where the horde loop starts. The game
should switch layers on bar lines (`params.barSeconds` in the manifest).

**Instruments** are SFZ files (`tools/music/sfz/*.sfz`), one per articulation, written from a catalog of the pinned
library trees (`tools/music/catalog.json`: 40 articulations, 1146 samples). The sampler (`tools/music/sampler.mjs`)
plays this SFZ subset:
- key and velocity ranges, with velocity crossfades between layers (`xfin_*` / `xfout_*`)
- round robins (`seq_length` / `seq_position`)
- CC-triggered regions (`on_loccN`: the piano pedal noises)
- `ampeg_*` envelopes, the sustain pedal, velocity tracking
- a velocity-tracked low-pass (`fil_veltrack`)
- loops with a cross-faded seam, found automatically in the sustain when a note outlasts the recording (`loop_crossfade`)
- `offset_auto`, which skips the silence before the attack

Resampling is Kaiser-windowed sinc. The library file names use C3 = MIDI 60; the timpani are pitch-detected (YIN).
Each instrument's loudest layer is calibrated to −20 LUFS-M on a reference note (`tools/music/calibration.json`,
written into the SFZ as `volume`), so levels mean the same across libraries. Each composition then sets its balance
as target loudness per track (`level` in its `mix`), and the build computes the gains.

**Only what is played is downloaded.** For each note the build finds the regions it reaches (all round-robin
siblings included) and fetches exactly those files: 385 files, about 540 MB, out of the 6 GB of the two libraries.

Adding a cue: write `tools/music/compositions/<id>.mjs` (a `Score`, its tracks and a `mix`), add the id to
`COMPOSITIONS` in `tools/music/build.mjs`, run `node tools/music/build.mjs <id>`. Adding an instrument: an entry in
`tools/music/instruments.mjs` (folder, file-name pattern, layers, opcodes), then `node tools/music/instruments.mjs`
to refresh the catalog.

## The 60-second test

`assets/audio/test/audio-test-60s.json` is the script (84 cues). Variants, pitch and gain are drawn with the rules
above from a fixed seed, so the offline render and the live page play the same takes.

| Time | Section | What happens |
| --- | --- | --- |
| 0–10 s | Apartment at night | night layer fades in; room tone, the generator on the balcony, wind; footsteps on the wooden floor, onto the kitchen tiles, a pickup, UI click + confirm, the pan starts to sizzle |
| 10–20 s | Rain | rain rises behind the window (two layers), distant then nearer thunder, UI click + error, footsteps back |
| 20–30 s | A zombie at the door | a groan on the landing, slow heavy knocks, a moan, the first bangs (music ducks), the player hurries to the door; the riser starts on the bar at 26.25 s, near thunder |
| 30–45 s | The horde | the riser's hit and the horde layer on 30.0 s; the crowd in the street; bangs and groans from all over the landing, thunder, UI error / repair, a weapon picked up, running steps |
| 45–60 s | Quiet | the last blow (horde end), the crowd fades, two far groans, the night layer returns softly on the bar at 48.75 s, tired steps, far thunder; everything fades out by 60 s |

The page (`pages/audio-test.html`) builds the same graph live:
- `PannerNode` sources, HRTF by default, or equal-power as in the offline render
- `ConvolverNode` rooms with portals
- five faders with meters, mute buttons, and toggles for ducking and reverb
- a top view that shows which sources sound
- the cue sheet, and A/B against the offline render
- an auditioner for every family: every click plays another take, from a chosen position in a chosen space
- every music layer

**Measure live graph** renders the live graph in an `OfflineAudioContext` and measures it. The current build gives
−15.9 LUFS against −16.0 for the offline render. Without limiters on either side the two agree within 0.01 LU.

## Rebuild contract

Every entry of `assets/audio/manifest.json` names its `rebuild` recipe and carries the SHA-256 `digests` of each file
it ships (the contract of `src/contracts/assets.js`). `tools/asset-lock.mjs` re-bakes a seeded sample in a sandbox and
compares by spectrogram (SSIM ≥ 0.99, duration within 10 ms, loudness within 0.5 LU); MIDI and scene files byte for
byte.

| Recipe | Entry | Rebuilds | Cost (s) |
| --- | --- | --- | --- |
| `music` | `tools/music/build.mjs {name}` | one stem and its MIDI | 20 |
| `sfx` | `tools/audio/build-sfx.mjs {name}` | one family, all its takes | 8 |
| `ir` | `tools/audio/build-ir.mjs {name}` | one room IR | 2 |
| `test` | `tools/audio/mix.mjs` | the 60-second render and its scene | 15 |

Every recipe pins its tools (node 24.15.0, ffmpeg 9.0.2, sox 14.4.2, libvorbis 1.3.7) and shares `assets/cache` plus
the decoded-sample cache. Costs are the slowest measured re-bake (all 29 entries in 134 s from a cold cache) with
headroom. The builds are byte-deterministic:
- every random source is seeded: the scores, the sampler's round robins and random draws per track (restarted at loop
  points), synthesis seeded from fixed take names, the scene's variant bags, and the WAV dither
- sox encodes in repeatable mode (`-R`: a fixed Ogg stream serial)
- two full builds produce identical files and manifest

Inside the sandbox the fetcher is frozen: nothing outside the lock can be downloaded.

## Sources and licenses

All downloads are pinned in `assets/sources.lock.json` under `wp: WP-P0-06` (URL at a commit, bytes, SHA-256; for Kenney
zips also the SHA-256 of every audio member used) and credited in the WP-P0-06 section of `assets/CREDITS.md`, both merged
from the lane's fragments by the integrator. `tools/audio/build.mjs` reads the lane's fragment `assets/lock/WP-P0-06.json`
when there is one (else its ledger entries), prunes it to what the build used, and writes it with
`assets/credits/WP-P0-06.md` for the integrator to merge again.

- **VSCO 2 Community Edition** and **VCSL** (Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell), CC0, from
  GitHub at pinned commits.
- **Kenney** Impact Sounds, Interface Sounds, RPG Audio, UI Audio, CC0.
- **Sonniss GDC bundles**: the official pages answered HTTP 403 to scripted requests (also with a browser user agent)
  on 2026-09-22, and the bundles are multi-GB archives without per-file downloads. The fallback is Kenney plus
  synthesis. The attempt is recorded in the lock.
- Everything else (music, synthesized sounds, IRs, mixes) is `LicenseRef-Original`, made by these scripts.

## For the game integration (later packages)

`src/engine/audio.js` still synthesizes its sound live. When it moves to these assets:
- map its moods to the layers (pre, home day/night, horde, explore → day/night variations, ending, death)
- map its cues to the families (door → door-bang/knock, groan → zombie-groan, sizzle → cooking-sizzle, thunder,
  click → ui-click, …)
- keep the variant rules, the bar-synced layer changes and the per-home music (the Warehouse Manager's home
  alternates two tracks)
