import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { actuatorMount } from "../lib/actuator-mount";
import {
  actuatorDimensions,
  anchors,
  DEG,
  endpoints,
  HOME,
  ik,
  quaternion,
  type Pose,
} from "../lib/kinematics";
import { makeLeg, positionActuator } from "../lib/machined-model";
import { Simulation } from "../lib/simulation";

const sim = await Simulation.create();
const g = sim.geometry;
const origin: Pose = [0, 0, 0, 0, 0, 0];
const axis = new Vector3(0, 1, 0);
const vector = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
const rotation = (q: { x: number; y: number; z: number; w: number }) =>
  new Quaternion(q.x, q.y, q.z, q.w).normalize();
const mounts = anchors(g).base.map(actuatorMount);
const models = mounts.map((_, i) => makeLeg(i, g));
const rodLength = actuatorDimensions(g.maxLength).rod;
const measures = mounts.map(() => ({
  twistDeg: 0,
  pistonTwistDeg: 0,
  axisErrorDeg: 0,
  maxStepDeg: 0,
  pinGapM: 0,
  minLengthM: Infinity,
  maxLengthM: 0,
}));

// Twist is the component of the measured RELATIVE quaternion about the
// installed stroke axis. It is independent of quaternion sign, swing and camera.
function twistDeg(actual: Quaternion, seat: Quaternion) {
  const relative = seat.clone().invert().multiply(actual);
  return (2 * Math.atan2(Math.abs(relative.y), Math.abs(relative.w))) / DEG;
}

// Use the real meshes and preserve the attachment centers, the piston stroke
// and the sleeve's installed clocking with a moving, yawed foundation.
for (let j = 0; j <= 360; j++) {
  const t = (j * Math.PI) / 180;
  const body: Pose = [
    0.03 * Math.sin(t),
    0.02 * Math.cos(t),
    0.48 + 0.03 * Math.sin(3 * t),
    0.08 * Math.sin(2 * t),
    0.09 * Math.cos(t),
    0.15 * Math.sin(t),
  ];
  const base: Pose = [
    0.012 * Math.sin(t),
    0.009 * Math.cos(t),
    0.003 * Math.sin(t),
    0.065 * Math.cos(t),
    0.07 * Math.sin(t),
    0.11 * Math.cos(t),
  ];
  const qBase = quaternion(base);
  const e = endpoints(body, g, base);
  const lengths = ik(body, g, base);
  for (const [i, model] of models.entries()) {
    const mount = mounts[i];
    const dir = positionActuator(model, e.base[i], e.top[i], mount.neutral, qBase, rodLength);
    const seat = qBase.clone().multiply(mount.neutral);
    assert(twistDeg(model.quaternion, seat) < 1e-9);
    assert(axis.clone().applyQuaternion(model.quaternion).dot(dir) > 1 - 1e-12);
    assert(model.upper.getWorldPosition(new Vector3()).distanceTo(e.top[i]) < 1e-12);
    assert(
      model.piston.localToWorld(new Vector3(0, rodLength / 2, 0)).distanceTo(e.top[i]) < 1e-12,
    );
    assert(Math.abs(model.upper.position.y - lengths[i]) < 1e-12);
  }
}

function measureSegment(ticks: number, drive?: (tick: number) => void) {
  let previous: Quaternion[] = [];
  for (let t = 0; t < ticks; t++) {
    drive?.(t);
    sim.tick();
    assert(!sim.paused);
    const frames = sim.assembly!.frames();
    const baseRotation = quaternion(sim.basePose);
    const e = endpoints(sim.pose, g, sim.basePose);
    const current = frames.map((f, i) => {
      const m = measures[i],
        model = models[i],
        mount = mounts[i];
      const a = vector(f.base),
        b = vector(f.top),
        actual = rotation(f.rotation);
      const seat = baseRotation.clone().multiply(mount.neutral);
      const piston = rotation(sim.assembly!.legs[i].rod.rotation());
      const dir = positionActuator(model, a, b, mount.neutral, baseRotation, rodLength);
      m.twistDeg = Math.max(m.twistDeg, twistDeg(actual, seat));
      m.pistonTwistDeg = Math.max(m.pistonTwistDeg, twistDeg(piston, seat));
      m.axisErrorDeg = Math.max(
        m.axisErrorDeg,
        actual.angleTo(model.quaternion) / DEG,
        axis.clone().applyQuaternion(piston).angleTo(dir) / DEG,
      );
      m.pinGapM = Math.max(m.pinGapM, a.distanceTo(e.base[i]), b.distanceTo(e.top[i]));
      const len = a.distanceTo(b);
      m.minLengthM = Math.min(m.minLengthM, len);
      m.maxLengthM = Math.max(m.maxLengthM, len);
      if (previous[i]) m.maxStepDeg = Math.max(m.maxStepDeg, actual.angleTo(previous[i]) / DEG);
      return actual;
    });
    previous = current;
  }
}

// Apply alternating external spin impulses to all twelve real rigid bodies.
// A spherical lower seat leaves the common barrel/piston roll unconstrained.
function torqueAll() {
  for (const [i, leg] of sim.assembly!.legs.entries()) {
    const impulse = axis
      .clone()
      .applyQuaternion(rotation(leg.barrel.rotation()))
      .multiplyScalar(i % 2 === 0 ? 0.008 : -0.008);
    leg.barrel.applyTorqueImpulse(impulse, true);
    leg.rod.applyTorqueImpulse(impulse, true);
  }
}
measureSegment(800, (t) => {
  if (t === 30) assert(sim.setPose([0.028, -0.019, 0.52, 0.065, -0.075, 0.12]));
  if (t === 320) assert(sim.setPose([-0.02, 0.021, 0.45, -0.065, 0.075, -0.12]));
  if (t === 550) assert(sim.setPose([...HOME]));
  if (t % 103 === 19) torqueAll();
});
sim.runScenario("sea");
measureSegment(1300, (t) => {
  if (t % 277 === 10) torqueAll();
});
for (const [i, m] of measures.entries()) {
  assert(
    m.twistDeg < 0.05 && m.pistonTwistDeg < 0.05,
    `A${i + 1} uncontrolled torsion: ${JSON.stringify(m)}`,
  );
  assert(
    m.axisErrorDeg < 0.15 && m.pinGapM < 0.0002 && m.maxStepDeg < 1,
    `A${i + 1} lost closure or flipped: ${JSON.stringify(m)}`,
  );
  assert(m.maxLengthM - m.minLengthM > 0.03, `A${i + 1} stroke stalled`);
}

// A legacy file may carry arbitrary clocking. Endpoints alone must recreate
// the same model even after a previous state and a wholly different orientation.
const e = endpoints(HOME, g, origin);
for (const [i, model] of models.entries()) {
  positionActuator(model, e.base[i], e.top[i], mounts[i].neutral, new Quaternion(), rodLength);
  const expected = model.quaternion.clone();
  model.rotateY(2.7);
  positionActuator(model, e.base[i], e.top[i], mounts[i].neutral, new Quaternion(), rodLength);
  assert(Math.abs(model.quaternion.dot(expected)) > 1 - 1e-12);
}
sim.dispose();
console.log(JSON.stringify({ kinematicPoses: 361, dynamicTicks: 2100, legs: measures }, null, 2));
