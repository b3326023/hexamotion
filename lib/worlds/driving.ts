import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { raceCourse, raceLapLength } from "./race-course";
import type { WorldFrame, WorldView } from "./types";

const asset = "/worlds/driving/";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const pbr = (color: THREE.ColorRepresentation, metalness = 0, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

function canvasMap(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: THREE.Vector3,
  position: THREE.Vector3,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}

function beam(
  parent: THREE.Object3D,
  material: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8),
    material,
  );
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(v(0, 1, 0), v(0, 0, 0).subVectors(b, a).normalize());
  parent.add(mesh);
}

function groupAt(scene: THREE.Object3D, distance: number, lane: number) {
  const sample = raceCourse(distance, lane),
    group = new THREE.Group();
  group.position.set(sample.x, 0, sample.z);
  group.rotation.y = -sample.heading;
  scene.add(group);
  return group;
}

function instanced(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  list: {
    position: THREE.Vector3;
    size: THREE.Vector3;
    angle?: number;
    color?: THREE.ColorRepresentation;
  }[],
) {
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  const dummy = new THREE.Object3D();
  list.forEach((item, i) => {
    dummy.position.copy(item.position);
    dummy.scale.copy(item.size);
    dummy.rotation.y = item.angle || 0;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (item.color !== undefined) mesh.setColorAt(i, new THREE.Color(item.color));
  });
  parent.add(mesh);
  return mesh;
}

function batchCircuitBoxes(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.Mesh<THREE.BoxGeometry, THREE.Material>[]>();
  scene.traverse((o) => {
    if (
      !(o instanceof THREE.Mesh) ||
      o instanceof THREE.InstancedMesh ||
      !(o.geometry instanceof THREE.BoxGeometry) ||
      Array.isArray(o.material)
    )
      return;
    const entries = groups.get(o.material) || [];
    entries.push(o);
    groups.set(o.material, entries);
  });
  const scale = new THREE.Matrix4(),
    mat = new THREE.Matrix4();
  for (const [material, entries] of groups) {
    if (entries.length < 3) continue;
    const combined = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, entries.length);
    entries.forEach((mesh, i) => {
      const { width, height, depth } = mesh.geometry.parameters;
      mat.multiplyMatrices(mesh.matrixWorld, scale.makeScale(width, height, depth));
      combined.setMatrixAt(i, mat);
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    scene.add(combined);
  }
}

/** Cross sections are in lateral offset and elevation; UVs follow surveyed track metres. */
function roadStrip(
  scene: THREE.Scene,
  section: number[][],
  material: THREE.Material,
  uvWidth = 1,
  uvLength = 1,
  stripe = false,
) {
  const position: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    index: number[] = [];
  const n = Math.ceil(raceLapLength / 1.7),
    white = new THREE.Color("#ebe8d9"),
    red = new THREE.Color("#a7231c");
  for (let i = 0; i < n; i++) {
    const paint = Math.floor(i / 2) % 2 ? white : red;
    for (let end = 0; end < 2; end++) {
      const s = (raceLapLength * (i + end)) / n;
      for (const [offset, y] of section) {
        const at = raceCourse(s, offset);
        position.push(at.x, y, at.z);
        uv.push(offset / uvWidth, s / uvLength);
        colors.push(paint.r, paint.g, paint.b);
      }
    }
    const base = i * 2 * section.length;
    for (let j = 0; j < section.length - 1; j++) {
      const a = base + j,
        b = a + section.length;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (stripe) g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, material));
}

function billboard(text: string, pale: boolean) {
  const map = canvasMap(1024, 128, (c) => {
    c.fillStyle = pale ? "#eeeadd" : "#14212b";
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = "#e43d21";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(20 + i * 31, 98);
      c.lineTo(60 + i * 31, 28);
      c.lineTo(78 + i * 31, 28);
      c.lineTo(38 + i * 31, 98);
      c.fill();
    }
    c.fillStyle = pale ? "#19242c" : "#faf7eb";
    c.font = "italic bold 65px Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 575, 67);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.74, side: THREE.DoubleSide });
}

function grandstand(scene: THREE.Scene, distance: number, lane: number, length: number) {
  const stand = groupAt(scene, distance, lane),
    along = Math.sign(lane);
  const steel = pbr("#5b6265", 0.63, 0.48),
    concrete = pbr("#9e998d"),
    trim = pbr("#e4e1d3", 0.48),
    roof = pbr("#515b64", 0.52);
  const seats: Parameters<typeof instanced>[3] = [],
    columns: Parameters<typeof instanced>[3] = [];
  let rowColor: string;
  for (let row = 0; row < 7; row++) {
    const x = along * row * 0.9,
      y = 0.5 + row * 0.46;
    box(stand, concrete, v(1.15, y, length), v(x, y / 2, 0));
    rowColor = ["#3c535f", "#f2e9cd", "#c3452f", "#c3452f", "#e3c8a1", "#3c535f", "#385565"][row];
    for (let j = 0; j < length / 0.68; j++) {
      if (j % 13 < 2) continue;
      const z = 0.68 * j - length / 2 + 0.33;
      seats.push({
        position: v(x + along * 0.15, y + 0.32, z),
        size: v(0.13, 0.43, 0.49),
        color: rowColor,
      });
      seats.push({ position: v(x, y + 0.14, z), size: v(0.39, 0.12, 0.49), color: rowColor });
    }
  }
  for (let z = -length / 2 + 0.5; z < length / 2; z += 5.5) {
    columns.push({ position: v(along * 6.45, 3.6, z), size: v(0.19, 7.2, 0.19) });
    beam(stand, steel, v(along * 6.45, 5.75, z), v(-along * 0.55, 7.65, z), 0.1);
  }
  instanced(stand, new THREE.BoxGeometry(), pbr("white", 0.08), seats);
  instanced(stand, new THREE.BoxGeometry(), steel, columns);
  const canopy = box(stand, roof, v(8.1, 0.24, length + 1.4), v(along * 3.05, 7.35, 0));
  canopy.rotation.z = -along * 0.075;
  box(stand, trim, v(0.21, 0.41, length + 1.5), v(-along * 0.94, 7.63, 0));
}

function circuit(scene: THREE.Scene, loadTile: (name: string) => THREE.Texture) {
  const grass = loadTile("grass.jpg"),
    asphalt = loadTile("asphalt.jpg");
  grass.repeat.set(62, 62);
  const grassMesh = new THREE.PlaneGeometry(420, 420, 98, 98);
  const sample = Array.from({ length: 160 }, (_, i) => raceCourse((raceLapLength * i) / 160));
  const fade: number[] = [];
  const position = grassMesh.attributes.position;
  for (let j = 0; j < position.count; j++) {
    const x = position.getX(j),
      z = -position.getY(j);
    const d = Math.sqrt(Math.min(...sample.map((p) => (p.x - x) ** 2 + (p.z - z) ** 2)));
    fade.push(1, 1, 1, 1 - THREE.MathUtils.smoothstep(d, 14, 70));
  }
  grassMesh.setAttribute("color", new THREE.Float32BufferAttribute(fade, 4));
  const ground = new THREE.Mesh(
    grassMesh,
    new THREE.MeshStandardMaterial({
      map: grass,
      color: "#b5c796",
      roughness: 0.98,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  scene.add(ground);
  ground.renderOrder = -4;
  const paving = new THREE.MeshStandardMaterial({
    map: asphalt,
    color: "#8c8982",
    bumpMap: asphalt,
    bumpScale: 0.012,
    roughness: 0.94,
  });
  roadStrip(
    scene,
    [
      [-5.65, 0.045],
      [5.65, 0.045],
    ],
    paving,
    4.8,
    4.8,
  );
  const curb = pbr("white", 0.05);
  curb.vertexColors = true;
  const white = pbr("#dad8ce"),
    gravel = pbr("#968977"),
    armco = pbr("#879090", 0.6, 0.56);
  armco.side = THREE.DoubleSide;
  const posts: Parameters<typeof instanced>[3] = [];
  for (const side of [-1, 1]) {
    roadStrip(
      scene,
      [
        [side * 5.41, 0.056],
        [side * 5.58, 0.056],
      ].sort((a, b) => a[0] - b[0]),
      white,
    );
    roadStrip(
      scene,
      [
        [side * 5.67, 0.051],
        [side * 5.96, 0.113],
        [side * 6.43, 0.058],
      ].sort((a, b) => a[0] - b[0]),
      curb,
      1,
      1,
      true,
    );
    roadStrip(
      scene,
      [
        [side * 6.43, 0.015],
        [side * 7.35, 0.015],
      ].sort((a, b) => a[0] - b[0]),
      gravel,
    );
    roadStrip(
      scene,
      [
        [9.42, 0.23],
        [9.37, 0.31],
        [9.45, 0.42],
        [9.38, 0.52],
        [9.46, 0.62],
        [9.37, 0.74],
        [9.42, 0.81],
      ].map(([l, y]) => [side * l, y]),
      armco,
    );
    for (let s = 0; s < raceLapLength; s += 4.4) {
      const at = raceCourse(s, side * 9.55);
      posts.push({ position: v(at.x, 0.43, at.z), size: v(0.12, 0.85, 0.16), angle: -at.heading });
    }
  }
  instanced(scene, new THREE.BoxGeometry(), pbr("#5f6562", 0.49), posts);
  const fenceTexture = canvasMap(128, 128, (c) => {
    c.strokeStyle = "#51565a";
    c.lineWidth = 2.8;
    for (let n = -2; n < 4; n++) {
      c.beginPath();
      c.moveTo(n * 64, 0);
      c.lineTo(n * 64 + 128, 128);
      c.moveTo(n * 64, 0);
      c.lineTo(n * 64 - 128, 128);
      c.stroke();
    }
  });
  fenceTexture.wrapS = fenceTexture.wrapT = THREE.RepeatWrapping;
  const wire = new THREE.MeshStandardMaterial({
    map: fenceTexture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  for (const [station, side, count] of [
    [36, -1, 16],
    [raceLapLength * 0.57, 1, 12],
  ]) {
    const supports: Parameters<typeof instanced>[3] = [];
    for (let k = 0; k < count; k++) {
      const a = raceCourse(station + (k - count / 2) * 3, side * 9.86),
        b = raceCourse(station + (k - count / 2 + 1) * 3, side * 9.86);
      const g = new THREE.PlaneGeometry(Math.hypot(a.x - b.x, a.z - b.z), 2.0);
      const uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 9, uv.getY(j) * 6);
      const mesh = new THREE.Mesh(g, wire);
      mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
      mesh.position.set((a.x + b.x) / 2, 1.77, (a.z + b.z) / 2);
      scene.add(mesh);
      supports.push({
        position: v(a.x, 1.47, a.z),
        size: v(0.052, 2.93, 0.052),
        angle: -a.heading,
      });
    }
    instanced(scene, new THREE.BoxGeometry(), pbr("#616165", 0.58), supports);
  }
  const tread = canvasMap(256, 512, (c) => {
    const data = c.createImageData(256, 512);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 256; x++) {
        const band = Math.exp(-(((x - 128) / 94) ** 2));
        const grain = Math.sin(x * 74.73 + y * 29.53) * 1567.827;
        const rubber =
          (0.44 + 0.56 * (grain - Math.floor(grain))) * band * (0.85 + 0.15 * Math.sin(x * 1.6));
        const i = (y * 256 + x) * 4;
        data.data[i] = 22;
        data.data[i + 1] = 22;
        data.data[i + 2] = 21;
        data.data[i + 3] = Math.round(76 * rubber);
      }
    c.putImageData(data, 0, 0);
  });
  tread.wrapT = THREE.RepeatWrapping;
  const skid = new THREE.MeshBasicMaterial({ map: tread, transparent: true, depthWrite: false });
  for (const lane of [-0.76, 0.76]) {
    const p: number[] = [],
      uv: number[] = [],
      ix: number[] = [];
    for (let j = 0; j <= 370; j++) {
      const s = (j * raceLapLength) / 370,
        center = lane + Math.tanh(raceCourse(s).curvature * 47) * 1.75;
      for (const d of [-0.25, 0.25]) {
        const at = raceCourse(s, center + d);
        p.push(at.x, 0.053, at.z);
        uv.push(d < 0 ? 0 : 1, s / 2.15);
      }
      if (j) {
        const k = j * 2;
        ix.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    scene.add(new THREE.Mesh(g, skid));
  }
  // Painted grid boxes and the chequered timing line sit on the asphalt surface.
  const grid = groupAt(scene, 26, 0),
    black = pbr("#27292b");
  for (let i = 0; i < 22; i++) {
    box(grid, i % 2 ? white : black, v(0.5, 0.012, 0.42), v(-5.25 + i * 0.5, 0.055, -0.21));
    box(grid, i % 2 ? black : white, v(0.5, 0.012, 0.42), v(-5.25 + i * 0.5, 0.055, 0.21));
  }
  for (let i = 0; i < 9; i++) {
    const spot = groupAt(scene, 20 - i * 5.2, i % 2 ? 2.1 : -2.1);
    box(spot, white, v(2.28, 0.008, 0.1), v(0, 0.058, 0));
    for (const sign of [-1, 1]) box(spot, white, v(0.1, 0.008, 0.8), v(sign * 1.09, 0.058, 0.36));
  }
  const dark = pbr("#323a40", 0.56);
  const gantry = groupAt(scene, 26, 0);
  for (const side of [-1, 1]) {
    box(gantry, dark, v(0.26, 5.4, 0.27), v(side * 10, 2.7, 0));
    box(gantry, dark, v(0.26, 5.4, 0.27), v(side * 10, 2.7, 1));
    beam(gantry, dark, v(side * 10, 0.1, 0), v(side * 10, 5.1, 1), 0.075);
  }
  box(gantry, dark, v(20.5, 1.34, 0.79), v(0, 5.63, 0.47));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(17.6, 1.23),
    billboard("HEXAMOTION   /   CIRCUIT", false),
  );
  sign.position.set(0, 5.67, 0.879);
  gantry.add(sign);
  grandstand(scene, 34, -11.8, 37);
  grandstand(scene, raceLapLength * 0.57, 14, 27);
  const adDark = billboard("APEX     RACING", false),
    adLight = billboard("MOTION     SPORT", true);
  for (let i = 0; i < 22; i++) {
    const side = i % 4 < 2 ? -1 : 1;
    const at = groupAt(scene, (raceLapLength * (i + 0.46)) / 22, side * 10.1);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 1.0), i % 2 ? adLight : adDark);
    ad.position.y = 1.04;
    ad.rotation.y = (-side * Math.PI) / 2;
    at.add(ad);
  }
}

function disposeGraph(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    const all = Array.isArray(o.material) ? o.material : [o.material];
    all.forEach((m) => {
      materials.add(m);
      Object.values(m).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

function fallbackCar() {
  const group = new THREE.Group(),
    paint = pbr("#ea3d16", 0.54, 0.27),
    glass = pbr("#223139", 0.62, 0.2),
    rubber = pbr("#1b1b1d");
  const loft = (profiles: number[][], mat: THREE.Material) => {
    const vertices: number[] = [],
      ix: number[] = [];
    for (const [z, w, top, bottom] of profiles) {
      for (const [x, h] of [
        [-w * 0.73, top],
        [w * 0.73, top],
        [w, top * 0.65 + bottom * 0.35],
        [w * 0.92, bottom],
        [-w * 0.92, bottom],
        [-w, top * 0.65 + bottom * 0.35],
      ])
        vertices.push(x, h, z);
    }
    for (let k = 0; k < profiles.length - 1; k++)
      for (let j = 0; j < 6; j++) {
        const a = k * 6 + j,
          b = k * 6 + ((j + 1) % 6);
        ix.push(a, b, a + 6, b, b + 6, a + 6);
      }
    ix.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
    const end = vertices.length / 3 - 6;
    ix.push(
      end,
      end + 2,
      end + 1,
      end,
      end + 3,
      end + 2,
      end,
      end + 4,
      end + 3,
      end,
      end + 5,
      end + 4,
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    mat.side = THREE.DoubleSide;
    group.add(new THREE.Mesh(g, mat));
  };
  loft(
    [
      [-2.15, 0.72, 0.41, 0.19],
      [-1.65, 0.96, 0.61, 0.13],
      [-0.7, 0.99, 0.71, 0.13],
      [0.7, 0.99, 0.75, 0.13],
      [1.72, 1.0, 0.71, 0.18],
      [2.12, 0.83, 0.68, 0.28],
    ],
    paint,
  );
  loft(
    [
      [-0.98, 0.78, 0.66, 0.51],
      [-0.35, 0.65, 1.12, 0.61],
      [0.4, 0.61, 1.17, 0.65],
      [1.36, 0.78, 0.72, 0.62],
    ],
    glass,
  );
  for (const x of [-0.88, 0.88])
    for (const z of [-1.24, 1.3]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.23, 32), rubber);
      m.rotation.z = Math.PI / 2;
      m.position.set(x, 0.35, z);
      group.add(m);
    }
  return group;
}

function raceTrim(car: THREE.Group) {
  const graphite = pbr("#23272a", 0.51, 0.31),
    metal = pbr("#555c60", 0.79, 0.29);
  const profile = new THREE.Shape();
  profile.moveTo(-0.14, 0.012);
  profile.quadraticCurveTo(-0.2, -0.008, -0.11, -0.024);
  profile.quadraticCurveTo(0.05, -0.04, 0.19, -0.01);
  profile.lineTo(0.192, 0);
  profile.quadraticCurveTo(0.03, -0.008, -0.14, 0.012);
  const foil = new THREE.Mesh(
    new THREE.ExtrudeGeometry(profile, { depth: 1.94, bevelEnabled: false, curveSegments: 10 }),
    graphite,
  );
  foil.rotation.y = -Math.PI / 2;
  foil.position.set(0.97, 0.983, 1.87);
  car.add(foil);
  const sidePlate = new THREE.Shape();
  sidePlate.moveTo(-0.15, -0.047);
  sidePlate.lineTo(0.16, -0.057);
  sidePlate.quadraticCurveTo(0.192, -0.057, 0.2, -0.037);
  sidePlate.lineTo(0.21, 0.083);
  sidePlate.quadraticCurveTo(0.21, 0.093, 0.17, 0.084);
  sidePlate.lineTo(-0.13, 0.039);
  sidePlate.quadraticCurveTo(-0.18, 0.034, -0.15, -0.047);
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(sidePlate, { depth: 0.016, bevelEnabled: false }),
      graphite,
    );
    plate.rotation.y = -Math.PI / 2;
    plate.position.set(0.974 * side, 0.977, 1.87);
    car.add(plate);
    beam(car, metal, v(side * 0.53, 0.72, 1.75), v(side * 0.56, 0.972, 1.89), 0.03);
    beam(car, metal, v(side * 0.58, 0.73, 2.0), v(side * 0.56, 0.972, 1.89), 0.027);
  }
  // A seated driver, hands on the wheel, is visible through the open cockpit.
  const suit = pbr("#242d31", 0.04, 0.92),
    helmet = pbr("#f4e7c9", 0.38, 0.19),
    visor = pbr("#1c383b", 0.83, 0.12);
  const body = (material: THREE.Material, position: THREE.Vector3, size: THREE.Vector3) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
    m.position.copy(position);
    m.scale.copy(size);
    car.add(m);
    return m;
  };
  body(suit, v(-0.35, 0.76, 0.15), v(0.215, 0.265, 0.15));
  body(helmet, v(-0.35, 1.005, 0.13), v(0.139, 0.165, 0.157));
  body(visor, v(-0.35, 1.023, 0.046), v(0.138, 0.075, 0.089));
  for (const s of [-1, 1]) {
    const shoulder = v(-0.35 + s * 0.165, 0.84, 0.12),
      elbow = v(-0.35 + s * 0.21, 0.69, -0.06),
      hand = v(-0.35 + s * 0.13, 0.805, -0.32);
    beam(car, suit, shoulder, elbow, 0.056);
    beam(car, suit, elbow, hand, 0.045);
    body(suit, hand, v(0.052, 0.045, 0.059));
  }
}

function livery(body: THREE.Mesh, car: THREE.Group) {
  const roundel = canvasMap(512, 384, (c) => {
    c.fillStyle = "#f5eee1";
    c.beginPath();
    c.roundRect(20, 15, 472, 352, 25);
    c.fill();
    c.fillStyle = "#172028";
    c.fillRect(25, 47, 462, 62);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#faf6e8";
    c.font = "bold 34px Arial";
    c.fillText("H X   /   R A C I N G", 256, 80);
    c.fillStyle = "#152129";
    c.font = "italic 900 255px Arial";
    c.fillText("06", 250, 236);
  });
  const stripe = canvasMap(128, 128, (c) => {
    c.fillStyle = "#f7f0dd";
    c.fillRect(8, 0, 83, 128);
    c.fillRect(101, 0, 15, 128);
  });
  const decal = (
    map: THREE.Texture,
    position: THREE.Vector3,
    orientation: THREE.Euler,
    size: THREE.Vector3,
  ) => {
    const geo = new DecalGeometry(body, position, orientation, size);
    const mat = new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      roughness: 0.34,
      metalness: 0.32,
    });
    const decal = new THREE.Mesh(geo, mat);
    decal.renderOrder = 2;
    car.add(decal);
  };
  for (const side of [-1, 1])
    decal(
      roundel,
      v(side * 0.98, 0.58, 0.05),
      new THREE.Euler(0, (side * Math.PI) / 2, 0),
      v(0.62, 0.42, 0.42),
    );
  // Individual projections keep the racing stripes off the glazing and cockpit.
  for (const [z, len, y] of [
    [-1.56, 1.12, 0.59],
    [0.04, 0.57, 1.21],
    [1.73, 0.72, 0.77],
  ]) {
    decal(stripe, v(-0.18, y, z), new THREE.Euler(-Math.PI / 2, 0, 0), v(0.235, len, 0.62));
  }
}

export function createDrivingWorld(manager?: THREE.LoadingManager): WorldView {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(38, 1, 0.12, 620);
  scene.background = new THREE.Color("#b3c9d7");
  scene.fog = new THREE.FogExp2("#b3c4cb", 0.0028);
  scene.add(new THREE.HemisphereLight("#d5def3", "#80725c", 0.5));
  const sun = new THREE.DirectionalLight("#fff0d8", 1.78);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    near: 0.1,
    far: 68,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.022;
  sun.shadow.bias = -0.00012;
  scene.add(sun, sun.target);
  let disposed = false,
    sky: THREE.Texture | undefined,
    panorama: THREE.Texture | undefined;
  const tl = new THREE.TextureLoader(manager);
  tl.load(
    asset + "horizon.jpg",
    (picture) => {
      if (disposed) {
        picture.dispose();
        return;
      }
      panorama = picture;
      picture.colorSpace = THREE.SRGBColorSpace;
      picture.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = picture;
      scene.backgroundRotation.y = 0.76;
      scene.backgroundIntensity = 1;
    },
    undefined,
    () => {},
  );
  new HDRLoader(manager).load(
    asset + "sky.hdr",
    (picture) => {
      if (disposed) {
        picture.dispose();
        return;
      }
      sky = picture;
      picture.mapping = THREE.EquirectangularReflectionMapping;
      if (!panorama) scene.background = picture;
      scene.environment = picture;
      scene.environmentIntensity = 0.67;
      scene.environmentRotation.y = 0.76;
    },
    undefined,
    () => {},
  );
  circuit(scene, (name) => {
    const t = tl.load(
      asset + name,
      (tex) => {
        if (disposed) tex.dispose();
      },
      undefined,
      () => {},
    );
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
  batchCircuitBoxes(scene);
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.receiveShadow = true;
    if (o.material instanceof THREE.MeshStandardMaterial && !o.material.transparent)
      o.castShadow = true;
  });

  const chassis = new THREE.Group();
  scene.add(chassis);
  const sprungMass = new THREE.Group();
  chassis.add(sprungMass);
  const fallback = fallbackCar();
  sprungMass.add(fallback);
  raceTrim(sprungMass);
  const contact = canvasMap(256, 512, (c) => {
    c.save();
    c.translate(128, 256);
    c.scale(1, 2.1);
    const g = c.createRadialGradient(0, 0, 38, 0, 0, 124);
    g.addColorStop(0, "rgba(8,12,13,.9)");
    g.addColorStop(0.55, "rgba(8,12,13,.63)");
    g.addColorStop(1, "rgba(8,12,13,0)");
    c.fillStyle = g;
    c.fillRect(-128, -128, 256, 256);
    c.restore();
  });
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 5.45),
    new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.09, 0.008, 0.12);
  shadow.renderOrder = 1;
  chassis.add(shadow);
  const wheels: { steering: THREE.Group; spinning: THREE.Group; front: boolean }[] = [];
  let brakeLights: THREE.MeshStandardMaterial | undefined;
  new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).load(
    asset + "racing-458.glb",
    (gltf) => {
      const model = gltf.scene;
      if (disposed) {
        disposeGraph(model);
        return;
      }
      model.updateWorldMatrix(true, true);
      const brushed = pbr("#747878", 0.89, 0.28),
        polished = pbr("#8b8c88", 0.91, 0.26),
        rubber = pbr("#17191a", 0, 0.9);
      const brakes = pbr("#545452", 0.72, 0.43),
        interior = pbr("#222527", 0.04, 0.87),
        grille = pbr("#181d20", 0.22, 0.64);
      brakeLights = new THREE.MeshStandardMaterial({
        color: "#b21c11",
        emissive: "#e01308",
        emissiveIntensity: 0.26,
        metalness: 0.16,
        roughness: 0.21,
      });
      const replaced = new Set<THREE.Material>();
      model.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const n = o.name;
        const m = /^(rim_|wheel\d*$|nuts)/.test(n)
          ? brushed
          : /^(tire)/.test(n)
            ? rubber
            : n === "brakes"
              ? brakeLights
              : /^(brake)/.test(n)
                ? brakes
                : /^(chrome|metal$)/.test(n)
                  ? polished
                  : /^(grills|carbon|plastic_gray)/.test(n)
                    ? grille
                    : /^(interior|leather|carpet)/.test(n)
                      ? interior
                      : undefined;
        if (m) {
          replaced.add(o.material);
          o.material = m;
        }
        o.castShadow = n === "body" || n.startsWith("tire");
        o.receiveShadow = true;
      });
      const body = model.getObjectByName("body");
      if (body instanceof THREE.Mesh) {
        replaced.add(body.material);
        body.material = new THREE.MeshPhysicalMaterial({
          color: "#ed4111",
          metalness: 0.52,
          roughness: 0.21,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
        });
        livery(body, sprungMass);
      }
      const glass = model.getObjectByName("glass");
      if (glass instanceof THREE.Mesh) {
        replaced.add(glass.material);
        glass.material = new THREE.MeshPhysicalMaterial({
          color: "#43555c",
          metalness: 0.16,
          roughness: 0.09,
          transparent: true,
          opacity: 0.56,
          clearcoat: 1,
          depthWrite: false,
        });
        glass.renderOrder = 1;
      }
      const lamps = model.getObjectByName("lights_red");
      if (lamps instanceof THREE.Mesh) {
        replaced.add(lamps.material);
        lamps.material = new THREE.MeshStandardMaterial({
          color: "#a40704",
          emissive: "#a90f04",
          emissiveIntensity: 0.28,
          metalness: 0.3,
          roughness: 0.18,
        });
      }
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) replaced.delete(o.material);
      });
      replaced.forEach((m) => m.dispose());
      for (const corner of ["fl", "fr", "rl", "rr"]) {
        const wheel = model.getObjectByName("wheel_" + corner);
        if (!wheel?.parent) continue;
        const steering = new THREE.Group(),
          spinning = new THREE.Group();
        steering.position.copy(wheel.position);
        wheel.parent.add(steering);
        steering.add(spinning);
        spinning.add(wheel);
        wheel.position.set(0, 0, 0);
        wheels.push({ steering, spinning, front: corner[0] === "f" });
      }
      sprungMass.add(model);
      sprungMass.remove(fallback);
      disposeGraph(fallback);
    },
    undefined,
    () => {},
  );
  const viewOffset = v(0, 0, 0),
    target = v(0, 0, 0),
    up = v(0, 1, 0),
    sunOffset = v(-20, 16, -24);
  return {
    scene,
    camera,
    update(frame: WorldFrame, aspect: number) {
      const station = raceCourse(frame.course, frame.x * 2.35);
      chassis.position.set(station.x, 0.051, station.z);
      chassis.rotation.y = -frame.heading;
      sun.target.position.copy(chassis.position);
      sun.position.copy(chassis.position).add(sunOffset);
      sprungMass.rotation.z = frame.roll * 0.18;
      sprungMass.rotation.x = -frame.pitch * 0.22;
      if (brakeLights) brakeLights.emissiveIntensity = 0.26 + Math.max(0, frame.pitch) * 17;
      for (const wheel of wheels) {
        wheel.steering.rotation.y = wheel.front ? -frame.steering * 0.52 : 0;
        wheel.spinning.rotation.x = -frame.distance / 0.356;
      }
      const camYaw = -station.heading;
      const scale = aspect < 1.6 ? 1.11 : 1;
      viewOffset.set(2.6 * scale, 1.83 * scale, 5.78 * scale).applyAxisAngle(up, camYaw);
      camera.position.copy(chassis.position).add(viewOffset);
      target.set(-0.14, 0.79, -0.97).applyAxisAngle(up, camYaw).add(chassis.position);
      camera.lookAt(target);
      if (Math.abs(camera.aspect - aspect) > 0.001) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
    },
    dispose() {
      disposed = true;
      sun.shadow.dispose();
      sky?.dispose();
      panorama?.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    },
  };
}
