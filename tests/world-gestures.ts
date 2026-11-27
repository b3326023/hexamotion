import assert from "node:assert/strict";
import test from "node:test";
import { WorldGesture, worldKeyCommand, type SceneCommand } from "../lib/world-gesture";
import { worldIds, type WorldId } from "../lib/worlds/types";

const extent = { width: 420, height: 300 };
const zero = { x: 0, y: 0 };
const near = (a: number, b: number, delta = 1e-7) =>
  assert.ok(Math.abs(a - b) < delta, `${a} expected ${b}`);
const isVector = (id: WorldId) => ["marine", "seismic", "balance"].includes(id);

function drag(id: WorldId, dx: number, dy: number, value: SceneCommand = zero, fine = false) {
  const g = new WorldGesture(id);
  g.begin(10, { x: 140, y: 130 }, 0);
  g.move(10, { x: 140 + dx, y: 130 + dy });
  return g.sample(value, extent, fine);
}
function twin(id: WorldId, turn: number, spread: number, dx: number, dy: number, reverse = false) {
  const g = new WorldGesture(id);
  g.begin(10, { x: 130, y: 150 }, 0);
  g.begin(20, { x: 230, y: 150 }, 1);
  const vx = (50 + spread / 2) * Math.cos(turn),
    vy = (50 + spread / 2) * Math.sin(turn);
  const samples = [
    { id: 10, x: 180 + dx - vx, y: 150 + dy - vy },
    { id: 20, x: 180 + dx + vx, y: 150 + dy + vy },
  ];
  for (const s of reverse ? samples.reverse() : samples) g.move(s.id, { x: s.x, y: s.y });
  return g.sample(zero, extent);
}

for (const id of worldIds) {
  test(
    id + ": no start jump; incremental single-pointer motion can reverse at a limit and fine tune",
    () => {
      const g = new WorldGesture(id),
        initial = { x: 0.21, y: 0.35 };
      g.begin(3, { x: 200, y: 150 }, 30);
      assert.equal(g.sample(initial, extent), initial);
      const first = drag(id, 15, -12);
      assert.ok(first.x > 0);
      assert.ok(id === "flight" ? first.y < 0 : first.y > 0);
      const fine = drag(id, 15, -12, zero, true);
      assert.ok(Math.abs(fine.x) > 0 && Math.abs(fine.x) < Math.abs(first.x));
      assert.ok(Math.abs(fine.y) > 0 && Math.abs(fine.y) < Math.abs(first.y));
      const saturated = drag(id, 900, isVector(id) ? 16 : 0, { x: 0.99, y: 0 });
      assert.equal(saturated.x, 1);
      // At a vector sector edge, drag perpendicular to the actual commanded vector to turn back.
      const ang = id === "marine" ? 0.72 : id === "seismic" ? Math.PI / 2 : Math.PI / 3;
      const next = isVector(id)
        ? drag(id, -Math.cos(ang) * 4, -Math.sin(ang) * 4, saturated)
        : drag(id, -4, 0, saturated);
      assert.ok(next.x < 1 && next.x > 0.85);
      if (isVector(id)) assert.equal(drag(id, 0, 900).y, -1);
      else near(fine.x, first.x / 4);
      assert.deepEqual(g.sample(initial, extent), initial);
    },
  );
  test(
    id + ": second contact does not jump; rotation, spread or centroid map to their own axes",
    () => {
      const turn = twin(id, 0.24, 0, 0, 0),
        spread = twin(id, 0, 24, 0, 0),
        pan = twin(id, 0, 0, 20, -15);
      if (isVector(id) || id === "camera") {
        assert.ok(turn.x > 0);
        near(turn.y, 0);
        near(spread.x, 0);
        assert.ok(spread.y > 0);
        near(pan.x, 0);
        near(pan.y, 0);
      } else if (["flight", "driving", "rail"].includes(id)) {
        assert.ok(turn.x > 0);
        near(turn.y, 0);
        near(spread.x, 0);
        near(spread.y, 0);
        near(pan.x, 0);
        assert.ok(id === "flight" ? pan.y < 0 : pan.y > 0);
      } else if (["optics", "docking", "photonics"].includes(id)) {
        const one = drag(id, 20, -15);
        near(pan.x, one.x / 4);
        near(pan.y, one.y / 4);
        near(turn.x, 0);
        near(turn.y, 0);
        near(spread.x, 0);
        near(spread.y, 0);
      } else {
        assert.ok(pan.x > 0);
        near(pan.y, 0);
        near(turn.x, 0);
        near(turn.y, 0);
        near(spread.x, 0);
        assert.ok(spread.y > 0);
      }
      assert.deepEqual(twin(id, 0.1, 19, -12, 7), twin(id, 0.1, 19, -12, 7, true));
    },
  );
}
test("pointer cancellation, handover and stale events cannot affect a later gesture", () => {
  const g = new WorldGesture("driving");
  g.begin(1, { x: 100, y: 80 }, 0);
  g.begin(2, { x: 220, y: 80 }, 2);
  assert.equal(g.begin(3, { x: 135, y: 58 }, 4), false);
  assert.equal(g.sample(zero, extent), zero);
  g.move(1, { x: 91, y: 65 });
  g.move(2, { x: 225, y: 97 });
  const before = g.sample(zero, extent);
  assert.ok(before.x > 0);
  g.move(1, { x: 444, y: 670 });
  g.end(1, 80, "touch", true);
  assert.equal(g.sample(before, extent), before);
  g.move(1, { x: 50, y: 70 });
  assert.equal(g.sample(before, extent), before);
  g.move(2, { x: 226, y: 97 });
  const after = g.sample(before, extent);
  near(after.x - before.x, 1 / (extent.width * 0.31));
  near(after.y, before.y);
  g.clear();
  assert.equal(g.contacts.size, 0);
  assert.equal(g.move(2, { x: 10, y: 33 }), false);
});
test("passing one finger through the other cannot flip a wheel by 180 degrees", () => {
  for (const id of ["flight", "driving", "camera", "rail", "marine", "seismic", "balance"] as const)
    near(twin(id, Math.PI, 0, 0, 0).x, 0);
});
test("only a nearby pair of short, distinct taps can centre; holds, movement and cancellations never centre", () => {
  const g = new WorldGesture("cinema");
  const tap = (t: number, x = 80, held = 40, cancelled = false) => {
    g.begin(1, { x, y: 70 }, t);
    return g.end(1, t + held, "touch", cancelled);
  };
  assert.equal(tap(0), false);
  assert.equal(tap(180), true);
  assert.equal(tap(340), false);
  assert.equal(tap(530, 80, 600), false);
  assert.equal(tap(1200), false);
  assert.equal(tap(1350, 80, 40, true), false);
  assert.equal(tap(1490), false);
  assert.equal(tap(1650, 155), false);
  g.clear();
  g.begin(1, { x: 80, y: 70 }, 1800);
  g.move(1, { x: 97, y: 70 });
  g.move(1, { x: 80, y: 70 });
  assert.equal(g.end(1, 1940, "touch"), false);
  assert.equal(tap(2030), false);
  g.begin(1, { x: 81, y: 70 }, 2140);
  g.begin(2, { x: 102, y: 60 }, 2150);
  g.end(2, 2180, "touch");
  assert.equal(g.end(1, 2210, "touch"), false);
  assert.equal(tap(2290), false);
});
test("keyboard has a neutral and fine movement, and down pulls the flight yoke", () => {
  for (const id of worldIds) {
    near(worldKeyCommand(id, zero, "ArrowDown", false)!.y, id === "flight" ? 0.04 : -0.04);
    near(worldKeyCommand(id, zero, "ArrowRight", true)!.x, 0.01);
    assert.deepEqual(worldKeyCommand(id, { x: -0.12, y: 0.44 }, "Home", false), zero);
    assert.equal(worldKeyCommand(id, zero, "Space", false), null);
  }
});
