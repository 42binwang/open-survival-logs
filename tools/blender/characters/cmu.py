"""CMU motion capture (Acclaim ASF skeleton + AMC motion) reader, forward kinematics and BVH writer. numpy only, so it
runs under Blender's Python or any Python with numpy.

    python cmu.py <subject.asf> <trial.amc> <out.bvh>        convert one trial to BVH (for inspection / other tools)

Conventions (Acclaim, as used by the CMU database):
  * lengths are in 'units length' of the ASF (CMU: 0.45) where 1 unit = 1 / 0.45 inch; METERS_PER_UNIT converts.
  * a bone's 'axis ax ay az XYZ' gives its local frame C = Rz(az) Ry(ay) Rx(ax); AMC values are Euler angles in that
    frame for the bone's dofs (rx, ry, rz order), M = Rz(rz) Ry(ry) Rx(rx).
  * world rotation of a bone: G = G_parent C M C^-1 (root: G = C_root M_root C_root^-1); at rest every G is identity
    and the skeleton stands in a T-pose, Y up, facing +Z.
  * a bone starts where its parent ends; end = start + length * G direction.
"""

import math
import re
import sys

import numpy as np

INCH = 0.0254


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def euler(order, angles_deg):
    """Rotation matrix for Euler angles applied in `order` (e.g. 'XYZ' = X first, then Y, then Z: Rz Ry Rx)."""
    m = np.eye(3)
    for axis, a in zip(order.upper(), angles_deg):
        r = {"X": rx, "Y": ry, "Z": rz}[axis](math.radians(a))
        m = r @ m
    return m


class Bone:
    def __init__(self, name):
        self.name = name
        self.direction = np.zeros(3)
        self.length = 0.0
        self.axis = np.zeros(3)
        self.axis_order = "XYZ"
        self.dof = []
        self.parent = None
        self.children = []
        self.C = np.eye(3)
        self.Cinv = np.eye(3)


class Skeleton:
    def __init__(self, path):
        self.bones = {}
        self.order = []
        self.length_unit = 1.0
        self.angle_unit = "deg"
        self.root_order = ["TX", "TY", "TZ", "RX", "RY", "RZ"]
        self.root_axis = "XYZ"
        self.root_position = np.zeros(3)
        self.root_orientation = np.zeros(3)
        self._parse(path)
        self.meters_per_unit = INCH / self.length_unit

    def _parse(self, path):
        with open(path, encoding="latin-1") as f:
            lines = [ln.strip() for ln in f.read().replace("\r", "").split("\n")]
        section = None
        cur = None
        root = Bone("root")
        self.bones["root"] = root
        self.order.append("root")
        i = 0
        while i < len(lines):
            ln = lines[i]
            i += 1
            if not ln or ln.startswith("#"):
                continue
            if ln.startswith(":"):
                parts = ln.split()
                section = parts[0][1:]
                continue
            parts = ln.split()
            if section == "units":
                if parts[0] == "length":
                    self.length_unit = float(parts[1])
                elif parts[0] == "angle":
                    self.angle_unit = parts[1]
            elif section == "root":
                if parts[0] == "order":
                    self.root_order = [p.upper() for p in parts[1:]]
                elif parts[0] == "axis":
                    self.root_axis = parts[1].upper()
                elif parts[0] == "position":
                    self.root_position = np.array([float(x) for x in parts[1:4]])
                elif parts[0] == "orientation":
                    self.root_orientation = np.array([float(x) for x in parts[1:4]])
            elif section == "bonedata":
                if parts[0] == "begin":
                    cur = None
                elif parts[0] == "end":
                    cur.C = euler(cur.axis_order, cur.axis)
                    cur.Cinv = cur.C.T
                    cur = None
                elif parts[0] == "name":
                    cur = Bone(parts[1])
                    self.bones[cur.name] = cur
                    self.order.append(cur.name)
                elif parts[0] == "direction":
                    cur.direction = np.array([float(x) for x in parts[1:4]])
                elif parts[0] == "length":
                    cur.length = float(parts[1])
                elif parts[0] == "axis":
                    cur.axis = np.array([float(x) for x in parts[1:4]])
                    cur.axis_order = parts[4].upper() if len(parts) > 4 else "XYZ"
                elif parts[0] == "dof":
                    cur.dof = [p.lower() for p in parts[1:]]
            elif section == "hierarchy":
                if parts[0] in ("begin", "end"):
                    continue
                parent = self.bones[parts[0]]
                for child in parts[1:]:
                    b = self.bones[child]
                    b.parent = parent
                    parent.children.append(b)
        root.C = euler(self.root_axis, self.root_orientation)
        root.Cinv = root.C.T
        # topological order (parents first)
        ordered = []

        def walk(b):
            ordered.append(b.name)
            for c in b.children:
                walk(c)

        walk(root)
        self.order = ordered

    def rest_positions(self):
        """Joint end positions at rest, in ASF units, root at the origin."""
        pos = {"root": np.zeros(3)}
        for name in self.order[1:]:
            b = self.bones[name]
            pos[name] = pos[b.parent.name] + b.length * b.direction
        return pos


def read_amc(path, skel):
    """Frames as a list of {bone: [values]} in file order (degrees / units)."""
    frames = []
    cur = None
    with open(path, encoding="latin-1") as f:
        for raw in f:
            ln = raw.strip()
            if not ln or ln.startswith("#") or ln.startswith(":"):
                continue
            if re.fullmatch(r"\d+", ln):
                cur = {}
                frames.append(cur)
                continue
            parts = ln.split()
            cur[parts[0]] = [float(x) for x in parts[1:]]
    return frames


def pose(skel, frame):
    """World rotations G (3x3, relative to the rest pose) and joint end positions for one AMC frame, in ASF units
    and ASF axes (Y up)."""
    G = {}
    P = {}
    rv = frame["root"]
    vals = dict(zip(skel.root_order, rv))
    t = np.array([vals.get("TX", 0.0), vals.get("TY", 0.0), vals.get("TZ", 0.0)])
    order = "".join(k[1] for k in skel.root_order if k.startswith("R"))
    M = euler(order, [vals[f"R{a}"] for a in order])
    root = skel.bones["root"]
    G["root"] = root.C @ M @ root.Cinv
    P["root"] = t
    for name in skel.order[1:]:
        b = skel.bones[name]
        ang = {"rx": 0.0, "ry": 0.0, "rz": 0.0}
        if b.dof and name in frame:
            for d, v in zip(b.dof, frame[name]):
                ang[d] = v
        M = rz(math.radians(ang["rz"])) @ ry(math.radians(ang["ry"])) @ rx(math.radians(ang["rx"]))
        G[name] = G[b.parent.name] @ b.C @ M @ b.Cinv
        P[name] = P[b.parent.name] + b.length * (G[name] @ b.direction)
    return G, P


def clip(skel, frames):
    """(G, P) arrays for a whole AMC: G[bone] (n, 3, 3), P[bone] (n, 3)."""
    Gs = {n: np.empty((len(frames), 3, 3)) for n in skel.order}
    Ps = {n: np.empty((len(frames), 3)) for n in skel.order}
    for i, fr in enumerate(frames):
        G, P = pose(skel, fr)
        for n in skel.order:
            Gs[n][i] = G[n]
            Ps[n][i] = P[n]
    return Gs, Ps


# ------------------------------------------------------------------------------------------------------ BVH out


def mat_to_euler_zxy(m):
    """Euler angles (degrees) for BVH channel order Zrotation Xrotation Yrotation, i.e. m = Rz Rx Ry."""
    x = math.asin(max(-1.0, min(1.0, m[2, 1])))
    if abs(m[2, 1]) < 0.9999:
        z = math.atan2(-m[0, 1], m[1, 1])
        y = math.atan2(-m[2, 0], m[2, 2])
    else:
        z = math.atan2(m[1, 0], m[0, 0])
        y = 0.0
    return math.degrees(z), math.degrees(x), math.degrees(y)


def write_bvh(skel, frames, path, fps=120.0, scale=None):
    """BVH with world-aligned joint frames (offsets = rest bone vectors), rotations as local deltas of G."""
    scale = scale if scale is not None else skel.meters_per_unit * 100.0  # centimetres
    Gs, Ps = clip(skel, frames)
    out = []
    ind = lambda d: "  " * d  # noqa: E731

    def emit(name, depth):
        b = skel.bones[name]
        kind = "ROOT" if name == "root" else "JOINT"
        out.append(f"{ind(depth)}{kind} {name}")
        out.append(f"{ind(depth)}{{")
        off = np.zeros(3) if name == "root" else b.parent.length * b.parent.direction * scale if b.parent.name != "root" else np.zeros(3)
        out.append(f"{ind(depth + 1)}OFFSET {off[0]:.6f} {off[1]:.6f} {off[2]:.6f}")
        chans = "6 Xposition Yposition Zposition Zrotation Xrotation Yrotation" if name == "root" else "3 Zrotation Xrotation Yrotation"
        out.append(f"{ind(depth + 1)}CHANNELS {chans}")
        if b.children:
            for c in b.children:
                emit(c.name, depth + 1)
        else:
            end = b.length * b.direction * scale
            out.append(f"{ind(depth + 1)}End Site")
            out.append(f"{ind(depth + 1)}{{")
            out.append(f"{ind(depth + 2)}OFFSET {end[0]:.6f} {end[1]:.6f} {end[2]:.6f}")
            out.append(f"{ind(depth + 1)}}}")
        out.append(f"{ind(depth)}}}")

    out.append("HIERARCHY")
    emit("root", 0)
    out.append("MOTION")
    out.append(f"Frames: {len(frames)}")
    out.append(f"Frame Time: {1.0 / fps:.8f}")
    for i in range(len(frames)):
        row = []
        for name in skel.order:
            b = skel.bones[name]
            g = Gs[name][i]
            local = g if name == "root" else Gs[b.parent.name][i].T @ g
            if name == "root":
                p = Ps["root"][i] * scale
                row += [p[0], p[1], p[2]]
            row += list(mat_to_euler_zxy(local))
        out.append(" ".join(f"{v:.6f}" for v in row))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sk = Skeleton(sys.argv[1])
    write_bvh(sk, read_amc(sys.argv[2], sk), sys.argv[3])
