"""The character pipeline, end to end: pinned sources -> MPFB human -> game mesh and baked atlases -> CMU clips ->
glTF -> KTX2 + meshopt -> manifest -> renders.

    python3 tools/blender/characters/build.py                     all stages for the Wage Slave (wage.json)
    python3 tools/blender/characters/build.py --only render       one stage (setup, character, animate, export,
                                                                   compress, manifest, render); comma-separated list ok
    python3 tools/blender/characters/build.py --recipe other.json --clips other_clips.json
    python3 tools/blender/characters/build.py --offline           never download (the cache must be complete)

Needs Blender 5.2 ($BLENDER, default /Applications/Blender.app), Node 24 and npm; KTX-Software 4.4.2 comes from
tools/bin/ktx (WP-P0-05) when present, otherwise the same pinned release is unpacked into .work/ktx. Outputs:
assets/characters/<id>/<id>.glb, assets/characters/manifest.json, docs/art/characters/*.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipeline as common  # noqa: E402
import fetch  # noqa: E402

STAGES = ["setup", "character", "animate", "export", "compress", "manifest", "render"]

# The release WP-P0-05 pins in tools/bin/install-ktx.sh (same package, same digest).
KTX_VERSION = "4.4.2"
KTX_PKG = f"KTX-Software-{KTX_VERSION}-Darwin-arm64.pkg"
KTX_URL = f"https://github.com/KhronosGroup/KTX-Software/releases/download/v{KTX_VERSION}/{KTX_PKG}"
KTX_SHA = "500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c"

NODE_DEPS = ["@gltf-transform/core@4.5.0", "@gltf-transform/extensions@4.5.0", "@gltf-transform/functions@4.5.0",
             "meshoptimizer@1.2.0", "three@0.186.0"]


def log(*a):
    print("[build]", *a, flush=True)


def run(cmd, env=None, summary=False):
    t0 = time.time()
    log("$", " ".join(os.path.relpath(c, common.ROOT) if isinstance(c, str) and c.startswith(common.ROOT) else str(c) for c in cmd))
    res = subprocess.run(cmd, env={**os.environ, **(env or {})}, cwd=common.ROOT, capture_output=True, text=True)
    out = res.stdout + res.stderr
    for line in out.splitlines():
        if line.startswith(("[character]", "[animate]", "[compress]", "[render]", "[fetch]")) or "Error" in line or "Traceback" in line:
            print("   ", line, flush=True)
    if res.returncode != 0 or "Traceback" in out:
        print(out[-4000:])
        raise SystemExit(f"stage failed ({res.returncode}): {cmd[0]}")
    log(f"   done in {time.time() - t0:.1f} s")
    if summary:
        lines = [ln for ln in out.splitlines() if ln.startswith("SUMMARY ")]
        return json.loads(lines[-1][8:]) if lines else None
    return None


def blender(script, *args, summary=False):
    env = {"BLENDER_USER_RESOURCES": common.BLENDER_USER}
    return run([common.BLENDER, "--background", "--factory-startup", "-noaudio", "--python-exit-code", "1",
                "--python", os.path.join(common.HERE, script), "--", *args], env, summary)


# How the asset-lock check (tools/asset-lock.mjs, src/contracts/assets.js RebuildRecipe) rebuilds a character in its
# sandbox: the pipeline without the manifest and render stages. Tools are pinned here and checked by the stages.
REBUILD = {
    "entry": "tools/blender/characters/build.py",
    "args": ["--recipe", "tools/blender/characters/{name}.json", "--only", "setup,character,animate,export,compress"],
    "inputs": ["tools/blender/characters/", "assets/sources.lock.json", "assets/lock/"],
    "shared": ["assets/cache/", "tools/bin/", "node_modules/"],
    "persist": ["tools/blender/characters/.work/blender_user/", "tools/blender/characters/.work/node/", "tools/blender/characters/.work/ktx/"],
    "tools": {"blender": "5.2.2", "mpfb": "2.0.17", "ktx": KTX_VERSION, "gltf-transform": "4.5.0", "meshoptimizer": "1.2.0", "node": ">=24", "python": ">=3.9"},
    "seeds": {"cycles": 0},
    "cycles": {"seed": 0, "samples": 128},
    "cost": 150,
    "timeoutSec": 1800,
}


def check_tools(ktx):
    """The rebuild recipe pins the tools: a different Blender or KTX-Software would bake different bytes."""
    out = subprocess.run([common.BLENDER, "--version"], capture_output=True, text=True).stdout
    want = REBUILD["tools"]["blender"]
    if f"Blender {want}" not in out:
        raise SystemExit(f"Blender {want} required (the recipe pins it), found: {out.splitlines()[0] if out else 'none'}")
    kv = subprocess.run([ktx, "--version"], capture_output=True, text=True).stdout
    if KTX_VERSION not in kv:
        raise SystemExit(f"KTX-Software {KTX_VERSION} required, found: {kv.strip()}")


def ktx_bin():
    for p in (os.environ.get("KTX"), os.path.join(common.ROOT, "tools", "bin", "ktx"), os.path.join(common.WORK, "ktx", "ktx")):
        if p and os.access(p, os.X_OK):
            return p
    return None


def install_ktx(offline):
    """Unpacks the pinned, notarized KTX-Software macOS package into .work/ktx without running its installer."""
    if ktx_bin():
        return ktx_bin()
    dest = os.path.join(common.WORK, "ktx")
    os.makedirs(dest, exist_ok=True)
    pkg = os.path.join(dest, KTX_PKG)
    if not os.path.exists(pkg) or common.sha256_file(pkg) != KTX_SHA:
        if offline:
            raise SystemExit("ktx not installed and --offline given")
        log("downloading", KTX_URL)
        with urllib.request.urlopen(urllib.request.Request(KTX_URL, headers={"User-Agent": fetch.UA}), timeout=300) as r, open(pkg, "wb") as f:
            shutil.copyfileobj(r, f)
    if common.sha256_file(pkg) != KTX_SHA:
        raise SystemExit(f"SHA-256 mismatch for {KTX_PKG}")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pkgutil", "--expand-full", pkg, os.path.join(tmp, "pkg")], check=True, capture_output=True)
        parts = os.listdir(os.path.join(tmp, "pkg"))
        tools = next(p for p in parts if p.endswith("-tools.pkg"))
        lib = next(p for p in parts if p.endswith("-library.pkg"))
        shutil.copy2(os.path.join(tmp, "pkg", tools, "Payload", "usr", "local", "bin", "ktx"), os.path.join(dest, "ktx"))
        libdir = os.path.join(tmp, "pkg", lib, "Payload", "usr", "local", "lib")
        dylib = next(f for f in os.listdir(libdir) if f.startswith("libktx.") and f.endswith(".dylib") and not os.path.islink(os.path.join(libdir, f)))
        shutil.copy2(os.path.join(libdir, dylib), os.path.join(dest, "libktx.4.dylib"))
    return ktx_bin()


def node_deps(offline):
    """glTF-Transform and meshoptimizer for compress.mjs: the repository's node_modules when it has them, else the
    same pinned versions in .work/node, linked as tools/blender/characters/node_modules."""
    if os.path.isdir(os.path.join(common.ROOT, "node_modules", "@gltf-transform", "core")):
        return
    nm = os.path.join(common.WORK, "node", "node_modules")
    if not os.path.isdir(os.path.join(nm, "@gltf-transform", "core")):
        if offline:
            raise SystemExit("node dependencies missing and --offline given")
        os.makedirs(os.path.join(common.WORK, "node"), exist_ok=True)
        pj = os.path.join(common.WORK, "node", "package.json")
        if not os.path.exists(pj):
            with open(pj, "w", encoding="utf-8") as f:
                f.write('{ "name": "character-pipeline-deps", "private": true, "type": "module" }\n')
        subprocess.run(["npm", "install", "--no-audit", "--no-fund", "--loglevel=error", *NODE_DEPS], cwd=os.path.join(common.WORK, "node"), check=True)
    link = os.path.join(common.HERE, "node_modules")
    if not os.path.exists(link):
        os.symlink(os.path.relpath(nm, common.HERE), link)


def write_manifest(recipe, stats, clips_report, character):
    """assets/characters/manifest.json (src/contracts/assets.js, schema survival-logs/asset-manifest@1)."""
    cid = recipe["id"]
    path = f"assets/characters/{cid}/{cid}.glb"
    ids = [s["id"] for s in fetch.locked_sources()["sources"]]
    textures = {f"{t['material']}.{t['slot']}": {"size": t["width"], "codec": t["codec"], "bytes": t["bytes"], "psnrDb": t["psnr"]} for t in stats["textures"]}
    clips = {}
    for name, c in stats["clips"].items():
        r = clips_report[name]
        clips[name] = {"durationSec": round(c["durationSec"], 4), "loop": r["loop"], "kind": r["kind"],
                       **({"use": r["use"]} if r.get("use") else {}), "keys": c["keys"], "channels": c["channels"],
                       "source": r["source"], "title": r["title"],
                       **({"loopStartSec": r["loopStartSec"]} if "loopStartSec" in r else {}),
                       **({"windowSec": r["windowSec"]} if "windowSec" in r else {}),
                       **({"speed": r["speed"]} if r.get("speed") else {}),
                       "rootMotion": r["rootMotion"],
                       **({"soleSlideMps": r["soleSlide"]["afterLock"]} if r.get("soleSlide") else {}),
                       **({"loopContinuity": r["loopContinuity"]} if r.get("loopContinuity") else {}),
                       **({"stride": r["stride"]} if r.get("stride") else {}),
                       **({"flinch": r["flinch"]} if r.get("flinch") else {}),
                       **({"hold": r["hold"]} if r.get("hold") else {}),
                       **({"seatRaiseM": r["seatRaiseM"]} if r.get("seatRaiseM") else {}),
                       "pose": r["pose"]}
    entry = {
        "id": f"characters/{cid}",
        "kind": "character",
        "path": path,
        # the most restrictive input: the clips are CMU motion capture; geometry and textures derive from CC0 sources
        "license": "LicenseRef-CMU-Mocap",
        "sources": ids,
        "rebuild": "character",
        "digests": {path: common.sha256_file(os.path.join(common.ROOT, path))},
        "params": {
            "title": recipe["title"],
            "rig": "MPFB game_engine (Unreal-style bone names: root, pelvis, spine_01-03, neck_01, head, clavicle/upperarm/lowerarm/hand, thigh/calf/foot/ball, fingers)",
            "forward": "+Z", "up": "+Y", "units": "metres",
            "materials": {f"{cid}_skin": "opaque", f"{cid}_cloth": "opaque, double-sided", f"{cid}_hair": "alpha MASK 0.35, double-sided"},
            "renderer": {f"{cid}_hair": "recommended: material.alphaToCoverage = true with an MSAA render target (softens the "
                                      "alpha-tested card edges); keep alphaTest 0.35 as the fallback without MSAA"},
            "licenses": {"geometry": "CC0-1.0 (MPFB / MakeHuman)", "textures": "CC0-1.0 inputs (MakeHuman, Poly Haven) baked here",
                         "hoodAndDrawstrings": "LicenseRef-Original (generated)", "animation": "LicenseRef-CMU-Mocap"},
            "rootMotion": "clips play in place; move the character along +Z at meta.clips.<clip>.rootMotion.speedMps to keep planted feet still",
            "clips": "loop (THREE.LoopRepeat): idle, walk, run, work, use, eat, sit, attack, sleep; oneShot (THREE.LoopOnce with "
                     "clampWhenFinished): pickup, hit, death. Every clip starts at the origin facing +Z, feet (or body) on y = 0; "
                     "none travels except death, which falls backward and ends lying on the back along the clip's Z axis (head "
                     "toward -Z, face up, pelvis near the origin; meta.clips.death.pose.end). sleep lies the same way (on the back, "
                     "head toward -Z, face up, the lowest body point on y = 0, pelvis over the origin): lay it on the mattress "
                     "top with the head toward the pillow. sit is seated with the underside of the buttocks at "
                     "meta.clips.sit.pose.seatHeightM above the floor, the pelvis over the origin and the feet on the floor ahead "
                     "of it: put the origin on the floor under the middle of the seat, not on the cushion. meta.clips.<clip>.pose has the pelvis height range, the lowest body "
                     "point and each end frame's head direction and pelvis position (glTF axes).",
            "locomotion": "playback rate of the moving clip = sim speed / its rootMotion.speedMps, clamped to meta.locomotion.rateClamp; "
                          "crossfade meta.locomotion.crossfadeSec to and from idle (also in the glb's root extras)",
        },
        "meta": {
            "triangles": int(stats["triangles"]),
            "vertices": int(stats["vertices"]),
            "bones": stats["joints"],
            "maxInfluences": stats["maxInfluences"],
            "heightM": round(stats["heightM"], 3),
            "sizeBytes": stats["bytes"],
            "texelDensity": {**character["texelDensityPxPerM"], "unit": "texels per metre (atlas mean; every island packed at the recipe density, ART.md §3 hero class)", "target": recipe["texelDensity"]},
            "clips": clips,
            "locomotion": stats["locomotion"],
            "albedo": character["albedo"],
            "textures": textures,
            "budgets": {"maxTriangles": recipe["budgets"]["maxTriangles"], "maxInfluences": recipe["budgets"]["maxInfluences"]},
        },
    }
    manifest_path = os.path.join(common.OUT_DIR, "manifest.json")
    manifest = common.load_json(manifest_path) if os.path.exists(manifest_path) else {"schema": "survival-logs/asset-manifest@1", "wp": fetch.WP, "assets": []}
    manifest["rebuild"] = {"character": REBUILD}
    manifest["assets"] = [a for a in manifest["assets"] if a["id"] != entry["id"]] + [entry]
    manifest["assets"].sort(key=lambda a: a["id"])
    common.save_json(manifest_path, manifest)
    log("wrote", os.path.relpath(manifest_path, common.ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--recipe", default=os.path.join(common.HERE, "wage.json"))
    ap.add_argument("--clips", default=os.path.join(common.HERE, "clips.json"))
    ap.add_argument("--only", default=",".join(STAGES))
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()
    stages = [s for s in a.only.split(",") if s]
    unknown = [s for s in stages if s not in STAGES]
    if unknown:
        raise SystemExit(f"unknown stage(s): {unknown}")
    recipe = common.load_json(a.recipe)
    cid = recipe["id"]
    w = lambda *p: common.work(cid, *p)  # noqa: E731
    glb = os.path.join(common.OUT_DIR, cid, f"{cid}.glb")
    if "setup" in stages:
        fetch.restore(offline=a.offline)
        ktx = install_ktx(a.offline)
        check_tools(ktx)
        log("ktx:", ktx)
        node_deps(a.offline)
    if "character" in stages:
        s = blender("character.py", a.recipe, summary=True)
        log("character:", json.dumps(s))
    if "animate" in stages:
        blender("animate.py", w("character.blend"), a.clips, w("animated.blend"), w("clips_report.json"), a.recipe)
    if "export" in stages:
        blender("export.py", w("animated.blend"), w(f"{cid}_raw.glb"))
    if "compress" in stages:
        env = {"KTX": ktx_bin() or ""}
        run(["node", os.path.join(common.HERE, "compress.mjs"), w(f"{cid}_raw.glb"), w("clips_report.json"), a.recipe, glb, w("stats.json")], env)
    if "manifest" in stages:
        write_manifest(recipe, common.load_json(w("stats.json")), common.load_json(w("clips_report.json")), common.load_json(w("character_summary.json")))
    if "render" in stages:
        blender("render.py", w(f"{cid}_raw.glb"), common.RENDERS, cid)
        run(["node", os.path.join(common.HERE, "render-three.mjs")], {})


if __name__ == "__main__":
    main()
