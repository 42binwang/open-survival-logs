"""Reference boards for docs/art (WP-P0-04): contact sheets and concept mood-board stamping (the lamp board is drawn
by measure.py lamps).

    tools/targets/.venv/bin/python tools/targets/boards.py contact
    tools/targets/.venv/bin/python tools/targets/boards.py mood <generated.png> [...]   # stamps CONCEPT ONLY

Mood boards come from an image-generation model and are concept-only: the stamp is burned into the pixels so they
can never be mistaken for, or shipped as, game assets.
"""

import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'targets', 'source')
OUT = os.path.join(ROOT, 'tools', 'targets', 'out')
ART = os.path.join(ROOT, 'docs', 'art')
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
FONT_B = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def sheet(entries, out, title, cols=7, tw=320, th=180):
    rows = math.ceil(len(entries) / cols)
    im = Image.new('RGB', (cols * (tw + 6) + 6, 40 + rows * (th + 26)), (16, 16, 18))
    dr = ImageDraw.Draw(im)
    f, fb = ImageFont.truetype(FONT, 13), ImageFont.truetype(FONT_B, 18)
    dr.text((8, 10), title, fill=(240, 240, 240), font=fb)
    for i, (path, label) in enumerate(entries):
        x, y = 6 + (i % cols) * (tw + 6), 40 + (i // cols) * (th + 26)
        im.paste(Image.open(path).convert('RGB').resize((tw, th), Image.LANCZOS), (x, y))
        dr.text((x, y + th + 4), label, fill=(220, 220, 220), font=f)
    im.save(out, quality=85)


def contact():
    m = json.load(open(os.path.join(SRC, 'manifest.json')))
    os.makedirs(os.path.join(ART, 'contact'), exist_ok=True)
    shots = [f for f in m['files'] if f['kind'] == 'trailer-shot']
    even = [f for f in m['files'] if f['kind'] == 'trailer-even']
    ss = [f for f in m['files'] if f['kind'] == 'screenshot']

    def lab(f):
        extra = f.get('extra') or {}
        cut = f" {extra.get('cutKind', '')}" if extra.get('cutKind') else ''
        return f"{os.path.basename(f['file'])[:8]} {f['timecode'][3:]}{cut}"

    sheet([(os.path.join(SRC, f['file']), lab(f)) for f in shots], os.path.join(ART, 'contact', 'trailer_shots.jpg'),
          f"Trailer 257229528: one frame per distinct shot ({len(shots)}), mid-shot, with the boundary type that opened it")
    sheet([(os.path.join(SRC, f['file']), lab(f)) for f in even], os.path.join(ART, 'contact', 'trailer_even.jpg'),
          f'Trailer 257229528: {len(even)} evenly spaced frames')
    sheet([(os.path.join(SRC, f['file']), os.path.basename(f['file'])) for f in ss], os.path.join(ART, 'contact', 'screenshots.jpg'),
          f'Steam store screenshots ({len(ss)}), native 1920x1080', cols=4, tw=480, th=270)


MOOD_SOURCES = {
    'mood_golden_cutaway': 'trailer/shot_24_t035.212s.jpg (t035)',
    'mood_night_lamps_rain': 'trailer/shot_23_t033.500s.jpg (t033)',
    'mood_blackout_flashlight': 'trailer/shot_13_t022.650s.jpg (t013)',
}


def mood(paths):
    os.makedirs(os.path.join(ART, 'mood'), exist_ok=True)
    fb = ImageFont.truetype(FONT_B, 34)
    f = ImageFont.truetype(FONT, 20)
    for p in paths:
        im = Image.open(p).convert('RGB')
        if im.width > 1920:
            im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
        dr = ImageDraw.Draw(im, 'RGBA')
        dr.rectangle([0, 0, im.width, 58], fill=(160, 20, 20, 225))
        dr.text((16, 10), 'CONCEPT ONLY - AI-generated mood board - not a game asset, never ship', fill=(255, 255, 255), font=fb)
        name = os.path.splitext(os.path.basename(p))[0]
        dr.rectangle([0, im.height - 62, im.width, im.height], fill=(0, 0, 0, 190))
        dr.text((12, im.height - 57), f'Image-to-image re-render of {MOOD_SOURCES.get(name, "a reference frame")}; the sun is harder and more cinematic than the source.',
                fill=(235, 235, 235), font=f)
        dr.text((12, im.height - 30), 'Mood only: not a layout, modelling, lighting or colour reference. docs/ART.md numbers win.',
                fill=(235, 235, 235), font=f)
        out = os.path.join(ART, 'mood', 'concept_' + os.path.splitext(os.path.basename(p))[0].replace('mood_', '') + '.jpg')
        im.save(out, quality=86)
        print(out)


if __name__ == '__main__':
    cmd, *rest = sys.argv[1:] or ['contact']
    if cmd == 'mood':
        mood(rest)
    else:
        for c in [cmd] + rest:
            {'contact': contact}[c]()
