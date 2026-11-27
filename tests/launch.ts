import assert from 'node:assert/strict';
import {
  aimLaunchAtCenter,
  updateLaunch,
  launchVelocity,
  DEFAULT_LAUNCH,
} from '../lib/launch';
for (const [x, y] of [
  [0.1, 0.08],
  [-0.1, 0.08],
  [-0.1, -0.08],
  [0.1, -0.08],
  [0, 0.1],
  [0.1, 0],
]) {
  const initial = {
    ...DEFAULT_LAUNCH,
    x,
    y,
    height: 0.23,
    elevation: 25,
    speed: 0.42,
  };
  const aimed = aimLaunchAtCenter(initial),
    v = launchVelocity(aimed);
  assert.equal(aimed.x, x);
  assert.equal(aimed.y, y);
  assert.equal(aimed.height, 0.23);
  assert.equal(aimed.elevation, 25);
  assert.equal(aimed.speed, 0.42);
  assert(x * v.x + y * v.y < 0, 'Horizontal velocity points toward center');
  assert(
    Math.abs(x * v.y - y * v.x) < 1e-10,
    'Velocity aligns with the center vector',
  );
  const moved = updateLaunch(aimed, { x: -x, y: -y }),
    mv = launchVelocity(moved);
  assert(moved.x * mv.x + moved.y * mv.y < 0, 'Changing XY updates locked aim');
  assert.equal(updateLaunch(moved, { azimuth: 30 }).aimAtCenter, false);
}
const origin = aimLaunchAtCenter({ ...DEFAULT_LAUNCH, x: 0, y: 0 });
assert.equal(origin.speed, 0);
assert(Object.values(launchVelocity(origin)).every(Number.isFinite));
console.log(
  'Center aiming passed: quadrants, preserved input, live XY changes, manual release and origin.',
);
