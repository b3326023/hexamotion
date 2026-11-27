import * as T from "three";
const TAU = 2 * Math.PI;

function roundedPolygon(pts: T.Vector2[], round = 0.08, shape: T.Shape | T.Path = new T.Shape()) {
  const start = pts[0].clone().lerp(pts[pts.length - 1], round);
  shape.moveTo(start.x, start.y);
  pts.forEach((p, i) => {
    const a = p.clone().lerp(pts[(i + pts.length - 1) % pts.length], round);
    const b = p.clone().lerp(pts[(i + 1) % pts.length], round);
    shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  shape.closePath();
  return shape;
}
function circleHole(shape: T.Shape, x: number, y: number, r: number) {
  const p = new T.Path();
  p.absarc(x, y, r, 0, TAU, true);
  shape.holes.push(p);
}
export function plate(
  radius: number,
  z: number,
  thickness: number,
  rotation: number,
  bevel: number,
  windows = false,
) {
  const shape = roundedPolygon(
    Array.from({ length: 6 }, (_, i) => {
      const a = rotation + (TAU * i) / 6;
      return new T.Vector2(radius * Math.cos(a), radius * Math.sin(a));
    }),
    0.095,
  ) as T.Shape;
  if (windows) {
    circleHole(shape, 0, 0, radius * 0.235);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + rotation;
      const s = [
        [-0.16, 0.75],
        [-0.17, 0.53],
        [0, 0.39],
        [0.17, 0.53],
        [0.16, 0.75],
      ];
      const pts = s.map(
        ([side, r]) =>
          new T.Vector2(
            radius * (r * Math.cos(a) - side * Math.sin(a)),
            radius * (r * Math.sin(a) + side * Math.cos(a)),
          ),
      );
      shape.holes.push(roundedPolygon(pts, 0.19, new T.Path()) as T.Path);
    }
  }
  return new T.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  }).translate(0, 0, z + bevel);
}

/** Collision skin of the perforated casting and its six vibration isolators, in metres. */
export function baseCastingMesh(baseRadius: number): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const R = baseRadius + 0.072;
  const shapes: T.BufferGeometry[] = [plate(R, -0.046, 0.081, 0, 0.002, true)];
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    shapes.push(
      new T.CylinderGeometry(0.036, 0.042, 0.027, 18)
        .rotateX(Math.PI / 2)
        .translate(R * 0.83 * Math.cos(a), R * 0.83 * Math.sin(a), -0.059),
    );
  }
  const positions: number[] = [],
    indices: number[] = [];
  for (const shape of shapes) {
    const p = shape.getAttribute("position"),
      offset = positions.length / 3;
    for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
    if (shape.index) {
      for (let i = 0; i < shape.index.count; i++) indices.push(offset + shape.index.getX(i));
    } else for (let i = 0; i < p.count; i++) indices.push(offset + i);
    shape.dispose();
  }
  return { vertices: new Float32Array(positions), indices: new Uint32Array(indices) };
}
