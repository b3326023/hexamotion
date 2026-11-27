import * as T from "three";
import type { WorldView } from "./types";
import {
  batch,
  box,
  finishTexture,
  fit,
  glow,
  group,
  mat,
  mesh,
  oval,
  placard,
  ring,
  seeded,
  tex,
  tube,
  v,
  wire,
  type XYZ,
} from "./experience-art";

function buildFilm(manager?: T.LoadingManager) {
  const film = new T.Scene(),
    cam = new T.PerspectiveCamera(62, 2.12, 0.045, 2400),
    loader = new T.TextureLoader(manager);
  let revision = 0;
  const sky = finishTexture(
    loader.load("/worlds/flight/alpine-sky.webp", () => {
      revision++;
    }),
  );
  sky.mapping = T.EquirectangularReflectionMapping;
  film.background = sky;
  film.backgroundIntensity = 0.97;
  film.fog = new T.FogExp2("#9fbbc5", 0.0016);
  const ortho = finishTexture(
    loader.load("/worlds/flight/oberland.webp", () => {
      revision++;
    }),
  );
  const terrain = new T.PlaneGeometry(1420, 1420, 256, 256).rotateX(-Math.PI / 2);
  const summit = new T.Mesh(terrain, new T.MeshBasicMaterial({ map: ortho, color: "#f2f5ee" }));
  film.add(summit);
  let dem: Uint16Array | null = null;
  const abort = new AbortController();
  let disposed = false;
  const path = (a: number) => v(-95 + 106 * Math.sin(a), 0, -168 + 69 * Math.cos(a));
  function height(x: number, z: number) {
    if (!dem) return 38;
    const tx = T.MathUtils.clamp((x / 1420 + 0.5) * 256, 0, 255.99),
      ty = T.MathUtils.clamp((z / 1420 + 0.5) * 256, 0, 255.99),
      ix = Math.floor(tx),
      iy = Math.floor(ty),
      u = tx - ix,
      w = ty - iy;
    const a = dem[iy * 257 + ix] * (1 - u) + dem[iy * 257 + ix + 1] * u,
      b = dem[(iy + 1) * 257 + ix] * (1 - u) + dem[(iy + 1) * 257 + ix + 1] * u;
    return (a * (1 - w) + b * w) * (1420 / 40320);
  }
  function sample(a: number) {
    const p = path(a);
    const look = path(a + 0.065),
      prev = path(a - 0.065);
    p.y =
      Math.max(height(p.x, p.z), height(look.x, look.z) * 0.55 + height(prev.x, prev.z) * 0.45) +
      9 +
      3.8 * Math.sin(a * 8) +
      1.65 * Math.sin(a * 16);
    return p;
  }
  const red = new T.MeshBasicMaterial({ color: "#d45925" }),
    steel = new T.MeshBasicMaterial({ color: "#748293" }),
    grey = new T.MeshBasicMaterial({ color: "#676c6b" });
  const rails = group(film);
  function makeRide() {
    const pts = Array.from({ length: 320 }, (_, i) => sample((i / 320) * Math.PI * 2));
    for (const offset of [-0.72, 0.72]) {
      const line = pts.map((p, i) => {
        const tangent = pts[(i + 1) % pts.length]
          .clone()
          .sub(pts[(i + pts.length - 1) % pts.length])
          .normalize();
        return p
          .clone()
          .add(v(tangent.z * 0.72, 0, -tangent.x * 0.72).multiplyScalar(Math.sign(offset)));
      });
      mesh(rails, new T.TubeGeometry(new T.CatmullRomCurve3(line, true), 440, 0.11, 7, true), red);
    }
    for (let j = 0; j < 392; j++) {
      const a = (j / 392) * Math.PI * 2,
        p = sample(a),
        q = sample(a + 0.003);
      const tangent = q.clone().sub(p).normalize();
      const right = v(tangent.z, 0, -tangent.x).normalize();
      const t = box(rails, steel, [1.62, 0.16, 0.17], p.toArray() as XYZ);
      t.position.y -= 0.1;
      t.rotation.y = Math.atan2(tangent.x, tangent.z);
      if (j % 8 === 0) {
        const top = p.clone().addScaledVector(right, 0.11);
        top.y -= 0.14;
        tube(
          rails,
          grey,
          [top.x, height(top.x, top.z) - 0.12, top.z],
          top.toArray() as XYZ,
          0.22,
          8,
        );
      }
    }
    batch(rails);
  }
  const url = "/worlds/flight/oberland.elev";
  manager?.itemStart(url);
  void fetch(url, { signal: abort.signal })
    .then((r) => {
      if (!r.ok) throw new Error("DEM");
      return r.arrayBuffer();
    })
    .then((b) => {
      if (disposed) return;
      dem = new Uint16Array(b);
      if (dem.length !== 257 * 257) throw new Error("DEM dimensions");
      const p = terrain.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, (dem[i] * 1420) / 40320);
      p.needsUpdate = true;
      terrain.computeBoundingSphere();
      makeRide();
      revision++;
    })
    .catch(() => {
      if (!disposed) manager?.itemError(url);
    })
    .finally(() => manager?.itemEnd(url));
  const target = new T.WebGLRenderTarget(704, 332, {
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
    depthBuffer: true,
  });
  target.texture.colorSpace = T.SRGBColorSpace;
  const look = v(),
    from = v();
  function update(a: number) {
    const u = a / 8 - 0.76,
      eye = sample(u),
      front = sample(u + 0.033);
    from.copy(eye);
    from.y += 1.12;
    look.copy(front);
    look.y += 1.04;
    cam.position.copy(from);
    cam.up.set(Math.sin(a * 2) * 0.055, 1, 0);
    cam.lookAt(look);
  }
  return {
    target,
    scene: film,
    camera: cam,
    update,
    get revision() {
      return revision;
    },
    dispose() {
      disposed = true;
      abort.abort();
      target.dispose();
      sky.dispose();
      ortho.dispose();
      const geos = new Set<T.BufferGeometry>(),
        mats = new Set<T.Material>();
      film.traverse((o) => {
        if (o instanceof T.Mesh) {
          geos.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
        }
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export function createWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(38, 2, 0.07, 100),
    film = buildFilm(manager);
  scene.background = new T.Color("#17101c");
  scene.environmentIntensity = 0.4;
  scene.add(new T.HemisphereLight("#e5dfe9", "#251d26", 0.83));
  const key = new T.DirectionalLight("#ffccad", 2.02);
  key.position.set(-7, 9, 5);
  scene.add(key);
  const bounce = new T.DirectionalLight("#9ab9da", 1.5);
  bounce.position.set(0, 5, -8);
  scene.add(bounce);
  const set = group(scene),
    walnut = mat("#805742", 0.22, 0.59),
    charcoal = mat("#272333", 0.25, 0.75),
    black = mat("#1e2027", 0.5, 0.57),
    trim = mat("#594751", 0.48, 0.47),
    steel = mat("#888d93", 0.74, 0.3),
    copper = mat("#a36d47", 0.59, 0.43),
    crimson = mat("#9b343b", 0.05, 0.79),
    rose = mat("#bc5960", 0.13, 0.74),
    ruby = mat("#64272e", 0.13, 0.69),
    leather = mat("#362d31", 0.12, 0.68),
    amber = glow("#d78e59", 0.94);
  const cloth = tex(
    (c, w, h) => {
      const rnd = seeded(25);
      c.fillStyle = "#95818c";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 24000; i++) {
        const n = Math.floor(rnd() * 205);
        c.fillStyle = "rgba(" + n + "," + n + "," + n + ",.25)";
        c.fillRect(rnd() * w, rnd() * h, 1.6, 1.2);
      }
    },
    256,
    128,
  );
  cloth.wrapS = cloth.wrapT = T.RepeatWrapping;
  cloth.repeat.set(5, 5);
  const carpet = new T.MeshStandardMaterial({ map: cloth, color: "#57414c", roughness: 1 });
  box(set, carpet, [15, 0.3, 17], [0, -0.18, -0.5]);
  box(set, charcoal, [15, 7.3, 0.25], [0, 3.47, -8.1]);
  for (const side of [-1, 1]) {
    const x = side * 7.0;
    box(set, charcoal, [0.3, 7.2, 17], [x, 3.4, -0.4]);
    for (let i = 0; i < 36; i++) {
      const z = -7.9 + i * 0.43;
      box(set, walnut, [0.16, 6.25, 0.17], [x - side * 0.21, 3.2, z]);
      if (i % 5 === 0) box(set, amber, [0.028, 2.1, 0.032], [x - side * 0.302, 3.6, z]);
    }
    for (let j = 0; j < 3; j++) {
      const z = -5 + j * 4;
      const o = box(set, black, [0.47, 0.72, 0.55], [x - side * 0.45, 4.14, z], 0.07);
      o.rotation.z = side * -0.17;
      oval(set, trim, [0.1, 0.2, 0.18], [x - side * 0.7, 4.1, z]);
    }
  }
  for (let j = 0; j < 5; j++) {
    const z = -3.2 + j * 1.8,
      y = j * 0.25;
    box(set, carpet, [11.4, 0.28 + y, 1.81], [0, -0.02 + y / 2, z]);
    for (const x of [-5.43, 5.43]) box(set, amber, [0.35, 0.03, 0.045], [x, 0.131 + y, z - 0.88]);
  }
  for (const x of [-6.34, 6.34]) {
    box(set, black, [0.87, 1.92, 0.17], [x, 0.98, -7.91]);
    placard(set, "EXIT", [x, 2.06, -7.79], 0.49, 0.16, "#e1f9ee", "#34544f");
  }
  const screenW = 12.1,
    screenH = 4.86,
    z0 = -7.39,
    y0 = 3.48;
  const sg = new T.PlaneGeometry(screenW, screenH, 44, 1),
    sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, 0.55 * (sp.getX(i) / (screenW / 2)) ** 2);
  sp.needsUpdate = true;
  sg.computeVertexNormals();
  const screen = mesh(
    scene,
    sg,
    new T.MeshBasicMaterial({ map: film.target.texture, toneMapped: false }),
    0,
    y0,
    z0,
  );
  screen.castShadow = false;
  for (const sign of [-1, 1]) {
    const points: XYZ[] = Array.from({ length: 21 }, (_, k) => {
      const x = (k / 20 - 0.5) * screenW;
      return [x, y0 + sign * (screenH / 2 + 0.07), z0 + 0.55 * (x / (screenW / 2)) ** 2];
    });
    wire(set, trim, points, 0.072, 36);
  }
  box(set, trim, [0.12, screenH + 0.24, 0.12], [-screenW / 2 - 0.04, y0, z0 + 0.55]);
  box(set, trim, [0.12, screenH + 0.24, 0.12], [screenW / 2 + 0.04, y0, z0 + 0.55]);
  const pods: { pod: T.Group; origin: T.Vector3 }[] = [];
  const skins = [
      mat("#9c6955", 0.07, 0.76),
      mat("#bf9274", 0.07, 0.76),
      mat("#825643", 0.08, 0.71),
    ],
    hair = [mat("#393234", 0.06, 0.82), mat("#514135", 0.09, 0.8)];
  for (let row = 0; row < 3; row++) {
    const baseY = row * 0.25 + 0.14,
      z = -2.98 + row * 2.54;
    for (const side of [-1, 1]) {
      const x = side * 2.31,
        pod = group(scene, x, baseY + 0.35, z),
        origin = pod.position.clone();
      pod.name = "Motion seat bank " + row + "/" + side;
      pods.push({ pod, origin });
      box(set, black, [3.74, 0.2, 1.27], [x, baseY + 0.11, z], 0.08);
      box(pod, black, [3.85, 0.17, 1.46], [0, 0.02, 0], 0.08);
      for (const dx of [-1.48, 1.48])
        for (const dz of [-0.46, 0.46])
          tube(
            set,
            steel,
            [x + dx, baseY + 0.11, z + dz],
            [x + dx * 0.88, baseY + 0.32, z + dz * 0.78],
            0.065,
            9,
          );
      for (let j = -1; j <= 1; j++) {
        const cx = j * 1.18;
        box(pod, ruby, [1.01, 0.22, 1.01], [cx, 0.35, -0.1], 0.11);
        box(pod, crimson, [0.9, 0.18, 0.81], [cx, 0.5, -0.13], 0.09);
        const back = group(pod, cx, 0.87, 0.37);
        back.rotation.x = 0.095;
        box(back, ruby, [1.07, 1.04, 0.23], [0, 0, 0], 0.15);
        box(back, leather, [0.83, 0.62, 0.065], [0, -0.13, 0.11], 0.071);
        for (const s of [-1, 1]) {
          wire(
            back,
            crimson,
            [
              [s * 0.4, -0.32, 0.152],
              [s * 0.42, -0.23, 0.148],
              [s * 0.42, 0.1, 0.145],
              [s * 0.36, 0.16, 0.141],
            ],
            0.011,
            8,
          );
          box(back, copper, [0.056, 0.026, 0.037], [s * 0.34, -0.31, 0.15], 0.009);
        }
        box(back, ruby, [0.77, 0.24, 0.08], [0, 0.31, 0.114], 0.07);
        box(back, copper, [0.21, 0.029, 0.029], [0, 0.31, 0.163], 0.008);
        box(back, crimson, [0.96, 0.98, 0.23], [0, 0.015, -0.042], 0.14);
        box(back, rose, [0.65, 0.21, 0.16], [0, 0.38, -0.12], 0.087);
        for (const s of [-1, 1]) {
          box(pod, black, [0.15, 0.49, 0.7], [cx + s * 0.54, 0.59, -0.08], 0.07);
          box(pod, leather, [0.17, 0.115, 0.75], [cx + s * 0.54, 0.84, -0.1], 0.05);
          ring(pod, copper, 0.048, 0.012, "y", [cx + s * 0.54, 0.903, -0.36]);
        }
        if ((row + j + (side > 0 ? 1 : 0) + 4) % 3 !== 0) {
          const skin = skins[(row + j + 4) % 3];
          oval(pod, skin, [0.189, 0.252, 0.176], [cx, 1.39, 0.21]);
          oval(pod, leather, [0.36, 0.27, 0.169], [cx, 1.065, 0.18]);
          tube(pod, skin, [cx, 1.075, 0.22], [cx, 1.23, 0.22], 0.077);
          for (const side of [-1, 1])
            oval(pod, skin, [0.035, 0.058, 0.038], [cx + 0.174 * side, 1.38, 0.2]);
          const head = oval(pod, hair[(row + j + 3) % 2], [0.194, 0.198, 0.181], [cx, 1.45, 0.24]);
          head.rotation.x = 0.13;
        }
      }
      batch(pod);
    }
  }
  batch(set);
  let filmTime = 0,
    painted = -Infinity,
    revision = -1;
  scene.onBeforeRender = (renderer) => {
    if (painted === filmTime && revision === film.revision) return;
    painted = filmTime;
    revision = film.revision;
    const output = renderer.getRenderTarget(),
      auto = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(film.target);
    try {
      renderer.render(film.scene, film.camera);
    } finally {
      renderer.setRenderTarget(output);
      renderer.xr.enabled = auto;
    }
  };
  return {
    scene,
    camera,
    update(f, aspect) {
      filmTime = f.t;
      film.update(f.phase);
      for (const { pod, origin } of pods) {
        pod.position.copy(origin).add(v(f.deckX * 2, f.deckZ * 2, -f.deckY * 2));
        pod.rotation.set(-f.deckPitch, f.yaw, f.deckRoll, "YXZ");
      }
      fit(camera, aspect, [3.22, 3.64, 7.28], [0, 2.28, -4.19], 48, 1.74);
    },
    dispose: () => {
      scene.onBeforeRender = () => {};
      film.dispose();
    },
  };
}
