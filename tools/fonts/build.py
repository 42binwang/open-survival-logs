#!/usr/bin/env python3
"""UI fonts: Noto Sans (Latin) and Noto Sans SC (Chinese), subset and instanced to WOFF2 for the UI kit.

    tools/fonts/build.sh [--only noto-sans,noto-sans-sc]   build assets/fonts/ and assets/fonts/manifest.json
    tools/fonts/build.sh --collect                           rewrite tools/fonts/charset.json from src/

Sources are the variable TTFs of the Google Fonts repository (SIL OFL 1.1), locked in assets/sources.lock.json and
restored into assets/cache/ by tools/fetch-assets.mjs. The build reads only the committed charset
(tools/fonts/charset.json), never src/, so a re-bake is hermetic; `--collect` refreshes the charset when the game's
strings change, and tests/fonts.test.js fails while a character the game shows is missing from it.

Both faces keep a variable weight axis limited to 400 … 700 (regular, medium, semibold and bold from one file); Noto
Sans' width axis is pinned at 100. Hinting is dropped. The output is byte-for-byte reproducible for the pinned
fontTools and brotli (requirements.txt): no timestamps are recalculated and the subsetter is deterministic.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys

from fontTools import subset, version as FONTTOOLS_VERSION
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
CHARSET = os.path.join(HERE, 'charset.json')
OUT = os.path.join(ROOT, 'assets', 'fonts')
MANIFEST = os.path.join(OUT, 'manifest.json')

COMMIT = 'b5efa9c32e8f'
WEIGHTS = (400, 700)

# CJK blocks (radicals, punctuation, kana, ideographs, compatibility, vertical/small forms, full-width forms).
CJK = re.compile(r'[\u2e80-\u9fff\uf900-\ufaff\ufe10-\ufe1f\ufe30-\ufe4f\uff00-\uffef]')
# Every face covers ASCII, Latin-1 and the common typographic punctuation, whatever the strings hold today.
BASE = [*range(0x20, 0x7f), *range(0xa0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x2030,
        0x2039, 0x203a, 0x20ac, 0x2122, 0x2212]
# The language names the English UI shows in Chinese (src/ui/menus.js).
LANGUAGE_NAMES = '中文简体'

FACES = {
    'noto-sans': {
        'title': 'Noto Sans (Latin UI text)',
        'family': 'Noto Sans',
        'source': f'googlefonts/notosans@{COMMIT}',
        'ttf': 'NotoSans[wdth,wght].ttf',
        'axes': {'wdth': 100, 'wght': WEIGHTS},
        'cjk': False,
        'woff2': 'assets/fonts/noto-sans/NotoSans.woff2',
        'license': 'assets/fonts/noto-sans/OFL.txt',
    },
    'noto-sans-sc': {
        'title': 'Noto Sans SC (Chinese UI text), subset to the characters the game shows',
        'family': 'Noto Sans SC',
        'source': f'googlefonts/notosanssc@{COMMIT}',
        'ttf': 'NotoSansSC[wght].ttf',
        'axes': {'wght': WEIGHTS},
        'cjk': True,
        # The face's CSS unicode-range, and what the subset may hold: ASCII, Latin-1, general punctuation and the CJK
        # blocks. Symbols (arrows, shapes, emoji) are left to the system fonts in both languages, so a ★ or an emoji
        # on an English screen never pulls in the Chinese file.
        'range': [(0x20, 0x7e), (0xa0, 0xff), (0x2000, 0x206f), (0x2e80, 0x9fff), (0xf900, 0xfaff), (0xfe10, 0xfe1f),
                  (0xfe30, 0xfe4f), (0xff00, 0xffef)],
        'woff2': 'assets/fonts/noto-sans-sc/NotoSansSC.woff2',
        'license': 'assets/fonts/noto-sans-sc/OFL.txt',
    },
    # The only Chinese an English session shows is the language switch (中文 on the title, 简体中文 in Settings). This
    # slice holds just those characters; its @font-face rule comes after the full face's, so the browser tries it
    # first for them and an English session never downloads the full Chinese file.
    'noto-sans-sc-lang': {
        'title': 'Noto Sans SC, the language names only (the Chinese an English session shows)',
        'family': 'Noto Sans SC',
        'source': f'googlefonts/notosanssc@{COMMIT}',
        'ttf': 'NotoSansSC[wght].ttf',
        'axes': {'wght': WEIGHTS},
        'cjk': True,
        'only': LANGUAGE_NAMES,
        'woff2': 'assets/fonts/noto-sans-sc/NotoSansSC-lang.woff2',
        'license': 'assets/fonts/noto-sans-sc/OFL.txt',
    },
}

RECIPE = {
    'entry': 'tools/fonts/build.sh',
    'args': ['--only', '{name}'],
    'inputs': ['tools/fonts/', 'tools/fetch-assets.mjs', 'assets/sources.lock.json'],
    'shared': ['assets/cache'],
    'persist': ['tools/fonts/.venv'],
    'tools': {'python': '>=3.9', 'fonttools': '4.60.2', 'brotli': '1.2.0'},
    'cost': 60,
    'timeoutSec': 600,
}


def collect():
    """Every non-ASCII character in the shipped sources (src/, index.html, styles.css), CJK and other."""
    chars = set()
    paths = [os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'styles.css')]
    for d, dirs, files in os.walk(os.path.join(ROOT, 'src')):
        dirs.sort()
        paths += [os.path.join(d, f) for f in sorted(files) if f.endswith(('.js', '.json', '.css', '.html'))]
    for p in paths:
        with open(p, encoding='utf-8') as fh:
            text = fh.read()
        chars.update(c for c in text if ord(c) > 0x7e and c.isprintable())
    cjk = ''.join(sorted(c for c in chars if CJK.match(c)))
    other = ''.join(sorted(c for c in chars if not CJK.match(c)))
    doc = {
        'note': 'Characters the UI shows, collected from src/, index.html and styles.css by `tools/fonts/build.sh --collect`. '
                'The font build reads only this file. Noto Sans SC is subset to cjk + other + the base ranges of '
                'tools/fonts/build.py; Noto Sans to other + the base ranges (each limited to what the face has).',
        'cjk': cjk,
        'other': other,
    }
    with open(CHARSET, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'charset: {len(cjk)} CJK and {len(other)} other characters -> {os.path.relpath(CHARSET, ROOT)}')


def sha256(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def cache_dir(source_id):
    return os.path.join(ROOT, 'assets', 'cache', *source_id.split('/'))


def build_face(name, face, charset):
    src = os.path.join(cache_dir(face['source']), face['ttf'])
    font = TTFont(src, recalcTimestamp=False)
    cmap = font.getBestCmap()
    wanted = set(BASE) | {ord(c) for c in charset['other']}
    if face['cjk']:
        wanted |= {ord(c) for c in charset['cjk']}
    if face.get('only'):
        wanted = {ord(c) for c in face['only']}
    if face.get('range'):
        wanted = {u for u in wanted if any(lo <= u <= hi for lo, hi in face['range'])}
    unicodes = sorted(u for u in wanted if u in cmap)
    missing = sorted(u for u in (wanted if face.get('only') else {ord(c) for c in charset['cjk']} if face['cjk'] else set(BASE)) if u not in cmap)
    if missing:
        print(f'{name}: {len(missing)} wanted characters are not in the source face: {"".join(map(chr, missing[:40]))}')

    opts = subset.Options()
    opts.layout_features = ['*']
    opts.layout_scripts = ['latn', 'DFLT', 'hani', 'kana'] if face['cjk'] else ['latn', 'DFLT']
    opts.hinting = False
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.name_languages = [0x409]
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.drop_tables += ['BASE', 'vhea', 'vmtx', 'VORG']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)

    font = instancer.instantiateVariableFont(font, dict(face['axes']))
    # The default instance is now Regular (Noto Sans SC's source default is Thin): name it so.
    names = font['name']
    for name_id in (16, 17, 25):
        names.removeNames(nameID=name_id)
    ps = face['family'].replace(' ', '')
    for name_id, value in ((1, face['family']), (2, 'Regular'), (4, f"{face['family']} Regular"), (6, f'{ps}-Regular')):
        names.setName(value, name_id, 3, 1, 0x409)
    font['OS/2'].usWeightClass = 400
    font.recalcTimestamp = False
    font.flavor = 'woff2'
    out = os.path.join(ROOT, face['woff2'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    font.save(out)
    shutil.copyfile(os.path.join(cache_dir(face['source']), 'OFL.txt'), os.path.join(ROOT, face['license']))

    axes = {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {}
    cjk_count = sum(1 for u in unicodes if CJK.match(chr(u)))
    return {
        'unicodes': unicodes,
        'meta': {
            'sizeBytes': os.path.getsize(out),
            'glyphs': len(font.getGlyphOrder()),
            'characters': len(unicodes),
            'cjkCharacters': cjk_count,
            'axes': axes,
        },
    }


def css_range(ranges):
    return ', '.join(f'U+{lo:X}' if lo == hi else f'U+{lo:X}-{hi:X}' for lo, hi in ranges)


def runs(unicodes):
    """Consecutive runs of a sorted code point list, as (first, last) pairs."""
    out = []
    for u in unicodes:
        if out and u == out[-1][1] + 1:
            out[-1] = (out[-1][0], u)
        else:
            out.append((u, u))
    return out


def entry(name, face, built):
    e = {
        'id': f'fonts/{name}',
        'kind': 'font',
        'path': face['woff2'],
        'license': 'OFL-1.1',
        'sources': [face['source']],
        'files': {'woff2': face['woff2'], 'license': face['license']},
        'rebuild': 'fonts',
        'digests': {face['woff2']: sha256(os.path.join(ROOT, face['woff2'])), face['license']: sha256(os.path.join(ROOT, face['license']))},
        'params': {
            'title': face['title'],
            'family': face['family'],
            'format': 'woff2',
            'weights': list(WEIGHTS),
            'axes': {k: (list(v) if isinstance(v, tuple) else v) for k, v in face['axes'].items()},
            'fontDisplay': 'swap',
            'unicodeRange': css_range(face.get('range') or runs(built['unicodes'])),
        },
        'meta': built['meta'],
    }
    return e


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated face names (noto-sans, noto-sans-sc)')
    ap.add_argument('--collect', action='store_true', help='rewrite tools/fonts/charset.json from src/ and exit')
    a = ap.parse_args()
    if a.collect:
        collect()
        return 0
    with open(CHARSET, encoding='utf-8') as fh:
        charset = json.load(fh)
    names = a.only.split(',') if a.only else list(FACES)
    for n in names:
        if n not in FACES:
            print(f'unknown face {n!r}; faces: {", ".join(FACES)}', file=sys.stderr)
            return 2
    manifest = None
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as fh:
            manifest = json.load(fh)
    entries = {e['id']: e for e in (manifest or {}).get('assets', [])}
    for n in names:
        built = build_face(n, FACES[n], charset)
        entries[f'fonts/{n}'] = entry(n, FACES[n], built)
        m = built['meta']
        print(f'{n}: {m["sizeBytes"]} bytes, {m["characters"]} characters ({m["cjkCharacters"]} CJK), {m["glyphs"]} glyphs')
    doc = {
        'schema': 'survival-logs/asset-manifest@1',
        'wp': 'WP-P1-fonts',
        'note': 'UI typefaces (SIL OFL 1.1), WOFF2 with a variable weight axis 400 … 700, subset by tools/fonts/build.py '
                'from the locked Google Fonts TTFs to tools/fonts/charset.json. OFL.txt ships beside each face. The '
                '@font-face rules are in src/ui/kit/fonts.css; the tokens --ui-font-latin and --ui-font-cjk name the '
                'families (docs/UI.md §3.2).',
        'rebuild': {'fonts': RECIPE},
        'assets': [entries[k] for k in sorted(entries)],
    }
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f'fontTools {FONTTOOLS_VERSION}; wrote {os.path.relpath(MANIFEST, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
