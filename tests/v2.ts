import assert from 'node:assert/strict';
import { Simulation, DT } from '../lib/simulation';
import { presetPath } from '../lib/drawn-path';
import { PlaySession } from '../lib/play-session';
import { MAZES } from '../lib/mazes';
import { DEG, clamp } from '../lib/kinematics';

// Acceptance uses production Rapier/servo code. Game navigation changes only
// public joystick inputs; never bodies, velocities, checkpoints, clocks or scores.
const outcomes: Record<string, unknown>[] = [];
const bodyState = (s: Simulation) =>
  s.objects.map((o) => ({
    id: o.id,
    handle: o.body.handle,
    p: { ...o.body.translation() },
    q: { ...o.body.rotation() },
    v: { ...o.body.linvel() },
    w: { ...o.body.angvel() },
  }));
async function verify(
  name: string,
  action: (s: Simulation) => unknown | Promise<unknown>,
) {
  const s = await Simulation.create();
  try {
    const result = await action(s);
    outcomes.push({ name, result });
  } finally {
    s.dispose();
  }
}
function step(s: Simulation, seconds: number) {
  for (let i = 0; i < seconds / DT; i++) {
    s.tick();
    assert(s.pose.every(Number.isFinite));
    assert(!s.paused);
  }
}
function track(s: Simulation, seconds = 36) {
  let sum = 0,
    count = 0,
    peak = 0,
    tilt = 0;
  const start = s.time;
  for (let i = 0; i < seconds / DT; i++) {
    s.tick();
    assert(!s.paused);
    assert(s.pose.every(Number.isFinite));
    assert(
      s.ball && !s.ball.lost,
      'Tracked ball stays on the physical platform',
    );
    tilt = Math.max(tilt, Math.hypot(s.pose[3], s.pose[4]) / DEG);
    if (s.time - start > 12 && s.pathTarget.phase === 'orbit') {
      const error = Math.hypot(
        s.ball.x - s.pathTarget.x,
        s.ball.y - s.pathTarget.y,
      );
      sum += error * error;
      count++;
      peak = Math.max(peak, error);
    }
  }
  assert(count > 1000, 'Reference reaches orbit');
  const rms = Math.sqrt(sum / count);
  assert(rms < 0.01, `Tracking RMS ${rms} m exceeds 10 mm`);
  assert(peak < 0.025, `Tracking peak ${peak} m exceeds 25 mm`);
  assert(tilt < 9, `Platform tilt ${tilt} exceeds 9 degrees`);
  return { rms, peak, tilt };
}
function navigate(s: Simulation, p: PlaySession) {
  const r = p.run!,
    b = s.trackedBalls.find((ball) => ball.id === r.ballId);
  if (!b || r.phase === 'ready') return p.setJoystick(0, 0);
  const target = r.kind === 'sea' ? { x: 0, y: 0 } : r.target;
  const dx = target.x - b.x,
    dy = target.y - b.y,
    distance = Math.hypot(dx, dy);
  const speed = Math.min(0.115, distance * 1.2);
  const vx = distance > 1e-8 ? (dx / distance) * speed : 0;
  const vy = distance > 1e-8 ? (dy / distance) * speed : 0;
  p.setJoystick(
    clamp((0.6 * (vx - b.vx)) / (4.5 * DEG), -1, 1),
    clamp((0.6 * (vy - b.vy)) / (4.5 * DEG), -1, 1),
  );
}
async function main() {
  for (const name of ['eight', 'heart', 'circle', 'flower'])
    await verify(`path/${name}`, (s) => {
      assert(s.configurePath(presetPath(name), 0.16));
      assert(s.setPath(true));
      assert.equal(s.objects.length, 0, 'Enabling a task never spawns a ball');
      assert.equal(s.pathTarget.phase, 'waiting');
      s.spawn('ball', 0.09, 0.065, 0.1);
      return track(s);
    });
  await verify('hand-drawn path / editing / clear / reacquire', (s) => {
    const drawing = Array.from({ length: 230 }, (_, i) => {
      const t = (i / 230) * Math.PI * 2;
      return {
        x: 0.125 * Math.cos(t) + 0.02 * Math.sin(3 * t),
        y: 0.085 * Math.sin(t) + 0.015 * Math.cos(2 * t),
      };
    });
    assert(s.configurePath(drawing, 0.12));
    assert(s.setPath(true));
    s.spawn('ball', -0.12, 0.025, 0.12);
    const arbitrary = track(s);
    let before = bodyState(s);
    assert(s.configurePath(presetPath('heart'), 0.1));
    assert.deepEqual(
      bodyState(s),
      before,
      'Path editing never teleports existing bodies',
    );
    const edited = track(s);
    before = bodyState(s);
    assert(s.configurePath(s.pathPoints, 0.16));
    assert.deepEqual(
      bodyState(s),
      before,
      'Speed editing never changes body state',
    );
    const invalidPath = s.drawnPath;
    assert(!s.configurePath([{ x: 0, y: 0 }]));
    assert.equal(s.drawnPath, invalidPath);
    assert.deepEqual(bodyState(s), before);
    const saved = {
      pose: [...s.pose],
      target: [...s.target],
      auto: s.auto,
      task: s.activeTask,
      time: s.time,
    };
    s.clearObjects();
    assert.equal(s.objects.length, 0);
    assert.equal(s.pathTarget.phase, 'waiting');
    assert.deepEqual(
      {
        pose: [...s.pose],
        target: [...s.target],
        auto: s.auto,
        task: s.activeTask,
        time: s.time,
      },
      saved,
    );
    step(s, 0.3);
    assert.equal(s.objects.length, 0);
    s.spawn('ball', -0.1, 0.01, 0.05);
    const latest = s.spawn('ball', 0.07, 0.05, 0.05);
    s.ballControlMode = 'group';
    step(s, 0.25);
    assert.equal(s.ballControlMode, 'latest');
    assert.equal(s.ball?.targetId, latest);
    assert.equal(s.ball?.controlledCount, 1);
    const reacquired = track(s, 30);
    before = bodyState(s);
    s.setPath(false);
    assert.deepEqual(bodyState(s), before);
    return { arbitrary, edited, reacquired };
  });
  await verify('geometry change reclamps an existing path on enable', (s) => {
    assert(
      s.configurePath(
        presetPath('circle').map((p) => ({ x: p.x * 1.95, y: p.y * 1.95 })),
        0.08,
      ),
    );
    assert(s.applySettings({ ...s.geometry, topRadius: 0.2 }));
    assert(s.setPath(true));
    const safe = Math.min(0.2, s.geometry.topRadius * 0.866 - 0.045);
    assert(
      s.drawnPath.points.every((p) => Math.hypot(p.x, p.y) <= safe + 1e-9),
    );
    return { safe };
  });
  for (const kind of ['maze0', 'maze1', 'maze2', 'center', 'precision', 'sea', 'energy'])
    await verify(`manual game/${kind}`, (s) => {
      const p = new PlaySession(s);
      if (kind.startsWith('maze')) p.startMaze(Number(kind.slice(-1)));
      else p.startChallenge(kind);
      for (let i = 0; p.active && i < 190 / DT; i++) {
        navigate(s, p);
        s.tick();
        p.tick();
        assert(s.pose.every(Number.isFinite));
        assert(
          !(s.paused && p.active),
          'Game cannot get stuck in a safety pause',
        );
      }
      assert.equal(p.run?.phase, 'won', `${kind}: ${p.run?.result?.reason}`);
      assert(p.run?.result?.success);
      assert(p.run.result.score > 0);
      if (kind === 'energy') {
        const work = p.run.result.workJ!;
        assert(work > 0 && Number.isFinite(work));
        assert(Math.abs(work - (s.energy - p.run.startEnergy)) < 1e-9);
        assert(p.run.dwell >= 1.2 && p.run.elapsed <= 45);
        assert.equal(p.run.result.score, Math.round(clamp(20000 / (20 + work), 100, 1000)));
        assert.equal(p.best.energy.workJ, work);
      }
      const elapsed = p.run.elapsed,
        score = p.run.result.score;
      p.selectMode('free');
      assert.equal(p.run, null);
      assert(!s.paused, 'Returning to free play resumes physics');
      assert.equal(s.maze, null);
      assert.equal(s.playTarget, null);
      return { elapsed, score };
    });
  await verify('energy / idle timeout and reusable measurement baseline', (s) => {
    const p = new PlaySession(s);
    s.profile = 'Step';
    s.ballMass = 0.23;
    p.startChallenge('energy');
    assert.equal(s.profile, 'S-Curve');
    assert.equal(s.ballMass, 0.0027);
    for (let i = 0; p.active && i < 47 / DT; i++) {
      s.tick();
      p.tick();
    }
    assert.equal(p.run?.phase, 'lost');
    assert.equal(p.run?.result?.score, 0);
    assert(p.run.elapsed >= 45);
    assert.equal(p.best.energy, undefined);
    p.retry();
    assert.equal(p.run?.workJ, 0);
    assert.equal(p.run?.phase, 'ready');
    return { reason: 'timeout', limit: 45 };
  });
  for (let index = 0; index < MAZES[2].holes.length; index++)
    await verify(`real hole/${index + 1}`, (s) => {
      s.installMaze(MAZES[2]);
      const hole = MAZES[2].holes[index];
      s.spawn('ball', hole.x, hole.y, 0.06);
      let lowest = Infinity;
      for (let i = 0; i < 2 / DT; i++) {
        s.tick();
        lowest = Math.min(lowest, s.ball?.z ?? Infinity);
      }
      assert(
        lowest < -0.05,
        'A 40 mm ball must fall through a 70 mm physical hole',
      );
      return { lowest };
    });
  await verify(
    'clear during game fails cleanly / retry resets / cancel resumes',
    (s) => {
      const p = new PlaySession(s);
      p.startMaze(0);
      for (let i = 0; i < 0.3 / DT; i++) {
        s.tick();
        p.tick();
      }
      assert.equal(p.run?.phase, 'running');
      s.clearObjects();
      p.tick();
      assert.equal(p.run?.phase, 'lost');
      assert.equal(p.run?.result?.success, false);
      p.retry();
      assert.equal(p.run?.phase, 'ready');
      assert.equal(s.objects.length, 1);
      assert(!s.paused);
      p.selectMode('free');
      assert(!s.paused);
      assert.equal(s.maze, null);
      p.startChallenge('center');
      for (let i = 0; i < 0.3 / DT; i++) {
        s.tick();
        p.tick();
      }
      p.cancel();
      assert.equal(p.run?.phase, 'lost');
      p.selectMode('free');
      assert(!s.paused);
      assert.equal(s.playTarget, null);
      assert.equal(s.objects.length, 1);
      return { passed: true };
    },
  );
  console.log(JSON.stringify({ passed: true, outcomes }, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
