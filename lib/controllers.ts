import { clamp } from './kinematics';
export type ControllerKind =
  | 'PID'
  | 'Cascaded PID'
  | 'LQR'
  | 'MPC'
  | 'Adaptive';
export type ControllerSettings = {
  kind: ControllerKind;
  kp: number;
  ki: number;
  kd: number;
  horizon: number;
  rate: number;
  noise: number;
  bias: number;
  dropout: number;
  delay: number;
  damping: number;
};
export const DEFAULT_CONTROL: ControllerSettings = {
  kind: 'PID',
  kp: 0.4,
  ki: 0,
  kd: 0.4,
  horizon: 30,
  rate: 120,
  noise: 0,
  bias: 0,
  dropout: 0,
  delay: 0,
  damping: 1.05,
};
// Solves the discrete algebraic Riccati equation for a rolling-shell double integrator.
export function lqrGain(dt = 1 / 120, q = 1, r = 3) {
  const a = [
      [1, dt],
      [0, 1],
    ],
    b = [(0.6 * 9.81 * dt * dt) / 2, 0.6 * 9.81 * dt];
  let p = [
    [q, 0],
    [0, 0.7],
  ];
  let k = [0, 0];
  for (let n = 0; n < 1500; n++) {
    const pb = [
        p[0][0] * b[0] + p[0][1] * b[1],
        p[1][0] * b[0] + p[1][1] * b[1],
      ],
      den = r + b[0] * pb[0] + b[1] * pb[1];
    k = [
      (b[0] * p[0][0] + b[1] * p[1][0]) / den,
      (b[0] * (p[0][0] * dt + p[0][1]) + b[1] * (p[1][0] * dt + p[1][1])) / den,
    ];
    const next = [
      [0, 0],
      [0, 0],
    ];
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        let sum = 0;
        for (let u = 0; u < 2; u++)
          for (let v = 0; v < 2; v++) sum += a[u][i] * p[u][v] * a[v][j];
        let apb = 0;
        for (let u = 0; u < 2; u++) apb += a[u][i] * pb[u];
        next[i][j] = sum - apb * k[j] + (i === j ? (i === 0 ? q : 0.7) : 0);
      }
    const delta = Math.max(
      ...next.flat().map((x, i) => Math.abs(x - p.flat()[i])),
    );
    p = next;
    if (delta < 1e-9) break;
  }
  return k;
}
// Box constrained finite horizon MPC. Gradient is evaluated by a backward adjoint pass.
export class PredictiveController {
  u: number[] = [];
  residual = 0;
  predict(x: number, v: number, horizon: number, limit: number) {
    const n = clamp(Math.round(horizon), 10, 60),
      h = 0.035,
      b = 0.6 * 9.81;
    const u =
      this.u.length === n
        ? [...this.u.slice(1), this.u[n - 1]]
        : Array(n).fill(0);
    let residual = 0;
    for (let it = 0; it < 45; it++) {
      const xs = [x],
        vs = [v];
      for (let j = 0; j < n; j++) {
        xs.push(xs[j] + h * vs[j] + 0.5 * h * h * b * u[j]);
        vs.push(vs[j] + h * b * u[j]);
      }
      let px = 2 * 9 * xs[n],
        pv = 2 * 4 * vs[n];
      residual = 0;
      for (let j = n - 1; j >= 0; j--) {
        const grad = 2 * 3 * u[j] + 0.5 * h * h * b * px + h * b * pv;
        const next = clamp(u[j] - 0.00045 * grad, -limit, limit);
        residual = Math.max(residual, Math.abs(next - u[j]));
        u[j] = next;
        pv = 2 * 0.8 * vs[j] + h * px + pv;
        px = 2 * 1.2 * xs[j] + px;
      }
    }
    this.u = u;
    this.residual = residual;
    return u[0];
  }
}
export class BallController {
  integral = [0, 0];
  gain = lqrGain();
  mpc = [new PredictiveController(), new PredictiveController()];
  last = [0, 0];
  adaptive = 1;
  reset() {
    this.integral = [0, 0];
    this.last = [0, 0];
    this.mpc = [new PredictiveController(), new PredictiveController()];
  }
  run(
    x: number,
    y: number,
    vx: number,
    vy: number,
    c: ControllerSettings,
    dt: number,
    limit: number,
  ) {
    const out = [0, 0];
    for (let i = 0; i < 2; i++) {
      const e = [x, y][i],
        velocity = [vx, vy][i];
      const candidate = clamp(this.integral[i] + e * dt, -0.3, 0.3);
      let u = 0;
      if (c.kind === 'LQR') u = -this.gain[0] * e - this.gain[1] * velocity;
      else if (c.kind === 'MPC')
        u = this.mpc[i].predict(e, velocity, c.horizon, limit);
      else if (c.kind === 'Cascaded PID') {
        const velocityTarget = clamp(-c.kp * 2 * e, -0.25, 0.25);
        u = c.kd * (velocityTarget - velocity) - c.ki * candidate;
      } else {
        if (c.kind === 'Adaptive')
          this.adaptive = clamp(
            this.adaptive + dt * (Math.abs(e) > 0.02 ? 0.015 : -0.005),
            0.75,
            1.3,
          );
        u = -(
          c.kp * (c.kind === 'Adaptive' ? this.adaptive : 1) * e +
          c.kd * velocity +
          c.ki * candidate
        );
      }
      if (Math.abs(u) < limit) this.integral[i] = candidate;
      out[i] = clamp(u, -limit, limit);
      this.last[i] = out[i];
    }
    return { pitch: out[0], roll: -out[1] };
  }
}
