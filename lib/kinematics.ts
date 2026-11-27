import { Euler, Quaternion, Vector3 } from 'three';
export type Pose = [number, number, number, number, number, number];
export const HOME: Pose = [0, 0, 0.48, 0, 0, 0];
export const DEG = Math.PI / 180;
export const actuatorDimensions = (maxLength: number) => ({
  barrel: 0.345 * (maxLength / 0.68),
  rod: 0.360 * (maxLength / 0.68),
});
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export type Geometry = {
  baseRadius: number;
  topRadius: number;
  minLength: number;
  maxLength: number;
  mass: number;
  payload: number;
  maxVelocity: number;
  maxAcceleration: number;
  maxJerk: number;
  maxForce: number;
  tiltLimit: number;
  jointLimit: number;
};
export const DEFAULT_GEOMETRY: Geometry = {
  baseRadius: 0.42,
  topRadius: 0.29,
  minLength: 0.38,
  maxLength: 0.68,
  mass: 24,
  payload: 0,
  maxVelocity: 0.18,
  maxAcceleration: 1.4,
  maxJerk: 18,
  maxForce: 1800,
  tiltLimit: 12 * DEG,
  jointLimit: 48 * DEG,
};
export const quaternion = (p: Pose) =>
  new Quaternion().setFromEuler(new Euler(p[3], p[4], p[5], 'ZYX'));
export const poseFromTransform = (
  v: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
): Pose => {
  const e = new Euler().setFromQuaternion(
    new Quaternion(q.x, q.y, q.z, q.w),
    'ZYX',
  );
  return [v.x, v.y, v.z, e.x, e.y, e.z];
};
export function anchors(g: Geometry) {
  return {
    base: [12, 108, 132, 228, 252, 348].map(
      (a) =>
        new Vector3(
          g.baseRadius * Math.cos(a * DEG),
          g.baseRadius * Math.sin(a * DEG),
          0.075,
        ),
    ),
    top: [48, 72, 168, 192, 288, 312].map(
      (a) =>
        new Vector3(
          g.topRadius * Math.cos(a * DEG),
          g.topRadius * Math.sin(a * DEG),
          0,
        ),
    ),
  };
}
export function endpoints(
  p: Pose,
  g: Geometry,
  basePose: Pose = [0, 0, 0, 0, 0, 0],
) {
  const a = anchors(g),
    q = quaternion(p),
    bq = quaternion(basePose);
  return {
    base: a.base.map((v) =>
      v
        .applyQuaternion(bq)
        .add(
          new Vector3(...(basePose.slice(0, 3) as [number, number, number])),
        ),
    ),
    top: a.top.map((v) =>
      v.applyQuaternion(q).add(new Vector3(p[0], p[1], p[2])),
    ),
  };
}
export function ik(
  p: Pose,
  g: Geometry = DEFAULT_GEOMETRY,
  b: Pose = [0, 0, 0, 0, 0, 0],
) {
  const e = endpoints(p, g, b);
  return e.top.map((v, i) => v.distanceTo(e.base[i]));
}
export function solve(A: number[][], b: number[]) {
  const n = b.length,
    m = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    if (Math.abs(m[pivot][k]) < 1e-12) return null;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k];
    for (let j = k; j <= n; j++) m[k][j] /= d;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const c = m[i][k];
        for (let j = k; j <= n; j++) m[i][j] -= c * m[k][j];
      }
  }
  return m.map((r) => r[n]);
}
// Physical twist Jacobian [v, angular velocity]. Rotation columns normalized by radius for conditioning.
export function jacobian(
  p: Pose,
  g: Geometry = DEFAULT_GEOMETRY,
  b: Pose = [0, 0, 0, 0, 0, 0],
  normalized = false,
) {
  const e = endpoints(p, g, b);
  return e.top.map((v, i) => {
    const u = v.clone().sub(e.base[i]).normalize(),
      r = v.clone().sub(new Vector3(p[0], p[1], p[2])),
      w = r.cross(u).multiplyScalar(normalized ? 1 / g.topRadius : 1);
    return [u.x, u.y, u.z, w.x, w.y, w.z];
  });
}
export function condition(p: Pose, g: Geometry, b: Pose) {
  const J = jacobian(p, g, b, true),
    norm = Math.max(...J.map((r) => r.reduce((s, x) => s + Math.abs(x), 0))),
    cols = J.map((_, i) =>
      solve(
        J,
        J.map((_, j) => +(i === j)),
      ),
    );
  if (cols.some((c) => !c)) return 1e9;
  return (
    norm *
    Math.max(...J.map((_, i) => cols.reduce((s, c) => s + Math.abs(c![i]), 0)))
  );
}
export function fk(
  lengths: number[],
  initial: Pose,
  g: Geometry = DEFAULT_GEOMETRY,
  b: Pose = [0, 0, 0, 0, 0, 0],
) {
  let p = [...initial] as Pose;
  for (let iter = 0; iter < 14; iter++) {
    const l = ik(p, g, b),
      err = l.map((v, i) => lengths[i] - v);
    if (Math.max(...err.map(Math.abs)) < 1e-7)
      return {
        pose: p,
        residual: Math.max(...err.map(Math.abs)),
        valid: p.every(Number.isFinite) && p[2] > 0.18,
      };
    const J = Array.from({ length: 6 }, () => Array(6).fill(0));
    for (let c = 0; c < 6; c++) {
      const pp = [...p] as Pose;
      pp[c] += 1e-6;
      const ll = ik(pp, g, b);
      for (let r = 0; r < 6; r++) J[r][c] = (ll[r] - l[r]) / 1e-6;
    }
    const delta = solve(J, err);
    if (!delta) break;
    let accepted = false;
    const before = err.reduce((s, v) => s + v * v, 0);
    for (const alpha of [1, 0.5, 0.25, 0.125]) {
      const next = p.map(
        (v, c) =>
          v +
          alpha * clamp(delta[c], c < 3 ? -0.035 : -0.1, c < 3 ? 0.035 : 0.1),
      ) as Pose;
      const r = ik(next, g, b).reduce(
        (s, v, i) => s + (v - lengths[i]) ** 2,
        0,
      );
      if (r < before) {
        p = next;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  const residual = Math.max(
    ...ik(p, g, b).map((v, i) => Math.abs(v - lengths[i])),
  );
  return {
    pose: p,
    residual,
    valid: residual < 1e-5 && p.every(Number.isFinite) && p[2] > 0.18,
  };
}
export function limits(p: Pose, g: Geometry, b: Pose = [0, 0, 0, 0, 0, 0]) {
  const l = ik(p, g, b),
    e = endpoints(p, g, b),
    up = new Vector3(0, 0, 1).applyQuaternion(quaternion(p));
  const angle = Math.max(
    ...e.top.map((v, i) => {
      const dir = v.clone().sub(e.base[i]).normalize();
      return Math.max(
        dir.angleTo(new Vector3(0, 0, 1).applyQuaternion(quaternion(b))),
        dir.angleTo(up),
      );
    }),
  );
  return {
    valid:
      l.every((v) => v >= g.minLength && v <= g.maxLength) &&
      p[2] > 0.18 &&
      up.angleTo(new Vector3(0, 0, 1)) <= g.tiltLimit + 1e-8 &&
      angle < g.jointLimit,
    angle,
    stroke: Math.min(
      ...l.map((v) => Math.min(v - g.minLength, g.maxLength - v)),
    ),
  };
}
