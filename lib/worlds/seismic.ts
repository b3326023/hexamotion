import { installFacade } from "./seismic-architecture";
import * as T from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldView, WorldFrame } from "./types";

const ROOT = "/worlds/seismic/";
const STORIES = 9,
  LEVEL = 3.32,
  SCENE_SCALE = 90;
// Each storey is displaced by the first bending mode of the same measured, one-axis proof mass.
export function structuralDrift(displacement: number, level: number) {
  return displacement * SCENE_SCALE * (1 - Math.cos((Math.PI * 0.5 * level) / STORIES));
}
export function createSeismicWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(38, 1, 0.15, 800);
  scene.background = new T.Color(0xb4cbd6);
  scene.fog = new T.FogExp2(0xc5d1d3, 0.0034);
  const fixed = new T.Group(),
    ground = new T.Group();
  scene.add(fixed, ground);
  let disposed = false;
  let skyTexture: T.DataTexture | null = null;
  new HDRLoader(manager).load(ROOT + "streetscape.hdr", (tex) => {
    if (disposed) {
      tex.dispose();
      return;
    }
    tex.mapping = T.EquirectangularReflectionMapping;
    skyTexture = tex;
    scene.environment = tex;
    scene.environmentRotation.y = -0.82;
    scene.environmentIntensity = 0.83;
  });
  const loader = new T.TextureLoader(manager);
  const backdrop = loader.load(ROOT + "streetscape.webp");
  backdrop.mapping = T.EquirectangularReflectionMapping;
  backdrop.colorSpace = T.SRGBColorSpace;
  scene.background = backdrop;
  scene.backgroundRotation.y = -0.82;
  scene.backgroundIntensity = 1;
  function texture(file: string, repeat: number, color: boolean) {
    const t = loader.load(ROOT + file);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.setScalar(repeat);
    t.anisotropy = 8;
    if (color) t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  const concreteTex = texture("concrete_wall_006-Diffuse.jpg", 2, true),
    concreteN = texture("concrete_wall_006-nor_gl.jpg", 2, false);
  const ash = texture("asphalt_04-Diffuse.jpg", 10, true),
    ashN = texture("asphalt_04-nor_gl.jpg", 10, false);
  const mat = (color: T.ColorRepresentation, roughness = 0.65, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness });
  const stone = new T.MeshStandardMaterial({
    color: 0xd6d2be,
    map: concreteTex,
    normalMap: concreteN,
    normalScale: new T.Vector2(0.35, 0.35),
    roughness: 0.8,
  });
  const slab = mat(0xb8b8ab, 0.68),
    soffit = mat(0x99958b, 0.8),
    dark = mat(0x2a3335, 0.42, 0.47),
    black = mat(0x1c2326, 0.55, 0.28),
    silver = mat(0xa8b1ae, 0.36, 0.65),
    sunshade = mat(0xad8262, 0.52, 0.42),
    warm = mat(0xcebfa2, 0.7);
  const glazing = [0x688687, 0x768f90, 0x819290, 0x526f73, 0x929c91].map(
    (color) =>
      new T.MeshPhysicalMaterial({
        color,
        roughness: 0.12,
        metalness: 0.72,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.26,
      }),
  );
  const painted = mat(0xe1d7b6),
    curb = mat(0xabab9e, 0.83),
    soil = mat(0x514736);
  const lamp = new T.MeshStandardMaterial({
    color: 0xffffda,
    emissive: 0xffdca2,
    emissiveIntensity: 0.44,
  });
  const unit = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(1, 1, 1, 20),
    ball = new T.IcosahedronGeometry(1, 1);
  const matrix = new T.Matrix4(),
    q = new T.Quaternion(),
    vec = new T.Vector3(),
    scale = new T.Vector3();
  const floors: T.Group[] = [];
  type Batches = Map<T.Material, T.BufferGeometry[]>;
  function piece(
    batch: Batches,
    g: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    ry = 0,
  ) {
    const geometries = batch.get(m) ?? [];
    if (!batch.has(m)) batch.set(m, geometries);
    q.setFromAxisAngle(vec.set(0, 1, 0), ry);
    matrix.compose(vec.set(x, y, z), q, scale.set(w, h, d));
    geometries.push(g.clone().applyMatrix4(matrix));
  }
  const box = (
    b: Batches,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    ry = 0,
  ) => piece(b, unit, m, x, y, z, w, h, d, ry);
  const tube = (b: Batches, m: T.Material, x: number, y: number, z: number, r: number, h: number) =>
    piece(b, cylinder, m, x, y, z, r, h, r);
  function finish(b: Batches, g: T.Object3D) {
    for (const [m, geos] of b) {
      const merged = mergeGeometries(geos)!;
      geos.forEach((v) => v.dispose());
      const mesh = new T.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }
  let seed = 731;
  function noise() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const site: Batches = new Map();
  const roadMat = new T.MeshStandardMaterial({
    color: 0x847d73,
    map: ash,
    normalMap: ashN,
    normalScale: new T.Vector2(0.4, 0.4),
    roughness: 0.91,
  });
  box(site, roadMat, 0, -0.52, 0, 180, 0.8, 110);
  box(site, curb, 0, -0.04, -37, 165, 0.33, 13);
  box(site, stone, -39, 0.005, 1, 19, 0.36, 93);
  box(site, stone, 0, -0.02, -0.2, 40, 0.54, 34);
  box(site, curb, 0, 0.18, -0.2, 39.9, 0.16, 33.8);
  const grout = mat(0x98978d, 0.9);
  for (let z = -15; z <= 16; z += 2.2) box(site, grout, 0, 0.264, z, 39.7, 0.008, 0.024);
  for (let x = -18; x <= 19; x += 2.2) box(site, grout, x, 0.264, -0.3, 0.025, 0.008, 33.6);
  // Pavement paint, pedestrian crossing and curb cuts give the base a fixed visual scale.
  for (let x = -100; x <= 100; x += 8) {
    box(site, painted, x, -0.105, 24.3, 3, 0.025, 0.11);
    box(site, painted, x, -0.105, -26, 3, 0.025, 0.11);
  }
  for (let z = -45; z < 60; z += 8) box(site, painted, -27, -0.105, z, 0.11, 0.025, 3.3);
  for (let i = 0; i < 8; i++) {
    box(site, painted, 27.2 + i * 0.75, -0.102, 20, 0.37, 0.025, 5.6);
    box(site, painted, -28.5, -0.102, 12 + i * 0.74, 4.9, 0.025, 0.36);
  }
  const wood = mat(0x735c45, 0.9);
  const leaves = ["tree_small_02", "jacaranda_tree", "shrub_02"].map((id) => {
    const map = loader.load(ROOT + id + ".webp");
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshBasicMaterial({
      map,
      transparent: false,
      alphaTest: 0.39,
      side: T.DoubleSide,
      color: 0xcad6b9,
    });
  });
  const treeGeometry = new T.PlaneGeometry(1, 1);
  function planting(x: number, z: number, i: number) {
    const tall = i < 2,
      h = tall ? (i === 1 ? 7.7 : 6.7) : 1.5,
      w = h * [0.72, 1.32, 3.15][i];
    box(site, slab, x, 0.48, z, tall ? 2.1 : 4.3, 0.39, tall ? 2.1 : 1.35);
    box(site, soil, x, 0.686, z, tall ? 1.91 : 4.1, 0.02, tall ? 1.91 : 1.2);
    const mesh = new T.Mesh(treeGeometry, leaves[i]);
    mesh.position.set(x, 0.69 + h / 2, z);
    mesh.scale.set(w, h, 1);
    mesh.rotation.y = 0.57;
    mesh.castShadow = true;
    ground.add(mesh);
  }
  [
    [-16, -12, 1],
    [-16, 3, 0],
    [15, -7, 0],
    [17, 5, 1],
    [-14, 13, 0],
    [-7, 11, 2],
    [2, 11, 2],
    [8, 11, 2],
    [-35, -22, 1],
    [-35, -8, 0],
    [-36, 8, 1],
    [-22, -34, 0],
    [-11, -34, 0],
    [7, -34, 1],
    [28, -34, 0],
  ].forEach(([x, z, i]) => planting(x, z, i));
  for (const [x, z] of [
    [17, 14],
    [-18, 14],
    [-18, -15],
    [17, -15],
  ]) {
    tube(site, black, x, 2.8, z, 0.072, 5.1);
    box(site, silver, x + 0.63, 5.32, z, 1.36, 0.1, 0.14);
    box(site, lamp, x + 1.15, 5.24, z, 0.62, 0.075, 0.29);
  }
  for (const x of [-7.8, -4, 5.5, 9.2]) {
    box(site, wood, x, 0.87, 13, 2.45, 0.14, 0.59);
    for (const dx of [-0.83, 0.83]) box(site, black, x + dx, 0.53, 13, 0.12, 0.6, 0.51);
  }
  for (const x of [-10, -6, -2, 2, 6, 10]) tube(site, silver, x, 0.77, 15.5, 0.087, 0.98);
  // Two stepped wings use deep window recesses and actual exterior mullions and brise-soleil.
  for (let k = 0; k < STORIES; k++) {
    const story = new T.Group();
    story.position.y = (k + 1) * LEVEL + 0.28;
    story.matrixAutoUpdate = false;
    ground.add(story);
    floors.push(story);
    const level = new T.Group();
    level.position.y = -LEVEL;
    story.add(level);
    const facade = new T.Group();
    facade.name = "preload-facade";
    level.add(facade);
    const b: Batches = new Map();
    const mainWidth = k < 6 ? 19.8 : 16.7,
      depth = k < 6 ? 14.5 : 12.7,
      cx = k < 6 ? 0 : -1.55,
      cz = k < 6 ? 0 : -0.85;
    box(b, soffit, cx, 0.14, cz, mainWidth - 0.74, 0.28, depth - 0.54);
    box(b, stone, cx, 0.32, cz, mainWidth + 0.16, 0.24, depth + 0.16);
    box(b, black, cx, 1.8, cz, mainWidth - 0.56, 2.76, depth - 0.56);
    const zface = cz + depth / 2,
      xf = mainWidth / 2;
    for (const side of [-1, 1]) {
      const z = cz + (side * depth) / 2;
      const bays = k === 0 ? 7 : 10,
        sw = mainWidth / bays;
      for (let j = 0; j < bays; j++) {
        const x = cx - xf + sw * (j + 0.5),
          g = glazing[Math.floor(noise() * glazing.length)];
        box(b, g, x, 1.84, z - side * 0.095, sw - 0.1, 2.56, 0.085);
        if (k > 0 && noise() > 0.47) {
          const drop = 0.22 + noise() * 0.8;
          box(b, warm, x, 3.13 - drop / 2, z - side * 0.035, sw - 0.17, drop, 0.034);
        }
        box(b, dark, x - sw / 2, 1.82, z, 0.09, 2.85, 0.18);
        box(b, silver, x, 1.06, z + 0.045 * side, sw - 0.07, 0.055, 0.095);
        if (k > 0 && j % 4 === 0)
          box(b, stone, x - sw * 0.46, 1.82, z + 0.08 * side, 0.24, 2.85, 0.34);
      }
      box(b, silver, cx, 3.15, z, mainWidth, 0.1, 0.18);
      box(b, slab, cx, 0.51, z + 0.15 * side, mainWidth + 0.15, 0.12, 0.51);
    }
    for (const side of [-1, 1]) {
      const x = cx + side * xf,
        bays = 7,
        sw = depth / bays;
      for (let j = 0; j < bays; j++) {
        const z = cz - depth / 2 + (j + 0.5) * sw;
        box(b, glazing[(j + k) % 5], x - side * 0.09, 1.83, z, 0.075, 2.53, sw - 0.09);
        box(b, dark, x, 1.82, z - sw / 2, 0.16, 2.8, 0.08);
        if (j >= 3 && k !== 0) {
          for (let u = 0; u < 3; u++)
            box(
              b,
              sunshade,
              x + side * 0.28,
              1.83,
              z - sw * 0.33 + (sw * u) / 3,
              0.56,
              2.83,
              0.075,
              0.2,
            );
        }
      }
      box(b, silver, x, 1.06, cz, 0.14, 0.065, depth);
      box(b, slab, x + side * 0.1, 0.54, cz, 0.42, 0.1, depth + 0.1);
    }
    if (k === 0) {
      box(b, dark, -1, 3.05, zface + 1.3, 11.7, 0.2, 2.95);
      box(b, silver, -1, 3.19, zface + 1.3, 11.9, 0.12, 2.95);
      for (const x of [-6.2, 4.2]) tube(b, silver, x, 1.55, zface + 2.45, 0.075, 2.7);
    }
    // Corner fire stair, louvred service enclosure and terrace on the set-back.
    box(b, stone, cx - xf + 0.8, 1.87, cz - depth / 2 + 0.9, 2.3, 2.94, 2.35);
    finish(b, facade);
    b.clear();
    if (k === 6) {
      box(b, slab, 0, 0.13, 0, 19.95, 0.27, 14.7);
      for (let i = 0; i < 9; i++) box(b, silver, -9 + i * 2.1, 0.68, 7.13, 0.046, 1.05, 0.046);
      box(b, silver, 0, 1.2, 7.13, 19.8, 0.06, 0.08);
    }
    if (k === STORIES - 1) {
      box(b, stone, cx, 3.38, cz, mainWidth - 0.55, 0.34, depth - 0.45);
      const roof = 3.75;
      for (const side of [-1, 1]) {
        box(b, slab, cx, roof, cz + (side * depth) / 2, mainWidth, 0.55, 0.16);
        box(b, slab, cx + side * xf, roof, cz, 0.16, 0.55, depth);
      }
      box(b, soffit, -3, 4.35, -2.8, 5.3, 1.65, 3.7);
      for (const x of [1.8, 4.25]) {
        box(b, silver, x, 4, -2, 1.97, 0.82, 2.8);
        for (const z of [-2.7, -1.3]) {
          tube(b, black, x, 4.44, z, 0.51, 0.065);
          for (let j = 0; j < 4; j++)
            box(b, dark, x, 4.49, z, 0.88, 0.035, 0.08, (j * Math.PI) / 4);
        }
      }
      tube(b, silver, -6.8, 6, -4.5, 0.065, 4.9);
      box(b, silver, -6.8, 7.95, -4.5, 0.9, 0.035, 0.035);
    }
    finish(b, level);
  }
  installFacade(floors, LEVEL, () => disposed, fixed, manager);
  finish(site, ground);
  unit.dispose();
  ball.dispose();
  cylinder.dispose();
  scene.add(new T.HemisphereLight(0xf2f6ef, 0x797064, 1.38));
  const sun = new T.DirectionalLight(0xffe9c8, 2.45);
  sun.position.set(-39, 65, 42);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, {
    left: -39,
    right: 39,
    top: 40,
    bottom: -36,
    near: 0.5,
    far: 174,
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00015;
  scene.add(sun, sun.target);
  // A survey mast stands beside the tested building and indicates the fixed vertical.
  const refMat = new T.LineDashedMaterial({
    color: 0xe9bc76,
    dashSize: 0.55,
    gapSize: 0.45,
    transparent: true,
    opacity: 0.68,
  });
  const line = new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(11.1, 0.32, 4),
      new T.Vector3(11.1, 31, 4),
    ]),
    refMat,
  );
  line.computeLineDistances();
  ground.add(line);
  const cameraRay = new T.Vector3(0.62, -0.04, 1).normalize(),
    focus = new T.Vector3(0, 14.8, 0);
  function update(f: WorldFrame, aspect: number) {
    // Rig model x/y horizontal correspond to world X and Z; world height is Y.
    ground.position.set(f.deckX * SCENE_SCALE, f.deckZ * SCENE_SCALE, f.deckY * SCENE_SCALE);
    fixed.position.copy(ground.position);
    for (let i = 0; i < floors.length; i++) {
      const story = floors[i],
        top = structuralDrift(f.specimen, i + 1),
        bottom = structuralDrift(f.specimen, i);
      story.position.x = top;
      story.matrix.makeShear(0, 0, (top - bottom) / LEVEL, 0, 0, 0).setPosition(story.position);
      story.matrixWorldNeedsUpdate = true;
    }
    camera.aspect = aspect;
    camera.fov = 37;
    const distance = Math.max(64, 51 / Math.max(0.65, aspect));
    camera.position.copy(cameraRay).multiplyScalar(distance).add(focus);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
  }
  return {
    scene,
    camera,
    update,
    dispose() {
      disposed = true;
      skyTexture?.dispose();
      backdrop.dispose();
    },
  };
}
