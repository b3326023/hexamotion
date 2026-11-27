import assert from 'node:assert/strict';
import { Simulation, DT } from '../lib/simulation';
const out: unknown[] = [];
const run = (s: Simulation, sec: number) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    s.tick();
    assert(s.pose.every(Number.isFinite));
    assert(!s.paused);
  }
};
const info = (s: Simulation) => ({
  target: s.ball?.targetId,
  controlled: s.ball?.controlledCount,
  active: s.ball?.activeCount,
  lost: s.ball?.lostCount,
  errorMm: s.ball!.error * 1000,
  settled: s.settled,
  positions: s.trackedBalls.map((b) => ({
    id: b.id,
    xMm: b.x * 1000,
    yMm: b.y * 1000,
    lost: b.lost,
  })),
});
const s = await Simulation.create();
assert.equal(s.ballControlMode, 'latest');
s.spawn();
s.setAuto(true);
run(s, 12);
s.spawn('ball', -0.09, -0.065, 0.1);
run(s, 12);
assert.equal(s.ball?.targetId, 2);
assert.equal(s.ball?.controlledCount, 1);
assert.equal(s.ball?.lost, false);
assert(s.ball!.error < 0.01);
out.push({ test: 'default_latest_second_opposite_throw', ...info(s) });

s.initialize();
s.spawn();
s.setAuto(true);
run(s, 12);
s.spawn('ball', 0.09, 0.065, 0.12);
run(s, 12);
assert.equal(s.ball?.targetId, 2);
assert(s.ball!.error < 0.01);
out.push({ test: 'default_latest_second_same_throw', ...info(s) });

s.initialize();
s.spawn('ball', 0.3, 0, 0.1, 2, 0);
s.setAuto(true);
run(s, 2);
s.spawn('ball', -0.1, -0.04, 0.1);
run(s, 8);
assert.equal(s.ball?.targetId, 2);
assert.equal(s.ball?.controlledCount, 1);
assert.equal(s.ball?.lost, false);
assert(s.ball!.error < 0.005);
out.push({ test: 'latest_fallen_then_new', ...info(s) });

s.initialize();
s.spawn('ball', 0.1, 0, 0.04);
s.objects[0].body.setTranslation({ x: 0.1, y: 0, z: 0.522 }, true);
s.spawn('ball', -0.1, 0, 0.04);
s.objects[1].body.setTranslation({ x: -0.1, y: 0, z: 0.522 }, true);
s.ballControlMode = 'selected';
s.focusBallId = 1;
s.setAuto(true);
s.measure();
assert.equal(s.ball?.targetId, 1);
assert.equal(s.ball?.controlledCount, 1);
assert.equal(s.ball?.activeCount, 2);
assert(Math.abs(s.ball!.x - 0.1) < 1e-6);
s.controlStep(1 / 120);
assert(s.target[4] < 0);
s.focusBallId = 2;
s.measure();
assert.equal(s.ball?.targetId, 2);
assert(Math.abs(s.ball!.x + 0.1) < 1e-6);
assert.equal(s.sensorQueue.length, 0);
s.controlStep(1 / 120);
assert(s.target[4] > 0);
out.push({ test: 'selected_ids_1_2_centroid_sign_queue_reset', ...info(s) });

s.ballControlMode = 'group';
s.measure();
assert.equal(s.ball?.targetId, null);
assert.equal(s.ball?.controlledCount, 2);
assert.equal(s.ball?.activeCount, 2);
for (let i = 0; i < 240; i++) {
  s.time += DT;
  s.measure();
}
assert.equal(s.settled, null);
assert(Math.abs(s.ball!.rmsRadius - 0.1) < 1e-6);
out.push({ test: 'group_opposite_no_false_lock', ...info(s) });
s.dispose();
console.log(JSON.stringify(out, null, 2));
