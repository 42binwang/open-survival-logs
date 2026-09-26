"""Stage 'animate': CMU clips (clips.json) retargeted onto the character's rig as looping, in-place actions with the
root motion extracted.

    Blender --background --factory-startup --python animate.py -- <character.blend> <clips.json> <out.blend> <report.json>

Retargeting is rotation-based, per bone, in world space: a target bone takes the world-space rotation its CMU source
bone makes away from the CMU rest pose (T-pose), composed with the rest-alignment rotation that turns the source bone's
rest direction into the target bone's (so the CMU T-pose drives the character's rest pose). Bones without a source
keep their rest pose relative to their parent (fingers get a relaxed curl, drawn together). The pelvis follows the CMU
root, scaled by the leg length ratio so the feet plant at the target's proportions. Upper-body corrections per clip:
the clavicles follow part of the upper arm's swing; neck and head can be turned toward the chest's facing (a subject
who looks aside) and lifted.

Root motion: the pelvis trajectory averaged over one loop period is the root path; the clip is re-expressed in that
moving frame (turning included), facing -Y, so it plays in place. The extracted travel (m/s, yaw rate) and the stride
(distance per cycle, cycle time) go to the report and the glTF extras.

Loop: the (start, length) inside the clip's search window whose end pose and pose velocity best match its start; for
locomotion the start must fall in single support (a walk) or flight (a run). The loop is closed by a correction spread
over the whole loop (pose) and over the last quarter second (velocity), per bone in world space, that makes pose and
angular velocity continuous across the wrap. The closed loop is then foot-locked: the shoe soles' heel, ball and toe points stay put on the floor while
planted and no sole point goes below it; legs are re-solved with two-bone IK (smoothed over time) and the pelvis drops
where a leg cannot reach.

Clips that are not searched loops (clips.json kind): 'oneShot' keeps the capture's window as is (played once), 'hold'
holds the window's mean pose with a procedural breathing cycle (retarget_action). Every clip's report carries a pose
summary for the renderer (pelvis height, lowest body point, seat height, and whether the end frames lie, with head
direction and pelvis position).
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import cmu  # noqa: E402
import pipeline as common  # noqa: E402

SRC_FPS = 120.0
ANALYSIS_FPS = 30.0  # loop-point calm and seam measures at the game's 30 Hz key spacing (what tests/characters.test.js samples)


def log(*a):
    print("[animate]", *a, flush=True)


# ---------------------------------------------------------------------------------------------------- rotations


def rot_between(a, b):
    """Smallest rotation matrix taking unit vector a onto unit vector b."""
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -0.999999:
        axis = np.cross(a, [1.0, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1.0, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def mats_to_quats(m):
    """(n, 3, 3) rotation matrices -> (n, 4) unit quaternions (w, x, y, z), continuous in sign."""
    n = m.shape[0]
    q = np.empty((n, 4))
    tr = m[:, 0, 0] + m[:, 1, 1] + m[:, 2, 2]
    for i in range(n):
        r = m[i]
        if tr[i] > 0:
            s = math.sqrt(tr[i] + 1.0) * 2
            q[i] = (0.25 * s, (r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s)
        elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
            s = math.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
            q[i] = ((r[2, 1] - r[1, 2]) / s, 0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s)
        elif r[1, 1] > r[2, 2]:
            s = math.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
            q[i] = ((r[0, 2] - r[2, 0]) / s, (r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s)
        else:
            s = math.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
            q[i] = ((r[1, 0] - r[0, 1]) / s, (r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s)
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    for i in range(1, n):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q


def qmul(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2])


def qconj(q):
    return np.array([q[0], -q[1], -q[2], -q[3]])


def slerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + t * (b - a)
        return r / np.linalg.norm(r)
    th = math.acos(d)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)


# ------------------------------------------------------------------------------------------------------ retarget

# CMU (Y up, facing +Z, +X = subject's left) -> Blender (Z up, facing -Y, +X = character's left): +90 deg about X
Q = np.array([[1.0, 0, 0], [0, 0, -1.0], [0, 1.0, 0]])


class Rig:
    def __init__(self, obj):
        self.obj = obj
        bones = obj.data.bones
        order = []

        def walk(b):
            order.append(b.name)
            for c in b.children:
                walk(c)

        for b in bones:
            if b.parent is None:
                walk(b)
        self.order = order
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.B = {b.name: np.array(b.matrix_local) for b in bones}
        self.length = {b.name: b.length for b in bones}

    def rest_dir(self, name):
        d = self.B[name][:3, 1]
        return d / np.linalg.norm(d)


def world_deltas(rig, skel, G, bone_map):
    """World-space rotation of every target bone away from its rest orientation, per frame: (n, 3, 3)."""
    n = len(G["root"])
    dW = {}
    for t, s in bone_map.items():
        D = np.einsum("ij,njk,kl->nil", Q, G[s], Q.T)
        if s == "root":
            R = np.eye(3)
        else:
            R = rot_between(Q @ skel.bones[s].direction, rig.rest_dir(t))
        dW[t] = D @ R.T
    eye = np.broadcast_to(np.eye(3), (n, 3, 3))
    for name in rig.order:
        if name not in dW:
            p = rig.parent[name]
            dW[name] = dW[p] if p else eye
    return dW


def local_rotations(rig, dW, extra_local):
    """Pose-bone rotations (bone space, relative to rest): L = B_t^-1 dW_parent^-1 dW_t B_t, times any extra
    constant local rotation (the relaxed hand)."""
    L = {}
    for name in rig.order:
        Bt = rig.B[name][:3, :3]
        p = rig.parent[name]
        rel = dW[name] if p is None else np.einsum("nji,njk->nik", dW[p], dW[name])
        Lm = np.einsum("ji,njk,kl->nil", Bt, rel, Bt)
        if name in extra_local:
            Lm = Lm @ extra_local[name]
        L[name] = Lm
    return L


def quats_to_mats(q):
    """(n, 4) unit quaternions (w, x, y, z) -> (n, 3, 3) rotation matrices."""
    w, x, y, z = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    return np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], axis=-1),
        np.stack([2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], axis=-1),
        np.stack([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], axis=-1),
    ], axis=1)


def axis_angle(axis, angle):
    axis = np.asarray(axis, dtype=float)
    n = np.linalg.norm(axis)
    if n < 1e-12 or abs(angle) < 1e-12:
        return np.eye(3)
    x, y, z = axis / n
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    return np.array([[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
                     [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
                     [t * x * z - s * y, t * y * z + s * x, t * z * z + c]])


def quat_log(q):
    """(n, 4) unit quaternions -> (n, 3) rotation vectors (axis x angle), shortest arc."""
    q = q * np.where(q[:, :1] < 0, -1.0, 1.0)
    s = np.linalg.norm(q[:, 1:], axis=1)
    ang = 2 * np.arctan2(s, q[:, 0])
    return q[:, 1:] * (ang / np.maximum(s, 1e-12))[:, None]


def quat_exp(v):
    """(n, 3) rotation vectors -> (n, 4) unit quaternions."""
    ang = np.linalg.norm(v, axis=1)
    k = np.where(ang > 1e-12, np.sin(ang / 2) / np.maximum(ang, 1e-12), 0.5)
    return np.concatenate([np.cos(ang / 2)[:, None], v * k[:, None]], axis=1)


def qmul_n(a, b):
    """Row-wise quaternion product of (n, 4) arrays."""
    w1, x1, y1, z1 = a.T
    w2, x2, y2, z2 = b.T
    return np.stack([w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                     w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2], axis=1)


LOOP_H = 4  # frames either side of the loop points used for the velocity estimates


def _closure_curves(per, window):
    """The two correction profiles: the pose term over the whole loop (smoothstep: no velocity at either end) and the
    velocity term over the last `window` frames (a Hermite bump: zero at both ends of the window, zero slope where it
    starts, unit slope per frame at the wrap)."""
    s = np.arange(per) / per
    pose = 3 * s ** 2 - 2 * s ** 3
    vel = np.zeros(per)
    k = np.arange(per - window, per)
    t = (k - (per - window)) / window
    vel[k] = (t ** 3 - t ** 2) * window
    return pose, vel


def close_loop(q, per, window):
    """C1 loop closure of a rotation sequence: q (per + 2H + 1, 4) holds frames start-H .. start+per+H. Returns the
    per frames start .. start+per-1 with a smooth correction applied in world space (rotation vectors): the pose
    mismatch at the wrap is spread over the whole loop, the angular velocity mismatch is taken out over the last
    `window` frames, so the frame after the last is the first and the velocity into the wrap equals the velocity out
    of it."""
    conj = lambda x: x * np.array([1.0, -1.0, -1.0, -1.0])  # noqa: E731
    H = LOOP_H
    i0, i1 = H, H + per
    d0 = quat_log(qmul_n(q[i1:i1 + 1], conj(q[i0:i0 + 1])))[0]
    w0 = quat_log(qmul_n(q[i0 + H:i0 + H + 1], conj(q[i0 - H:i0 - H + 1])))[0] / (2 * H)
    w1 = quat_log(qmul_n(q[i1 + H:i1 + H + 1], conj(q[i1 - H:i1 - H + 1])))[0] / (2 * H)
    pose, vel = _closure_curves(per, window)
    c = -np.outer(pose, d0) - np.outer(vel, w1 - w0)
    return qmul_n(quat_exp(c), q[i0:i1])


def close_loop_lin(x, per, window):
    """The same closure for positions: x (per + 2H + 1, d) frames start-H .. start+per+H."""
    H = LOOP_H
    i0, i1 = H, H + per
    d0 = x[i1] - x[i0]
    w0 = (x[i0 + H] - x[i0 - H]) / (2 * H)
    w1 = (x[i1 + H] - x[i1 - H]) / (2 * H)
    pose, vel = _closure_curves(per, window)
    return x[i0:i1] - np.outer(pose, d0) - np.outer(vel, w1 - w0)


MIRROR = np.diag([-1.0, 1.0, 1.0])  # the sagittal plane of the in-place clip (facing -Y): x -> -x


def mirror_name(name):
    """The bone's counterpart on the other side (thigh_l <-> thigh_r); centre bones map to themselves."""
    if name.endswith("_l"):
        return name[:-2] + "_r"
    if name.endswith("_r"):
        return name[:-2] + "_l"
    return name


def mirror_mats(R):
    """World-space rotation deltas (n, 3, 3) mirrored through the sagittal plane (the rig is left-right symmetric)."""
    return np.einsum("ij,njk,kl->nil", MIRROR, R, MIRROR)


def close_half(q, qm, h, window):
    """Closure of one step for a mirrored loop: q (h + 2H + 1, 4) holds a bone's frames start-H .. start+h+H and qm
    its mirrored counterpart's. Returns the h frames start .. start+h-1 corrected so that the frame after the last is
    the counterpart's mirrored first frame, with its angular velocity; the loop is then the step followed by the
    mirrored step of the other side."""
    conj = lambda x: x * np.array([1.0, -1.0, -1.0, -1.0])  # noqa: E731
    H = LOOP_H
    i0, i1 = H, H + h
    d0 = quat_log(qmul_n(q[i1:i1 + 1], conj(qm[i0:i0 + 1])))[0]
    w0 = quat_log(qmul_n(qm[i0 + H:i0 + H + 1], conj(qm[i0 - H:i0 - H + 1])))[0] / (2 * H)
    w1 = quat_log(qmul_n(q[i1 + H:i1 + H + 1], conj(q[i1 - H:i1 - H + 1])))[0] / (2 * H)
    pose, vel = _closure_curves(h, window)
    c = -np.outer(pose, d0) - np.outer(vel, w1 - w0)
    return qmul_n(quat_exp(c), q[i0:i1])


def rot_power(R, f):
    """R^f: the same axis, f times the angle."""
    q = mats_to_quats(R[None])[0]
    ang = 2 * math.acos(max(-1.0, min(1.0, q[0])))
    return axis_angle(q[1:], ang * f)


def mean_rotation(Rs):
    """Average of rotation matrices (n, 3, 3) (normalised quaternion mean, signs aligned)."""
    q = mats_to_quats(Rs)
    q *= np.sign(q @ q[0])[:, None]
    m = q.mean(axis=0)
    return quats_to_mats((m / np.linalg.norm(m))[None])[0]


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def cyclic_smooth(x, win):
    """Centered moving average along axis 0 of a cyclic sequence."""
    win = max(1, int(win) | 1)
    if win == 1:
        return x.copy()
    pad = win // 2
    xp = np.concatenate([x[-pad:], x, x[:pad]])
    k = np.ones(win) / win
    flat = xp.reshape(len(xp), -1)
    out = np.stack([np.convolve(flat[:, j], k, mode="valid") for j in range(flat.shape[1])], axis=1)
    return out.reshape(x.shape)


def cyclic_smooth_rot(R, win):
    """Moving average of a cyclic rotation sequence (n, 3, 3) (quaternions, signs aligned across the wrap)."""
    win = max(1, int(win) | 1)
    if win == 1:
        return R.copy()
    q = mats_to_quats(R)
    pad = win // 2
    s = 1.0 if np.dot(q[-1], q[0]) >= 0 else -1.0
    qp = np.concatenate([q[-pad:] * s, q, q[:pad] * s])
    k = np.ones(win) / win
    qs = np.stack([np.convolve(qp[:, j], k, mode="valid") for j in range(4)], axis=1)
    qs /= np.linalg.norm(qs, axis=1, keepdims=True)
    return quats_to_mats(qs)


def smooth(x, win):
    """Centered moving average along axis 0 (edges use the available samples)."""
    win = max(1, int(win))
    k = np.ones(win) / win
    pad = win // 2
    xp = np.pad(x, [(pad, win - 1 - pad)] + [(0, 0)] * (x.ndim - 1), mode="edge")
    return np.stack([np.convolve(xp[:, j], k, mode="valid") for j in range(x.shape[1])], axis=1)


def fk(rig, L, pelvis_loc):
    """World (armature-space) 4x4 matrices of every bone for each frame: L[bone] (n, 3, 3) local rotations,
    pelvis_loc (n, 3) the pelvis pose-bone location."""
    n = len(pelvis_loc)
    M = {}
    for name in rig.order:
        p = rig.parent[name]
        Bt = rig.B[name]
        Lm = np.zeros((n, 4, 4))
        Lm[:, :3, :3] = L[name]
        Lm[:, 3, 3] = 1.0
        if name == "pelvis":
            Lm[:, :3, 3] = pelvis_loc
        if p is None:
            M[name] = np.einsum("ij,njk->nik", Bt, Lm)
        else:
            M[name] = np.einsum("nij,jk,nkl->nil", M[p], np.linalg.inv(rig.B[p]) @ Bt, Lm)
    return M


def relaxed_hand(rig, spec):
    """Constant local rotations of the finger bones: each finger's first bone turns toward the middle finger by
    'together' of the angle between them (fingers held together), then every bone curls about its local X toward the
    palm by curlDeg (thumbDeg for the thumb)."""
    extra = {}
    for name in rig.order:
        parts = name.split("_")
        if len(parts) != 3 or parts[0] not in ("index", "middle", "ring", "pinky", "thumb"):
            continue
        finger, seg, side = parts
        deg = spec["thumbDeg" if finger == "thumb" else "curlDeg"].get(seg, 0.0)
        a = math.radians(deg)
        c, s = math.cos(a), math.sin(a)
        curl = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
        add = np.eye(3)
        if seg == "01" and finger in ("index", "ring", "pinky"):
            d_f, d_m = rig.rest_dir(name), rig.rest_dir(f"middle_01_{side}")
            ang = math.acos(max(-1.0, min(1.0, float(d_f @ d_m))))
            Rw = axis_angle(np.cross(d_f, d_m), ang * spec.get("together", 0.0))
            Bt = rig.B[name][:3, :3]
            add = Bt.T @ Rw @ Bt
        extra[name] = add @ curl
    return extra


def clavicle_follow(rig, dW, frac):
    """The clavicle takes `frac` of the upper arm's swing away from its rest direction (its twist is left out)."""
    if not frac:
        return
    for s in "lr":
        c, u = f"clavicle_{s}", f"upperarm_{s}"
        d = rig.rest_dir(u)
        rel = np.einsum("nji,njk->nik", dW[c], dW[u])
        moved = np.einsum("nij,j->ni", rel, d)
        out = np.empty_like(dW[c])
        for i in range(len(moved)):
            ang = math.acos(max(-1.0, min(1.0, float(moved[i] @ d))))
            out[i] = dW[c][i] @ axis_angle(np.cross(d, moved[i]), ang * frac)
        # the clavicle's children (the arm chain) keep their world rotations; only the shoulder joint moves
        dW[c] = out


def scale_arm_swing(rig, dW, f):
    """Scales each upper arm's swing about its mean pose (relative to the chest) by f; the forearm, hand and fingers
    ride along. A leaning run's backswing lifts the far elbow above the shoulder behind the head at the game camera's
    pitch."""
    if f == 1.0:
        return
    chest = dW["spine_03"]
    for s in "lr":
        ua = f"upperarm_{s}"
        rel = np.einsum("nji,njk->nik", chest, dW[ua])
        mean = mean_rotation(rel)
        new_rel = np.stack([rot_power(r @ mean.T, f) @ mean for r in rel])
        corr = np.einsum("nij,njk,nlk,nml->nim", chest, new_rel, rel, chest)  # world: chest new_rel rel^T chest^T
        chain = [ua]
        for name in rig.order:
            if rig.parent[name] in chain:
                chain.append(name)
        for name in chain:
            dW[name] = np.einsum("nij,njk->nik", corr, dW[name])


def limit_arm_back(rig, dW, limit_deg):
    """Soft limit on how far each upper arm swings back: the angle of the upper arm behind the vertical, in the
    in-place clip's sagittal plane (world space: that is what the game camera sees; a leaning run's pumping backswing
    otherwise shows the far upper arm as a flap behind the head). Past limit_deg the excess is compressed (tanh) to at
    most 5° more; the forearm, hand and fingers ride along. Returns the largest backswing before and after (degrees)."""
    if not limit_deg:
        return None
    lim = math.radians(limit_deg)
    worst = [0.0, 0.0]
    for s in "lr":
        ua = f"upperarm_{s}"
        d = np.einsum("nij,j->ni", dW[ua], rig.rest_dir(ua))
        ext = np.arctan2(d[:, 1], -d[:, 2])  # + = behind (the in-place clip faces -Y)
        new = np.where(ext > lim, lim + math.radians(5) * np.tanh((ext - lim) / math.radians(5)), ext)
        worst[0] = max(worst[0], float(np.degrees(ext.max())))
        worst[1] = max(worst[1], float(np.degrees(new.max())))
        corr = np.stack([axis_angle([1, 0, 0], -(e - ne)) for e, ne in zip(ext, new)])
        chain = [ua]
        for name in rig.order:
            if rig.parent[name] in chain:
                chain.append(name)
        for name in chain:
            dW[name] = np.einsum("nij,njk->nik", corr, dW[name])
    return [round(w, 1) for w in worst]


def face_angles(dW_head, dW_chest):
    """Per frame: the face's yaw relative to the chest's facing and its pitch (degrees; + = left / up). The rest
    pose faces -Y."""
    fwd = np.array([0.0, -1.0, 0.0])
    fh = np.einsum("nij,j->ni", dW_head, fwd)
    fc = np.einsum("nij,j->ni", dW_chest, fwd)
    yaw = np.degrees(np.arctan2(fh[:, 0], -fh[:, 1]) - np.arctan2(fc[:, 0], -fc[:, 1]))
    yaw = (yaw + 180) % 360 - 180
    pitch = np.degrees(np.arcsin(np.clip(fh[:, 2], -1, 1)))
    return yaw, pitch


def correct_head(rig, dW, spec, frames):
    """Turns neck (40%) and head (the rest) in the chest's frame: the mean yaw of the face away from the chest's
    facing is removed ('alignToChest'), the yaw's swings about that mean are scaled by keepYaw (a subject who looks
    around keeps small motions), and the face is lifted by liftDeg."""
    if not spec:
        return {}
    chest = dW["spine_03"]
    yaw0, pitch0 = face_angles(dW["head"][frames], chest[frames])
    keep = spec.get("keepYaw", 1.0)
    lift = math.radians(spec.get("liftDeg", 0.0))

    def turn(per_frame_deg, lift_rad):
        for name, f in (("neck_01", 0.4), ("head", 1.0)):
            Cs = np.stack([rot_power(axis_angle([1, 0, 0], -lift_rad) @ axis_angle([0, 0, 1], -math.radians(d)), f) for d in per_frame_deg])
            dW[name] = np.einsum("nij,njk,nlk,nlm->nim", chest, Cs, chest, dW[name])

    for it in range(4):
        yaw = face_angles(dW["head"], chest)[0]
        mean = float(np.mean(yaw[frames])) if spec.get("alignToChest") else 0.0
        if it == 0:
            turn((yaw - mean) * (1.0 - keep) + mean, lift)
        elif abs(mean) >= 0.2:  # a tilted chest turns the correction off the vertical a little: repeat on the rest
            turn(np.full(len(yaw), mean), 0.0)
        else:
            break
    yaw1, pitch1 = face_angles(dW["head"][frames], chest[frames])
    return {"alignToChest": bool(spec.get("alignToChest")), "keepYaw": keep, "liftDeg": spec.get("liftDeg", 0.0),
            "sourceFaceYawDeg": [round(float(x), 1) for x in (yaw0.min(), yaw0.mean(), yaw0.max())],
            "sourceFacePitchDeg": round(float(np.mean(pitch0)), 1),
            "faceYawDeg": [round(float(x), 1) for x in (yaw1.min(), yaw1.mean(), yaw1.max())]}


# ----------------------------------------------------------------------------------------------- soles and feet


def cyclic_runs(mask, min_len, max_gap):
    """Runs of True in a cyclic boolean array (gaps up to max_gap filled, runs shorter than min_len dropped), as lists
    of indices in order (a run may wrap around the end)."""
    n = len(mask)
    m = mask.copy()
    if not m.any():
        return []
    if m.all():
        return [list(range(n))]
    # fill short gaps
    for _ in range(2):
        start = int(np.argmin(m))
        i = 0
        while i < n:
            j = (start + i) % n
            if not m[j]:
                k = i
                while k < n and not m[(start + k) % n]:
                    k += 1
                if k - i <= max_gap:
                    for q in range(i, k):
                        m[(start + q) % n] = True
                i = k
            else:
                i += 1
    start = int(np.argmin(m))  # a False frame: runs never wrap past it
    runs, cur = [], []
    for i in range(n):
        j = (start + i) % n
        if m[j]:
            cur.append(j)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= min_len]


def two_bone_ik(hip, knee, ankle, target, a, b):
    """New knee position so that the ankle reaches target, keeping the knee in the current leg plane."""
    d_vec = target - hip
    d = float(np.linalg.norm(d_vec))
    d = min(max(d, 1e-4), (a + b) * 0.9995)
    dirn = d_vec / max(np.linalg.norm(d_vec), 1e-9)
    pole = (knee - hip) - np.dot(knee - hip, dirn) * dirn
    if np.linalg.norm(pole) < 1e-6:
        pole = np.array([0, -1.0, 0]) - np.dot([0, -1.0, 0], dirn) * dirn
    pole /= np.linalg.norm(pole)
    cos_a = (a * a + d * d - b * b) / (2 * a * d)
    alpha = math.acos(max(-1.0, min(1.0, cos_a)))
    new_knee = hip + a * (math.cos(alpha) * dirn + math.sin(alpha) * pole)
    new_ankle = hip + d * dirn
    return new_knee, new_ankle


CONTACT_POINTS = ("heel", "ball", "toe")  # stance and loop-point detection
LOCK_POINTS = CONTACT_POINTS + ("outer", "inner")  # pinned by the foot lock


def sole_tracks(rig, M, soles):
    """World positions of the sole points per frame, and each point's height above its flat-standing height."""
    out = {}
    for s in "lr":
        tr = {}
        for key in LOCK_POINTS:
            sp = soles[s][key]
            p = np.einsum("nij,j->ni", M[sp["bone"]], sp["local"])[:, :3]
            tr[key] = p
            tr[key + "_h"] = p[:, 2] - sp["restZ"]
        # sole vertices against the floor itself (z = 0; every sole vertex must stay above it, the lowest one touches
        # it in contact): foot and toe weights before the IK, exact skinning (every influence) once the legs are final
        tr["floor"] = [(sum(w * np.einsum("nij,j->ni", M[b], loc)[:, :3] for b, w, loc in fp["influences"]), 0.0)
                       for fp in soles[s]["floor"]]
        tr["floor_full"] = [(sum(w * np.einsum("nij,j->ni", M[b], loc)[:, :3] for b, w, loc in fp["full"]), 0.0)
                            for fp in soles[s]["floor"]]
        tr["hip"] = M[f"thigh_{s}"][:, :3, 3]
        tr["knee"] = M[f"calf_{s}"][:, :3, 3]
        tr["ankle"] = M[f"foot_{s}"][:, :3, 3]
        out[s] = tr
    return out


def cyc_vel(p, fps):
    return (np.roll(p, -1, axis=0) - np.roll(p, 1, axis=0)) * fps / 2


def contact_mask(p, h, u, fps, h_max=0.025, v_max=0.4):
    """Frames where a sole point is on the floor and nearly still in world space (the in-place clip moves the world
    backward at u along +Y)."""
    v = cyc_vel(p, fps) - np.array([0, u, 0])
    return (h < h_max) & (np.linalg.norm(v[:, :2], axis=1) < v_max)


def foot_contacts(tr, u, fps):
    """Contact frames of one foot's sole points. Stance: the foot's lowest sole point is near this foot's own floor
    level (retargeting can leave one foot a little higher) and nearly still in world space; within a stance each
    point is in contact while it is within 12 mm of its own lowest stance height (a retargeted foot can be pitched,
    so every point gets its own baseline; the lock then sets them on the floor)."""
    hs = np.stack([tr[k + "_h"] for k in CONTACT_POINTS])
    low = hs.min(axis=0)
    lowest = hs.argmin(axis=0)
    base = np.percentile(low, 5)
    vs = np.stack([np.linalg.norm((cyc_vel(tr[k], fps) - np.array([0, u, 0]))[:, :2], axis=1) for k in CONTACT_POINTS])
    v = vs[lowest, np.arange(len(low))]
    v_max = max(0.45, 0.15 * u)
    stance = np.zeros(len(low), dtype=bool)
    for run in cyclic_runs((low - base < 0.03) & (v < v_max), min_len=max(3, int(0.06 * fps)), max_gap=int(0.03 * fps)):
        stance[run] = True
    out = {"stance": stance}
    for k in LOCK_POINTS:
        h = tr[k + "_h"]
        base_p = np.percentile(h[stance], 5) if stance.any() else h.min()
        out[k] = stance & (h - base_p < 0.012)
    return out


def pose_arrays(rig, dW, loc, extra):
    L = local_rotations(rig, dW, extra)
    rest_loc = rig.B["pelvis"][:3, 3]
    Bp = rig.B["pelvis"][:3, :3]
    return L, np.einsum("ji,nj->ni", Bp, loc - rest_loc)


def sole_state(rig, dW, loc, extra, soles):
    L, pel = pose_arrays(rig, dW, loc, extra)
    return sole_tracks(rig, fk(rig, L, pel), soles)


def slide_stats(tracks, u, fps, masks=None):
    """World-space speed of the sole contact points while in contact (m/s): median and 95th percentile, worst
    side/point; and the lowest sole point relative to the floor (m). masks[side][point]: the contact frames (the
    lock's full-weight contacts, so before and after compare the same frames); detected from the motion if absent."""
    med, p95 = [], []
    low = 0.0
    for s, tr in tracks.items():
        fc = masks[s] if masks else foot_contacts(tr, u, fps)
        for p, rz in tr["floor"]:
            low = min(low, float((p[:, 2] - rz).min()))
        for key in LOCK_POINTS:
            low = min(low, float(tr[key + "_h"].min()))
            m = fc[key]
            if m.sum() >= 3:
                v = np.linalg.norm((cyc_vel(tr[key], fps) - np.array([0, u, 0]))[m, :2], axis=1)
                med.append(float(np.median(v)))
                p95.append(float(np.percentile(v, 95)))
    return {"medianMps": round(max(med), 4) if med else None, "p95Mps": round(max(p95), 4) if p95 else None,
            "lowestSoleM": round(low, 4)}


def lock_feet(rig, dW, loc, u, extra, soles, cfg, spec=None):
    """Foot locking on a closed (cyclic) loop. Each sole contact point (heel, ball, toe) in contact is pinned where it
    was planted (travelling backward at u), at its flat-standing height; a foot with heel and toe pinned is also
    turned so its heel-to-toe line matches the pins. The correction is exact in contact and fades in and out around every contact (smoothstep);
    a foot never goes below the floor. The pelvis is denoised first; legs are re-solved with two-bone IK, the IK result
    smoothed and solved once more onto the targets; the pelvis drops where a leg cannot reach. Modifies dW and loc in place; returns stats."""
    n = len(loc)
    fps = SRC_FPS
    period = n / fps
    t = np.arange(n) / fps
    spec = spec or {}
    blend = max(2, int(spec.get("lockBlendSec", cfg.get("lockBlendSec", 0.06)) * fps))
    loc[:] = cyclic_smooth(loc, cfg.get("smoothFrames", 7))  # mocap jitter of the pelvis would shake planted feet
    planted = bool(spec.get("planted"))
    if planted:
        # a standing clip: both feet stay flat and still for the whole loop (their mean heading, no pitch or roll)
        for s in "lr":
            f = mean_rotation(dW[f"foot_{s}"]) @ np.array([0.0, -1.0, 0.0])
            yaw = axis_angle([0, 0, 1], math.atan2(f[0], -f[1]))
            for name in (f"foot_{s}", f"ball_{s}"):
                dW[name] = np.broadcast_to(yaw, dW[name].shape).copy()
    level = spec.get("levelPelvis", 0.0)
    if level:
        # the weight shift rolls the pelvis and drops one hip, bending that knee: take out part of the roll
        tracks = sole_state(rig, dW, loc, extra, soles)
        dh = tracks["l"]["hip"] - tracks["r"]["hip"]
        roll = np.arctan2(dh[:, 2], np.linalg.norm(dh[:, :2], axis=1))
        dW["pelvis"] = np.einsum("nij,njk->nik", np.stack([axis_angle([0, 1, 0], level * r) for r in roll]), dW["pelvis"])
    tracks = sole_state(rig, dW, loc, extra, soles)
    # stance width (a standing clip): the feet's pins move sideways so the ankles stand about hip width apart
    shift = {"l": np.zeros(2), "r": np.zeros(2)}
    if spec.get("stanceWidth") == "hip":
        # and front to back, each ankle where it is at rest relative to its hip (under it)
        hip_w = float(rig.B["thigh_l"][0, 3] - rig.B["thigh_r"][0, 3])
        cur = float(np.mean(tracks["l"]["ankle"][:, 0] - tracks["r"]["ankle"][:, 0]))
        for s, sx in (("l", 1.0), ("r", -1.0)):
            dy = float(rig.B[f"foot_{s}"][1, 3] - rig.B[f"thigh_{s}"][1, 3])
            want_y = float(np.mean(tracks[s]["hip"][:, 1])) + dy
            shift[s] = np.array([sx * (hip_w - cur) / 2, want_y - float(np.mean(tracks[s]["ankle"][:, 1]))])
    corr, turn, contact, masks, footw = {}, {}, {}, {}, {}
    for s, tr in tracks.items():
        pins, weights = {}, {}
        fc = {k: np.ones(n, dtype=bool) for k in LOCK_POINTS} if planted else foot_contacts(tr, u, fps)
        for key in LOCK_POINTS:
            p = tr[key]
            runs = cyclic_runs(fc[key], min_len=max(3, int(0.04 * fps)), max_gap=int(0.02 * fps))
            target = p.copy()
            w = np.zeros(n)
            for run in runs:
                tt = np.array([t[j] + (period if j < run[0] else 0.0) for j in run])
                pin = (p[run] - np.outer(tt, [0, u, 0])).mean(axis=0)
                for j, ttj in zip(run, tt):
                    target[j, :2] = pin[:2] + shift[s] + np.array([0, u * ttj])
                    target[j, 2] = soles[s][key]["restZ"]
                    w[j] = 1.0
                for side, edge in ((-1, run[0]), (1, run[-1])):
                    for k in range(1, blend + 1):
                        j = (edge + side * k) % n
                        f = float(smoothstep(1.0 - k / (blend + 1)))
                        if f > w[j]:
                            w[j] = f
                            target[j] = p[j] + (target[edge] - p[edge])
            pins[key], weights[key] = target, w
            contact[f"{s}_{key}"] = round(float((w == 1.0).mean()), 3)
            masks.setdefault(s, {})[key] = w == 1.0
        footw[s] = np.maximum.reduce([weights[k] for k in LOCK_POINTS])
        # foot turn where both points are pinned: heel-to-toe line onto the pins' line
        R = np.broadcast_to(np.eye(3), (n, 3, 3)).copy()
        both = np.minimum(weights["heel"], weights["toe"])
        for k in range(n):
            if both[k] > 0:
                a = tr["toe"][k] - tr["heel"][k]
                b = pins["toe"][k] - pins["heel"][k]
                full = rot_between(a, b)
                R[k] = rot_power(full, both[k])
        R = cyclic_smooth_rot(R, cfg.get("smoothFrames", 7))
        # translation: weighted mean of the pinned points' offsets after the turn, about the ankle
        # translation: the pinned points' offsets after the turn, each weighted by its contact weight and by how
        # close it is to being the foot's lowest (the point bearing the weight: the heel at strike, the ball and toe
        # at push-off), so a rolling foot follows the point it rolls over
        moved = {k: tr["ankle"] + np.einsum("nij,nj->ni", R, tr[k] - tr["ankle"]) for k in LOCK_POINTS}
        hts = {k: moved[k][:, 2] - soles[s][k]["restZ"] for k in LOCK_POINTS}
        hmin = np.min(list(hts.values()), axis=0)
        c = np.zeros((n, 3))
        wsum = np.zeros(n)
        for key in LOCK_POINTS:
            wk = weights[key] * np.exp(-(hts[key] - hmin) / 0.004)
            c += wk[:, None] * (pins[key] - moved[key])
            wsum += wk
        c *= (np.maximum.reduce([weights[k] for k in LOCK_POINTS]) / np.maximum(wsum, 1e-9))[:, None]
        # the floor: no sole point below its flat-standing height
        below = np.zeros(n)
        for p, rz in ([] if planted else [(tr[k], soles[s][k]["restZ"]) for k in LOCK_POINTS] + tr["floor"]):
            moved = tr["ankle"] + np.einsum("nij,nj->ni", R, p - tr["ankle"]) + c
            below = np.maximum(below, rz - moved[:, 2])
        c[:, 2] += below
        corr[s], turn[s] = c, R
    # knees (a standing clip, 'knees': [min, max] degrees): the pelvis rises until the most bent leg is at max
    # flexion, and drops wherever a leg would straighten past min; otherwise it only drops where a leg cannot reach
    # (99.5 % of its length)
    knees = spec.get("knees")

    def reach_at(a, b, deg):
        return math.sqrt(a * a + b * b + 2 * a * b * math.cos(math.radians(deg)))

    raise_m = 0.0
    if knees:
        lo_r, hi_r = 0.0, 0.3
        for _ in range(40):
            mid = (lo_r + hi_r) / 2
            short = False
            for s, tr in tracks.items():
                a, b = rig.length[f"thigh_{s}"], rig.length[f"calf_{s}"]
                d = np.linalg.norm(tr["ankle"] + corr[s] - (tr["hip"] + np.array([0, 0, mid])), axis=1)
                short |= bool((d < reach_at(a, b, knees[1])).any())
            lo_r, hi_r = (mid, hi_r) if short else (lo_r, mid)
        raise_m = hi_r
        loc[:, 2] += raise_m
        for tr in tracks.values():
            tr["hip"] = tr["hip"] + np.array([0, 0, raise_m])
    drop = np.zeros(n)
    for s, tr in tracks.items():
        a, b = rig.length[f"thigh_{s}"], rig.length[f"calf_{s}"]
        reach = reach_at(a, b, knees[0]) if knees else (a + b) * 0.995
        need = np.linalg.norm(tr["ankle"] + corr[s] - tr["hip"], axis=1) - reach
        drop = np.maximum(drop, need)
    drop = cyclic_smooth(np.maximum(drop, 0.0), 13)
    loc[:, 2] -= drop
    # targets in world space: the ankle positions the corrections ask for
    targets = {s: tr["ankle"] + corr[s] for s, tr in tracks.items()}
    for s in "lr":
        ft, ba = f"foot_{s}", f"ball_{s}"
        dW[ft] = np.einsum("nij,njk->nik", turn[s], dW[ft])
        dW[ba] = np.einsum("nij,njk->nik", turn[s], dW[ba])
    # two IK passes: the first result is smoothed over time (no knee zig-zag from frame-to-frame IK noise), the second
    # puts the ankles back exactly on their targets from the smoothed legs (a small change, so it stays smooth)
    for ik_pass in range(2):
        tracks = sole_state(rig, dW, loc, extra, soles)
        for s, tr in tracks.items():
            a, b = rig.length[f"thigh_{s}"], rig.length[f"calf_{s}"]
            th, ca = f"thigh_{s}", f"calf_{s}"
            for k in range(n):
                hip, knee, ank = tr["hip"][k], tr["knee"][k], tr["ankle"][k]
                new_knee, new_ankle = two_bone_ik(hip, knee, ank, targets[s][k], a, b)
                r1 = rot_between(knee - hip, new_knee - hip)
                r2 = rot_between(r1 @ (ank - knee), new_ankle - new_knee)
                dW[th][k] = r1 @ dW[th][k]
                dW[ca][k] = r2 @ r1 @ dW[ca][k]
            if ik_pass == 0:
                for name in (th, ca):
                    dW[name] = cyclic_smooth_rot(dW[name], cfg.get("ikSmoothFrames", 5))
    hover, drop2 = {}, np.zeros(n)
    if not planted:
        # settle (locomotion; planted feet are exact from their pins): the floor constraint is estimated before the IK,
        # so planted soles can end up hovering; in contact, each
        # foot now comes down (or up) until its lowest sole vertex is on the floor, the pelvis dropping where a leg cannot
        # reach, and the legs are solved once more
        for s in "lr":
            # the capture's toe channels are noisy: a light smoothing of the toe joint (invisible at 30 fps), before the
            # soles are settled
            ft, ba = f"foot_{s}", f"ball_{s}"
            rel = cyclic_smooth_rot(np.einsum("nji,njk->nik", dW[ft], dW[ba]), spec.get("toeSmoothFrames", cfg.get("toeSmoothFrames", 9)))
            dW[ba] = np.einsum("nij,njk->nik", dW[ft], rel)
        tracks = sole_state(rig, dW, loc, extra, soles)
        for s, tr in tracks.items():
            hs = np.stack([p[:, 2] - rz for p, rz in tr["floor_full"]])
            m = hs.min(axis=0)
            # in contact the lowest sole vertex comes onto the floor; anywhere a sole vertex is below it, it comes up
            # (smoothed over time: a frame-by-frame correction would jerk the legs)
            dz = cyclic_smooth(np.where(m < 0, m, m * footw[s]), 7)
            # never below the floor, with 0.8 mm to spare for the dip between keys; in contact within 1.8 mm of it
            # (floorMarginM / contactMaxM: a character whose shipped, quantized clip dips further between keys)
            dz = np.minimum(dz, m - spec.get("floorMarginM", 0.0008))
            if spec.get("swingClearM"):
                # a swinging foot clears the floor by swingClearM (out of contact; faded with the lock weight): a
                # longer or heavier leg would otherwise brush the floor mid-swing, a sole grazing it while it travels
                dz = np.minimum(dz, m - spec["swingClearM"] * (1.0 - footw[s]) ** 2)
            dz = np.where(footw[s] >= 1.0, np.maximum(dz, m - spec.get("contactMaxM", 0.0018)), dz)
            targets[s] = tr["ankle"] - np.outer(dz, [0, 0, 1.0])
            hover[s] = round(float(np.max(np.where(footw[s] >= 1.0, m, -1.0))), 4)
        for s, tr in tracks.items():
            a, b = rig.length[f"thigh_{s}"], rig.length[f"calf_{s}"]
            drop2 = np.maximum(drop2, np.linalg.norm(targets[s] - tr["hip"], axis=1) - (a + b) * 0.999)
        drop2 = cyclic_smooth(np.maximum(drop2, 0.0), 9)
        loc[:, 2] -= drop2
        tracks = sole_state(rig, dW, loc, extra, soles)
        for s, tr in tracks.items():
            a, b = rig.length[f"thigh_{s}"], rig.length[f"calf_{s}"]
            th, ca = f"thigh_{s}", f"calf_{s}"
            for k in range(n):
                hip, knee, ank = tr["hip"][k], tr["knee"][k], tr["ankle"][k]
                new_knee, new_ankle = two_bone_ik(hip, knee, ank, targets[s][k], a, b)
                r1 = rot_between(knee - hip, new_knee - hip)
                r2 = rot_between(r1 @ (ank - knee), new_ankle - new_knee)
                dW[th][k] = r1 @ dW[th][k]
                dW[ca][k] = r2 @ r1 @ dW[ca][k]
    return {"contactFraction": contact, "maxPelvisDropM": round(float(drop.max()), 4), "pelvisRaiseM": round(float(raise_m), 4),
            "stanceShiftM": {k: [round(float(x), 4) for x in v] for k, v in shift.items()},
            "settledHoverM": hover, "settleDropM": round(float(drop2.max()), 4),
            "maxFootCorrectionM": round(float(max(np.abs(corr[s]).max() for s in "lr")), 4)}, masks


def sample_keys(keys_q, fps_out, fps):
    """The loop's keys (last repeats first) resampled at another rate over the same duration, as a glTF player would
    (slerp between keys): {bone: (m + 1, 4)} with the last sample repeating the first."""
    out = {}
    for name, q in keys_q.items():
        nk = len(q) - 1
        m = int(round(nk * fps / fps_out))
        t = np.arange(m + 1) * (nk / m)
        i0 = np.minimum(np.floor(t).astype(int), nk - 1)
        f = t - i0
        out[name] = np.stack([slerp(q[a], q[a + 1], x) for a, x in zip(i0, f)])
        out[name][-1] = out[name][0]
    return out


def wrap_continuity(keys_q, fps, floor=1.0):
    """Angular acceleration across the loop's wrap against each bone's own typical value, from the output keys (the
    last key repeats the first): per bone and key, |w(k+1) - w(k)| (w: angular velocity of the local rotation between
    keys, rad/s); typical = the bone's median over the loop (at least `floor` rad/s², for bones that barely move);
    wrap = the value at the key where the loop restarts. Reports the worst bone."""
    worst = (0.0, "", 0.0, 0.0)
    for name, q in keys_q.items():
        q = q[:-1]
        n = len(q)
        w = np.empty((n, 3))
        for k in range(n):
            d = qmul(q[(k + 1) % n], qconj(q[k]))
            if d[0] < 0:
                d = -d
            ang = 2 * math.acos(min(1.0, d[0]))
            ax = d[1:] / (np.linalg.norm(d[1:]) or 1.0)
            w[k] = ax * ang * fps
        a = np.linalg.norm(np.roll(w, -1, axis=0) - w, axis=1) * fps  # a[k]: at key k+1
        typical = max(float(np.median(a)), floor)
        wrap = float(a[-1])  # velocity into the last key (n-1 -> 0) vs out of the first (0 -> 1)
        ratio = wrap / typical
        if ratio > worst[0]:
            worst = (ratio, name, wrap, typical)
    return {"worstBone": worst[1], "wrapRadPerS2": round(worst[2], 1), "typicalRadPerS2": round(worst[3], 1), "ratio": round(worst[0], 3)}


# ------------------------------------------------------------------------------------------------------ retarget


def retarget_clip(rig, spec, cfg, soles, body=None):
    global SRC_FPS  # noqa: PLW0603  (the capture rate of the trial being processed)
    SRC_FPS = float(spec.get("fps", 120.0))
    subj, trial = spec["subject"], spec["trial"]
    skel = cmu.Skeleton(common.cache("cmu", f"{subj:02d}", f"{subj:02d}.asf"))
    frames = cmu.read_amc(common.cache("cmu", f"{subj:02d}", f"{subj:02d}_{trial:02d}.amc"), skel)
    G, P = cmu.clip(skel, frames)
    n = len(frames)
    m = skel.meters_per_unit
    src_leg = (skel.bones["lfemur"].length + skel.bones["ltibia"].length + skel.bones["rfemur"].length + skel.bones["rtibia"].length) / 2 * m
    tgt_leg = (rig.length["thigh_l"] + rig.length["calf_l"] + rig.length["thigh_r"] + rig.length["calf_r"]) / 2
    scale = tgt_leg / src_leg
    pelvis_world = np.einsum("ij,nj->ni", Q, P["root"]) * m * scale
    dW = world_deltas(rig, skel, G, cfg["boneMap"])
    mode = spec["rootMotion"]
    lo = max(0, int(spec["window"][0] * SRC_FPS))
    hi = min(n - 1, int(spec["window"][1] * SRC_FPS))
    clavicle_follow(rig, dW, spec.get("clavicleFollow", cfg.get("clavicleFollow", 0.0)))
    keep = spec.get("clavicleKeep", 1.0)
    if keep != 1.0:
        # a pumping run shrugs the shoulders toward the ears (the far one then shows behind the head at the game
        # camera's pitch): the clavicles keep this share of their motion relative to the chest; the arms keep their
        # world orientation, so only the shoulder joints come down
        for s in "lr":
            c = f"clavicle_{s}"
            rel = np.einsum("nji,njk->nik", dW["spine_03"], dW[c])
            dW[c] = np.einsum("nij,njk->nik", dW["spine_03"], np.stack([rot_power(r, keep) for r in rel]))
    extra = relaxed_hand(rig, cfg["relaxedHand"])

    def moving_frame(period):
        """Root path r(f) and yaw psi(f) so that Rz(psi) (0, -1, 0) is the travel (extract) or mean facing (pin)."""
        xy = pelvis_world[:, :2]
        if mode == "extract":
            r = smooth(xy, period)
            v = np.gradient(smooth(r, period // 4 or 1), axis=0)
            psi = np.unwrap(np.arctan2(v[:, 0], -v[:, 1]))
            psi = smooth(psi[:, None], period // 2 or 1)[:, 0]
        else:
            fwd = facing(rig, dW, spec.get("yawFrom"))
            ang = np.unwrap(np.arctan2(fwd[:, 0], -fwd[:, 1]))
            r = np.broadcast_to(xy[lo:hi + 1].mean(axis=0), xy.shape).copy()
            psi = np.full(n, float(ang[lo:hi + 1].mean()))
        return r, psi

    def in_place(period):
        r, psi = moving_frame(period)
        turn = np.stack([rz(-a) for a in psi])
        # the turn goes into everything below Root, so Root stays at identity (in place) and the pelvis carries it
        dWl = {k: (v if rig.parent[k] is None else np.einsum("nij,njk->nik", turn, v)) for k, v in dW.items()}
        loc = pelvis_world.copy()
        loc[:, :2] -= r
        loc = np.einsum("nij,nj->ni", turn, loc)
        return dWl, loc, r, psi

    pmin = int(spec["loop"]["minSec"] * SRC_FPS)
    pmax = int(spec["loop"]["maxSec"] * SRC_FPS)
    # loopAt [start, length] (seconds of the capture): take that loop instead of searching (another body keeps the
    # loop the reference character's search found, where the splice rules and the closure were tuned)
    loop_at = spec.get("loopAt")
    if loop_at:
        pmin = pmax = int(round(loop_at[1] * SRC_FPS))
    K = max(2, int(spec.get("spliceSec", 0.05) * SRC_FPS))
    ahead = 6  # pose-velocity check: frames past the loop point

    dWl, loc, _, _ = in_place((pmin + pmax) // 2)
    # frames where the loop point may fall: 'singleSupport' (a walk) keeps one and the same foot planted and the other
    # in the air through the K frames before it; 'flight' (a run) has both feet in the air
    ok = np.ones(n, dtype=bool)
    splice = spec.get("splice")
    if splice:
        tr = sole_state(rig, dWl, loc, extra, soles)
        lift0 = -min(np.percentile(tr[s][k + "_h"], 3) for s in "lr" for k in CONTACT_POINTS)
        loc0 = loc + np.array([0, 0, lift0])
        tr = sole_state(rig, dWl, loc0, extra, soles)
        planted = {s: np.min([tr[s][k + "_h"] for k in CONTACT_POINTS], axis=0) < 0.03 for s in "lr"}
        single_l = planted["l"] & ~planted["r"]
        single_r = planted["r"] & ~planted["l"]
        flight = ~planted["l"] & ~planted["r"]
        ok = np.zeros(n, dtype=bool)
        for a in range(K, n):
            if splice == "flight":
                ok[a] = flight[a - K:a + 1].all()
            else:
                ok[a] = single_l[a - K:a + 1].all() or single_r[a - K:a + 1].all()
    L = local_rotations(rig, dWl, extra)
    key = [b for b in cfg["boneMap"] if b != "pelvis"]
    Qk = np.stack([mats_to_quats(L[b]) for b in key], axis=1)
    Qp = mats_to_quats(dWl["pelvis"])
    # calm: per frame, the largest over bones of the angular acceleration (at the 30 fps key spacing) against the
    # bone's median; a loop point where every bone is calm keeps the wrap within each bone's typical acceleration
    st = int(round(SRC_FPS / ANALYSIS_FPS))
    calm = np.zeros(n)
    for j in range(len(key)):
        q = Qk[:, j]
        w = np.zeros((n, 3))
        w[st:n - st] = quat_log(qmul_n(q[2 * st:], q[:n - 2 * st] * np.array([1.0, -1.0, -1.0, -1.0])))
        acc = np.zeros(n)
        acc[st:n - st] = np.linalg.norm(w[2 * st:] - w[:n - 2 * st], axis=1)
        med = max(float(np.median(acc[lo:hi + 1])), 1e-6)
        calm = np.maximum(calm, acc / med)
    calm_w = spec.get("calmWeight", 0.05)
    best = None
    mirror = bool(spec.get("mirror"))
    if mirror:
        # one step and the other side's mirrored step: the step's end must match the mirrored start
        names = key + ["pelvis"]
        Qw = np.stack([mats_to_quats(dWl[b]) for b in names], axis=1)
        Qm = np.stack([mats_to_quats(mirror_mats(dWl[mirror_name(b)])) for b in names], axis=1)
        locm = loc * np.array([-1.0, 1.0, 1.0])
        for h in range(pmin // 2, pmax // 2 + 1):
            a = np.arange(max(lo, K, LOOP_H), min(hi, n - LOOP_H - 1) - h - ahead)
            a = a[ok[a]] if len(a) else a
            if len(a) == 0:
                continue
            b = a + h
            pose = np.sum(1 - np.einsum("abk,abk->ab", Qw[b], Qm[a]) ** 2, axis=1)
            vel = np.sum(1 - np.einsum("abk,abk->ab", Qw[b + ahead], Qm[a + ahead]) ** 2, axis=1)
            posd = np.sum((loc[b] - locm[a]) ** 2, axis=1) * 40.0
            cost = pose + vel + posd + calm_w * np.maximum(calm[a], calm[b])
            i = int(np.argmin(cost))
            if best is None or cost[i] < best[0]:
                best = (float(cost[i]), int(a[i]), 2 * h)
    for per in range(pmin, pmax + 1) if not mirror else ():
        a = np.arange(max(lo, K, LOOP_H), min(hi, n - LOOP_H - 1) - per - ahead)
        a = a[ok[a]] if len(a) and not loop_at else a
        if loop_at:
            a = a[a == int(round(loop_at[0] * SRC_FPS))]
        if len(a) == 0:
            continue
        b = a + per
        pose = np.sum(1 - np.einsum("abk,abk->ab", Qk[a], Qk[b]) ** 2, axis=1) + 2 * (1 - np.einsum("ak,ak->a", Qp[a], Qp[b]) ** 2)
        vel = np.sum(1 - np.einsum("abk,abk->ab", Qk[a + ahead], Qk[b + ahead]) ** 2, axis=1)
        posd = np.sum((loc[a] - loc[b]) ** 2, axis=1) * 40.0
        cost = pose + vel + posd + calm_w * np.maximum(calm[a], calm[b])
        i = int(np.argmin(cost))
        if best is None or cost[i] < best[0]:
            best = (float(cost[i]), int(a[i]), per)
    if best is None:
        raise RuntimeError(f"no loop of {pmin}-{pmax} frames (splice: {splice}) fits in window {spec['window']}")
    cost, start, per = best
    span = per // 2 if mirror else per
    log(f"{subj}_{trial:02d}: loop {start / SRC_FPS:.3f}s + {per / SRC_FPS:.3f}s{' (a step and its mirror)' if mirror else ''} (cost {cost:.4f}, calm {max(calm[start], calm[start + span]):.2f})")

    # the closed loop: frames start .. start+per-1, closed C1 by a correction spread over the loop
    dWl, loc, r, psi = in_place(per)
    idx = np.arange(start, start + span)
    ext = np.arange(start - LOOP_H, start + span + LOOP_H + 1)
    window = max(4, min(span, int(spec.get("closeSec", 0.25) * SRC_FPS)))
    if mirror:
        half = {name: quats_to_mats(close_half(mats_to_quats(v[ext]), mats_to_quats(mirror_mats(dWl[mirror_name(name)][ext])), span, window))
                for name, v in dWl.items()}
        dWc = {name: np.concatenate([half[name], mirror_mats(half[mirror_name(name)])]) for name in dWl}
        x = loc[ext]
        xm = x * np.array([-1.0, 1.0, 1.0])
        H = LOOP_H
        pose_c, vel_c = _closure_curves(span, window)
        hx = x[H:H + span] - np.outer(pose_c, x[H + span] - xm[H]) - np.outer(vel_c, (x[2 * H + span] - x[span]) / (2 * H) - (xm[2 * H] - xm[0]) / (2 * H))
        locc = np.concatenate([hx, hx * np.array([-1.0, 1.0, 1.0])])
    else:
        dWc = {name: quats_to_mats(close_loop(mats_to_quats(v[ext]), per, window)) for name, v in dWl.items()}
        locc = close_loop_lin(loc[ext], per, window)
    scale_arm_swing(rig, dWc, spec.get("armSwing", 1.0))
    arm_back = limit_arm_back(rig, dWc, spec.get("armBackLimitDeg"))
    head = correct_head(rig, dWc, spec.get("head"), np.arange(per))

    dur = per / SRC_FPS
    u0 = float(np.sum(np.linalg.norm(np.diff(r[start:start + span + 1], axis=0), axis=1))) / (span / SRC_FPS) if mode == "extract" else 0.0
    # pelvis height: the soles' planted points sit on the floor on average; the backward speed of planted soles is
    # the travel speed (refined from the pelvis path)
    u = u0
    for _ in range(3):
        tr = sole_state(rig, dWc, locc, extra, soles)
        hs = np.concatenate([tr[s][k + "_h"] for s in "lr" for k in CONTACT_POINTS])
        floor = np.percentile(hs, 3)
        locc[:, 2] -= floor
        if mode == "extract":
            tr = sole_state(rig, dWc, locc, extra, soles)
            vs = []
            for s in "lr":
                fc = foot_contacts(tr[s], u, SRC_FPS)
                for k in CONTACT_POINTS:
                    vs.append(cyc_vel(tr[s][k], SRC_FPS)[fc[k], 1])
            vs = np.concatenate(vs)
            if len(vs):
                u = float(np.median(vs))
            else:
                # no stance found at the pelvis path's speed (a body whose stride differs from it by more than the
                # stance speed tolerance): bootstrap from the backward speed of each foot's lowest sole point while it is
                # near its floor, and search the contacts again at that speed
                for s in "lr":
                    hs_s = np.stack([tr[s][k + "_h"] for k in CONTACT_POINTS])
                    low_s, arg = hs_s.min(axis=0), hs_s.argmin(axis=0)
                    vy = np.stack([cyc_vel(tr[s][k], SRC_FPS)[:, 1] for k in CONTACT_POINTS])[arg, np.arange(len(low_s))]
                    vs = np.concatenate([vs, vy[low_s - np.percentile(low_s, 5) < 0.015]])
                if len(vs):
                    u = float(np.median(vs))
    lift = float(locc[:, 2].mean() - loc[idx, 2].mean())
    seat_raise = 0.0
    if spec.get("seatHeightM") and body is not None:
        # a seated clip: the pelvis moves up (or down) until the underside of the buttocks is at the seat height the
        # game's chairs and sofas have; the planted feet stay on the floor (the leg IK opens or closes the knees)
        seat_raise = spec["seatHeightM"] - pose_summary(rig, dWc, locc, extra, body, seat=spec.get("seatBones", True))["seatHeightM"]
        locc[:, 2] += seat_raise
    before_state = sole_state(rig, dWc, locc, extra, soles)
    lock, masks = lock_feet(rig, dWc, locc, u, extra, soles, cfg, spec) if spec.get("footLock", True) else ({}, None)
    before = slide_stats(before_state, u, SRC_FPS, masks)
    tr = sole_state(rig, dWc, locc, extra, soles)
    after = slide_stats(tr, u, SRC_FPS, masks)

    def flex(t):
        a, b = t["knee"] - t["hip"], t["ankle"] - t["knee"]
        c = np.einsum("ni,ni->n", a, b) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        return np.degrees(np.arccos(np.clip(c, -1, 1)))

    stance = {"kneeFlexDeg": {s: [round(float(flex(tr[s]).min()), 1), round(float(flex(tr[s]).max()), 1)] for s in "lr"},
              "ankleSpacingM": [round(float(x), 3) for x in (np.abs(tr["l"]["ankle"][:, 0] - tr["r"]["ankle"][:, 0]).min(), np.abs(tr["l"]["ankle"][:, 0] - tr["r"]["ankle"][:, 0]).max())],
              "hipWidthM": round(float(rig.B["thigh_l"][0, 3] - rig.B["thigh_r"][0, 3]), 3)}
    yaw_after, pitch_after = face_angles(dWc["head"], dWc["spine_03"])
    L, pel_loc = pose_arrays(rig, dWc, locc, extra)
    if spec.get("handSmoothFrames"):
        # the capture's wrist channels can snap (a single-frame flick); a light smoothing of the hand joint
        for s in "lr":
            L[f"hand_{s}"] = cyclic_smooth_rot(L[f"hand_{s}"], spec["handSmoothFrames"])
    if spec.get("upperSmoothFrames"):
        # busy hands (kneading, eating): a light cyclic smoothing of the trunk, head and arm joints evens out the
        # acceleration everywhere, the wrap included (the legs keep their foot-locked solution)
        legs = ("pelvis", "thigh_", "calf_", "foot_", "ball_")
        for name in rig.order:
            if rig.parent[name] is not None and not name.startswith(legs):
                L[name] = cyclic_smooth_rot(L[name], spec["upperSmoothFrames"])

    # resample the cyclic loop to the output rate: nk intervals, the last key repeating the first ('speed' plays the
    # capture faster: fewer keys over the same source frames)
    out_fps = cfg["fps"]
    play = float(spec.get("speed", 1.0))
    nk = max(2, int(round(per / (SRC_FPS / out_fps) / play)))
    times = np.arange(nk + 1) * (per / nk)
    i0 = np.floor(times).astype(int) % per
    i1 = (i0 + 1) % per
    frac = times - np.floor(times)
    keys_q = {}
    for name in rig.order:
        q = mats_to_quats(np.concatenate([L[name], L[name][:1]]))[:-1]
        keys_q[name] = np.stack([slerp(q[a], q[b], f) for a, b, f in zip(i0, i1, frac)])
        keys_q[name][-1] = keys_q[name][0]
    keys_p = pel_loc[i0] * (1 - frac)[:, None] + pel_loc[i1] * frac[:, None]
    keys_p[-1] = keys_p[0]

    # extracted root motion: the speed at which a planted sole travels backward in the in-place clip is the speed
    # the character moves at for it to stay put; the loop is resampled to a whole number of output frames, so the
    # published speed follows the exported duration
    yaw = 0.0 if mirror else float(psi[start + per] - psi[start])  # a mirrored loop's two steps turn opposite ways
    dist = u * dur
    out_dur = nk / out_fps
    speed = dist / out_dur
    report = {
        "source": f"CMU {subj}_{trial:02d}",
        "title": spec.get("title", ""),
        "kind": "loop",
        "loop": True,
        **({"speed": play} if play != 1.0 else {}),
        **({"use": spec["use"]} if spec.get("use") else {}),
        "loopStartSec": round(start / SRC_FPS, 4),
        "sourceDurationSec": round(span / SRC_FPS, 4),
        "mirroredStep": mirror,
        "durationSec": round(out_dur, 4),
        "keys": nk + 1,
        "fps": out_fps,
        "loopCost": round(cost, 5),
        "splice": splice or "any",
        "legScale": round(scale, 4),
        "floorLiftM": round(lift, 4),
        **({"seatRaiseM": round(seat_raise, 4)} if seat_raise else {}),
        "rootMotion": {
            "mode": mode,
            "forward": [0, 0, 1],
            "distanceM": round(dist, 4),
            "speedMps": round(speed, 4),
            "pelvisPathSpeedMps": round(u0, 4),
            "yawDegPerLoop": round(math.degrees(yaw), 2) if mode == "extract" else 0.0,
        },
        "stride": {"cycleSec": round(out_dur, 4), "strideM": round(dist, 4), "stepsPerCycle": 2,
                   "cadenceStepsPerMin": round(120.0 / out_dur, 1)} if mode == "extract" else None,
        "head": {**head, "faceYawToChestDeg": round(float(np.mean(yaw_after)), 1), "facePitchDeg": round(float(np.mean(pitch_after)), 1)},
        "soleSlide": {"beforeLock": before, "afterLock": after},
        "stance": stance,
        "armBackswingDeg": arm_back,
        "trunkLeanDeg": round(float(np.degrees(np.mean(np.arctan2(-np.einsum("nij,j->ni", dWc["spine_03"], rig.rest_dir("spine_03"))[:, 1],
                                                                        np.einsum("nij,j->ni", dWc["spine_03"], rig.rest_dir("spine_03"))[:, 2])))), 1),
        "loopContinuity": wrap_continuity(sample_keys(keys_q, out_fps, ANALYSIS_FPS), ANALYSIS_FPS),
        "footLock": lock,
    }
    if report["stride"] is None:
        del report["stride"]
    if body is not None:
        report["pose"] = pose_summary(rig, dWc, locc, extra, body, seat=spec.get("seatBones", True) if spec.get("seat") else False)
    return {"q": keys_q, "p": keys_p, "report": report, "nk": nk}


# ------------------------------------------------------------------------------------ one-shot and held clips


def body_points(rig_obj, rig, step=4):
    """Every `step`-th vertex of the character's mesh, skinned with all its influences: [(bone, weight, local 4-vector)]
    per point. Floor contact of clips whose body touches the ground (lying, falling)."""
    mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig_obj)
    to_arm = np.array(rig_obj.matrix_world.inverted() @ mesh.matrix_world)
    names = {g.index: g.name for g in mesh.vertex_groups}
    inv = {b: np.linalg.inv(rig.B[b]) for b in rig.B}
    pts = []
    for i, v in enumerate(mesh.data.vertices):
        if i % step:
            continue
        w = {names.get(g.group): g.weight for g in v.groups if names.get(g.group) in rig.B and g.weight > 0}
        total = sum(w.values())
        if total <= 0:
            continue
        p = to_arm @ np.array([*v.co, 1.0])
        pts.append([(b, x / total, inv[b] @ p) for b, x in w.items()])
    by_bone = {}
    for j, infl in enumerate(pts):
        for b, x, loc in infl:
            by_bone.setdefault(b, ([], [], []))
            by_bone[b][0].append(j)
            by_bone[b][1].append(x)
            by_bone[b][2].append(loc)
    return {"count": len(pts), "bones": {b: (np.array(ix), np.array(ws), np.array(ls)) for b, (ix, ws, ls) in by_bone.items()}}


def body_positions(M, body):
    """(n, points, 3) armature-space positions of the body sample points for bone matrices M."""
    n = len(next(iter(M.values())))
    out = np.zeros((n, body["count"], 3))
    for b, (ix, ws, ls) in body["bones"].items():
        p = np.einsum("fij,pj->fpi", M[b][:, :3, :], ls)
        np.add.at(out, (slice(None), ix), p * ws[None, :, None])
    return out


def body_lowest(rig, dW, loc, extra, body):
    """Per frame: the height of the lowest body sample point (m)."""
    L, pel = pose_arrays(rig, dW, loc, extra)
    return body_positions(fk(rig, L, pel), body)[:, :, 2].min(axis=1)


def to_gltf(v):
    """Blender armature space (Z up, facing -Y) -> glTF (Y up, facing +Z)."""
    return [round(float(v[0]), 3), round(float(v[2]), 3), round(float(-v[1]), 3)]


def pose_summary(rig, dW, loc, extra, body, seat=False):
    """What the renderer needs to place a clip: pelvis height range, the lowest body point, and for the first and last
    frame whether the body lies (trunk within 30 degrees of horizontal), where the head points and where the pelvis is
    (glTF axes: +Y up, the character faces +Z at the clip's start)."""
    L, pel = pose_arrays(rig, dW, loc, extra)
    M = fk(rig, L, pel)
    pos = body_positions(M, body)
    low = pos[:, :, 2].min(axis=1)
    pz = M["pelvis"][:, 2, 3]
    seat_m = None
    if seat:
        # the underside of the buttocks: the lowest body point within 25 cm (horizontally) of the pelvis joint; with a
        # list of bones (a clip's seatBones), only points skinned mostly to them (not hands in the lap, not a coat's hem)
        d = np.linalg.norm(pos[:, :, :2] - M["pelvis"][:, None, :2, 3], axis=2)
        near = d < 0.25
        if isinstance(seat, (list, tuple)):
            share = np.zeros(body["count"])
            for b in seat:
                if b in body["bones"]:
                    ix, ws, _ls = body["bones"][b]
                    np.add.at(share, ix, ws)
            near &= (share > 0.5)[None, :]
        seat_m = round(float(np.min(np.where(near, pos[:, :, 2], np.inf))), 3)

    def frame(k):
        head = M["head"][k, :3, 3]
        pelvis = M["pelvis"][k, :3, 3]
        axis = head - pelvis
        axis /= np.linalg.norm(axis)
        face = M["head"][k, :3, :3] @ rig.B["head"][:3, :3].T @ np.array([0.0, -1.0, 0.0])
        return {"lying": bool(abs(axis[2]) < math.sin(math.radians(30))), "headDir": to_gltf(axis), "faceDir": to_gltf(face),
                "pelvisM": to_gltf(pelvis), "headM": to_gltf(head)}

    return {"pelvisHeightM": [round(float(pz.min()), 3), round(float(pz.max()), 3)],
            **({"seatHeightM": seat_m} if seat else {}),
            "lowestBodyPointM": round(float(low.min()), 4), "start": frame(0), "end": frame(len(pz) - 1)}


def rotate_subtree(rig, dW, bone, R):
    """World-space rotations R (n, 3, 3) applied to a bone and everything below it (the subtree turns about that
    bone's joint; positions follow through the forward kinematics)."""
    chain = [bone]
    for name in rig.order:
        if rig.parent[name] in chain:
            chain.append(name)
    for name in chain:
        dW[name] = np.einsum("nij,njk->nik", R, dW[name])


def flinch(rig, dW, loc, spec, fps):
    """A procedural hit reaction layered on the capture: an envelope that rises fast (the impact) and settles back
    (both ends at rest with no velocity) drives a backward lean of the spine, the head snapping forward against it,
    the upper arms lifting forward and the pelvis pushed back and down (the planted feet then bend the knees)."""
    n = len(loc)
    t = np.arange(n) / fps
    dur = n / fps
    peak = spec.get("peakSec", 0.12)
    env = np.where(t < peak, smoothstep(t / peak), 1.0 - smoothstep((t - peak) / max(1e-6, dur - peak)))
    lateral = np.array([1.0, 0.0, 0.0])  # the in-place clip faces -Y: +X is the character's left; about -X leans back
    for bone, deg in spec.get("spineDeg", {}).items():
        rotate_subtree(rig, dW, bone, np.stack([axis_angle(lateral, -math.radians(deg) * e) for e in env]))
    for bone, deg in spec.get("neckDeg", {}).items():
        rotate_subtree(rig, dW, bone, np.stack([axis_angle(lateral, math.radians(deg) * e) for e in env]))
    for s in "lr":
        up = spec.get("armLiftDeg", 0.0)
        out = spec.get("armOutDeg", 0.0) * (1 if s == "l" else -1)
        # forward is -Y: lifting forward turns about -X; out to the side about the forward axis
        R = np.stack([axis_angle(lateral, -math.radians(up) * e) @ axis_angle([0, 1.0, 0], -math.radians(out) * e) for e in env])
        rotate_subtree(rig, dW, f"upperarm_{s}", R)
        bend = spec.get("elbowDeg", 0.0)
        if bend:
            rotate_subtree(rig, dW, f"lowerarm_{s}", np.stack([axis_angle(lateral, -math.radians(bend) * e) for e in env]))
    back, down = spec.get("pelvisBackM", 0.0), spec.get("pelvisDownM", 0.0)
    loc[:, 1] += back * env
    loc[:, 2] -= down * env
    return {"peakSec": peak, "envelope": "smoothstep rise to peakSec, smoothstep settle to the end",
            **{k: spec[k] for k in ("spineDeg", "neckDeg", "armLiftDeg", "armOutDeg", "elbowDeg", "pelvisBackM", "pelvisDownM") if k in spec}}


def facing(rig, dW, how):
    """Per frame, the vector whose horizontal part is the clip's facing: the pelvis's forward (default), the chest's
    ('chest'), their mean ('mix': a seated subject whose trunk is turned from the hips), or, lying on the back, the
    opposite of where the head points ('lying': as after falling backward)."""
    pelvis = np.einsum("nij,j->ni", dW["pelvis"], np.array([0, -1.0, 0]))
    chest = np.einsum("nij,j->ni", dW["spine_03"], np.array([0, -1.0, 0]))
    if how == "lying":
        return -np.einsum("nij,j->ni", dW["spine_03"], rig.rest_dir("spine_03"))
    if how == "chest":
        return chest
    if how == "mix":
        unit = lambda v: v / np.maximum(np.linalg.norm(v[:, :2], axis=1, keepdims=True), 1e-9)  # noqa: E731
        return unit(pelvis) + unit(chest)
    return pelvis


def face_up(rig, dW, frac):
    """Turns neck (40 %) and head (the rest) so the face turns `frac` of the way toward straight up (a subject lying
    on the back with the head rolled to one side). dW holds constant poses; returns the angle before and after."""
    fwd = np.array([0.0, -1.0, 0.0])
    face = dW["head"][0] @ fwd
    before = math.degrees(math.acos(max(-1.0, min(1.0, face[2]))))
    R = rot_between(face, np.array([0.0, 0.0, 1.0]))
    n = len(dW["head"])
    for name, f in (("neck_01", 0.4), ("head", 0.6)):
        rotate_subtree(rig, dW, name, np.broadcast_to(rot_power(R, frac * f), (n, 3, 3)))
    face = dW["head"][0] @ fwd
    return [round(before, 1), round(math.degrees(math.acos(max(-1.0, min(1.0, face[2])))), 1)]


def retarget_action(rig, spec, cfg, soles, body):
    """A clip that is not a searched loop. kind 'oneShot': the capture's window as is (pickup, hit, death), played once
    and held on its last frame; kind 'hold': one pose, the mean of the window, held for holdSec with a procedural
    breathing cycle (sleep), looping exactly. Root motion: 'pin' fixes the pelvis's mean position and facing over the
    window; 'pinStart' those of its first 0.1 s (a fall keeps its travel away from where it started); yawFrom 'lying'
    takes the facing from the body's long axis (a subject lying on the back faces away from where the head points),
    so the clip lies along glTF Z, head toward -Z, face up. Floor: 'soles' (the planted soles' contact points on
    the floor), 'body' (the lowest body point on the floor; a fall blends from the soles at the start to the body
    at the end)."""
    global SRC_FPS  # noqa: PLW0603
    SRC_FPS = float(spec.get("fps", 120.0))
    kind = spec["kind"]
    subj, trial = spec["subject"], spec["trial"]
    skel = cmu.Skeleton(common.cache("cmu", f"{subj:02d}", f"{subj:02d}.asf"))
    frames = cmu.read_amc(common.cache("cmu", f"{subj:02d}", f"{subj:02d}_{trial:02d}.amc"), skel)
    G, P = cmu.clip(skel, frames)
    n_all = len(frames)
    m = skel.meters_per_unit
    src_leg = (skel.bones["lfemur"].length + skel.bones["ltibia"].length + skel.bones["rfemur"].length + skel.bones["rtibia"].length) / 2 * m
    tgt_leg = (rig.length["thigh_l"] + rig.length["calf_l"] + rig.length["thigh_r"] + rig.length["calf_r"]) / 2
    scale = tgt_leg / src_leg
    a = max(0, int(round(spec["window"][0] * SRC_FPS)))
    b = min(n_all - 1, int(round(spec["window"][1] * SRC_FPS)))
    pad = int(round(0.1 * SRC_FPS))
    pa, pb = max(0, a - pad), min(n_all - 1, b + pad)
    sl = slice(pa, pb + 1)
    G = {k: v[sl] for k, v in G.items()}
    pelvis_world = np.einsum("ij,nj->ni", Q, P["root"][sl]) * m * scale
    dW = world_deltas(rig, skel, G, cfg["boneMap"])
    clavicle_follow(rig, dW, spec.get("clavicleFollow", cfg.get("clavicleFollow", 0.0)))
    extra = relaxed_hand(rig, cfg["relaxedHand"])
    n = len(pelvis_world)
    i0, i1 = a - pa, b - pa  # the window inside the padded frames

    # root frame: position r and facing psi (Rz(psi) (0, -1, 0) is the facing), constant over the clip
    mode = spec.get("rootMotion", "pin")
    ref = np.arange(i0, i1 + 1) if mode == "pin" else np.arange(i0, min(i1, i0 + int(0.1 * SRC_FPS)) + 1)
    fwd = facing(rig, dW, spec.get("yawFrom"))
    f = fwd[ref, :2].mean(axis=0)
    psi = math.atan2(f[0], -f[1])
    r = pelvis_world[ref, :2].mean(axis=0)
    turn = rz(-psi)
    dWl = {k: (np.array(v) if rig.parent[k] is None else np.einsum("ij,njk->nik", turn, v)) for k, v in dW.items()}
    loc = pelvis_world.copy()
    loc[:, :2] -= r
    loc = np.einsum("ij,nj->ni", turn, loc)

    flinch_report, face_report = None, None
    if spec.get("flinch"):
        # the layer spans the window (the pad frames keep the capture as is)
        sub = {k: v[i0:i1 + 1] for k, v in dWl.items()}
        sloc = loc[i0:i1 + 1].copy()
        flinch_report = flinch(rig, sub, sloc, spec["flinch"], SRC_FPS)
        for k in dWl:
            dWl[k][i0:i1 + 1] = sub[k]
        loc[i0:i1 + 1] = sloc
    head = correct_head(rig, dWl, spec.get("head"), np.arange(i0, i1 + 1))

    if kind == "hold":
        # one pose: the window's mean (each bone's mean world rotation), then a breathing cycle over holdSec
        per = int(round(spec["holdSec"] * SRC_FPS))
        idx = np.arange(i0, i1 + 1)
        dWl = {k: np.broadcast_to(mean_rotation(v[idx]), (per, 3, 3)).copy() for k, v in dWl.items()}
        loc = np.broadcast_to(loc[idx].mean(axis=0), (per, 3)).copy()
        face_report = face_up(rig, dWl, spec["faceUp"]) if spec.get("faceUp") else None
        br = spec.get("breathe", {})
        phase = np.sin(2 * math.pi * np.arange(per) / per)
        for bone, deg in br.get("chestDeg", {}).items():
            # about the bone's own lateral axis (its local X), so the chest rises whatever way the body lies
            ax = dWl[bone][0] @ rig.B[bone][:3, 0]
            rotate_subtree(rig, dWl, bone, np.stack([axis_angle(ax, math.radians(deg) * p) for p in phase]))
        n, i0, i1 = per, 0, per - 1

    # floor
    floor_mode = spec.get("floor", "soles")
    tr = sole_state(rig, dWl, loc, extra, soles)
    soles_low = np.min([tr[s][k + "_h"] for s in "lr" for k in CONTACT_POINTS], axis=0)
    if floor_mode == "body":
        low = body_lowest(rig, dWl, loc, extra, body)
        if kind == "hold":
            offset = np.full(n, float(low.min()))
        else:
            # standing at the start (the soles' contact points on the floor), lying at the end (the lowest body point)
            k = max(2, int(0.1 * SRC_FPS))
            o0 = float(np.min(soles_low[i0:i0 + k]))
            o1 = float(np.min(low[i1 - k:i1 + 1]))
            w = smoothstep((np.arange(n) - i0) / max(1, i1 - i0))
            offset = o0 + (o1 - o0) * w
            # nothing below the floor at any frame
            offset = np.minimum(offset, low)
            offset = smooth(offset[:, None], max(1, int(0.05 * SRC_FPS)))[:, 0]
            offset = np.minimum(offset, low)
    else:
        offset = np.full(n, float(np.percentile(soles_low[i0:i1 + 1], 3)))
    loc[:, 2] -= offset

    lock, before, after = {}, None, None
    if spec.get("planted") and kind == "oneShot":
        masks = None
        before_state = sole_state(rig, dWl, loc, extra, soles)
        lock, masks = lock_feet(rig, dWl, loc, 0.0, extra, soles, cfg, spec)
        before = slide_stats(before_state, 0.0, SRC_FPS, masks)
        after = slide_stats(sole_state(rig, dWl, loc, extra, soles), 0.0, SRC_FPS, masks)

    L, pel_loc = pose_arrays(rig, dWl, loc, extra)
    out_fps = cfg["fps"]
    speed = float(spec.get("speed", 1.0))
    span = n if kind == "hold" else i1 - i0
    nk = max(2, int(round(span / (SRC_FPS / out_fps) / speed)))
    keys_q = {}
    if kind == "hold":
        # cyclic: nk intervals over the held loop, the last key repeating the first
        times = np.arange(nk + 1) * (n / nk)
        j0 = np.floor(times).astype(int) % n
        j1 = (j0 + 1) % n
    else:
        times = i0 + np.arange(nk + 1) * (span / nk)
        j0 = np.minimum(np.floor(times).astype(int), n - 2)
        j1 = j0 + 1
    frac = times - j0 if kind != "hold" else times - np.floor(times)
    for name in rig.order:
        q = mats_to_quats(L[name])
        keys_q[name] = np.stack([slerp(q[x], q[y], fr) for x, y, fr in zip(j0, j1, frac)])
    keys_p = pel_loc[j0] * (1 - frac)[:, None] + pel_loc[j1] * frac[:, None]
    if kind == "hold":
        for name in keys_q:
            keys_q[name][-1] = keys_q[name][0]
        keys_p[-1] = keys_p[0]
    out_dur = nk / out_fps
    idx = np.arange(i0, i1 + 1)
    report = {
        "source": f"CMU {subj}_{trial:02d}",
        "title": spec.get("title", ""),
        "kind": kind,
        "loop": kind == "hold",
        **({"use": spec["use"]} if spec.get("use") else {}),
        "windowSec": [round(a / SRC_FPS, 4), round(b / SRC_FPS, 4)],
        **({"speed": speed} if speed != 1.0 else {}),
        "durationSec": round(out_dur, 4),
        "keys": nk + 1,
        "fps": out_fps,
        "legScale": round(scale, 4),
        "floor": floor_mode,
        "rootMotion": {"mode": mode, "forward": [0, 0, 1], "distanceM": 0.0, "speedMps": 0.0,
                       **({"yawFrom": spec["yawFrom"]} if spec.get("yawFrom") else {})},
        "head": head,
        **({"flinch": flinch_report} if flinch_report else {}),
        **({"hold": {"holdSec": spec["holdSec"], "breathe": spec.get("breathe", {}),
                     **({"faceUp": spec["faceUp"], "faceFromUpDeg": face_report} if face_report else {})}} if kind == "hold" else {}),
        **({"soleSlide": {"beforeLock": before, "afterLock": after}, "footLock": lock} if after else {}),
        "pose": pose_summary(rig, {k: v[idx] for k, v in dWl.items()}, loc[idx], extra, body),
    }
    if kind == "hold":
        report["loopContinuity"] = wrap_continuity(sample_keys(keys_q, out_fps, ANALYSIS_FPS), ANALYSIS_FPS)
    return {"q": keys_q, "p": keys_p, "report": report, "nk": nk}


# ------------------------------------------------------------------------------------------------------- actions


def write_action(rig_obj, name, clip, fps, cyclic=True):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    slot = action.slots.new(id_type="OBJECT", name=rig_obj.name)
    layer = action.layers.new("Layer")
    strip = layer.strips.new(type="KEYFRAME")
    bag = strip.channelbags.new(slot)
    frames = np.arange(clip["nk"] + 1, dtype=np.float64)

    def curve(path, index, values, group):
        fc = bag.fcurves.new(path, index=index)
        if group:
            grp = bag.groups.get(group) or bag.groups.new(group)
            fc.group = grp
        fc.keyframe_points.add(len(values))
        co = np.empty(len(values) * 2)
        co[0::2] = frames
        co[1::2] = values
        fc.keyframe_points.foreach_set("co", co)
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
        fc.update()

    for bone, q in clip["q"].items():
        path = f'pose.bones["{bone}"].rotation_quaternion'
        for i in range(4):
            curve(path, i, q[:, i], bone)
    for i in range(3):
        curve('pose.bones["pelvis"].location', i, clip["p"][:, i], "pelvis")
    action.frame_range = (0, clip["nk"])
    action.use_frame_range = True
    action.use_cyclic = cyclic
    action["fps"] = fps
    return action, slot


def sole_points(rig_obj, rig):
    """The shoe soles' contact points, per side: the heel (rearmost), ball (under the ball joint), toe (frontmost) and
    the outer and inner edges at the ball (a rolling push-off lands on them) of the lowest vertices bound mostly to
    that foot, each in the local frame of the foot bone that carries most of
    its weight; and every sole vertex (within 3 cm of the sole's lowest point, skinned with its foot and toe weights)
    as a floor point that keeps the foot above the floor. Heights are above the floor when the foot stands flat."""
    mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == rig_obj)
    to_arm = np.array(rig_obj.matrix_world.inverted() @ mesh.matrix_world)
    names = {g.index: g.name for g in mesh.vertex_groups}
    inv = {b: np.linalg.inv(rig.B[b]) for b in rig.B}
    attr = mesh.data.attributes.get("shoe")
    shoe = None
    if attr is not None:
        shoe = np.zeros(len(mesh.data.vertices))
        attr.data.foreach_get("value", shoe)
    out = {}
    for s in "lr":
        foot, ball = f"foot_{s}", f"ball_{s}"
        pts, owner, infl = [], [], []
        for v in mesh.data.vertices:
            w = {names.get(g.group): g.weight for g in v.groups if names.get(g.group) in rig.B}
            if w.get(foot, 0) + w.get(ball, 0) > 0.5 and (shoe is None or shoe[v.index] > 0.5):
                p = (to_arm @ np.array([*v.co, 1.0]))[:3]
                pts.append(p)
                owner.append(ball if w.get(ball, 0) > w.get(foot, 0) else foot)
                # the sole's height comes from the foot and toe bones; a calf share would move with the leg IK
                fw = {b: w.get(b, 0.0) for b in (foot, ball)}
                total = sum(fw.values())
                full = sum(w.values())
                infl.append(([(b, x / total) for b, x in fw.items() if x > 0], [(b, x / full) for b, x in w.items() if x > 0]))
        pts = np.array(pts)
        z0 = pts[:, 2].min()
        low = np.where(pts[:, 2] < z0 + 0.012)[0]
        ball_y = rig.B[ball][1, 3]
        near_ball = low[np.abs(pts[low, 1] - ball_y) < 0.015]
        out_sign = 1.0 if s == "l" else -1.0
        band = low[np.abs(pts[low, 1] - ball_y) < 0.03]
        picks = {"heel": low[np.argmax(pts[low, 1])], "toe": low[np.argmin(pts[low, 1])],
                 "ball": near_ball[np.argmin(pts[near_ball, 2])] if len(near_ball) else low[np.argmin(pts[low, 2])],
                 "outer": band[np.argmax(out_sign * pts[band, 0])], "inner": band[np.argmin(out_sign * pts[band, 0])]}
        out[s] = {}
        for key, i in picks.items():
            out[s][key] = {"bone": owner[i], "local": inv[owner[i]] @ np.array([*pts[i], 1.0]), "restZ": float(pts[i][2] - z0),
                           "rest": [round(float(x), 4) for x in pts[i]]}
        out[s]["floor"] = [{"influences": [(b, w, inv[b] @ np.array([*pts[i], 1.0])) for b, w in infl[i][0]],
                            "full": [(b, w, inv[b] @ np.array([*pts[i], 1.0])) for b, w in infl[i][1]], "restZ": float(pts[i][2] - z0)}
                           for i in np.where(pts[:, 2] < z0 + 0.03)[0]]
    return out


def main():
    args = common.script_args()
    char_blend, clips_path, out_blend, report_path = args[:4]
    cfg = common.load_json(clips_path)
    recipe = common.load_json(args[4]) if len(args) > 4 else {}
    if recipe:
        # the character recipe's per-clip overrides (recipe 'clips': {clip: {key: value}}): the same captures and
        # rules, a parameter tuned to a body (a heavier or smaller one)
        for name, over in recipe.get("clips", {}).items():
            spec = cfg["clips"][name]
            for k, v in over.items():
                spec[k] = {**spec[k], **v} if isinstance(v, dict) and isinstance(spec.get(k), dict) else v
    bpy.ops.wm.open_mainfile(filepath=char_blend)
    rig_obj = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for pb in rig_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rig = Rig(rig_obj)
    soles = sole_points(rig_obj, rig)
    # the body's floor points: every 4th vertex, or every one (recipe 'bodyPointStep': a body whose hands or elbows
    # would reach the floor between the sampled vertices in a fall)
    body = body_points(rig_obj, rig, step=int(recipe.get("bodyPointStep", 4)))
    log("sole points:", json.dumps({s: {k: d[k]["rest"] for k in CONTACT_POINTS} for s, d in soles.items()}))
    scene = bpy.context.scene
    scene.render.fps = cfg["fps"]
    rig_obj.animation_data_create()
    reports = {}
    for name, spec in cfg["clips"].items():
        kind = spec.get("kind", "loop")
        clip = retarget_clip(rig, spec, cfg, soles, body) if kind == "loop" else retarget_action(rig, spec, cfg, soles, body)
        action, slot = write_action(rig_obj, name, clip, cfg["fps"], cyclic=clip["report"]["loop"])
        track = rig_obj.animation_data.nla_tracks.new()
        track.name = name
        st = track.strips.new(name, 0, action)
        st.action_slot = slot
        track.mute = True
        reports[name] = clip["report"]
        log(name, json.dumps(clip["report"]))
    reports["_locomotion"] = cfg["locomotion"]
    first = next(iter(cfg["clips"]))
    rig_obj.animation_data.action = bpy.data.actions[first]
    rig_obj.animation_data.action_slot = bpy.data.actions[first].slots[0]
    scene.frame_start = 0
    scene.frame_end = int(bpy.data.actions[first].frame_range[1])
    bpy.ops.wm.save_as_mainfile(filepath=out_blend)
    common.save_json(report_path, reports)
    print("SUMMARY " + json.dumps(reports), flush=True)


if __name__ == "__main__":
    main()
