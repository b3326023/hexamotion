import assert from "node:assert/strict";
import { Vector3 } from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  DEFAULT_GEOMETRY,
  HOME,
  DEG,
  endpoints,
  fk,
  ik,
  jacobian,
  limits,
  type Pose,
} from "../lib/kinematics";
import { Simulation, DT } from "../lib/simulation";
import { FIXTURE_MASS } from "../lib/application-fixtures";
import { APPLICATIONS, ApplicationSession } from "../lib/applications";

const g = DEFAULT_GEOMETRY;
const zero: Pose = [0, 0, 0, 0, 0, 0];
const maximum = (a: number[]) => Math.max(...a.map(Math.abs));
const evidence: Record<string, unknown> = {};

// The attitude basis is a world angular twist, independent of Euler coordinates.
let residual = 0,
  poseError = 0,
  differentialError = 0,
  n = 0;
for (let i = 1; i <= 120; i++) {
  const p: Pose = [
    0.035 * Math.sin(i),
    0.027 * Math.cos(1.2 * i),
    0.49 + 0.04 * Math.sin(0.4 * i),
    0.09 * Math.cos(0.7 * i),
    0.085 * Math.sin(0.13 * i),
    0.1 * Math.cos(0.42 * i),
  ];
  const base: Pose = [0.003, -0.004, 0.003 * Math.cos(i), 0.025 * Math.sin(i), 0.01, -0.008];
  if (!limits(p, g, base).valid) continue;
  const reference = ik(p, g, base),
    solve = fk(reference, HOME, g, base);
  assert(solve.valid);
  residual = Math.max(residual, solve.residual);
  poseError = Math.max(poseError, maximum(p.map((x, k) => x - solve.pose[k])));
  const J = jacobian(p, g, base);
  const twist = [0.03, -0.04, 0.05, -0.07, 0.08, 0.06];
  const points = endpoints(p, g, base);
  for (let k = 0; k < 6; k++) {
    const arm = points.top[k].clone().sub(new Vector3(p[0], p[1], p[2]));
    const velocity = new Vector3(...(twist.slice(3) as [number, number, number]))
      .cross(arm)
      .add(new Vector3(...(twist.slice(0, 3) as [number, number, number])));
    const derivative =
      (points.top[k].clone().addScaledVector(velocity, 1e-6).distanceTo(points.base[k]) -
        reference[k]) /
      1e-6;
    differentialError = Math.max(
      differentialError,
      Math.abs(derivative - J[k].reduce((sum, j, c) => sum + j * twist[c], 0)),
    );
  }
  n++;
}
assert(n >= 100 && residual < 1e-7 && poseError < 2e-6 && differentialError < 1e-7);
evidence.kinematics = {
  testedPoses: n,
  peakLengthResidualM: residual,
  maximumPoseComponentError: poseError,
  jacobianVelocityErrorMps: differentialError,
};

const s = await Simulation.create();
const run = (seconds: number, inspect?: () => void) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s.tick();
    assert(s.pose.every(Number.isFinite) && !s.paused, "unexpected instability");
    inspect?.();
  }
};
assert.equal(s.dynamic, true);
assert.equal(s.world.impulseJoints.len(), 18);
assert.equal(s.world.bodies.len(), 15);
const closure = () => {
  const e = endpoints(s.pose, s.geometry, s.basePose);
  return Math.max(
    ...s
      .assembly!.frames()
      .flatMap((f, i) => [e.base[i].distanceTo(f.base), e.top[i].distanceTo(f.top)]),
  );
};
run(2);
const casting = s.foundation.collider(0);
const cast = (x: number, y: number) =>
  casting.castRay(new RAPIER.Ray({ x, y, z: 0.2 }, { x: 0, y: 0, z: -1 }), 0.35, true);
assert(
  cast(0, 0) < 0 && cast(0.275, 0) < 0 && cast(0.43, 0) > 0,
  "base must have through-holes and solid material",
);
const emptyForce = s.actuators.reduce((sum, a) => sum + a.force, 0);
let worstClosure = 0,
  peakCommandSpeed = 0;
const command: Pose = [0.024, -0.014, 0.512, 0.045, -0.06, 0.083];
assert(s.setPose(command));
run(4, () => {
  worstClosure = Math.max(worstClosure, closure());
  peakCommandSpeed = Math.max(peakCommandSpeed, maximum(s.actuators.map((a) => a.commandVelocity)));
  assert(
    s.actuators.every((a) => a.length >= g.minLength - 1e-3 && a.length <= g.maxLength + 1e-3),
  );
});
assert(worstClosure < 8e-4);
assert(peakCommandSpeed <= g.maxVelocity + 1e-6);
const settledError = s.pose.map((x, i) => Math.abs(x - command[i]));
assert(maximum(settledError.slice(0, 3)) < 8e-4);
assert(maximum(settledError.slice(3)) < 0.35 * DEG);
assert(
  s.assembly!.legs.every(
    (x) => x.slide.limitsEnabled() && Math.abs(x.slide.limitsMin() - g.minLength) < 1e-6,
  ),
);
evidence.coupling = {
  rigidBodies: s.world.bodies.len(),
  joints: s.world.impulseJoints.len(),
  worstJointGapM: worstClosure,
  maxSettledTranslationErrorM: maximum(settledError.slice(0, 3)),
  maxSettledRotationErrorDeg: maximum(settledError.slice(3)) / DEG,
};

// Apply a physical side impulse to one sleeve, bypassing all controller commands.
const before = [...s.pose];
s.assembly!.legs[1].barrel.applyImpulse({ x: 0, y: 0.4, z: 0.1 }, true);
let inducedMotion = 0;
run(0.5, () => {
  inducedMotion = Math.max(inducedMotion, maximum(s.pose.slice(0, 3).map((x, k) => x - before[k])));
});
assert(inducedMotion > 1e-5, "sleeve impulse must move deck through joints");
s.impulse();
let peakDeviation = 0;
run(1.8, () => {
  peakDeviation = Math.max(
    peakDeviation,
    maximum(s.pose.slice(0, 3).map((x, k) => x - command[k])),
  );
});
assert(peakDeviation > 8e-4 && maximum(s.pose.slice(0, 3).map((x, k) => x - command[k])) < 9e-4);
evidence.impact = {
  sleeveImpulseDeckResponseM: inducedMotion,
  appliedDeckImpulsePeakM: peakDeviation,
};

// Verify a physical load with a changed inertia tensor and eccentric center of gravity.
s.payloadOffset = 0.075;
assert(s.applySettings({ ...g, payload: 50 }));
run(3);
assert(Math.abs(s.plate.mass() - 74) < 0.01);
const weights = s.actuators.map((a) => a.force);
const vertical = weights.reduce(
  (sum, force, i) => sum + jacobian(s.pose, s.geometry, zero)[i][2] * force,
  0,
);
assert(vertical > 74 * 9.81 && vertical < 90 * 9.81);
assert(Math.max(...weights) - Math.min(...weights) > 20);
assert(weights.reduce((a, b) => a + b, 0) > emptyForce + 450);
evidence.ballast = {
  deckMassKg: s.plate.mass(),
  motorVerticalForceN: vertical,
  maximumAxialN: Math.max(...weights),
  minimumAxialN: Math.min(...weights),
};
const livePlate = s.plate;
assert(s.setPayload(300, -0.025));
run(2);
assert.equal(s.plate, livePlate);
assert(Math.abs(s.plate.mass() - 324) < 0.01 && Math.abs(s.pose[2] - HOME[2]) < 0.002);

// Too little thrust must cause sag followed by physical lower stops.
assert(s.applySettings({ ...g, maxForce: 12 }));
let smallest = Infinity,
  maxThrust = 0,
  hitStop = false;
run(1.5, () => {
  for (const a of s.actuators) {
    smallest = Math.min(smallest, a.length);
    maxThrust = Math.max(maxThrust, Math.abs(a.force));
    if (a.length < g.minLength + 0.001) hitStop = true;
  }
});
assert(hitStop && s.pose[2] < HOME[2] - 0.07);
assert(smallest > g.minLength - 0.002);
assert(maxThrust <= 12);
evidence.strokeStop = { minimumM: smallest, thrustCapN: maxThrust, stoppedHeightM: s.pose[2] };

assert(s.applySettings({ ...g }));
s.runScenario("sea");
let largestBaseTilt = 0,
  largestDeckTilt = 0,
  peakSeaGap = 0;
run(9, () => {
  largestBaseTilt = Math.max(largestBaseTilt, Math.hypot(s.basePose[3], s.basePose[4]));
  largestDeckTilt = Math.max(largestDeckTilt, Math.hypot(s.pose[3], s.pose[4]));
  peakSeaGap = Math.max(peakSeaGap, closure());
});
assert(largestBaseTilt > 4 * DEG && largestDeckTilt < largestBaseTilt * 0.5 && peakSeaGap < 0.002);
evidence.sea = {
  peakBaseTiltDeg: largestBaseTilt / DEG,
  peakDeckTiltDeg: largestDeckTilt / DEG,
  maxGapM: peakSeaGap,
};

s.initialize();
s.spawn("ball", 0, 0, 0.2);
const ball = s.objects[0].body,
  height = ball.translation().z;
run(0.1);
const ballisticError = Math.abs(height - ball.translation().z - 0.5 * s.gravity * 0.1 ** 2);
assert(ballisticError < 0.004);
let reboundVelocity = 0;
run(0.35, () => {
  reboundVelocity = Math.max(reboundVelocity, ball.linvel().z);
});
assert(reboundVelocity > 0.1);
assert(s.impacts.length > 0);
evidence.ball = { freeFallErrorM: ballisticError, firstReboundSpeedZ: reboundVelocity };

// Swap complete scaled assemblies on the same live deck with a ball and a
// separate ballast. Ensure that geometry, inertia and live object identities survive.
s.clearObjects();
assert(s.setPayload(10, 0.04));
s.spawn("ball", 0.19, 0.02, 0.11);
const retained = s.objects[0].body;
let minParts = Infinity,
  maxParts = 0;
for (const [id, mass] of Object.entries(FIXTURE_MASS)) {
  assert(s.setApplicationFixture(id));
  assert.equal(retained, s.objects[0].body);
  assert.equal(s.geometry.payload, 10);
  assert.equal(s.payloadOffset, 0.04);
  assert(
    Math.abs(s.plate.mass() + (s.specimen?.body.mass() ?? 0) - (g.mass + 10 + mass)) < 0.002,
    id + ": combined mass",
  );
  if (id !== "manual") {
    const count = s.fixtureColliders.length;
    minParts = Math.min(minParts, count);
    maxParts = Math.max(maxParts, count);
    assert(count >= 3);
    run(0.2);
  }
}
assert(s.setApplicationFixture("flight"));
s.clearObjects();
s.spawn("steel", 0, 0, 0.23);
const steel = s.objects[0].body;
let fixtureContact = false;
run(0.6, () => {
  s.world.contactPairsWith(steel.collider(0), (c) => {
    if (s.fixtureColliders.some((f) => f.handle === c.handle))
      s.world.contactPair(steel.collider(0), c, (m) => {
        if (m.numSolverContacts()) fixtureContact = true;
      });
  });
});
assert(fixtureContact && steel.translation().z > s.pose[2] + 0.08);
const seatedHeight = steel.translation().z - s.pose[2];
assert(s.setApplicationFixture("manual"));
assert.equal(s.fixtureColliders.length, 0);
assert(Math.abs(s.plate.mass() - 34) < 0.002);
evidence.fixtures = {
  count: Object.keys(FIXTURE_MASS).length - 1,
  minParts,
  maxParts,
  seatContactHeightM: seatedHeight,
};
assert(s.setPayload(0, 0));
s.clearObjects();
assert(s.setApplicationFixture("vibration"));
const specimen = s.specimen!;
assert.equal(s.world.impulseJoints.len(), 19);
assert(Math.abs(specimen.body.mass() - 1.4) < 0.002);
run(2);
const beforeImpact = s.plate.translation();
specimen.body.applyImpulse({ x: 0.2, y: 0, z: 0 }, true);
let slidePeak = 0,
  deckPeak = 0,
  slideRecovered = false;
run(3, () => {
  slidePeak = Math.max(slidePeak, Math.abs(specimen.displacement));
  deckPeak = Math.max(deckPeak, Math.abs(s.plate.translation().x - beforeImpact.x));
  if (slidePeak > 0.01 && specimen.displacement < -0.003) slideRecovered = true;
});
assert(slidePeak > 0.01 && slidePeak <= 0.041 && deckPeak > 0.00001 && slideRecovered);
assert(Math.abs(specimen.displacement) < slidePeak * 0.25);
assert(s.setApplicationFixture("manual"));
assert.equal(s.world.impulseJoints.len(), 18);
assert.equal(s.world.bodies.len(), 15);
evidence.spring = {
  coupledBodyMassKg: 1.4,
  relativeDeflectionM: slidePeak,
  deckResponseM: deckPeak,
};

s.dynamic = false;
s.initialize();
assert.equal(s.world.impulseJoints.len(), 0);
assert(s.setPose(command));
run(3);
assert(maximum(s.pose.map((x, k) => x - command[k])) < 1e-4);
evidence.realtime = { peakSettledComponentError: maximum(s.pose.map((x, k) => x - command[k])) };

for (const dynamic of [false, true]) {
  s.dynamic = dynamic;
  s.initialize();
  s.runScenario("tracking");
  s.startRecord();
  run(1.2);
  assert.equal(s.record.length, 36);
  const data = JSON.parse(JSON.stringify(s.exportExperiment()));
  assert(s.loadExperiment(data));
  assert.equal(s.record.length, 36);
  s.replay();
  for (let i = 0; i < 300; i++) s.tick();
  assert(s.paused);
  assert.deepEqual(s.view().pose, data.recording.at(-1).pose);
  assert.deepEqual(s.view().legFrames, data.recording.at(-1).legFrames);
  for (const f of data.recording) delete f.legFrames;
  assert(s.loadExperiment(data));
  assert.equal(s.record.length, 36);
  s.replay();
  s.tick();
  assert(!s.view().legFrames);

  s.initialize();
  s.control.rate = 120;
  s.setAuto(true);
  s.spawn("ball", 0.06, 0.04, 0.04);
  run(0.7);
  const last = s.sensorQueue.at(-1)!;
  assert(last && s.sensorQueue.length > 80);
  assert(Math.abs(last.capturedAt - s.sensorQueue.at(-2)!.capturedAt - DT) < 1e-9);
  const samples = s.sensorQueue.length;
  s.control.dropout = 1;
  run(0.1);
  assert.equal(s.sensorQueue.length, samples);
  assert(s.sensorQueue.at(-1)!.capturedAt === last.capturedAt);
  s.control.dropout = 0;
  evidence[dynamic ? "dynamicRecording" : "realtimeRecording"] = {
    frames: 36,
    legacyFrames: 36,
    captureRateHz: 1 / DT,
  };

  const response = [];
  for (const frequency of [0.2, 1, 2]) {
    s.initialize();
    const duration = Math.max(5, 2 / frequency);
    let sin = 0,
      cos = 0,
      samples = 0;
    for (let i = 0; i < Math.round(duration / DT); i++) {
      const t = i * DT,
        phase = 2 * Math.PI * frequency * t;
      s.target = [0, 0, HOME[2], 0, 2 * DEG * Math.sin(phase), 0];
      s.tick();
      assert(!s.paused);
      if (t >= duration - 1 / frequency) {
        sin += s.pose[4] * Math.sin(phase);
        cos += s.pose[4] * Math.cos(phase);
        samples++;
      }
    }
    response.push({
      hz: frequency,
      amplitudeRatio: (2 * Math.hypot(sin, cos)) / (samples * 2 * DEG),
      phaseDeg: Math.atan2(cos, sin) / DEG,
    });
  }
  assert(response[0].amplitudeRatio > 0.9 && response[0].amplitudeRatio < 1.06);
  assert(response[2].amplitudeRatio < response[0].amplitudeRatio * 0.9);
  evidence[dynamic ? "dynamicFrequencyResponse" : "realtimeFrequencyResponse"] = response;

  s.initialize();
  s.profile = "Step";
  const homeBefore = [...s.target];
  assert(!s.setPose([0.12, 0.12, 0.34, 0.2, 0.2, 0.3]));
  assert.deepEqual(s.target, homeBefore);
  assert(s.setPose([0, 0, 0.62, 0, 0, 0]));
  let previous = s.actuators.map((a) => a.commandAcceleration);
  run(1.1, () => {
    s.actuators.forEach((a, i) => {
      assert(Math.abs(a.commandVelocity) <= g.maxVelocity + 1e-7);
      assert(Math.abs(a.commandAcceleration) <= g.maxAcceleration + 1e-7);
      assert(Math.abs(previous[i] - a.commandAcceleration) / DT <= g.maxJerk + 1e-7);
    });
    previous = s.actuators.map((a) => a.commandAcceleration);
  });
  s.stop();
  assert(!s.setPose([...HOME]));
  run(0.2);
  assert(s.actuators.every((a) => Math.abs(a.commandVelocity) < 1e-7));
  s.release();
  assert(s.setPose([...HOME]));
  s.profile = "S-Curve";
  s.initialize();
  const suite = new ApplicationSession(s);
  for (const application of APPLICATIONS) {
    assert(suite.select(application.id));
    suite.setInput(-0.4, 0.45);
    for (let i = 0; i < 360; i++) {
      suite.tick();
      s.tick();
      assert(!s.paused && s.pose.every(Number.isFinite), application.id);
      assert(Number.isFinite(suite.metric.value), application.id);
    }
  }
  assert(suite.select("manual"));
}
s.dispose();
console.log(JSON.stringify(evidence, null, 2));
