import assert from 'node:assert/strict';
import { Simulation, DT } from '../lib/simulation';
import { DEG } from '../lib/kinematics';

// Acceptance tests exercise the real Rapier world and servo dynamics; never edit bodies to force success.
const results: unknown[] = [];
const readBall = (sim: Simulation) => sim.ball;
const step = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < seconds / DT; i++) {
    sim.tick();
    assert(
      sim.pose.every(Number.isFinite),
      'Platform state must remain finite',
    );
    assert(!sim.paused, 'Unexpected physics safety pause');
  }
};
const snapshot = (sim: Simulation) => ({
  pose: [...sim.pose],
  target: [...sim.target],
  auto: sim.auto,
  scenario: sim.scenario,
  paused: sim.paused,
  time: sim.time,
  ballMotion: sim.ballMotion,
  activeTask: sim.activeTask,
});
const identities = (sim: Simulation) =>
  sim.objects.map((o) => ({ id: o.id, body: o.body, handle: o.body.handle }));
const unchangedBodies = (
  sim: Simulation,
  before: ReturnType<typeof identities>,
) => {
  assert.equal(sim.objects.length, before.length);
  before.forEach((b, i) => {
    assert.equal(sim.objects[i].id, b.id);
    assert.equal(sim.objects[i].body, b.body);
    assert.equal(sim.objects[i].body.handle, b.handle);
  });
};
async function simpleStates() {
  const s = await Simulation.create();
  s.setAuto(true);
  assert.equal(s.objects.length, 0);
  step(s, 0.5);
  assert.equal(s.objects.length, 0);
  s.setAuto(false);
  s.setPose([0, 0, 0.48, 2 * DEG, -3 * DEG, 0]);
  step(s, 2);
  s.spawn();
  const before = snapshot(s);
  s.clearObjects();
  assert.deepEqual(snapshot(s), before);
  assert.equal(s.objects.length, 0);
  assert.equal(s.ball, null);
  s.setAuto(true);
  s.spawn();
  step(s, 1);
  const active = snapshot(s);
  s.clearObjects();
  assert.deepEqual(snapshot(s), active);
  assert.equal(s.objects.length, 0);
  s.setAuto(false);
  s.spawn('ball', 0, 0, 0.1);
  s.spawn('steel', 0.07, 0, 0.1);
  const bodies = identities(s);
  s.setTask('sea');
  unchangedBodies(s, bodies);
  assert.equal(s.activeTask, 'sea');
  assert.equal(s.scenario, 'sea');
  s.setTask('sea');
  unchangedBodies(s, bodies);
  assert.equal(s.activeTask, null);
  s.setTask('tracking');
  unchangedBodies(s, bodies);
  assert.equal(s.activeTask, 'tracking');
  s.setTask('tracking');
  unchangedBodies(s, bodies);
  assert.equal(s.activeTask, null);
  s.clearObjects();
  s.setCircle(true);
  assert.equal(s.objects.length, 0);
  step(s, 1);
  assert.equal(s.objects.length, 0);
  assert.equal(s.circleTarget?.phase, 'waiting');
  assert.equal(s.activeTask, 'circle');
  s.ballControlMode = 'group';
  s.measure();
  assert.equal(
    s.ballControlMode,
    'latest',
    'Circle tracking must remain a single-ball task',
  );
  s.spawn('ball', -0.08, 0, 0.05);
  const circleBall = s.spawn('ball', 0.08, 0, 0.05);
  s.ballControlMode = 'group';
  step(s, 0.3);
  assert.equal(readBall(s)?.controlledCount, 1);
  assert.equal(readBall(s)?.targetId, circleBall);
  s.clearObjects();
  s.setCircle(false);
  assert.equal(s.objects.length, 0);
  s.dispose();
  results.push({
    name: 'state preservation / task toggles / no implicit spawning',
    passed: true,
  });
}
async function circle(radius: number, speed: number, direction: 1 | -1 = 1) {
  const s = await Simulation.create();
  s.configureCircle({ radius, speed, direction });
  s.spawn('ball', 0.09, 0.065, 0.12);
  s.setCircle(true);
  let square = 0,
    n = 0,
    radiusSum = 0,
    speedSum = 0,
    crossSum = 0,
    maxTilt = 0,
    maxError = 0,
    xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (let i = 0; i < 40 / DT; i++) {
    s.tick();
    assert(!s.paused);
    assert(s.pose.every(Number.isFinite));
    const b = s.ball,
      t = s.circleTarget;
    assert(b && !b.lost, 'Ball should stay on the platform');
    maxTilt = Math.max(maxTilt, Math.hypot(s.pose[3], s.pose[4]) / DEG);
    if (s.time > 14 && t?.phase === 'orbit') {
      const e = Math.hypot(b.x - t.x, b.y - t.y);
      square += e * e;
      n++;
      maxError = Math.max(maxError, e);
      radiusSum += Math.hypot(b.x, b.y);
      speedSum += b.speed;
      crossSum += b.x * b.vy - b.y * b.vx;
      xmin = Math.min(xmin, b.x);
      xmax = Math.max(xmax, b.x);
      ymin = Math.min(ymin, b.y);
      ymax = Math.max(ymax, b.y);
    }
  }
  assert(n > 2400, 'Orbit should be established');
  const rms = Math.sqrt(square / n),
    meanRadius = radiusSum / n,
    meanSpeed = speedSum / n;
  assert(rms < 0.008, `Circle tracking RMS ${rms} m exceeds 8 mm`);
  assert(
    Math.abs(meanRadius - s.circleRadius) < 0.01,
    'Average radius should be within 10 mm',
  );
  assert(
    Math.abs(meanSpeed - s.circleEffectiveSpeed) < 0.02,
    'Average speed should be within 20 mm/s',
  );
  assert(
    Math.sign(crossSum) === direction,
    'Ball orbital direction must match requested direction',
  );
  assert(
    xmax - xmin > 1.5 * radius && ymax - ymin > 1.5 * radius,
    'Ball must make full circles rather than merely settle',
  );
  assert(
    s.circleEffectiveSpeed <=
      Math.min(speed, 1.2 * radius, Math.sqrt(0.35 * radius)) + 1e-9,
  );
  assert(maxTilt <= 9, 'Expected motion below 9 degree tilt');
  const bodies = identities(s);
  s.setCircle(false);
  unchangedBodies(s, bodies);
  results.push({
    name: 'circle',
    radius,
    speed,
    direction,
    effectiveSpeed: s.circleEffectiveSpeed,
    rms,
    maxError,
    meanRadius,
    meanSpeed,
    maxTilt,
    passed: true,
  });
  s.dispose();
}
async function retune() {
  const s = await Simulation.create();
  s.spawn('ball', 0.1, 0, 0.1);
  s.setCircle(true);
  step(s, 18);
  const before = s.objects.map((o) => ({
    id: o.id,
    p: { ...o.body.translation() },
    v: { ...o.body.linvel() },
    q: { ...o.body.rotation() },
  }));
  s.configureCircle({ radius: 0.12, speed: 0.12, direction: -1 });
  assert.deepEqual(
    s.objects.map((o) => ({
      id: o.id,
      p: { ...o.body.translation() },
      v: { ...o.body.linvel() },
      q: { ...o.body.rotation() },
    })),
    before,
    'Retuning must not teleport bodies or change their velocity',
  );
  let sum = 0,
    n = 0,
    cross = 0;
  for (let i = 0; i < 32 / DT; i++) {
    s.tick();
    const b = s.ball,
      t = s.circleTarget;
    assert(b && !b.lost);
    assert(!s.paused);
    if (i > 16 / DT && t?.phase === 'orbit') {
      sum += (b.x - t.x) ** 2 + (b.y - t.y) ** 2;
      n++;
      cross += b.x * b.vy - b.y * b.vx;
    }
  }
  assert(n > 1200);
  assert(Math.sqrt(sum / n) < 0.008);
  assert(cross < 0);
  const cleared = snapshot(s);
  s.clearObjects();
  assert.deepEqual(snapshot(s), cleared);
  step(s, 0.5);
  assert.equal(s.circleTarget?.phase, 'waiting');
  assert.equal(s.objects.length, 0);
  const newId = s.spawn('ball', -0.11, 0.06, 0.1);
  step(s, 0.25);
  assert.equal(s.ball?.targetId, newId);
  step(s, 16);
  assert(!s.ball?.lost);
  assert.equal(s.circleTarget?.phase, 'orbit');
  results.push({
    name: 'retune radius/speed/reversal, clear/reacquire',
    rms: Math.sqrt(sum / n),
    passed: true,
  });
  s.dispose();
}
(async () => {
  await simpleStates();
  await circle(0.08, 0.08);
  await circle(0.02, 0.18);
  await circle(0.18, 0.18, -1);
  await retune();
  console.log(JSON.stringify({ passed: true, results }, null, 2));
})().catch((e) => {
  console.error(e);
  console.log(JSON.stringify({ passed: false, results }, null, 2));
  process.exitCode = 1;
});
