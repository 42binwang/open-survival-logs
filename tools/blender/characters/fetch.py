"""Sources of the character pipeline: pinned downloads, verification and unpacking.

    python3 tools/blender/characters/fetch.py            restore: download what is missing from assets/cache, verify
                                                          every SHA-256 (archives and the members the pipeline reads),
                                                          unpack MPFB and the asset packs into the isolated Blender
                                                          profile (.work/blender_user)
    python3 tools/blender/characters/fetch.py --offline  the same without downloading
    python3 tools/blender/characters/fetch.py --lock     (re)write assets/lock/WP-P0-09.json and assets/credits/WP-P0-09.md
                                                          from SOURCES below and the files in assets/cache

The lock fragment follows WP-P0-05's schema (tools/fetch-assets.mjs): {schema, wp, sources: [{id, provider, title,
page, license, licenseUrl, authors, kind, usedFor, retrieved, files: [{url, path, bytes, sha256}]}]}; files are cached
at assets/cache/<id>/<path>. Two optional fields are this pipeline's: files[].usedMembers (SHA-256 of every archive
member the pipeline reads) and files[].extractTo (where build.py unpacks the archive). Standard library only.
"""

import datetime
import hashlib
import json
import os
import shutil
import sys
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipeline as common  # noqa: E402

WP = "WP-P0-09"
UA = "SurvivalLogs-character-pipeline/1 (private build)"
ALLOWED_HOSTS = ("extensions.blender.org", "files.makehumancommunity.org", "files2.makehumancommunity.org",
                 "dl.polyhaven.org", "mocap.cs.cmu.edu")

CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
MH_ASSETS = "https://static.makehumancommunity.org/assets/assetpacks"
MH_FILES = "https://files.makehumancommunity.org/asset_packs"
PH_PNG = "https://dl.polyhaven.org/file/ph-assets/Textures/png"
CMU = "http://mocap.cs.cmu.edu/subjects"
CMU_TERMS = ("CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), created with funding from NSF EIA-0196217: "
             "'The motion capture data may be copied, modified, or redistributed without permission.'")


def mh_pack(pack, title, members, used_for, authors=("MakeHuman team (system assets)",)):
    return {
        "id": f"makehuman/{pack}",
        "provider": "MakeHuman Community asset packs (MPFB system assets)",
        "title": title,
        "page": f"{MH_ASSETS}/{pack}.html",
        "license": "CC0-1.0",
        "licenseUrl": CC0,
        "authors": list(authors),
        "kind": "model",
        "usedFor": used_for,
        "files": [{"url": f"{MH_FILES}/{pack}/{pack}_cc0.zip", "path": f"{pack}_cc0.zip", "usedPrefixes": members,
                   "extractTo": "mpfb-data"}],
        "notes": f"Per-asset license 'CC0' in packs/{pack}.json inside the archive; the MakeHuman assets carry the CC0 "
                 "release statement of September 2020 in their headers.",
    }


def polyhaven(slug, res, title, authors, maps, used_for):
    return {
        "id": f"polyhaven/{slug}@{res}",
        "provider": "Poly Haven",
        "title": title,
        "page": f"https://polyhaven.com/a/{slug}",
        "license": "CC0-1.0",
        "licenseUrl": "https://polyhaven.com/license",
        "authors": authors,
        "kind": "texture",
        "creationMethod": "Photoscan",
        "usedFor": used_for,
        "files": [{"url": f"{PH_PNG}/{res}/{slug}/{slug}_{m}_{res}.png", "path": f"{slug}_{m}_{res}.png"} for m in maps],
    }


def cmu(subject, trials, title, used_for):
    s = f"{subject:02d}"
    return {
        "id": f"cmu/{s}",
        "provider": "CMU Graphics Lab Motion Capture Database",
        "title": title,
        "page": f"http://mocap.cs.cmu.edu/search.php?subjectnumber={subject}",
        "license": "LicenseRef-CMU-Mocap",
        "licenseUrl": "http://mocap.cs.cmu.edu/faqs.php",
        "authors": ["Carnegie Mellon University Graphics Lab"],
        "kind": "animation",
        "creationMethod": "Optical motion capture (Vicon), Acclaim ASF/AMC",
        "usedFor": used_for,
        "files": [{"url": f"{CMU}/{s}/{s}.asf", "path": f"{s}.asf"}] + [{"url": f"{CMU}/{s}/{s}_{t:02d}.amc", "path": f"{s}_{t:02d}.amc"} for t in trials],
        "notes": CMU_TERMS,
    }


SOURCES = [
    {
        "id": "mpfb/2.0.17",
        "provider": "MPFB (MakeHuman Plugin For Blender), Blender Extensions",
        "title": "MPFB 2.0.17",
        "page": "https://extensions.blender.org/add-ons/mpfb/",
        "license": "CC0-1.0",
        "licenseUrl": "https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md",
        "authors": ["Joel Palmius", "MakeHuman team"],
        "kind": "model",
        "usedFor": ["base mesh hm08, macro targets (phenotype), game_engine rig and skin weights, clothes fitting "
                    "(characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"],
        "files": [{
            "url": "https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip",
            "path": "add-on-mpfb-v2.0.17.zip",
            "usedPrefixes": ["blender_manifest.toml", "data/3dobjs/base.obj", "data/rigs/standard/rig.game_engine.json",
                             "data/rigs/standard/weights.game_engine.json"],
            "extractTo": "mpfb-extension",
        }],
        "notes": "Split license (LICENSE.md of the MPFB repository): the bundled assets (base mesh, proxies, targets, "
                 "rigs, weights, textures) are CC0-1.0; the add-on's program code is GPL-3.0-or-later and is only run "
                 "at build time in an isolated Blender profile, never shipped. MPFB's license disclaims any claim on "
                 "its output (exports, renders, saved models).",
    },
    mh_pack("makehuman_system_assets", "MakeHuman system assets",
            ["packs/makehuman_system_assets.json", "clothes/male_casualsuit02/", "clothes/male_casualsuit03/",
             "clothes/male_casualsuit05/", "clothes/male_casualsuit06/", "clothes/male_worksuit01/", "clothes/shoes06/", "hair/ponytail01/", "hair/short01/",
             "hair/short02/", "hair/short03/", "hair/short04/", "eyebrows/eyebrow001/", "eyebrows/eyebrow005/",
             "eyebrows/eyebrow008/", "eyebrows/eyebrow010/", "eyelashes/eyelashes01/", "eyelashes/eyelashes02/",
             "eyes/low-poly/", "eyes/materials/brown", "skins/young_asian_male/", "skins/young_asian_female/",
             "skins/middleage_asian_male/", "skins/middleage_caucasian_male/", "skins/middleage_african_male/"],
            ["male_casualsuit02 (crew top recoloured as the hoodie, the pack's jeans), shoes06 (recoloured dark, white "
             "soles), short04 hair, eyebrow001, eyelashes01, low-poly eyes, brown eye material, young_asian_male skin "
             "(characters/wage)",
             "male_casualsuit02 (a dusty-rose hoodie, the pack's jeans), shoes06 (recoloured pale), ponytail01 hair, "
             "eyebrow010, eyelashes02, young_asian_female skin (characters/college)",
             "male_casualsuit05 (the jacket's body as an orange hi-vis vest, its sleeves navy, the pack's shirt, the jeans "
             "as khaki work trousers), shoes06 (recoloured brown), short02 hair (greyed), eyebrow005, "
             "middleage_asian_male skin (characters/manager)",
             "male_casualsuit03 (the striped shirt, the jeans as grey office trousers), shoes06 (black), short01 hair, "
             "middleage_caucasian_male skin tinted grey-green (characters/zombie_a); male_worksuit01 overalls, shoes06, "
             "short03 hair, eyebrow008, middleage_african_male skin tinted (characters/zombie_b); male_casualsuit06 "
             "T-shirt and jeans, shoes06, short04 hair, middleage_caucasian_male skin tinted (characters/zombie_big); "
             "all faded, dirtied, bloodied and torn in the bake"]),
    mh_pack("skins02", "Skins 02 (natural male skins)",
            ["packs/skins02.json", "skins/mindfront_aksel_skin/"],
            ["mindfront_aksel_skin normal and specular maps: skin pore/wrinkle normal and roughness (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"],
            ("Mindfront",)),
    polyhaven("jogging_melange", "1k", "Jogging Melange", ["colormass", "Rico Cilliers"], ["diff", "nor_gl", "rough"],
              ["hoodie and hood: heathered jersey variation, normal and roughness (characters/wage, college); the "
               "backpack (characters/college) and the hi-vis vest (characters/manager), at lower contrast"]),
    cmu(82, [8], "Subject 82 (jumping, pushing, emotional walks), trial 8: stand still; casual walk forward",
        ["idle clip: the stand-still part; hit clip: its base pose under the procedural flinch (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(35, [1], "Subject 35 (walk, run), trial 1: walk", ["walk clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(16, [46], "Subject 16 (run, jump, walk), trial 46: run/jog", ["run clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(79, [1, 14, 15, 26], "Subject 79 (actor everyday activities), trials 1, 14, 15, 26: chopping wood; making dough; "
        "eating a sandwich; planting a tree",
        ["attack clip: chopping wood; use clip: making dough; eat clip: eating a sandwich; work clip: planting a tree "
         "(characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(13, [4], "Subject 13 (various everyday behaviors), trial 4: sit on stepstool, chin in hand",
        ["sit clip: the seated part, hands in the lap (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(115, [6], "Subject 115 (bending over), trial 6: picking box up, bending knees", ["pickup clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(90, [18], "Subject 90 (cartwheels; acrobatics; dances), trial 18: rug pull fall", ["death clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
    cmu(140, [8], "Subject 140 (getting up from ground), trial 8: get up from ground laying on back",
        ["sleep clip: the pose lying on the back before getting up (characters/wage, college, manager, zombie_a, zombie_b, zombie_big)"]),
]


def log(*a):
    print("[fetch]", *a, flush=True)


def download(url, dest):
    host = urllib.parse.urlparse(url).hostname or ""
    if not any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS):
        raise RuntimeError(f"{host} is not an allowed source host")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    os.replace(tmp, dest)


def zip_member_hashes(path, prefixes):
    out = {}
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            if info.is_dir() or not any(info.filename == p or info.filename.startswith(p) for p in prefixes):
                continue
            out[info.filename] = hashlib.sha256(z.read(info)).hexdigest()
    return dict(sorted(out.items()))


def lock():
    """Writes the lock and credit fragments from SOURCES and the cached files."""
    today = datetime.date.today().isoformat()
    old = {s["id"]: s for s in common.load_json(common.LOCK)["sources"]} if os.path.exists(common.LOCK) else {}
    out = []
    for src in SOURCES:
        entry = {k: v for k, v in src.items() if k != "files"}
        entry["retrieved"] = old.get(src["id"], {}).get("retrieved", today)
        entry["files"] = []
        for f in src["files"]:
            p = common.cache(src["id"], f["path"])
            if not os.path.exists(p):
                download(f["url"], p)
            rec = {"url": f["url"], "path": f["path"], "bytes": os.path.getsize(p), "sha256": common.sha256_file(p)}
            if f.get("usedPrefixes"):
                rec["usedMembers"] = zip_member_hashes(p, f["usedPrefixes"])
            if f.get("extractTo"):
                rec["extractTo"] = f["extractTo"]
            entry["files"].append(rec)
        out.append(entry)
        log("locked", src["id"], sum(x["bytes"] for x in entry["files"]), "bytes")
    frag = {"schema": 1, "wp": WP, "sources": sorted(out, key=lambda s: s["id"])}
    common.save_json(common.LOCK, frag)
    write_credits(frag)


def write_credits(frag):
    esc = lambda s: str(s).replace("|", "\\|")  # noqa: E731
    lines = [
        f"# Credits — {WP}",
        "",
        "Generated by `python3 tools/blender/characters/fetch.py --lock` from `assets/lock/WP-P0-09.json` (which also",
        "lists the SHA-256 of every archive member the character pipeline reads). The integrator merges this fragment",
        "into `assets/CREDITS.md`.",
        "",
        "## Assets",
        "",
        "| Asset | Provider | Author(s) | License | Used for |",
        "| --- | --- | --- | --- | --- |",
    ]
    for s in frag["sources"]:
        lines.append(f"| [{esc(s['title'])}]({s['page']}) (`{s['id']}`) | {esc(s['provider'])} | {esc(', '.join(s['authors']))} | "
                     f"[{s['license']}]({s['licenseUrl']}) | {esc('; '.join(s['usedFor']))} |")
    lines += [
        "",
        "Motion capture: the data used in this project was obtained from mocap.cs.cmu.edu. The database was created with",
        "funding from NSF EIA-0196217.",
        "",
        "Made here (LicenseRef-Original, inputs above): the hood and drawstrings (generated on the top by",
        "`tools/blender/characters/character.py`), the garment recolouring and the baked texture atlases, the",
        "retargeting, loops, foot locking and root-motion extraction of the clips, and the procedural layers on two",
        "of them (the hit clip's backward flinch, the sleep clip's breathing).",
        "",
        "## Tools (build time only, not shipped)",
        "",
        "| Tool | Author(s) | License | Used for |",
        "| --- | --- | --- | --- |",
        "| MPFB 2.0.17 add-on code | Joel Palmius, MakeHuman team | GPL-3.0-or-later | builds the human in headless Blender |",
        "| Blender 5.2.2 LTS | Blender Foundation | GPL-3.0-or-later | modelling, baking (Cycles), glTF export, renders |",
        "| KTX-Software 4.4.2 (`ktx create`) via WP-P0-05's `tools/bin/install-ktx.sh` | The Khronos Group | Apache-2.0 | KTX2 (Basis Universal) textures |",
        "| glTF-Transform 4.5.0 (core, extensions, functions) | Don McCurdy | MIT | meshopt compression, texture swap, validation |",
        "| meshoptimizer 1.2.0 | Arseny Kapoulkine | MIT | EXT_meshopt_compression encoder / decoder |",
        "| three.js 0.186.0 (GLTFLoader, meshopt decoder) | three.js authors | MIT | loads the character in tests/characters.test.js |",
        "",
        "## Downloads (URL and SHA-256)",
        "",
    ]
    for s in frag["sources"]:
        lines.append(f"- `{s['id']}`")
        for f in s["files"]:
            lines.append(f"  - {f['url']} — {f['bytes']} bytes — `{f['sha256']}`")
    lines.append("")
    os.makedirs(os.path.dirname(common.CREDITS), exist_ok=True)
    with open(common.CREDITS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def locked_sources():
    """This pipeline's pinned sources: from the merged ledger (assets/sources.lock.json) and/or this package's
    fragment (assets/lock/WP-P0-09.json, which the integrator folds into the ledger). Unpack targets come from
    SOURCES, so they survive the merge."""
    ids = {s["id"]: s for s in SOURCES}
    found = {}
    for path in (common.LEDGER, common.LOCK):
        if os.path.exists(path):
            for s in common.load_json(path).get("sources", []):
                if s["id"] in ids:
                    found[s["id"]] = s
    missing = [i for i in ids if i not in found]
    if missing:
        raise SystemExit(f"not in the asset lock: {', '.join(missing)} (run fetch.py --lock)")
    for sid, s in found.items():
        extract = {f["path"]: f.get("extractTo") for f in ids[sid]["files"]}
        for f in s["files"]:
            f.setdefault("extractTo", extract.get(f["path"]))
    return {"sources": [found[i] for i in ids]}


def restore(offline=False):
    frag = locked_sources()
    guard = os.path.join(common.CACHE, ".gitignore")
    if not os.path.exists(guard):
        os.makedirs(common.CACHE, exist_ok=True)
        with open(guard, "w", encoding="utf-8") as fh:
            fh.write("# restorable by node tools/fetch-assets.mjs --verify\n*\n")
    problems = []
    for src in frag["sources"]:
        for f in src["files"]:
            p = common.cache(src["id"], f["path"])
            ok = os.path.exists(p) and os.path.getsize(p) == f["bytes"] and common.sha256_file(p) == f["sha256"]
            if not ok:
                if offline:
                    problems.append(f"{src['id']}/{f['path']}: missing or corrupt (offline)")
                    continue
                log("downloading", f["url"])
                download(f["url"], p)
                if common.sha256_file(p) != f["sha256"]:
                    problems.append(f"{src['id']}/{f['path']}: SHA-256 mismatch after download")
                    continue
            if f.get("usedMembers"):
                got = zip_member_hashes(p, list(f["usedMembers"]))
                bad = [m for m, h in f["usedMembers"].items() if got.get(m) != h]
                if bad:
                    problems.append(f"{src['id']}/{f['path']}: {len(bad)} member(s) differ from the lock, e.g. {bad[0]}")
            dest = {"mpfb-extension": common.MPFB_DIR, "mpfb-data": common.MPFB_USER_DATA}.get(f.get("extractTo", ""))
            if dest:
                stamp = os.path.join(dest, f".unpacked-{f['sha256'][:16]}")
                if not os.path.exists(stamp):
                    os.makedirs(dest, exist_ok=True)
                    with zipfile.ZipFile(p) as z:
                        for info in z.infolist():
                            target = os.path.realpath(os.path.join(dest, info.filename))
                            if not target.startswith(os.path.realpath(dest) + os.sep):
                                raise RuntimeError(f"unsafe member {info.filename}")
                        z.extractall(dest)
                    open(stamp, "w").close()
                    log("unpacked", f["path"], "->", os.path.relpath(dest, common.ROOT))
    if problems:
        for pr in problems:
            log("PROBLEM", pr)
        sys.exit(1)
    log(f"{sum(len(s['files']) for s in frag['sources'])} files of {len(frag['sources'])} sources verified")


if __name__ == "__main__":
    if "--lock" in sys.argv:
        lock()
    else:
        restore(offline="--offline" in sys.argv)
