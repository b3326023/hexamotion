export type Point2 = { x: number; y: number };
export type PathTarget = Point2 & {
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  phase: 'waiting' | 'capture' | 'ramp' | 'orbit';
};
const mod = (x: number, n: number) => ((x % n) + n) % n;
const mix = (a: Point2, b: Point2, u: number) => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
});
export function presetPath(name: string): Point2[] {
  return Array.from({ length: 180 }, (_, i) => {
    const t = (i / 180) * Math.PI * 2;
    if (name === 'heart')
      return {
        x: 0.144 * Math.sin(t) ** 3,
        y:
          0.008 *
          (13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)),
      };
    if (name === 'circle')
      return { x: 0.1 * Math.cos(t), y: 0.1 * Math.sin(t) };
    if (name === 'flower') {
      const r = 0.115 + 0.025 * Math.cos(3 * t);
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    }
    return { x: 0.14 * Math.sin(t), y: 0.075 * Math.sin(2 * t) };
  });
}
function geometry(ps: Point2[], t: number) {
  const i = Math.floor(t),
    u = t - i,
    n = ps.length;
  const b = [
    (1 - u) ** 3 / 6,
    (3 * u ** 3 - 6 * u * u + 4) / 6,
    (-3 * u ** 3 + 3 * u * u + 3 * u + 1) / 6,
    u ** 3 / 6,
  ];
  const d = [
    -((1 - u) ** 2) / 2,
    1.5 * u * u - 2 * u,
    -1.5 * u * u + u + 0.5,
    (u * u) / 2,
  ];
  const dd = [1 - u, 3 * u - 2, 1 - 3 * u, u];
  const sum = (key: 'x' | 'y', w: number[]) =>
    w.reduce((s, a, j) => s + a * ps[mod(i + j - 1, n)][key], 0);
  const x = sum('x', b),
    y = sum('y', b),
    dx = sum('x', d),
    dy = sum('y', d),
    ddx = sum('x', dd),
    ddy = sum('y', dd),
    length = Math.hypot(dx, dy);
  const tx = dx / Math.max(length, 1e-9),
    ty = dy / Math.max(length, 1e-9),
    along = tx * ddx + ty * ddy;
  const kx = (ddx - tx * along) / Math.max(length * length, 1e-12),
    ky = (ddy - ty * along) / Math.max(length * length, 1e-12);
  return { x, y, tx, ty, kx, ky, k: Math.hypot(kx, ky) };
}
export function compilePath(
  raw: Point2[],
  requestedSpeed = 0.08,
  safeRadius = 0.2,
) {
  if (
    raw.length < 4 ||
    raw.length > 2048 ||
    !raw.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  )
    throw new Error('請畫出至少四個點的完整路線。');
  const points: Point2[] = [];
  for (const p of raw) {
    const factor = Math.min(
      1,
      safeRadius / Math.max(1e-8, Math.hypot(p.x, p.y)),
    );
    const q = { x: p.x * factor, y: p.y * factor };
    if (
      !points.length ||
      Math.hypot(q.x - points.at(-1)!.x, q.y - points.at(-1)!.y) > 0.0001
    )
      points.push(q);
  }
  if (points.length < 4) throw new Error('路徑太短，請畫出更大的範圍。');
  const spans = points.map((p, i) =>
    Math.hypot(
      p.x - points[(i + 1) % points.length].x,
      p.y - points[(i + 1) % points.length].y,
    ),
  );
  const total = spans.reduce((a, b) => a + b, 0);
  const width =
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    height =
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  if (total < 0.08 || width < 0.015 || height < 0.015)
    throw new Error('請畫出有寬度及高度的路線，避免單點或直線折返。');
  let j = 0,
    start = 0;
  let controls = Array.from({ length: 48 }, (_, i) => {
    const s = (total * i) / 48;
    while (j < points.length - 1 && start + spans[j] < s) start += spans[j++];
    return mix(
      points[j],
      points[(j + 1) % points.length],
      (s - start) / Math.max(1e-9, spans[j]),
    );
  });
  for (let round = 0; round < 3; round++)
    controls = controls.map((p, i) => ({
      x: (controls[mod(i - 1, 48)].x + 2 * p.x + controls[(i + 1) % 48].x) / 4,
      y: (controls[mod(i - 1, 48)].y + 2 * p.y + controls[(i + 1) % 48].y) / 4,
    }));
  const n = 1536,
    samples = Array.from({ length: n }, (_, i) =>
      geometry(controls, (i * 48) / n),
    );
  const ds = samples.map((p, i) =>
    Math.hypot(p.x - samples[(i + 1) % n].x, p.y - samples[(i + 1) % n].y),
  );
  const request = Math.max(0.02, Math.min(0.16, requestedSpeed));
  const speeds = samples.map((p) =>
    Math.min(
      request,
      Math.sqrt(0.25 / Math.max(p.k, 1e-6)),
      1 / Math.max(p.k, 1e-6),
    ),
  );
  if (Math.min(...speeds) < 0.002)
    throw new Error('路徑有過於尖銳的折返，請畫得圓滑一點。');
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      speeds[next] = Math.min(
        speeds[next],
        Math.sqrt(speeds[i] ** 2 + 0.16 * ds[i]),
      );
    }
    for (let i = n - 1; i >= 0; i--) {
      const next = (i + 1) % n;
      speeds[i] = Math.min(
        speeds[i],
        Math.sqrt(speeds[next] ** 2 + 0.16 * ds[i]),
      );
    }
  }
  const times = [0];
  for (let i = 0; i < n; i++)
    times.push(
      times[i] + (2 * ds[i]) / Math.max(1e-8, speeds[i] + speeds[(i + 1) % n]),
    );
  const period = times[n];
  if (!Number.isFinite(period) || period > 300)
    throw new Error('這條路線過於複雜，請減少折返後再試。');
  const at = (time: number) => {
    const t = mod(time, period);
    let lo = 0,
      hi = n - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    const i = lo,
      next = (i + 1) % n,
      tt = t - times[i],
      a = (speeds[next] ** 2 - speeds[i] ** 2) / (2 * Math.max(ds[i], 1e-9)),
      s = speeds[i] * tt + 0.5 * a * tt * tt,
      v = speeds[i] + a * tt;
    return {
      ...geometry(
        controls,
        ((i + Math.min(1, s / Math.max(ds[i], 1e-9))) * 48) / n,
      ),
      v,
      a,
    };
  };
  const nearest = (point: Point2) => {
    let best = 0;
    for (let i = 1; i < n; i++)
      if (
        Math.hypot(samples[i].x - point.x, samples[i].y - point.y) <
        Math.hypot(samples[best].x - point.x, samples[best].y - point.y)
      )
        best = i;
    return times[best];
  };
  return {
    period,
    at,
    nearest,
    points: samples
      .filter((_, i) => i % 8 === 0)
      .map((p) => ({ x: p.x, y: p.y })),
    requestedSpeed: request,
    minSpeed: Math.min(...speeds),
    length: ds.reduce((a, b) => a + b, 0),
  };
}
export type CompiledPath = ReturnType<typeof compilePath>;
export function followPath(
  path: CompiledPath,
  start: Point2,
  elapsed: number,
  offset: number,
): PathTarget {
  if (elapsed < 3) {
    const end = path.at(offset),
      u = Math.max(0, elapsed / 3),
      q = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5,
      qd = (30 * u * u - 60 * u ** 3 + 30 * u ** 4) / 3,
      qdd = (60 * u - 180 * u * u + 120 * u ** 3) / 9,
      dx = end.x - start.x,
      dy = end.y - start.y;
    return {
      x: start.x + dx * q,
      y: start.y + dy * q,
      vx: dx * qd,
      vy: dy * qd,
      ax: dx * qdd,
      ay: dy * qdd,
      phase: 'capture',
    };
  }
  const t = elapsed - 3,
    u = Math.min(1, t / 3),
    h = 3 * u * u - 2 * u ** 3,
    hd = t < 3 ? (6 * u - 6 * u * u) / 3 : 0,
    clock = t < 3 ? 3 * (u ** 3 - 0.5 * u ** 4) : t - 1.5;
  const p = path.at(offset + clock),
    v = p.v * h,
    a = p.a * h * h + p.v * hd;
  return {
    x: p.x,
    y: p.y,
    vx: p.tx * v,
    vy: p.ty * v,
    ax: p.kx * v * v + p.tx * a,
    ay: p.ky * v * v + p.ty * a,
    phase: t < 3 ? 'ramp' : 'orbit',
  };
}
