"""Plank floors: a non-repeating tile of whole boards laid from a plank scan.

The scan's boards run along x and its long-edge gaps along rows. The tile is laid row by row: each row is one
board width, taken from a board of the scan; along the row, boards of random length meet at end joints that stagger
against the neighbouring rows. Every board is a window of one scan board (periodic along x) at a random offset, in
one of four orientations (flipped along its length and/or across it), so its grain stays intact. Windows are picked
to cover the scan evenly per orientation. Knots are found in the scan and removed from a clean copy; each board is
cut from the clean copy and a knot is pasted back only the first time its window is used, so no knot appears twice
in the tile. End joints get the scan's own long-edge gap profile, turned across the board.
All maps of a material are laid together (one stack).
"""

from __future__ import annotations

import zlib

import numpy as np

from . import imageio as io
from .periodic import gaussian_blur, resample


def _roles(order: list) -> dict:
    out, k = {}, 0
    for role, c in order:
        out[role] = (k, c)
        k += c
    return out


def gap_rows(profile: np.ndarray, expected_px: float, min_z: float = 1.0) -> list:
    """Rows where the (periodic) row profile has a clear local minimum, at least 0.35 board widths apart."""
    p = (profile - np.median(profile)) / (profile.std() + 1e-9)
    n = len(p)
    half = max(2, int(0.35 * expected_px))
    out: list = []
    for i in range(n):
        win = p[np.arange(i - half, i + half + 1) % n]
        if p[i] < -min_z and p[i] <= win.min() and not (out and i - out[-1] <= half):
            out.append(i)
    if len(out) > 1 and out[0] + n - out[-1] <= half:
        out.pop()
    # a board far narrower than the others is split by a false gap: drop the weaker of its two gaps
    while len(out) > 3:
        wd = np.diff(out + [out[0] + n])
        i = int(np.argmin(wd))
        if wd[i] >= 0.6 * np.median(wd):
            break
        a, b = i, (i + 1) % len(out)
        out.pop(a if p[out[a]] > p[out[b]] else b)
    return out


def _components(mask: np.ndarray) -> list:
    """4-connected components of a boolean image: a list of (ys, xs) index arrays."""
    seen = np.zeros_like(mask, bool)
    comps = []
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        stack, ys, xs = [(y0, x0)], [], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            ys.append(y)
            xs.append(x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                v, u = y + dy, x + dx
                if 0 <= v < h and 0 <= u < w and mask[v, u] and not seen[v, u]:
                    seen[v, u] = True
                    stack.append((v, u))
        comps.append((np.array(ys), np.array(xs)))
    return comps


def find_knots(lum: np.ndarray, ppm: float, bounds: list, cfg: dict) -> list:
    """Dark, roundish blobs of knot size in a luminance image (ppm texels per metre). Returns rects in its pixels."""
    L = np.log(np.maximum(lum, 1e-4))
    dog = gaussian_blur(L, cfg.get("sigmaM", [0.002, 0.015])[0] * ppm) - gaussian_blur(L, cfg.get("sigmaM", [0.002, 0.015])[1] * ppm)
    mask = dog < -cfg.get("k", 3.0) * dog.std()
    min_d = cfg.get("minM", 0.006) * ppm
    knots = []
    for ys, xs in _components(mask):
        bh, bw = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if len(ys) < 0.5 * min_d * min_d or bw > cfg.get("maxAspect", 4.0) * bh:
            continue
        cy, cx = float(ys.mean()), float(xs.mean())
        board = int(np.searchsorted(bounds, cy, side="right") - 1) % (len(bounds) - 1)
        knots.append({"board": board, "cx": cx, "cy": cy, "rx": bw / 2.0, "ry": bh / 2.0, "area": int(len(ys))})
    return knots


def _ramp(n: int, f: float) -> np.ndarray:
    i = np.arange(n, dtype=np.float32)
    return np.clip(np.minimum(i + 0.5, n - i - 0.5) / max(f, 0.5), 0.0, 1.0)


def _interval_hits(a0: float, a1: float, b0: float, b1: float, period: float) -> bool:
    """Do the periodic intervals [a0, a1) and [b0, b1) overlap?"""
    for s in (-period, 0.0, period):
        if a0 < b1 + s and b0 + s < a1:
            return True
    return False


def gap_profile(native: np.ndarray, bounds: list, g: int) -> np.ndarray:
    """Mean of each channel at offsets -g..g from the scan's gap rows, over the board interiors' mean (ratio)."""
    rows = []
    for b in bounds[:-1]:
        idx = (b + np.arange(-g, g + 1)) % native.shape[0]
        rows.append(native[idx].mean(axis=1))
    prof = np.mean(rows, axis=0)
    return prof.astype(np.float32)


def lay(stack: np.ndarray, order: list, size_m: tuple, res: int, tile_m: float, cfg: dict, seed_text: str) -> tuple[np.ndarray, dict]:
    """Returns (res, res, C) planks laid from the scan stack (h, w, C) of size_m metres, and a report."""
    h, w, c = stack.shape
    ro = _roles(order)
    rng = np.random.default_rng(zlib.crc32(seed_text.encode()))
    density = res / tile_m
    spx, spy = round(size_m[0] * density), round(size_m[1] * density)
    plank_px = cfg["plankM"] * h / size_m[1]

    # gap rows at full resolution: the mean of the standardized row profiles of height, AO and luminance
    profs = [io.luminance(stack[..., ro["albedo"][0] : ro["albedo"][0] + 3]).mean(axis=1)]
    profs += [stack[..., ro[r][0]].mean(axis=1) for r in ("height", "ao") if r in ro]
    prof = np.mean([(p - np.median(p)) / (p.std() + 1e-9) for p in profs], axis=0)
    full_gaps = gap_rows(prof, plank_px, cfg.get("gapZ", 1.0))
    widths = np.diff(full_gaps + [full_gaps[0] + h])
    med = float(np.median(widths)) if len(widths) else 0.0
    if len(full_gaps) < 3 or not (0.6 * plank_px <= med <= 1.6 * plank_px) or widths.min() < 0.6 * med or widths.max() > 1.6 * med:
        raise SystemExit(f"{seed_text}: plank gaps not found (rows {full_gaps}, expected {plank_px:.0f} px apart)")

    native = resample(stack, spy, spx)
    gaps = sorted({int(round(g * spy / h)) % spy for g in full_gaps})
    bounds = gaps + [gaps[0] + spy]
    boards = [(bounds[i], bounds[i + 1]) for i in range(len(gaps))]
    bh = np.array([b1 - b0 for b0, b1 in boards], float)

    # knots, found at twice the output density, kept in native pixels
    k2 = 2
    lum2 = io.luminance(resample(stack[..., ro["albedo"][0] : ro["albedo"][0] + 3], spy * k2, spx * k2))
    knots = find_knots(lum2, density * k2, [b * k2 for b in bounds], cfg.get("knots", {}))
    margin = cfg.get("knots", {}).get("marginM", 0.006) * density
    for kn in knots:
        kn.update(cx=kn["cx"] / k2, cy=kn["cy"] / k2, rx=kn["rx"] / k2 + margin, ry=kn["ry"] / k2 + margin)
        b0, b1 = boards[kn["board"]]
        cy = kn["cy"] if kn["cy"] >= b0 else kn["cy"] + spy
        kn["y0"], kn["y1"] = max(b0 + 1, int(np.floor(cy - kn["ry"]))), min(b1 - 1, int(np.ceil(cy + kn["ry"])) + 1)
        kn["x0"], kn["x1"] = kn["cx"] - kn["rx"], kn["cx"] + kn["rx"]

    # the clean copy: every knot replaced by knot-free wood of its own board, shifted along the grain
    clean = native.copy()
    feather = cfg.get("knots", {}).get("featherPx", 2.0)
    for i, kn in enumerate(knots):
        mates = [o for o in knots if o["board"] == kn["board"]]
        x0, x1 = int(np.floor(kn["x0"] - feather)), int(np.ceil(kn["x1"] + feather))
        best = None
        for _ in range(64):
            d = int(rng.integers(x1 - x0 + 1, spx - (x1 - x0)))
            if not any(_interval_hits(x0 + d, x1 + d, o["x0"] - feather, o["x1"] + feather, spx) for o in mates):
                best = d
                break
        if best is None:
            raise SystemExit(f"{seed_text}: no knot-free wood beside knot {i} on board {kn['board']}")
        rows = np.arange(kn["y0"], kn["y1"]) % spy
        cols = np.arange(x0, x1) % spx
        m = (_ramp(len(rows), 1.5)[:, None] * _ramp(len(cols), feather)[None, :])[..., None]
        donor = clean[np.ix_(rows, (cols + best) % spx)]
        clean[np.ix_(rows, cols)] = clean[np.ix_(rows, cols)] * (1 - m) + donor * m
        kn["mask"] = (rows, cols, m)

    # rows: a board sequence whose widths sum to the tile, scaled to fit exactly
    best_seq, best_err = None, np.inf
    for _ in range(400):
        seq, s = [], 0.0
        while s < res - 0.5 * bh.mean():
            p = int(rng.integers(len(boards)))
            if seq and p == seq[-1]:
                continue
            seq.append(p)
            s += bh[p]
        if len(seq) > 1 and seq[0] == seq[-1]:
            continue
        if abs(s - res) < best_err:
            best_seq, best_err = seq, abs(s - res)
    seq = best_seq
    row_scale = res / float(bh[seq].sum())
    edges = np.round(np.concatenate([[0.0], np.cumsum(bh[seq])]) * row_scale).astype(int)

    # joints: random board lengths per row, staggered against the neighbouring rows
    lmin, lmax = cfg["lengthM"][0] * density, cfg["lengthM"][1] * density
    if lmax > spx - 2:
        raise SystemExit(f"{seed_text}: boards up to {cfg['lengthM'][1]} m are longer than the scan ({size_m[0]} m)")
    stagger = cfg.get("staggerM", 0.2) * density
    n_rows = len(seq)

    def circ(a: float, b: float) -> float:
        d = abs(a - b) % res
        return min(d, res - d)

    def lengths() -> np.ndarray:
        for _ in range(200):
            n = int(rng.integers(int(np.ceil(res / lmax)), int(np.floor(res / lmin)) + 1))
            L = rng.uniform(lmin, lmax, n)
            L *= res / L.sum()
            if L.min() >= lmin and L.max() <= lmax:
                return np.concatenate([[0.0], np.cumsum(L)[:-1]])
        raise SystemExit(f"{seed_text}: cannot split {res} px into boards of {lmin:.0f}-{lmax:.0f} px")

    def far(j: list, other: list, need: float) -> bool:
        return all(circ(a, b) >= need for a in j for b in other)

    joints = None
    for _ in range(50):
        rows_j: list = []
        for r in range(n_rows):
            rules = []
            if r >= 1:
                rules.append((rows_j[r - 1], stagger))
            if r >= 2:
                rules.append((rows_j[r - 2], 0.5 * stagger))
            if r == n_rows - 1:
                rules += [(rows_j[0], stagger), (rows_j[1], 0.5 * stagger)]
            if r == n_rows - 2:
                rules.append((rows_j[0], 0.5 * stagger))
            for _ in range(100):
                rel = lengths()
                starts = [s0 for s0 in range(res) if all(far([int(round(s0 + x)) % res for x in rel], o, need) for o, need in rules)]
                if starts:
                    s0 = starts[int(rng.integers(len(starts)))]
                    rows_j.append([int(round(s0 + x)) % res for x in rel])
                    break
            else:
                break
        if len(rows_j) == n_rows:
            joints = rows_j
            break
    if joints is None:
        raise SystemExit(f"{seed_text}: no staggered joint layout found")

    # boards: windows of the scan, covering it evenly per orientation; each knot pasted at most once
    cover = np.zeros((4, len(boards), spx), np.float32)
    used = np.zeros(len(knots), bool)
    out = np.zeros((res, res, c), np.float32)
    tone = cfg.get("toneJitter", 0.0)
    a0 = ro["albedo"][0]
    segments = []
    for r in range(n_rows):
        y0, y1 = int(edges[r]), int(edges[r + 1])
        rh = y1 - y0
        js = sorted(joints[r])
        for i, j in enumerate(js):
            L = (js[(i + 1) % len(js)] - j) % res or res
            fits = [p for p in range(len(boards)) if abs(bh[p] / rh - 1.0) <= cfg.get("widthTolerance", 0.15)]
            cand = []
            for _ in range(48):
                p = fits[int(rng.integers(len(fits)))]
                ox = int(rng.integers(spx))
                f = int(rng.integers(4))
                cols = (ox + np.arange(L)) % spx
                cand.append((float(cover[f, p, cols].mean() + 0.25 * cover[:, p, cols].sum(axis=0).mean()), p, ox, f))
            score, p, ox, f = min(cand, key=lambda t: t[0])
            cols = (ox + np.arange(L)) % spx
            cover[f, p, cols] += 1
            b0, b1 = boards[p]
            src_rows = (np.arange(b0, b1) if f < 2 else np.arange(b1, b0, -1)) % spy
            piece = clean[np.ix_(src_rows, cols)].copy()
            orig = native[np.ix_(src_rows, cols)]
            weight = np.zeros(piece.shape[:2] + (1,), np.float32)
            row_pos = {int(v): k for k, v in enumerate(src_rows)}
            col_pos = {int(v): k for k, v in enumerate(cols)}
            for q, kn in enumerate(knots):
                if used[q] or kn["board"] != p:
                    continue
                kr, kc, km = kn["mask"]
                hit = False
                for a, rr in enumerate(kr):
                    if int(rr) not in row_pos:
                        continue
                    for b, cc in enumerate(kc):
                        if int(cc) in col_pos:
                            weight[row_pos[int(rr)], col_pos[int(cc)]] = np.maximum(weight[row_pos[int(rr)], col_pos[int(cc)]], km[a, b])
                            hit = True
                used[q] |= hit
            piece = piece * (1 - weight) + orig * weight
            # to the row height (along y only)
            t = (np.arange(rh) + 0.5) * len(src_rows) / rh - 0.5
            i0 = np.clip(np.floor(t).astype(int), 0, len(src_rows) - 1)
            i1 = np.clip(i0 + 1, 0, len(src_rows) - 1)
            fr = (t - np.floor(t)).astype(np.float32)[:, None, None]
            piece = piece[i0] * (1 - fr) + piece[i1] * fr
            if f % 2:
                piece = piece[:, ::-1]
            if "normal" in ro:
                n0 = ro["normal"][0]
                if f % 2:
                    piece[..., n0] *= -1.0
                if f >= 2:
                    piece[..., n0 + 1] *= -1.0
            if tone:
                piece[..., a0 : a0 + 3] *= float(np.clip(1.0 + tone * rng.standard_normal(), 1.0 - 2 * tone, 1.0 + 2 * tone))
            out[y0:y1, (j + np.arange(L)) % res] = piece
            segments.append({"row": r, "x": j, "lengthPx": L, "board": p, "offsetPx": ox, "flip": f})

    # end joints: the scan's long-edge gap profile, turned across the board
    g = cfg.get("jointPx", 2)
    prof = gap_profile(native, bounds, g)
    interior = np.concatenate([native[(b0 + g + 1) % spy : (b0 + g + 1) % spy + max(1, (b1 - b0) - 2 * g - 2)] for b0, b1 in boards], axis=0)
    base = interior.reshape(-1, c).mean(axis=0)
    ratio_roles = [r for r in ("albedo", "roughness", "ao") if r in ro]
    for r in range(n_rows):
        y0, y1 = int(edges[r]), int(edges[r + 1])
        for j in joints[r]:
            for o in range(-g, g + 1):
                x = (j + o) % res
                col = out[y0:y1, x]
                for role in ratio_roles:
                    k0, kc = ro[role]
                    col[:, k0 : k0 + kc] *= prof[o + g, k0 : k0 + kc] / np.maximum(base[k0 : k0 + kc], 1e-4)
                if "height" in ro:
                    k0 = ro["height"][0]
                    col[:, k0] += prof[o + g, k0] - base[k0]
                if "normal" in ro:
                    n0 = ro["normal"][0]
                    col[:, n0] += -(prof[o + g, n0 + 1] - base[n0 + 1])
                out[y0:y1, x] = col

    # the wrap falls inside the first row's boards, not on a gap (a gap on the wrap reads as a seam)
    roll = int(edges[1]) // 2
    out = np.roll(out, -roll, axis=0)
    reuse = cover.max()
    info = {
        "boards": len(boards),
        "boardPx": [int(v) for v in bh],
        "rows": n_rows,
        "rowScale": round(row_scale, 4),
        "segments": len(segments),
        "lengthPx": [int(min(s["lengthPx"] for s in segments)), int(max(s["lengthPx"] for s in segments))],
        "minStaggerPx": round(min(circ(a, b) for r in range(n_rows) for a in joints[r] for b in joints[(r + 1) % n_rows]), 1),
        "knots": {"found": len(knots), "placed": int(used.sum())},
        "maxWindowUsesPerOrientation": int(reuse),
        "nativePx": [spx, spy],
        "rollPx": roll,
    }
    return out, info
