import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DataTexture, Group, Texture, TextureLoader, Vector3 } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { APPLICATIONS, ApplicationSession } from "../lib/applications";
import { DT, Simulation } from "../lib/simulation";
import { DEG, HOME, ik } from "../lib/kinematics";
import { raceCourse, raceLapLength } from "../lib/worlds/race-course";
import { createSeismicWorld } from "../lib/worlds/seismic";
import { sampleVesselWave } from "../lib/worlds/wave-field";
import { worldIds, type WorldId } from "../lib/worlds/types";

function near(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}
async function setup(t: TestContext, id: WorldId) {
  const s = await Simulation.create();
  t.after(() => s.dispose());
  const a = new ApplicationSession(s);
  assert.ok(s.dynamic && a.select(id));
  function advance(seconds: number, sample?: () => void) {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      a.tick();
      s.tick();
      assert.ok(!s.paused && !s.estop, "safety system tripped while driving " + id);
      sample?.();
    }
  }
  return { s, a, advance };
}

test("Airliner commands bank and pitch in both directions, and turn rate follows coordinated flight", async (t) => {
  const { s, a, advance } = await setup(t, "flight");
  const readings: string[] = [];
  for (const sign of [1, -1]) {
    a.setInput(sign * 0.8, sign * 0.65);
    advance(2);
    const start = { ...a.world };
    let integratedTurn = 0,
      previousTime = start.t,
      largestLag = 0;
    advance(1.5, () => {
      const f = a.world;
      integratedTurn += ((f.t - previousTime) * s.gravity * Math.tan(f.roll)) / f.speed;
      previousTime = f.t;
      largestLag = Math.max(largestLag, Math.abs(f.roll - f.deckRoll));
      near(f.deckRoll, s.pose[3]);
      near(f.deckPitch, s.pose[4]);
    });
    const f = a.world;
    near(f.distance - start.distance, f.speed * (f.t - start.t), 1e-6);
    near(f.heading - start.heading, integratedTurn, 1e-7);
    assert.ok(f.roll * sign > 3 * DEG && f.deckRoll * sign > 2 * DEG);
    assert.ok(f.pitch * sign > 1.3 * DEG && f.deckPitch * sign > 1 * DEG);
    assert.ok(largestLag > 0.004 * DEG, "physical servos exhibit a finite tracking error");
    readings.push(`${(f.roll / DEG).toFixed(2)}°/${(f.deckRoll / DEG).toFixed(2)}°`);
  }
  t.diagnostic("Aircraft/physical deck bank, right then left: " + readings.join(", "));
});

test("Race route closes, stays tangent to the centerline, and links lane offset, speed and lateral feedback", async (t) => {
  const { a, advance } = await setup(t, "driving");
  let right = 0,
    left = 0;
  const ds = 0.08;
  for (let s = 0.51; s < raceLapLength; s += 3.73) {
    const h = raceCourse(s),
      p = raceCourse(s - ds),
      n = raceCourse(s + ds),
      lane = raceCourse(s, 2.2);
    const dx = n.x - p.x,
      dz = n.z - p.z,
      length = Math.hypot(dx, dz);
    near(Math.sin(h.heading), dx / length, 1e-4);
    near(-Math.cos(h.heading), dz / length, 1e-4);
    near(Math.hypot(h.x - lane.x, h.z - lane.z), 2.2);
    near(((lane.x - h.x) * dx) / length + ((lane.z - h.z) * dz) / length, 0, 1e-4);
    const angle = n.heading - p.heading;
    near(h.curvature, Math.atan2(Math.sin(angle), Math.cos(angle)) / length, 0.001);
    const loop = raceCourse(s + raceLapLength);
    near(loop.x, h.x);
    near(loop.z, h.z);
    right = Math.max(right, h.curvature);
    left = Math.min(left, h.curvature);
  }
  assert.ok(right > 0.015 && left < -0.015);
  a.setInput(0.8, 0.85);
  advance(3.5);
  const fast = { ...a.world };
  assert.ok(fast.x > 0.65 && fast.speed > 27);
  a.setInput(-0.8, -0.85);
  let peakRoll = 0;
  advance(6, () => {
    const f = a.world;
    near(f.course, f.distance);
    peakRoll = Math.max(peakRoll, Math.abs(f.deckRoll));
  });
  const slow = a.world;
  assert.ok(slow.x < -0.68 && slow.speed < 13.5 && peakRoll > DEG && slow.distance > fast.distance);
  t.diagnostic(
    `Lap ${raceLapLength.toFixed(2)} m; throttle/brake ${fast.speed.toFixed(2)}→${slow.speed.toFixed(2)} m/s; measured peak deck roll ${(peakRoll / DEG).toFixed(2)}°`,
  );
});

test("Sea slopes match finite differences and the six actuators compensate measured vessel motion", async (t) => {
  const { s, a, advance } = await setup(t, "marine");
  a.setInput(0.45, 0.75);
  let baseSq = 0,
    deckSq = 0,
    count = 0,
    heave = 0,
    stroke = 0;
  const home = ik(HOME, s.geometry);
  advance(11, () => {
    const f = a.world;
    if (f.t < 2 || s.count % 8 !== 0) return;
    const wave = (x: number, z: number) =>
      sampleVesselWave(f.t, f.waveHeight, f.waveDirection, x, z).height;
    const eps = 0.01,
      dx = (wave(eps, 0) - wave(-eps, 0)) / (2 * eps),
      dz = (wave(0, eps) - wave(0, -eps)) / (2 * eps);
    near(f.baseHeave, wave(0, 0) * 0.01);
    near(f.basePitch, -Math.atan(dx), 1e-7);
    near(f.baseRoll, -Math.atan(dz * Math.cos(f.basePitch)), 1e-7);
    baseSq += f.baseRoll ** 2 + f.basePitch ** 2;
    deckSq += f.deckRoll ** 2 + f.deckPitch ** 2;
    count++;
    heave = Math.max(heave, Math.abs(f.baseHeave));
    stroke = Math.max(stroke, ...s.actuators.map((leg, j) => Math.abs(leg.length - home[j])));
  });
  const vessel = Math.sqrt(baseSq / count) / DEG,
    deck = Math.sqrt(deckSq / count) / DEG;
  assert.ok(vessel > 2 && deck < vessel * 0.65 && heave > 0.006 && stroke > 0.005);
  t.diagnostic(
    `Vessel/deck RMS tilt ${vessel.toFixed(3)}°/${deck.toFixed(3)}°; base peak heave ${(1000 * heave).toFixed(2)} mm; actuator excursion ${(1000 * stroke).toFixed(2)} mm`,
  );
});

test("All nine rendered storeys follow measured proof-mass motion relative to the moving foundation", async (t) => {
  // Node needs no pixel assets to instantiate and update the actual scene graph.
  t.mock.method(TextureLoader.prototype, "load", () => new Texture());
  t.mock.method(HDRLoader.prototype, "load", () => new DataTexture());
  const view = createSeismicWorld();
  t.after(() => view.dispose?.());
  const ground = view.scene.children.find(
    (g) => g.children.filter((o) => o instanceof Group).length === 9,
  );
  assert.ok(ground);
  const floors = ground.children
    .filter((g) => g instanceof Group)
    .sort((a, b) => a.position.y - b.position.y);
  const { s, a, advance } = await setup(t, "seismic");
  const ex = new Vector3(1, 0, 0),
    relative = new Vector3(),
    axis = new Vector3();
  let maxProof = 0,
    peakRoof = 0,
    positive = false,
    negative = false;
  a.setInput(0, 0.8);
  advance(9, () => {
    if (s.count % 8 !== 0) return;
    const f = a.world,
      body = s.specimen!.body,
      deck = s.plate;
    relative.copy(body.translation()).sub(deck.translation());
    const deflection = relative.dot(axis.copy(ex).applyQuaternion(deck.rotation()));
    near(f.specimen, deflection);
    view.update(f, 1.85);
    near(ground.position.x, deck.translation().x * 90);
    near(ground.position.y, (deck.translation().z - HOME[2]) * 90);
    near(ground.position.z, deck.translation().y * 90);
    for (let i = 0; i < floors.length; i++) {
      const mode = 1 - Math.cos(((i + 1) * Math.PI) / (2 * floors.length));
      near(floors[i].position.x, deflection * 90 * mode);
      if (i)
        assert.ok(Math.abs(floors[i].position.x) >= Math.abs(floors[i - 1].position.x) - 1e-10);
    }
    positive ||= deflection > 0.0006;
    negative ||= deflection < -0.0006;
    maxProof = Math.max(maxProof, Math.abs(deflection));
    peakRoof = Math.max(peakRoof, Math.abs(floors[8].position.x));
  });
  assert.ok(positive && negative && maxProof > 0.001);
  t.diagnostic(
    `Measured proof-mass peak ${(1000 * maxProof).toFixed(3)} mm, rendered roof peak ${peakRoof.toFixed(3)} scene metres at 90:1`,
  );
});

test("All thirteen scenario clocks and commanded travel hold on pause and emergency braking", async (t) => {
  const s = await Simulation.create();
  t.after(() => s.dispose());
  const a = new ApplicationSession(s);
  for (const id of worldIds) {
    assert.ok(a.select(id));
    a.setInput(0.6, 0.7);
    for (let i = 0; i < 240; i++) {
      a.tick();
      s.tick();
    }
    s.paused = true;
    const paused = { ...a.world };
    a.setInput(-1, -1);
    for (let i = 0; i < 180; i++) a.tick();
    assert.deepEqual(a.world, paused);
    s.paused = false;
    for (let i = 0; i < 12; i++) {
      a.tick();
      s.tick();
    }
    assert.ok(a.world.t > paused.t);
    s.stop();
    const stopped = { ...a.world },
      locked = s.actuators.map((leg) => leg.target);
    assert.ok(!a.select(id));
    for (let i = 0; i < 120; i++) {
      a.tick();
      s.tick();
    }
    const after = a.world;
    for (const key of [
      "t",
      "distance",
      "course",
      "heading",
      "roll",
      "pitch",
      "baseRoll",
      "basePitch",
      "baseHeave",
    ] as const)
      near(after[key], stopped[key]);
    s.actuators.forEach((leg, i) => near(leg.target, locked[i]));
    s.release();
    assert.ok(a.select(id));
    assert.ok(
      a.world.t < DT && a.world.distance < 2,
      "restarting after brake starts a fresh scenario",
    );
  }
});

test("The catalogue supplies a unique paired world, measurement channels and a named sound field for every application", async (t) => {
  const { worldDisplay, reading } = await import("../lib/worlds/display");
  const { soundLabels } = await import("../lib/scene-sound");
  assert.deepEqual(
    [...worldIds].sort(),
    APPLICATIONS.filter((a) => a.id !== "manual")
      .map((a) => a.id)
      .sort(),
  );
  assert.equal(new Set(Object.values(soundLabels)).size, worldIds.length);
  const s = await Simulation.create();
  t.after(() => s.dispose());
  const a = new ApplicationSession(s);
  for (const id of worldIds) {
    assert(a.select(id));
    a.setInput(-0.29, 0.64);
    for (let i = 0; i < 260; i++) {
      a.tick();
      s.tick();
    }
    const f = a.world,
      display = worldDisplay[id];
    assert.equal(f.metric, a.metric.value);
    near(f.targetZ, s.target[2] - HOME[2]);
    near(f.deckZ, s.pose[2] - HOME[2]);
    assert.ok(Object.values(f).every(Number.isFinite), id);
    if (a.planarReading) {
      near(f.planeX, a.planarReading.x);
      near(f.planeY, a.planarReading.y);
    }
    for (const c of [display.left, display.right]) {
      assert.ok(Number.isFinite(c[2](f)), id + " " + c[0]);
      assert.ok(reading(c, f).endsWith(c[1]));
    }
  }
});

test("Rail travel, CNC radius and sweep frequency follow the gestures that feed the rendered worlds", async (t) => {
  const { s, a, advance } = await setup(t, "rail");
  a.setInput(0.2, -0.8);
  advance(2);
  const slow = { ...a.world };
  a.setInput(0.2, 0.8);
  advance(3);
  const fast = { ...a.world };
  assert.ok(slow.speed < 12 && fast.speed > 18);
  assert.ok(fast.distance > slow.distance + 40);
  assert.ok(Math.abs(fast.heading) > 0.01);
  a.select("machining");
  a.setInput(-0.8, -0.8);
  advance(2);
  const fine = { ...a.world };
  a.setInput(0.8, 0.8);
  advance(2);
  const wide = { ...a.world };
  assert.ok(wide.feed > 2 * fine.feed && wide.radius > 1.8 * fine.radius);
  near(wide.radius * 1000, a.planarReading!.radius!);
  a.select("vibration");
  a.setInput(-0.7, -0.5);
  advance(2);
  const low = { ...a.world };
  a.setInput(0.75, 0.6);
  advance(2);
  const high = { ...a.world };
  assert.ok(high.frequency > low.frequency + 0.65 && high.damping > low.damping + 0.07);
  assert.ok(!s.estop);
  t.diagnostic(
    "Rail " +
      slow.speed.toFixed(2) +
      "→" +
      fast.speed.toFixed(2) +
      " m/s; feed " +
      fine.feed.toFixed(1) +
      "→" +
      wide.feed.toFixed(1) +
      " mm/s; sweep " +
      low.frequency.toFixed(2) +
      "→" +
      high.frequency.toFixed(2) +
      " Hz",
  );
});
