import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../lib/simulation';
import { APPLICATIONS, ApplicationSession, type ApplicationId } from '../lib/applications';
import { HOME, ik, limits } from '../lib/kinematics';

function run(s: Simulation, a: ApplicationSession, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    a.tick();
    s.tick();
    assert.ok(s.pose.every(Number.isFinite), a.current.id + ' produced finite pose');
    assert.ok(!s.estop && !s.paused, a.current.id + ' stayed within controller safety limits');
  }
}

test('Every applied scenario drives six finite IK commands and a measured application channel', async () => {
  const s = await Simulation.create();
  try {
    const a = new ApplicationSession(s);
    for (const item of APPLICATIONS.filter((item) => item.id !== 'manual')) {
      assert(a.select(item.id));
      assert.equal(s.fixtureId, item.id);
      assert(s.fixtureColliders.length > 0);
      a.setInput(0.6, 0.48);
      let maxTravel = 0;
      let maxMeasuredTravel = 0;
      const homeLengths = ik(HOME, s.geometry);
      for (let i = 0; i < 9; i++) {
        run(s, a, 0.25);
        const commanded = ik(s.target, s.geometry, s.basePose);
        assert.ok(limits(s.target, s.geometry, s.basePose).valid, item.id);
        assert.equal(commanded.length, 6);
        assert.ok(commanded.every(Number.isFinite));
        maxTravel = Math.max(maxTravel, ...commanded.map((length, index) => Math.abs(length - homeLengths[index])));
        maxMeasuredTravel = Math.max(maxMeasuredTravel, ...s.actuators.map((leg, index) => Math.abs(leg.length - homeLengths[index])));
        assert(Number.isFinite(a.metric.value));
        if (a.planarReading) assert([a.planarReading.x, a.planarReading.y, a.planarReading.span].every(Number.isFinite));
      }
      assert(maxTravel > 0.001, item.id + ' commands observable stroke');
      assert(maxMeasuredTravel > 0.0003, item.id + ' has observable measured motion');
      assert.match(item.source.url, /^https:\/\//);
      assert(a.metric.label && a.metric.detail && a.metric.unit);
    }
  } finally {
    s.dispose();
  }
});

test('Application changes preserve dropped objects, and manual control owns the target after exit', async () => {
  const s = await Simulation.create();
  try {
    const a = new ApplicationSession(s);
    s.spawn('ball', 0, 0, 0, 0, 0.02);
    const handle = s.objects[0].body.handle;
    for (const id of ['marine', 'rail', 'manual'] as ApplicationId[]) {
      a.select(id);
      run(s, a, 0.25);
      assert.equal(s.objects.length, 1);
      assert.equal(s.objects[0].body.handle, handle);
    }
    assert.deepEqual(s.basePose, [0, 0, 0, 0, 0, 0]);
    assert(s.setPose([0.015, -0.01, 0.49, 0, 0, 0]));
    run(s, a, 0.2);
    assert.deepEqual(s.target, [0.015, -0.01, 0.49, 0, 0, 0]);
  } finally {
    s.dispose();
  }
});

test('Coupling rises at the optical peak, while an off-axis docking ring cannot advance', async () => {
  const s = await Simulation.create();
  try {
    const a = new ApplicationSession(s);
    a.select('photonics');
    a.setInput(-0.55, 0.6);
    run(s, a, 3.5);
    const weak = a.metric.value;
    a.setInput(0.009 / 0.021, -0.005 / 0.018);
    run(s, a, 3.5);
    assert(a.metric.value > 90 && a.metric.value > weak + 65, 'optical power follows measured pose');
    a.select('docking');
    a.setInput(-0.5, 0.6);
    run(s, a, 2);
    assert.equal(s.target[2], HOME[2]);
    a.setInput(0.5, -0.4);
    run(s, a, 8);
    assert(a.metric.value < 3 && s.target[2] > HOME[2] + 0.01);
  } finally {
    s.dispose();
  }
});

test('Sweep response increases near resonance and drops with damping', async (t) => {
  const s = await Simulation.create();
  try {
    const a = new ApplicationSession(s);
    function responseAt(x: number, y: number) {
      a.select('vibration');
      a.setInput(x, y);
      run(s, a, 10);
      return a.metric.value;
    }
    const low = responseAt(-0.9, -0.3);
    const resonance = responseAt((1.02 - 0.98) / 0.52, -0.3);
    const damped = responseAt((1.02 - 0.98) / 0.52, 1);
    t.diagnostic(`Measured RMS displacement ratios: 0.512 Hz ${low.toFixed(2)}×, 1.02 Hz ${resonance.toFixed(2)}×, higher damping ${damped.toFixed(2)}×`);
    assert(resonance > low * 1.5, [low, resonance].join(' / '));
    assert(damped < resonance * 0.85, [damped, resonance].join(' / '));
  } finally {
    s.dispose();
  }
});

test('Seismic displacement is read from the moving proof mass and varies with excitation direction', async (t) => {
  const s = await Simulation.create();
  try {
    const a = new ApplicationSession(s);
    function measureRun(direction: number) {
      a.select('manual');
      s.initialize();
      a.select('seismic');
      a.setInput(direction, 0.5);
      let sum = 0, samples = 0;
      for (let i = 0; i < 9 / DT; i++) {
        a.tick();
        if (i % 2 === 0 && i * DT > 2) {
          const mm = 1000 * s.specimen!.displacement;
          assert(Math.abs(mm - a.metric.value) < 1e-5, 'display reads the physical joint displacement');
          sum += mm * mm;
          samples++;
        }
        s.tick();
        assert(!s.paused && s.pose.every(Number.isFinite));
      }
      return Math.sqrt(sum / samples);
    }
    const along = measureRun(0), across = measureRun(1);
    t.diagnostic(`Specimen RMS stroke: axial ${along.toFixed(3)} mm, transverse ${across.toFixed(3)} mm`);
    assert(along > 0.2 && across < along * 0.45, [along, across].join(' / '));
  } finally {
    s.dispose();
  }
});
