import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type XYZ = [number, number, number];
export const V = (a: XYZ) => new T.Vector3(...a);
export const tau = Math.PI * 2;
export const metal = (color: T.ColorRepresentation, m = 0.67, r = 0.36) =>
  new T.MeshStandardMaterial({ color, metalness: m, roughness: r });
export const glow = (color: T.ColorRepresentation, power = 1) =>
  new T.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: power,
    roughness: 0.34,
    metalness: 0.16,
  });
export function group(parent: T.Object3D, at: XYZ = [0, 0, 0]) {
  const g = new T.Group();
  g.position.set(...at);
  parent.add(g);
  return g;
}
export function mesh(g: T.Object3D, geometry: T.BufferGeometry, m: T.Material, p: XYZ) {
  const part = new T.Mesh(geometry, m);
  part.position.set(...p);
  part.castShadow = true;
  part.receiveShadow = true;
  g.add(part);
  return part;
}
export function box(g: T.Object3D, d: XYZ, p: XYZ, m: T.Material, r = 0) {
  return mesh(
    g,
    r
      ? new RoundedBoxGeometry(...d, 2, Math.min(r, ...d.map((v) => v * 0.4)))
      : new T.BoxGeometry(...d),
    m,
    p,
  );
}
export function cyl(
  g: T.Object3D,
  top: number,
  bottom: number,
  h: number,
  p: XYZ,
  m: T.Material,
  n = 32,
) {
  return mesh(g, new T.CylinderGeometry(top, bottom, h, n), m, p);
}
export function rod(g: T.Object3D, a: XYZ, b: XYZ, r: number, m: T.Material, n = 12) {
  const va = V(a),
    vb = V(b),
    delta = vb.sub(va),
    part = cyl(g, r, r, delta.length(), [0, 0, 0], m, n);
  part.position.copy(va).addScaledVector(delta, 0.5);
  part.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
  return part;
}
export function cable(g: T.Object3D, points: XYZ[], radius: number, mat: T.Material, res = 30) {
  return mesh(
    g,
    new T.TubeGeometry(new T.CatmullRomCurve3(points.map(V)), res, radius, 8, false),
    mat,
    [0, 0, 0],
  );
}
export function ring(
  g: T.Object3D,
  r: number,
  thickness: number,
  p: XYZ,
  m: T.Material,
  axis: "x" | "y" | "z" = "y",
  angle = tau,
) {
  const o = mesh(
    g,
    new T.TorusGeometry(r, thickness, 9, Math.max(24, Math.round((64 * angle) / tau)), angle),
    m,
    p,
  );
  if (axis === "y") o.rotation.x = Math.PI / 2;
  else if (axis === "x") o.rotation.y = Math.PI / 2;
  return o;
}
export function bolt(g: T.Object3D, p: XYZ, r: number, m: T.Material, dark: T.Material) {
  cyl(g, r, r, r * 0.43, p, m, 12);
  cyl(g, r * 0.49, r * 0.49, r * 0.06, [p[0], p[1] + r * 0.24, p[2]], dark, 6);
}
export function texture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") return new T.Texture();
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  draw(ctx);
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function placard(
  g: T.Object3D,
  p: XYZ,
  w: number,
  h: number,
  main: string,
  sub: string,
  fg = "#f4f1db",
  bg = "#242d30",
) {
  const map = texture(768, 200, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 768, 200);
    c.fillStyle = fg;
    c.fillRect(16, 24, 6, 151);
    c.font = "600 66px Arial, sans-serif";
    c.fillText(main, 46, 94, 699);
    c.font = "500 34px monospace";
    c.fillText(sub, 48, 153, 682);
  });
  return mesh(
    g,
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({ map, toneMapped: false, side: T.DoubleSide }),
    p,
  );
}
export function panelTexture(color: string, holeColor: string, pitch = 32, holes = true) {
  const map = texture(256, 256, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 256);
    let seed = 8979;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1500; i++) {
      c.fillStyle = i % 2 ? "rgba(255,255,255,.055)" : "rgba(0,0,0,.075)";
      c.fillRect(random() * 256, random() * 256, 2 + 25 * random(), 0.45);
    }
    if (holes)
      for (let y = pitch / 2; y < 256; y += pitch)
        for (let x = pitch / 2; x < 256; x += pitch) {
          c.beginPath();
          c.arc(x, y + 1.35, 3.2, 0, tau);
          c.fillStyle = "#a9a6a1";
          c.fill();
          c.beginPath();
          c.arc(x, y, 3.25, 0, tau);
          c.fillStyle = holeColor;
          c.fill();
        }
  });
  map.wrapS = map.wrapT = T.RepeatWrapping;
  return map;
}
export function floor(g: T.Object3D, y: number, size: number, m: T.Material) {
  const f = mesh(g, new T.PlaneGeometry(size, size), m, [0, y, 0]);
  f.rotation.x = -Math.PI / 2;
  f.castShadow = false;
  return f;
}
export function shadow(
  g: T.Object3D,
  x: number,
  z: number,
  w: number,
  d: number,
  y = 0.01,
  alpha = 0.58,
) {
  const map = texture(128, 128, (c) => {
    const gradient = c.createRadialGradient(64, 64, 12, 64, 64, 62);
    gradient.addColorStop(0, "rgba(0,0,0,.96)");
    gradient.addColorStop(0.55, "rgba(0,0,0,.57)");
    gradient.addColorStop(1, "transparent");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 128, 128);
  });
  const o = mesh(
    g,
    new T.PlaneGeometry(w, d),
    new T.MeshBasicMaterial({ map, transparent: true, opacity: alpha, depthWrite: false }),
    [x, y, z],
  );
  o.rotation.x = -Math.PI / 2;
  o.castShadow = false;
  return o;
}
export function compact(g: T.Object3D) {
  for (const child of g.children.slice()) if (child instanceof T.Group) compact(child);
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const o of g.children)
    if (
      o instanceof T.Mesh &&
      !Array.isArray(o.material) &&
      !o.material.transparent &&
      !o.userData.moving
    ) {
      const list = batches.get(o.material) || [];
      list.push(o);
      batches.set(o.material, list);
    }
  for (const [material, list] of batches) {
    if (list.length < 3) continue;
    const parts: listGeometry[] = [];
    for (const part of list) {
      part.updateMatrix();
      const src = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      for (const key of Object.keys(src.attributes))
        if (!["position", "normal", "uv"].includes(key)) src.deleteAttribute(key);
      src.applyMatrix4(part.matrix);
      parts.push(src);
    }
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    if (!merged) continue;
    const out = new T.Mesh(merged, material);
    out.castShadow = list.some((x) => x.castShadow);
    out.receiveShadow = true;
    g.add(out);
    for (const part of list) {
      g.remove(part);
      part.geometry.dispose();
    }
  }
}
type listGeometry = T.BufferGeometry;
export function studio(
  manager: T.LoadingManager | undefined,
  image: string,
  look: {
    eye: XYZ;
    target: XYZ;
    fov?: number;
    bg?: number;
    blur?: number;
    rot?: number;
    env?: number;
    key?: number;
  },
) {
  const scene = new T.Scene(),
    cam = new T.PerspectiveCamera(look.fov ?? 38, 1, 0.035, 180);
  scene.background = new T.Color(0x313b43);
  const target = V(look.target),
    delta = V(look.eye).sub(target);
  let disposed = false;
  let backdrop: T.Texture | undefined;
  if (typeof document !== "undefined")
    backdrop = new T.TextureLoader(manager).load(image, (t) => {
      if (disposed) {
        t.dispose();
        return;
      }
      t.colorSpace = T.SRGBColorSpace;
      t.mapping = T.EquirectangularReflectionMapping;
      scene.background = t;
      scene.environment = t;
      scene.backgroundRotation.y = scene.environmentRotation.y = look.rot ?? 0;
      scene.backgroundIntensity = look.bg ?? 0.8;
      scene.backgroundBlurriness = look.blur ?? 0.015;
      scene.environmentIntensity = look.env ?? 1.0;
    });
  scene.add(new T.HemisphereLight(0xeaf3ff, 0x5b5452, 1.05));
  const key = new T.DirectionalLight(0xffecce, look.key ?? 3.0);
  key.position.set(-3.7, 7.5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 30 });
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.009;
  scene.add(key, key.target);
  const fill = new T.DirectionalLight(0xb0d4ff, 1.3);
  fill.position.set(4, 3, -5);
  scene.add(fill);
  return {
    scene,
    camera: cam,
    compose(aspect: number) {
      cam.aspect = aspect;
      cam.position.copy(target).addScaledVector(delta, Math.max(1, 1.5 / Math.max(0.35, aspect)));
      cam.lookAt(target);
      cam.updateProjectionMatrix();
    },
    disposed: () => disposed,
    model(
      path: string,
      parent: T.Object3D,
      height: number,
      turn = 0,
      filter?: (g: T.Group) => void,
    ) {
      if (typeof document === "undefined") return;
      new GLTFLoader(manager).load(path, ({ scene: model }) => {
        if (disposed) {
          model.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.geometry.dispose();
              for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                for (const t of Object.values(m)) if (t instanceof T.Texture) t.dispose();
                m.dispose();
              }
            }
          });
          return;
        }
        filter?.(model);
        model.rotation.y = turn;
        model.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(model),
          center = bounds.getCenter(new T.Vector3()),
          size = bounds.getSize(new T.Vector3());
        const scale = height / Math.max(1e-5, size.y);
        model.scale.multiplyScalar(scale);
        model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        model.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        parent.add(model);
      });
    },
    dispose() {
      disposed = true;
      backdrop?.dispose();
      key.shadow.map?.dispose();
    },
  };
}
