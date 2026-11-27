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
  sun,
  tex,
  tube,
  v,
  wire,
  type XYZ,
} from "./experience-art";

const SEGMENTS = 112,
  near = -152,
  far = 100;
function trackOffset(s: number, phase: number, speed: number) {
  const k = 0.36 / speed;
  return (
    0.0022 * ((s * Math.cos(phase)) / k - (Math.sin(phase + k * s) - Math.sin(phase)) / (k * k))
  );
}
function trackAngle(s: number, phase: number, speed: number) {
  const k = 0.36 / speed;
  return Math.atan((0.0022 * (Math.cos(phase) - Math.cos(phase + k * s))) / k);
}
export function createWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(40, 2, 0.12, 660),
    loader = new T.TextureLoader(manager);
  const sky = finishTexture(loader.load("/worlds/driving/horizon.jpg"));
  sky.mapping = T.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.backgroundIntensity = 0.88;
  scene.fog = new T.FogExp2("#c7c2a6", 0.0082);
  scene.environmentIntensity = 0.74;
  scene.add(new T.HemisphereLight("#d7e5f0", "#77734e", 1.15));
  sun(scene, [-12, 17, 11], 2.8, "#ffe1aa", 21);
  const grass = finishTexture(loader.load("/worlds/driving/grass.jpg"));
  grass.wrapS = grass.wrapT = T.RepeatWrapping;
  grass.repeat.set(52, 62);
  const ground = mesh(
    scene,
    new T.PlaneGeometry(360, 320),
    new T.MeshStandardMaterial({ map: grass, color: "#a1ae78", roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  const grit = finishTexture(loader.load("/worlds/rail/ballast.jpg"));
  grit.wrapS = grit.wrapT = T.RepeatWrapping;
  grit.repeat.set(1, 1);
  const iron = mat("#53565b", 0.75, 0.52),
    dark = mat("#32323b", 0.7, 0.48),
    chrome = mat("#b6bdc3", 0.88, 0.27),
    bodyWhite = mat("#e1e1d9", 0.41, 0.32),
    roof = mat("#7d8483", 0.62, 0.47),
    navy = mat("#192d40", 0.63, 0.38),
    orange = mat("#d84c1e", 0.39, 0.34),
    black = mat("#192328", 0.47, 0.43),
    glass = mat("#283e49", 0.66, 0.18),
    red = glow("#bf421f", 0.45),
    lamps = glow("#fff2bd", 2.6);
  const sleeper = mat("#857767", 0.05, 0.91),
    masts = mat("#929793", 0.69, 0.56);
  const railStrips: {
    mesh: T.Mesh;
    left: number;
    right: number;
    y1: number;
    y2: number;
    positions: T.BufferAttribute;
  }[] = [];
  function strip(left: number, right: number, y1: number, y2: number, m: T.Material) {
    const pos = new Float32Array((SEGMENTS + 1) * 6),
      uv = new Float32Array((SEGMENTS + 1) * 4),
      idx = [];
    for (let j = 0; j <= SEGMENTS; j++) {
      const s = near + ((far - near) * j) / SEGMENTS;
      uv.set([left / 2.65, s / 2.65, right / 2.65, s / 2.65], j * 4);
      if (j < SEGMENTS) {
        const a = 2 * j;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new T.BufferGeometry();
    const attribute = new T.BufferAttribute(pos, 3);
    attribute.setUsage(T.DynamicDrawUsage);
    g.setAttribute("position", attribute);
    g.setAttribute("uv", new T.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const bars = mesh(scene, g, m);
    bars.castShadow = false;
    bars.frustumCulled = false;
    railStrips.push({ mesh: bars, left, right, y1, y2, positions: attribute });
  }
  const ballast = new T.MeshStandardMaterial({ color: "#98938e", map: grit, roughness: 0.99 });
  strip(-2.38, -1.48, 0, 0.34, ballast);
  strip(-1.48, 1.48, 0.34, 0.34, ballast);
  strip(1.48, 2.38, 0.34, 0, ballast);
  for (const x of [-0.76, 0.76]) {
    strip(x - 0.05, x + 0.05, 0.56, 0.56, chrome);
    strip(x + 0.05, x + 0.069, 0.56, 0.47, iron);
    strip(x - 0.069, x - 0.05, 0.47, 0.56, iron);
  }
  const ties = new T.InstancedMesh(new T.BoxGeometry(2.42, 0.13, 0.235), sleeper, 351);
  ties.castShadow = false;
  ties.receiveShadow = true;
  ties.frustumCulled = false;
  scene.add(ties);
  const dummy = new T.Object3D();
  const scenery = group(scene);
  const catenary = group(scenery);
  box(catenary, masts, [0.2, 6.85, 0.25], [0, 3.45, 0]);
  box(catenary, iron, [0.39, 0.35, 0.4], [0, 0.23, 0]);
  tube(catenary, masts, [0.04, 6.23, 0], [3.95, 6.4, 0], 0.085);
  tube(catenary, iron, [0.04, 5.21, 0], [3.68, 6.37, 0], 0.047);
  tube(catenary, iron, [3.5, 6.4, 0], [3.5, 5.58, 0], 0.022);
  for (let j = 0; j < 5; j++) ring(catenary, dark, 0.1, 0.03, "y", [3.5, 5.96 + j * 0.063, 0]);

  batch(catenary);
  scenery.remove(catenary);
  const poles = Array.from({ length: 11 }, () => {
    const p = catenary.clone();
    scenery.add(p);
    return p;
  });
  const overhead = mat("#3f413f", 0.52, 0.63);
  strip(-0.012, 0.012, 5.65, 5.65, overhead);
  strip(-0.013, 0.013, 6.31, 6.31, overhead);
  const random = seeded(42),
    treeMaps = ["/worlds/seismic/jacaranda_tree.webp", "/worlds/seismic/tree_small_02.webp"].map(
      (url) => finishTexture(loader.load(url)),
    );
  const trees = treeMaps.map((map, k) => {
    const m = new T.MeshBasicMaterial({
      map,
      color: k ? "#c2c09d" : "#b4bb98",
      alphaTest: 0.55,
      side: T.DoubleSide,
    });
    const tr = new T.InstancedMesh(new T.PlaneGeometry(1, 1), m, 62);
    tr.frustumCulled = false;
    scene.add(tr);
    return tr;
  });
  const grove = trees.map((_, k) =>
    Array.from({ length: 62 }, (_, i) => ({
      start: near + random() * (far - near),
      x: (i % 3 === 0 ? 1 : -1) * (11 + random() * 53),
      height: (k ? 6 : 7) + random() * 7,
      angle: 0.2 + random() * 0.6,
    })),
  );
  const habitat = group(scene);
  const bark = mat("#8d7762", 0.08, 0.85),
    wall = mat("#d5c5a1", 0.1, 0.85),
    tile = mat("#866c59", 0.18, 0.83);
  for (const [j, z] of [-30, -3, 35].entries()) {
    const x = -29 - (j % 2) * 6;
    box(habitat, wall, [6.2, 2.8, 7.3], [x, 1.37, z]);
    for (const side of [-1, 1]) {
      const slab = box(habitat, tile, [3.9, 0.22, 7.75], [x + side * 1.63, 3.3, z]);
      slab.rotation.z = side * -0.32;
      for (let w = -1; w <= 1; w++) {
        box(habitat, glass, [0.08, 0.89, 0.77], [x + side * 3.12, 1.69, z + w * 2.15]);
        box(habitat, chrome, [0.12, 0.06, 0.91], [x + side * 3.13, 1.22, z + w * 2.15]);
      }
    }
    box(habitat, bark, [0.73, 1.4, 0.62], [x - 1, 3.65, z - 1]);
  }
  batch(habitat);
  const paint = tex(
    (c, w, h) => {
      c.fillStyle = "#e5e6de";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#293c4e";
      c.fillRect(0, h * 0.73, w, h * 0.27);
      c.fillStyle = "#ce481d";
      c.fillRect(0, h * 0.65, w, h * 0.07);
      c.fillStyle = "#abb6b6";
      c.fillRect(0, h * 0.06, w, h * 0.028);
    },
    128,
    256,
  );
  const painted = new T.MeshStandardMaterial({ map: paint, metalness: 0.43, roughness: 0.31 });
  const windowTexture = tex(
    (c, w, h) => {
      const bg = c.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#293c49");
      bg.addColorStop(0.37, "#6b8183");
      bg.addColorStop(0.58, "#a8b5aa");
      bg.addColorStop(0.61, "#4e6056");
      bg.addColorStop(1, "#243238");
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#354146";
      for (let i = 0; i < 6; i++) {
        c.fillRect((i * w) / 5 - 4, h * 0.44, 5, h * 0.62);
        c.beginPath();
        c.ellipse((i * w) / 5 + 17, h * 0.56, 9, 11, 0.1, 0, Math.PI * 2);
        c.fill();
        c.fillRect((i * w) / 5 + 7, h * 0.62, 23, h * 0.35);
      }
      c.fillStyle = "#dbeaf119";
      c.beginPath();
      c.moveTo(w * 0.25, 0);
      c.lineTo(w * 0.4, 0);
      c.lineTo(w * 0.15, h);
      c.lineTo(0, h);
      c.fill();
    },
    384,
    140,
  );
  const passengerWindow = new T.MeshStandardMaterial({
    map: windowTexture,
    roughness: 0.24,
    metalness: 0.47,
  });
  function surface(main: T.Group, nose: boolean) {
    const section = [
      [-1.22, 0],
      [-1.43, 0.28],
      [-1.47, 0.73],
      [-1.47, 2.13],
      [-1.33, 2.58],
      [-0.88, 2.8],
      [0, 2.87],
      [0.88, 2.8],
      [1.33, 2.58],
      [1.47, 2.13],
      [1.47, 0.73],
      [1.43, 0.28],
      [1.22, 0],
      [-1.22, 0],
    ];
    const rings = nose
      ? [
          [-7, 0.98, 0.98, 0],
          [-6.7, 1, 1, 0],
          [4.5, 1, 1, 0],
          [5.45, 0.97, 0.98, 0],
          [6.3, 0.9, 0.88, 0],
          [7.04, 0.75, 0.65, 0.02],
          [7.57, 0.59, 0.45, 0.05],
          [7.88, 0.36, 0.3, 0.11],
          [7.97, 0.035, 0.17, 0.17],
        ]
      : [
          [-7, 0.94, 0.95, 0.03],
          [-6.78, 1, 1, 0],
          [6.78, 1, 1, 0],
          [7, 0.94, 0.95, 0.03],
        ];
    const positions: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      wind: number[] = [];
    for (let j = 0; j < rings.length; j++) {
      const [z, a, b, h] = rings[j];
      for (let i = 0; i < section.length; i++) {
        const [xx, yy] = section[i];
        positions.push(xx * a, yy * b + h, z);
        uv.push(j / (rings.length - 1), yy / 2.87);
        if (j + 1 < rings.length && i + 1 < section.length) {
          const n = j * section.length + i,
            m = n + section.length;
          const frontGlass =
            nose &&
            ((j === 3 && i >= 4 && i <= 8) ||
              (j === 4 && i >= 3 && i <= 9) ||
              (j === 5 && i >= 4 && i <= 8));
          (frontGlass ? wind : idx).push(n, m, n + 1, n + 1, m, m + 1);
        }
      }
    }
    const shell = new T.BufferGeometry();
    shell.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    shell.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    shell.setIndex([...idx, ...wind]);
    shell.computeVertexNormals();
    const windowGeom = shell.clone();
    windowGeom.setIndex(wind);
    shell.setIndex(idx);
    painted.side = T.DoubleSide;
    mesh(main, shell, painted);
    if (wind.length) {
      glass.side = T.DoubleSide;
      mesh(main, windowGeom, glass);
    } else windowGeom.dispose();
    box(main, navy, [2.13, 0.3, 5.25], [0, -0.17, -0.23], 0.085);
    box(main, black, [1.43, 0.26, 3.46], [0, -0.31, -0.17], 0.08);
    for (const side of [-1, 1]) {
      for (const z of [-4.98, 4.86]) {
        box(main, roof, [0.055, 0.11, 2.62], [side * 1.22, 0.01, z], 0.025);
        for (let i = 0; i < 8; i++)
          box(main, chrome, [0.028, 0.023, 0.13], [side * 1.26, 0.045, z - 1.05 + i * 0.3]);
      }
      for (let i = 0; i < 11; i++)
        box(main, iron, [0.036, 0.035, 0.27], [side * 1.081, -0.22, -1.9 + i * 0.33]);
    }
    for (const side of [-1, 1]) {
      for (let j = 0; j < (nose ? 6 : 7); j++) {
        const z = -5.85 + j * 1.77;
        box(main, black, [0.045, 0.99, 1.61], [side * 1.472, 1.68, z], 0.1);
        const pane = mesh(
          main,
          new T.PlaneGeometry(1.45, 0.79),
          passengerWindow,
          side * 1.501,
          1.69,
          z,
        );
        pane.rotation.y = (side * Math.PI) / 2;
        box(main, chrome, [0.023, 0.029, 1.47], [side * 1.51, 1.22, z]);
      }
      for (const z of [-3.79, 3.32]) {
        const dr = box(main, bodyWhite, [0.08, 2.08, 0.77], [side * 1.475, 1.14, z], 0.035);
        dr.rotation.z = side * 0.007;
        box(main, navy, [0.09, 0.61, 0.51], [side * 1.499, 1.64, z], 0.06);
        box(main, orange, [0.09, 0.11, 0.77], [side * 1.499, 0.81, z]);
        box(main, black, [0.09, 0.045, 0.13], [side * 1.508, 1.03, z + 0.2]);
      }
      placard(
        main,
        "RHEIN  /  REGIO",
        [side * 1.487, 0.99, -0.6],
        1.33,
        0.19,
        "#354c54",
        "#dedfd6",
        (side * Math.PI) / 2,
      );
    }
    if (nose) {
      const a = v(-1.15, 2.46, 6.08),
        b = v(1.15, 2.46, 6.08),
        c = v(0.99, 1.39, 7.31),
        d = v(-0.99, 1.39, 7.31);
      const wg = new T.BufferGeometry().setFromPoints([a, d, b, d, c, b]);
      wg.computeVertexNormals();
      glass.side = T.DoubleSide;
      mesh(main, wg, glass);
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, d],
        [d, a],
      ])
        tube(main, black, p.toArray() as XYZ, q.toArray() as XYZ, 0.055);
      tube(main, black, [0, 1.39, 7.33], [0, 2.47, 6.1], 0.036);
      for (const side of [-1, 1]) {
        const eye = group(main, side * 0.63, 0.71, 7.7);
        eye.rotation.y = side * 0.39;
        box(eye, navy, [0.52, 0.19, 0.1], [0, 0, 0], 0.05);
        box(eye, lamps, [0.41, 0.088, 0.12], [0, 0, 0.03], 0.035);
        oval(eye, red, [0.043, 0.043, 0.05], [side * 0.23, 0.02, -0.03]);
      }
      box(main, navy, [0.76, 0.2, 0.14], [0, 0.27, 7.89], 0.06);
      box(main, orange, [0.37, 0.056, 0.09], [0, 0.76, 7.78], 0.02);
      for (const s of [-1, 1]) {
        wire(
          main,
          orange,
          [
            [s * 0.96, 0.58, 7.19],
            [s * 0.69, 0.53, 7.63],
            [s * 0.34, 0.48, 7.89],
            [s * 0.02, 0.46, 7.93],
          ],
          0.04,
          14,
        );
        box(main, black, [0.28, 0.083, 0.052], [s * 0.34, 0.37, 7.9], 0.02);
      }
      box(main, orange, [0.55, 0.1, 0.08], [0, 0.91, 7.76], 0.03);
      for (const s of [-1, 1]) {
        wire(
          main,
          navy,
          [
            [s * 0.56, 2.34, 6.8],
            [s * 0.4, 2.11, 6.99],
            [s * 0.08, 1.68, 7.3],
          ],
          0.022,
          11,
        );
        tube(main, chrome, [s * 0.46, 1.72, 7.26], [s * 0.07, 2.05, 7.04], 0.019, 8);
      }
    } else {
      for (let i = 0; i < 6; i++)
        box(main, black, [2.63, 2.39, 0.11], [0, 1.16, 6.99 + i * 0.09], 0.13);
    }
    for (const z of [-3.9, 1.0]) {
      box(main, roof, [1.58, 0.25, 2.37], [0, 2.91, z], 0.11);
      for (let k = 0; k < 9; k++)
        box(main, black, [1.13, 0.025, 0.045], [0, 3.044, z - 0.78 + k * 0.18]);
    }
    if (!nose) {
      const z = -1.5;
      for (const side of [-1, 1]) {
        wire(
          main,
          iron,
          [
            [side * 0.49, 2.91, z - 0.67],
            [side * 0.51, 3.44, z + 0.43],
            [side * 0.47, 4.36, z - 0.11],
          ],
          0.044,
          8,
        );
      }
      tube(main, black, [-0.88, 4.36, z - 0.11], [0.88, 4.36, z - 0.11], 0.046);
    }
  }
  const contact = tex(
    (c, w, h) => {
      const grad = c.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
      grad.addColorStop(0, "rgba(21,20,17,.82)");
      grad.addColorStop(0.55, "rgba(23,21,17,.53)");
      grad.addColorStop(1, "rgba(28,26,23,0)");
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    },
    128,
    128,
  );
  const contactMat = new T.MeshBasicMaterial({
    map: contact,
    transparent: true,
    depthWrite: false,
  });
  const cars: Array<{ body: T.Group; vehicle: T.Group; s: number }> = [];
  for (let i = 0; i < 3; i++) {
    const vehicle = group(scene),
      body = group(vehicle, 0, 1.34, 0);
    body.name = i === 0 ? "Driving carriage" : "Passenger carriage " + i;
    surface(body, i === 0);
    batch(body);
    const bogies = group(vehicle);
    for (const z of [-4.93, 4.9]) {
      box(bogies, black, [1.96, 0.27, 2.64], [0, 1.12, z], 0.07);
      for (const side of [-1, 1])
        for (const dz of [-0.72, 0.72]) {
          const wheel = tube(
            bogies,
            dark,
            [side * 0.67, 0.94, z + dz],
            [side * 1.03, 0.94, z + dz],
            0.405,
            20,
          );
          wheel.castShadow = true;
          tube(bogies, iron, [side * 1.028, 0.94, z + dz], [side * 1.055, 0.94, z + dz], 0.27, 16);
        }
    }
    for (const side of [-1, 1])
      for (const z of [-4.93, 4.9]) {
        tube(
          bogies,
          roof,
          [side * 1.072, 0.94, z + 0.74],
          [side * 1.072, 0.94, z - 0.74],
          0.073,
          10,
        );
        for (const dz of [-0.75, 0.75]) {
          tube(bogies, roof, [side * 1.045, 0.94, z + dz], [side * 1.126, 0.94, z + dz], 0.147, 12);
          box(bogies, chrome, [0.061, 0.1, 0.1], [side * 1.147, 0.94, z + dz], 0.012);
        }
      }
    batch(bogies);
    const shadow = mesh(vehicle, new T.PlaneGeometry(3.64, 15.8), contactMat, 0, 0.48, 0);
    shadow.rotation.x = -Math.PI / 2;
    shadow.castShadow = false;
    cars.push({ body, vehicle, s: -i * 14.49 });
  }
  return {
    scene,
    camera,
    dispose() {
      sky.dispose();
    },
    update(f, aspect) {
      const speed = f.speed || 15,
        phase = f.t * 0.36,
        d = f.distance;
      const loc = (s: number) => trackOffset(s, phase, speed),
        angle = (s: number) => trackAngle(s, phase, speed);
      for (const strip of railStrips) {
        for (let j = 0; j <= SEGMENTS; j++) {
          const s = near + ((far - near) * j) / SEGMENTS,
            offset = loc(s);
          strip.positions.setXYZ(j * 2, offset + strip.left, strip.y1, s);
          strip.positions.setXYZ(j * 2 + 1, offset + strip.right, strip.y2, s);
        }
        strip.positions.needsUpdate = true;
        if (!strip.mesh.geometry.attributes.normal) strip.mesh.geometry.computeVertexNormals();
      }
      grit.offset.y = d / 2.65;
      grass.offset.y = (-d / 320) * 62;
      const step = 0.72;
      for (let i = 0; i < ties.count; i++) {
        const s = near + i * step - (d % step);
        dummy.position.set(loc(s), 0.403, s);
        dummy.rotation.set(0, angle(s), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ties.setMatrixAt(i, dummy.matrix);
      }
      ties.instanceMatrix.needsUpdate = true;
      for (let j = 0; j < poles.length; j++) {
        const s = (j - 6) * 21 - (d % 21);
        const a = angle(s);
        poles[j].position.set(loc(s) - 3.5, 0.02, s + 3.5 * Math.sin(a));
        poles[j].rotation.y = a;
      }
      for (let k = 0; k < trees.length; k++) {
        for (let j = 0; j < grove[k].length; j++) {
          const t = grove[k][j],
            s = near + T.MathUtils.euclideanModulo(t.start - near - d, far - near);
          dummy.position.set(t.x + loc(s) * 0.63, t.height * 0.49, s);
          dummy.rotation.set(0, t.angle, 0);
          dummy.scale.set(t.height * (k ? 0.73 : 1.15), t.height, 1);
          dummy.updateMatrix();
          trees[k].setMatrixAt(j, dummy.matrix);
        }
        trees[k].instanceMatrix.needsUpdate = true;
      }
      habitat.position.z = 22 - T.MathUtils.euclideanModulo(d, 67);
      for (const { vehicle, body, s } of cars) {
        vehicle.position.set(loc(s), 0, s);
        vehicle.rotation.y = angle(s);
        // Positive curvature turns toward local +X. A positive rig cant therefore leans the body in that direction.
        body.rotation.z = -f.deckRoll;
        body.position.y = 1.34 + f.deckZ * 0.9;
      }
      scene.backgroundRotation.y = 0.79 - f.heading;
      fit(camera, aspect, [13.9, 5.6, 19.5], [-0.5, 2.0, -0.7], 31.8, 1.76);
    },
  };
}
