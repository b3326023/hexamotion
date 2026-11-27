export type CircleTarget = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  phase: 'waiting' | 'capture' | 'ramp' | 'orbit';
};
export const emptyCircleTarget = (): CircleTarget => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ax: 0,
  ay: 0,
  phase: 'waiting',
});

// Three seconds of minimum-jerk capture, then a smooth angular-speed ramp.
// Derivatives are analytic; only platform tilt, never the ball body, follows this reference.
export function circlePath(
  t: number,
  start: { x: number; y: number },
  radius: number,
  speed: number,
  direction: 1 | -1,
): CircleTarget {
  const phase = Math.atan2(start.y, start.x);
  if (t < 3) {
    const u = Math.max(0, t / 3),
      q = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
    const qd = (30 * u * u - 60 * u ** 3 + 30 * u ** 4) / 3;
    const qdd = (60 * u - 180 * u * u + 120 * u ** 3) / 9;
    const dx = radius * Math.cos(phase) - start.x,
      dy = radius * Math.sin(phase) - start.y;
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
  const tt = t - 3,
    u = Math.min(1, tt / 3),
    w = (direction * speed) / radius;
  const omega = w * (3 * u * u - 2 * u ** 3),
    dw = tt < 3 ? (w * (6 * u - 6 * u * u)) / 3 : 0;
  const angle = phase + w * (tt < 3 ? 3 * (u ** 3 - 0.5 * u ** 4) : tt - 1.5);
  const x = radius * Math.cos(angle),
    y = radius * Math.sin(angle);
  return {
    x,
    y,
    vx: -omega * y,
    vy: omega * x,
    ax: -omega * omega * x - dw * y,
    ay: -omega * omega * y + dw * x,
    phase: tt < 3 ? 'ramp' : 'orbit',
  };
}
