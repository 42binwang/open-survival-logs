// @ts-check
// Look constants the renderers and the visual tools share, from docs/ART.md (WP-P0-04). Frozen for P0: a change to
// ART.md's camera standard is an interface request to the architect, and the numbers below change with it.
// World axes as in ART.md §1.2: x = east = sim x, z = south = sim y, y up, 1 unit = 1 m.

/** The game camera (ART.md §1.2 "Standard (decided)", §1.3 "Cutaway rules", §2 "Scale"). */
export const CAMERA = Object.freeze({
  /** vertical field of view zoomed out, degrees (§1.2: default vertical FOV 60°) */
  vfovDefault: 60,
  /** vertical field of view fully zoomed in, degrees; zoom changes the FOV only (§1.2: zoom 60° → 50°) */
  vfovMin: 50,
  /** pitch below the horizontal, degrees, fixed (§1.2: pitch 40.0°) */
  pitchDeg: 40,
  /** home yaw off the grid axes, degrees: the camera sits S30°E of its target and looks N30°W (§1.2: yaw 30°) */
  yawDeg: 30,
  /** metres from the camera to the look-at point on the current floor plane (§1.1 D = H / sin 40°, §1.2) */
  lookDistance: 10.47,
  /** height camera-facing walls are cut to, metres (§1.3 cutaway rules, §2 cut wall height 0.9 m) */
  cutWallHeight: 0.9,
  /** near clip plane, metres (§1.2 near / far) */
  near: 1,
  /** far clip plane, metres (§1.2 near / far) */
  far: 80,
});

/** Where each CAMERA value is decided in docs/ART.md. */
export const CAMERA_SOURCES = Object.freeze({
  vfovDefault: 'docs/ART.md §1.2',
  vfovMin: 'docs/ART.md §1.2',
  pitchDeg: 'docs/ART.md §1.2',
  yawDeg: 'docs/ART.md §1.2',
  lookDistance: 'docs/ART.md §1.1, §1.2',
  cutWallHeight: 'docs/ART.md §1.3, §2',
  near: 'docs/ART.md §1.2',
  far: 'docs/ART.md §1.2',
});

/**
 * Camera position relative to its look-at target, in metres (ART.md §1.2: +4.010 east, +6.730 up, +6.946 south).
 * @param {number} [yawDeg]  the current yaw (swivel held); the home yaw by default
 * @returns {[number, number, number]} [x east, y up, z south]
 */
export function cameraOffset(yawDeg = CAMERA.yawDeg) {
  const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const d = CAMERA.lookDistance;
  return [d * Math.sin(yaw) * Math.cos(pitch), d * Math.sin(pitch), d * Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * The vertical FOV at a zoom amount (0 zoomed out … 1 zoomed in); zoom never moves the camera (ART.md §1.2).
 * @param {number} t
 */
export function zoomFov(t) {
  const k = Math.min(1, Math.max(0, t));
  return CAMERA.vfovDefault + (CAMERA.vfovMin - CAMERA.vfovDefault) * k;
}
