import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export type XYZ = [number, number, number];
export const mat = (color: T.ColorRepresentation, metalness = 0.15, roughness = 0.55) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
export const glow = (color: T.ColorRepresentation, intensity = 1) =>
  new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
export function group(parent: T.Object3D, x = 0, y = 0, z = 0) {
  const g = new T.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
export function mesh(parent: T.Object3D, g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) {
  const o = new T.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
export function box(parent: T.Object3D, m: T.Material, sz: XYZ, pos: XYZ = [0, 0, 0], bevel = 0) {
  return mesh(
    parent,
    bevel > 0
      ? new RoundedBoxGeometry(...sz, 2, Math.min(bevel, ...sz.map((a) => a * 0.48)))
      : new T.BoxGeometry(...sz),
    m,
    ...pos,
  );
}
export function tube(
  parent: T.Object3D,
  m: T.Material,
  a: XYZ,
  b: XYZ,
  r: number,
  segments = 10,
  r2 = r,
) {
  const from = v(...a),
    to = v(...b),
    dir = to.clone().sub(from);
  const g = mesh(parent, new T.CylinderGeometry(r2, r, dir.length(), segments), m);
  g.position.copy(from).addScaledVector(dir, 0.5);
  g.quaternion.setFromUnitVectors(v(0, 1, 0), dir.normalize());
  return g;
}
export function oval(parent: T.Object3D, m: T.Material, sz: XYZ, pos: XYZ) {
  const o = mesh(parent, new T.SphereGeometry(1, 24, 14), m, ...pos);
  o.scale.set(...sz);
  return o;
}
export function wire(parent: T.Object3D, m: T.Material, points: XYZ[], r: number, n = 30) {
  return mesh(
    parent,
    new T.TubeGeometry(new T.CatmullRomCurve3(points.map((p) => v(...p))), n, r, 7, false),
    m,
  );
}
export function turn(
  parent: T.Object3D,
  m: T.Material,
  profile: [number, number][],
  axis: "x" | "y" | "z",
  pos: XYZ,
  segments = 48,
) {
  const o = mesh(
    parent,
    new T.LatheGeometry(
      profile.map(([r, h]) => new T.Vector2(Math.max(0.0001, r), h)),
      segments,
    ),
    m,
    ...pos,
  );
  if (axis === "x") o.rotation.z = -Math.PI / 2;
  if (axis === "z") o.rotation.x = Math.PI / 2;
  return o;
}
export function ring(
  parent: T.Object3D,
  m: T.Material,
  r: number,
  thick: number,
  axis: "x" | "y" | "z",
  pos: XYZ,
) {
  const o = mesh(parent, new T.TorusGeometry(r, thick, 8, 48), m, ...pos);
  if (axis === "x") o.rotation.y = Math.PI / 2;
  if (axis === "y") o.rotation.x = Math.PI / 2;
  return o;
}
export function tex(
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 512,
  h = 256,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
export function placard(
  parent: T.Object3D,
  label: string,
  pos: XYZ,
  w: number,
  h: number,
  ink: string,
  bg: string,
  rotation = 0,
) {
  const map = tex(
    (c, a, b) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, a, b);
      c.font = "600 " + Math.floor(b * 0.57) + "px Arial";
      c.fillStyle = ink;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(label, a * 0.5, b * 0.54, a * 0.9);
    },
    512,
    96,
  );
  const m = new T.MeshBasicMaterial({ map, side: T.DoubleSide, toneMapped: false });
  const o = mesh(parent, new T.PlaneGeometry(w, h), m, ...pos);
  o.rotation.y = rotation;
  return o;
}
/** Consolidate static children once. Dynamic assemblies are placed in separate groups. */
export function batch(parent: T.Group) {
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert();
  const sets = new Map<T.Material, { geoms: T.BufferGeometry[]; originals: T.BufferGeometry[] }>();
  parent.traverse((o) => {
    if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
    const geom = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const key of Object.keys(geom.attributes))
      if (!["position", "normal", "uv"].includes(key)) geom.deleteAttribute(key);
    if (!geom.attributes.uv)
      geom.setAttribute(
        "uv",
        new T.Float32BufferAttribute(new Float32Array(geom.attributes.position.count * 2), 2),
      );
    geom.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    const b = sets.get(o.material) ?? { geoms: [], originals: [] };
    b.geoms.push(geom);
    b.originals.push(o.geometry);
    sets.set(o.material, b);
  });
  parent.clear();
  for (const [m, { geoms, originals }] of sets) {
    const out = mergeGeometries(geoms);
    if (out) mesh(parent, out, m);
    for (const g of geoms) g.dispose();
    for (const g of new Set(originals)) g.dispose();
  }
}
export function sun(
  scene: T.Scene,
  pos: XYZ,
  power: number,
  color: T.ColorRepresentation,
  span = 14,
) {
  const d = new T.DirectionalLight(color, power);
  d.position.set(...pos);
  d.castShadow = true;
  d.shadow.mapSize.set(1024, 1024);
  Object.assign(d.shadow.camera, {
    left: -span,
    right: span,
    top: span,
    bottom: -span,
    near: 0.1,
    far: 90,
  });
  d.shadow.normalBias = 0.018;
  d.shadow.bias = -0.00025;
  scene.add(d, d.target);
  return d;
}
export function fit(
  camera: T.PerspectiveCamera,
  aspect: number,
  position: XYZ,
  target: XYZ,
  fov: number,
  minAspect = 1.65,
) {
  camera.position.set(...position);
  camera.lookAt(...target);
  const a = Math.max(0.2, aspect);
  camera.aspect = a;
  camera.fov = T.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(T.MathUtils.degToRad(fov * 0.5)) * Math.max(1, minAspect / a)),
  );
  camera.updateProjectionMatrix();
}
export function finishTexture(texture: T.Texture) {
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
