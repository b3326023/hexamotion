import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldFrame, WorldView } from "./types";

const TAU = Math.PI * 2;
const ROOT = "/worlds/flight/";
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const section = [
  [-19.6, 1.12, 0.06],
  [-18.7, 1.07, 0.37],
  [-17, 0.86, 0.83],
  [-14.1, 0.44, 1.51],
  [-11.3, 0.14, 1.89],
  [-8.4, 0.02, 2.01],
  [-3.5, 0, 2.04],
  [6.5, 0, 2.04],
  [11.7, 0, 2.03],
  [13.3, -0.02, 1.99],
  [14.8, -0.11, 1.82],
  [16.2, -0.24, 1.48],
  [17.7, -0.43, 0.98],
  [18.72, -0.54, 0.47],
  [19.12, -0.57, 0.035],
];
const shellCurve = new THREE.CatmullRomCurve3(section.map(([x, y, r]) => V(x, y, r)));
const stations = shellCurve.getPoints(136);
const aft = section[0][0],
  fore = section[section.length - 1][0];
const xUV = (x: number) => (x - aft) / (fore - aft);

function shellPoint(x: number, angle: number, clearance = 0) {
  let i = 1;
  while (i < stations.length - 1 && stations[i].x < x) i++;
  const a = stations[i - 1],
    b = stations[i];
  const u = THREE.MathUtils.clamp((x - a.x) / (b.x - a.x), 0, 1);
  const radius = THREE.MathUtils.lerp(a.z, b.z, u) + clearance;
  return V(
    x,
    THREE.MathUtils.lerp(a.y, b.y, u) - Math.cos(angle) * radius * 1.045,
    Math.sin(angle) * radius,
  );
}

function meshGrid(points: THREE.Vector3[], uv: number[], rows: number, cols: number) {
  const geo = new THREE.BufferGeometry();
  const pos = points.flatMap((p) => [p.x, p.y, p.z]);
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c,
        b = a + cols;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function fuselageGeometry() {
  const pts: THREE.Vector3[] = [],
    uvs: number[] = [];
  for (const { x, y, z: r } of stations) {
    for (let j = 0; j <= 96; j++) {
      const theta = (TAU * j) / 96;
      pts.push(V(x, y - Math.cos(theta) * r * 1.045, Math.sin(theta) * r));
      uvs.push(xUV(x), j / 96);
    }
  }
  return meshGrid(pts, uvs, stations.length, 97);
}

function paintAirframe() {
  const canvas = document.createElement("canvas");
  canvas.width = 3072;
  canvas.height = 768;
  const ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#f0f1ed";
  ctx.fillRect(0, 0, w, h);
  // The seam is under the fuselage. Mirror the two painted sides around the roof.
  for (const sign of [-1, 1]) {
    ctx.save();
    ctx.translate(0, h * 0.5);
    ctx.scale(1, sign);
    const lower = (u: number) => h * (0.338 - 0.21 * Math.pow(1 - u, 2.35));
    ctx.beginPath();
    ctx.moveTo(0, h * 0.51);
    for (let i = 0; i <= 100; i++) ctx.lineTo((w * i) / 100, lower(i / 100));
    ctx.lineTo(w, h * 0.51);
    ctx.closePath();
    ctx.fillStyle = "#244457";
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) ctx.lineTo((w * i) / 100, lower(i / 100) - 2);
    for (let i = 100; i >= 0; i--)
      ctx.lineTo((w * i) / 100, lower(i / 100) - h * (0.007 + 0.04 * Math.pow(1 - i / 100, 2)));
    ctx.closePath();
    ctx.fillStyle = "#ed7337";
    ctx.fill();
    // Circumferential skin joins, cargo access panels, static pressure ports.
    for (let x = -13.6; x < 16; x += 1.02) {
      const xx = xUV(x) * w;
      ctx.strokeStyle = "rgba(75,83,81,0.15)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, h * 0.48);
      ctx.stroke();
    }
    const px = (x: number) => xUV(x) * w;
    const round = (
      x: number,
      y: number,
      width: number,
      height: number,
      r: number,
      fill: string,
    ) => {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, r);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    for (const dx of [-11.55, -1.2, 1.3, 11.5]) {
      const xx = px(dx),
        yy = h * 0.159,
        bw = dx > 10 || dx < -10 ? 67 : 55,
        bh = 100;
      ctx.strokeStyle = "#838789";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(xx - bw / 2, yy, bw, bh, 8);
      ctx.stroke();
      round(xx - bw * 0.18, yy + bh * 0.48, 10, 3, 1.5, "#777b7c");
      round(xx - 6, yy + 10, 12, 13, 4, "#294255");
      ctx.fillStyle = "#b05238";
      ctx.fillRect(xx - 5, yy + bh - 11, 10, 2);
    }
    for (let x = -10.6; x < 11.1; x += 0.68) {
      if ([-1.2, 1.3].some((d) => Math.abs(x - d) < 0.47)) continue;
      const xx = px(x),
        yy = h * 0.184,
        ww = 24,
        hh = 29;
      round(xx - ww * 0.5, yy, ww, hh, 10, "#c1cbc9");
      const g = ctx.createLinearGradient(0, yy, 0, yy + hh);
      g.addColorStop(0, "#587280");
      g.addColorStop(0.36, "#304653");
      g.addColorStop(1, "#1c2c35");
      ctx.beginPath();
      ctx.roundRect(xx - ww * 0.5 + 2, yy + 2, ww - 4, hh - 4, 8);
      ctx.fillStyle = g;
      ctx.fill();
      if (Math.round(x * 13) % 8 === 0) {
        round(xx - ww * 0.5 + 4, yy + 3, ww - 8, 7, 2, "#b8c1bf");
      }
    }
    // Markings are applied to the curved skin rather than a floating text plane.
    ctx.save();
    ctx.translate(px(7.05), h * 0.145);
    ctx.scale(sign > 0 ? 1 : -1, sign);
    ctx.fillStyle = "#233c49";
    ctx.font = "italic 700 43px Arial";
    ctx.textAlign = "center";
    ctx.fillText("HEXA AIR", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(px(-7.8), h * 0.262);
    ctx.scale(sign > 0 ? 1 : -1, sign);
    ctx.fillStyle = "#45565c";
    ctx.font = "600 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("HX-306", 0, 0);
    ctx.restore();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function alloy(color: THREE.ColorRepresentation, metalness = 0.12, roughness = 0.38) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide });
}

class Assembly {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geometry: THREE.BufferGeometry, material: THREE.Material, at?: THREE.Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (at) g.applyMatrix4(at);
    for (const name of Object.keys(g.attributes))
      if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute("uv"))
      g.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(new Float32Array(2 * g.getAttribute("position").count), 2),
      );
    const set = this.parts.get(material) ?? [];
    set.push(g);
    this.parts.set(material, set);
  }
  finish() {
    const group = new THREE.Group();
    for (const [mat, parts] of this.parts) {
      const g = mergeGeometries(parts)!;
      const mesh = new THREE.Mesh(g, mat);
      group.add(mesh);
      parts.forEach((p) => p.dispose());
    }
    return group;
  }
}

// Chordwise camber and thickness create a real leading edge and a thin trailing edge.
type AirfoilStation = [number, number, number, number, number]; // span, lead X, trail X, rise, thickness fraction
function foil(stations: AirfoilStation[], side: number, vertical = false) {
  const pts: THREE.Vector3[] = [],
    uv: number[] = [];
  for (const [span, lead, trail, rise, thick] of stations) {
    for (let j = 0; j <= 44; j++) {
      const theta = (TAU * j) / 44,
        u = (1 - Math.cos(theta)) / 2,
        c = lead - trail;
      const t =
        5 *
        thick *
        c *
        (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      const h = vertical ? 0 : 0.012 * c * 4 * u * (1 - u);
      const a = THREE.MathUtils.lerp(lead, trail, u),
        b = rise + h + Math.sign(Math.sin(theta)) * t;
      pts.push(vertical ? V(a, span, b) : V(a, b, side * span));
      uv.push(u, span / 18);
    }
  }
  const g = meshGrid(pts, uv, stations.length, 45);
  if ((side > 0 && !vertical) || vertical) {
    const ix = g.index!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    g.computeVertexNormals();
  }
  return g;
}

function tube(points: THREE.Vector3[], r: number, sides = 6) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    Math.max(5, points.length * 2),
    r,
    sides,
    false,
  );
}
function oval(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  return new THREE.SphereGeometry(1, 22, 12).scale(rx, ry, rz).translate(x, y, z);
}
function latheX(profile: number[][], x: number, y: number, z: number) {
  return new THREE.LatheGeometry(
    profile.map(([localX, r]) => new THREE.Vector2(r, localX)),
    72,
  )
    .rotateZ(-Math.PI / 2)
    .translate(x, y, z);
}
function patch(corners: THREE.Vector3[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      corners.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  const ix: number[] = [];
  for (let i = 1; i < corners.length - 1; i++) ix.push(0, i, i + 1);
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function makePlane() {
  const batch = new Assembly(),
    texture = paintAirframe();
  const fanAssemblies: THREE.Group[] = [];
  const skin = alloy("#ffffff", 0.24, 0.28);
  skin.map = texture;
  const white = alloy("#ecefe9", 0.23, 0.3),
    silver = alloy("#aab5b7", 0.78, 0.23);
  const navy = alloy("#183d52", 0.38, 0.29),
    orange = alloy("#f37337", 0.27, 0.32);
  const black = alloy("#1e272b", 0.42, 0.38),
    lines = alloy("#7c898e", 0.37, 0.42),
    glass = alloy("#233846", 0.65, 0.145);
  const blade = alloy("#6f8288", 0.8, 0.24);
  batch.add(fuselageGeometry(), skin);
  for (const sign of [-1, 1]) {
    // Three windshield panes per side wrap around the narrowing cockpit.
    const glassPanels = [
      [
        [17.55, 0.036],
        [16.1, 1.04],
        [15.52, 0.76],
        [16.62, 0.028],
      ],
      [
        [16.05, 1.052],
        [14.7, 1.29],
        [14.31, 0.91],
        [15.47, 0.772],
      ],
      [
        [14.64, 1.29],
        [13.62, 1.26],
        [13.53, 0.94],
        [14.25, 0.92],
      ],
    ];
    for (const panel of glassPanels) {
      // Values are measured away from the crown of the nose.
      const skinPane: THREE.Vector3[] = [];
      const tex: number[] = [];
      for (let i = 0; i <= 7; i++)
        for (let j = 0; j <= 9; j++) {
          const u = i / 7,
            v = j / 9;
          const a = THREE.MathUtils.lerp(panel[0][0], panel[3][0], u);
          const b = THREE.MathUtils.lerp(panel[1][0], panel[2][0], u);
          const c0 = THREE.MathUtils.lerp(panel[0][1], panel[3][1], u);
          const c1 = THREE.MathUtils.lerp(panel[1][1], panel[2][1], u);
          skinPane.push(
            shellPoint(
              THREE.MathUtils.lerp(a, b, v),
              Math.PI - sign * THREE.MathUtils.lerp(c0, c1, v),
              0.025,
            ),
          );
          tex.push(u, v);
        }
      batch.add(meshGrid(skinPane, tex, 8, 10), glass);
      for (let i = 0; i < 4; i++) {
        const start = panel[i],
          end = panel[(i + 1) % 4];
        const edge = Array.from({ length: 6 }, (_, k) =>
          shellPoint(
            THREE.MathUtils.lerp(start[0], end[0], k / 5),
            Math.PI - sign * THREE.MathUtils.lerp(start[1], end[1], k / 5),
            0.039,
          ),
        );
        batch.add(tube(edge, 0.026), silver);
      }
    }
    const wing: AirfoilStation[] = [
      [1.28, 5.25, -7.25, -0.69, 0.125],
      [3.8, 3.86, -7.07, -0.54, 0.105],
      [7.3, 1.85, -6.8, -0.3, 0.088],
      [12.6, -1.3, -6.48, 0.18, 0.072],
      [16.9, -4.03, -6.1, 0.78, 0.058],
      [17.25, -4.53, -5.99, 1.05, 0.052],
    ];
    batch.add(foil(wing, sign), white);
    // Raised spoiler/flap seams and the polished leading-edge anti-icing strip.
    const edge = (fraction: number, bump: number) =>
      wing.map(([z, lead, trail, y, t]) =>
        V(
          THREE.MathUtils.lerp(lead, trail, fraction),
          y +
            (lead - trail) *
              (0.012 * 4 * fraction * (1 - fraction) +
                5 *
                  t *
                  (0.2969 * Math.sqrt(fraction) -
                    0.126 * fraction -
                    0.3516 * fraction ** 2 +
                    0.2843 * fraction ** 3 -
                    0.1036 * fraction ** 4)) +
            bump,
          z * sign,
        ),
      );
    batch.add(patch([...edge(0.008, 0.012), ...edge(0.048, 0.012).reverse()]), silver);
    for (const u of [0.55, 0.78]) batch.add(tube(edge(u, 0.018), 0.017), lines);
    for (const i of [2, 3, 4])
      batch.add(
        tube([edge(0.36, 0.024)[i], edge(0.61, 0.024)[i], edge(0.94, 0.024)[i]], 0.014),
        lines,
      );
    for (const z of [4.5, 7.7, 10.8])
      batch.add(oval(-5.66, -0.55 + z * 0.037, z * sign, 2.17, 0.25, 0.22), white);
    // Blended winglet, vertical navigation lamp and horizontal stabilizer.
    const winglet: AirfoilStation[] = [
      [16.77, -3.98, -6.11, 0.76, 0.06],
      [17.18, -4.41, -5.98, 1.06, 0.06],
      [17.48, -4.88, -6.03, 2.04, 0.065],
      [17.68, -5.75, -6.24, 3.21, 0.04],
    ];
    batch.add(foil(winglet, sign), navy);
    const lamp = alloy(sign > 0 ? "#52b888" : "#f04d3f", 0.06, 0.2);
    lamp.emissive.set(sign > 0 ? "#167750" : "#c02a1e");
    batch.add(oval(-5.94, 3.13, sign * 17.68, 0.21, 0.08, 0.055), lamp);
    batch.add(
      foil(
        [
          [0.92, -11.8, -18.42, 1.17, 0.105],
          [3.0, -13.0, -18.45, 1.36, 0.085],
          [6.8, -15.95, -18.97, 1.76, 0.06],
          [7.05, -16.42, -19.02, 1.78, 0.045],
        ],
        sign,
      ),
      white,
    );
    // Nacelle, open intake with separate fan stage, spinner, hot core nozzle and pylon.
    const x = 2.3,
      y = -1.26,
      z = sign * 5.47;
    batch.add(
      latheX(
        [
          [-2.34, 0.69],
          [-2.2, 0.9],
          [-1.6, 1.09],
          [-0.45, 1.23],
          [1.4, 1.24],
          [1.8, 1.19],
          [1.94, 1.14],
        ],
        x,
        y,
        z,
      ),
      navy,
    );
    batch.add(
      latheX(
        [
          [1.7, 1.204],
          [1.87, 1.19],
          [2.01, 1.14],
          [2.035, 1.08],
          [1.99, 1.01],
          [1.82, 0.986],
        ],
        x,
        y,
        z,
      ),
      silver,
    );
    batch.add(
      latheX(
        [
          [1.83, 0.991],
          [1.39, 0.998],
          [1.23, 0.98],
        ],
        x,
        y,
        z,
      ),
      black,
    );
    batch.add(
      latheX(
        [
          [-2.36, 0.65],
          [-2.75, 0.6],
          [-2.8, 0.55],
          [-2.39, 0.49],
        ],
        x,
        y,
        z,
      ),
      silver,
    );
    batch.add(
      latheX(
        [
          [-3.03, 0.03],
          [-2.58, 0.32],
          [-2.15, 0.39],
        ],
        x,
        y,
        z,
      ),
      black,
    );
    batch.add(
      latheX(
        [
          [1.35, 0.01],
          [1.35, 1.0],
        ],
        x,
        y,
        z,
      ),
      black,
    );
    batch.add(
      latheX(
        [
          [1.35, 0.3],
          [1.53, 0.275],
          [1.74, 0.195],
          [1.89, 0.035],
        ],
        x,
        y,
        z,
      ),
      silver,
    );
    const fan = new Assembly();
    for (let j = 0; j < 28; j++) {
      const a = (j / 28) * TAU;
      const ring = (r: number, theta: number, dx: number) =>
        V(dx, r * Math.cos(theta), r * Math.sin(theta));
      fan.add(
        patch([
          ring(0.3, a, 1.51),
          ring(0.55, a + 0.11, 1.49),
          ring(0.96, a + 0.19, 1.55),
          ring(0.982, a + 0.3, 1.38),
          ring(0.55, a + 0.24, 1.36),
        ]),
        blade,
      );
    }
    const rotor = fan.finish();
    rotor.position.set(x, y, z);
    fanAssemblies.push(rotor);
    batch.add(
      foil(
        [
          [0.04, 2.21, -1.89, 0, 0.11],
          [0.48, 1.51, -2.25, 0, 0.135],
          [1.48, 0.03, -2.57, 0, 0.115],
        ],
        1,
        true,
      ).translate(x, y + 0.4, z),
      white,
    );
    batch.add(
      latheX(
        [
          [-0.64, 1.22],
          [-0.61, 1.225],
        ],
        x,
        y,
        z,
      ),
      silver,
    );
  }
  batch.add(
    foil(
      [
        [0.6, -8.6, -18.4, 0, 0.13],
        [2.15, -10.75, -18.3, 0, 0.11],
        [3.26, -12.26, -18.35, 0, 0.105],
        [7.46, -15.85, -19.12, 0, 0.08],
        [8.26, -16.83, -19.1, 0, 0.055],
      ],
      1,
      true,
    ),
    navy,
  );
  for (const sign of [-1, 1]) {
    const points = [
      [-10.75, 2.17, 0.11],
      [-13.78, 2.17, 0.47],
      [-18.3, 7.9, 0.12],
      [-17.78, 7.9, 0.13],
      [-13.55, 3.24, 0.43],
    ];
    batch.add(patch(points.map(([x, y, z]) => V(x, y, z * sign))), orange);
    batch.add(
      tube(
        [V(-16.4, 3.02, sign * 0.34), V(-17.8, 6.22, sign * 0.19), V(-18.6, 7.95, sign * 0.09)],
        0.017,
      ),
      lines,
    );
  }
  batch.add(oval(-2.3, 2.13, 0, 0.56, 0.19, 0.24), white);
  const group = batch.finish();
  group.add(...fanAssemblies);
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  group.name = "HEXA AIR · twin-engine transport";
  return { group, fans: fanAssemblies };
}

function addLandscape(world: THREE.Group, signal: AbortSignal, manager?: THREE.LoadingManager) {
  const side = 40320,
    intervals = 256;
  const map = new THREE.TextureLoader(manager).load(ROOT + "oberland.webp");
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry(side, side, intervals, intervals).rotateX(-Math.PI / 2);
  const distant = new THREE.PlaneGeometry(side, side, 64, 64).rotateX(-Math.PI / 2);
  // The orthophoto includes real terrain illumination. Soft atmospherics restore distance.
  const material = new THREE.MeshBasicMaterial({
    map,
    color: 0xe8ede6,
    fog: true,
    side: THREE.DoubleSide,
  });
  const tiles: THREE.Mesh[] = [];
  for (let row = -1; row <= 1; row++)
    for (let col = -1; col <= 1; col++) {
      const mesh = new THREE.Mesh(row === 0 && col === 0 ? geometry : distant, material);
      mesh.visible = false;
      world.add(mesh);
      tiles.push(mesh);
    }
  const elevationUrl = ROOT + "oberland.elev";
  manager?.itemStart(elevationUrl);
  void fetch(elevationUrl, { signal })
    .then((r) => {
      if (!r.ok) throw new Error("Unable to load flight elevation field");
      return r.arrayBuffer();
    })
    .then((buffer) => {
      if (signal.aborted) return;
      const value = new Uint16Array(buffer),
        position = geometry.getAttribute("position");
      if (value.length !== position.count) throw new Error("Invalid terrain elevation field");
      for (let i = 0; i < value.length; i++) position.setY(i, value[i]);
      position.needsUpdate = true;
      const low = distant.getAttribute("position");
      for (let row = 0; row <= 64; row++) {
        for (let col = 0; col <= 64; col++)
          low.setY(row * 65 + col, value[row * 4 * (intervals + 1) + col * 4]);
      }
      low.needsUpdate = true;
      distant.computeBoundingSphere();
      distant.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      tiles.forEach((tile) => (tile.visible = true));
    })
    .catch((error) => {
      if (!signal.aborted) {
        manager?.itemError(elevationUrl);
        console.error(error);
      }
    })
    .finally(() => manager?.itemEnd(elevationUrl));

  const cloudMaterials: THREE.SpriteMaterial[] = [];
  const clouds: THREE.Sprite[] = [];
  // Several independent cloud banks drift below the aircraft in front of the terrain.
  for (let i = 0; i < 4; i++) {
    const cm = new THREE.SpriteMaterial({
      visible: false,
      color: 0xf5f6f2,
      opacity: 0.91,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    cloudMaterials.push(cm);
    for (let j = 0; j < 5; j++) {
      const cloud = new THREE.Sprite(cm),
        n = i * 5 + j;
      cloud.userData.x = (((n * 2939 + 6573) % 15983) / 15983 - 0.5) * 48000;
      cloud.userData.z = (((n * 9323 + 3199) % 18647) / 18647 - 0.5) * 48000;
      cloud.position.y = 2700 + 730 * Math.sin(n * 2.43);
      const width = 2050 + 1200 * Math.cos(n * 1.75);
      cloud.scale.set(width, width * 0.4, 1);
      if (n < 2) {
        cloud.userData.x = n === 0 ? -7300 : -6500;
        cloud.userData.z = n === 0 ? 1300 : -7100;
        cloud.position.y = n === 0 ? 3650 : 3340;
        cloud.scale.set(n === 0 ? 3450 : 4200, n === 0 ? 1250 : 1650, 1);
      }
      world.add(cloud);
      clouds.push(cloud);
    }
  }
  const atlas = new THREE.TextureLoader(manager).load(ROOT + "cloudbanks.webp", (loaded) => {
    if (signal.aborted) return;
    loaded.colorSpace = THREE.SRGBColorSpace;
    cloudMaterials.forEach((material, i) => {
      const map = loaded.clone();
      map.repeat.set(0.5, 0.5);
      map.offset.set((i % 2) * 0.5, Math.floor(i / 2) * 0.5);
      material.map = map;
      material.visible = true;
      material.needsUpdate = true;
    });
  });
  const wrap = (n: number, range: number) => n - range * Math.floor(n / range + 0.5);
  return {
    place(x: number, z: number, t: number) {
      const ix = Math.floor(x / side + 0.5),
        iz = Math.floor(z / side + 0.5);
      for (let i = 0; i < tiles.length; i++) {
        const tx = ix + (i % 3) - 1,
          tz = iz + Math.floor(i / 3) - 1;
        tiles[i].scale.set(tx % 2 === 0 ? 1 : -1, 1, tz % 2 === 0 ? 1 : -1);
        tiles[i].position.set(tx * side - x, 0, tz * side - z);
      }
      for (const cloud of clouds) {
        cloud.position.x = wrap(cloud.userData.x - x + 3 * t, 48000);
        cloud.position.z = wrap(cloud.userData.z - z, 48000);
      }
    },
    dispose() {
      atlas.dispose();
    },
  };
}

export function createFlightWorld(manager?: THREE.LoadingManager): WorldView {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1.75, 0.6, 72000);
  const sky = new THREE.TextureLoader(manager).load(ROOT + "alpine-sky.webp");
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.backgroundIntensity = 1.05;
  scene.fog = new THREE.FogExp2(0xb6cbd9, 0.000032);
  const abort = new AbortController(),
    landGroup = new THREE.Group();
  scene.add(landGroup);
  const landscape = addLandscape(landGroup, abort.signal, manager);
  const { group: plane, fans } = makePlane();
  scene.add(plane);
  scene.add(new THREE.HemisphereLight(0xe5f3ff, 0x879185, 1.08));
  const light = new THREE.DirectionalLight(0xffedca, 2.15);
  light.position.set(-12, 23, 13);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {
    left: -25,
    right: 25,
    top: 24,
    bottom: -24,
    near: 1,
    far: 65,
  });
  light.shadow.bias = -0.00023;
  light.shadow.normalBias = 0.024;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xc5e0ff, 1.0);
  rim.position.set(-7, 5, -9);
  scene.add(rim);
  let previousDistance = 0,
    groundX = 3300,
    groundZ = 1000,
    altitude = 5500;
  return {
    scene,
    camera,
    update(f: WorldFrame, aspect: number) {
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      if (f.distance < previousDistance) {
        groundX = 3300;
        groundZ = 1000;
        altitude = 5500;
      }
      const delta = f.distance >= previousDistance ? f.distance - previousDistance : 0;
      previousDistance = f.distance;
      // Camera and plane use a floating local origin. Terrain and cloud translations
      // come from the simulated ground track and climb angle, never from wall time.
      // A clockwise pilot heading points towards the starboard (+Z) wing. Three.js
      // positive rotations about +Y turn the nose (+X) towards port.
      const heading = 0.66 - f.heading;
      groundX += delta * Math.cos(heading);
      groundZ -= delta * Math.sin(heading);
      altitude = THREE.MathUtils.clamp(altitude + delta * Math.sin(f.pitch), 4350, 7200);
      landscape.place(groundX, groundZ, f.t);
      landGroup.rotation.y = -heading;
      landGroup.position.y = -altitude;
      scene.backgroundRotation.y = -heading + 0.37;
      plane.rotation.set(f.roll, -f.yaw, f.pitch, "YZX");
      plane.position.y = f.deckZ * 18;
      for (const fan of fans) fan.rotation.x = f.t * (105 + f.speed * 0.29);
      const distanceScale = THREE.MathUtils.clamp(1.6 / aspect, 1, 1.38);
      camera.position.set(
        (25.5 + 1.4 * Math.sin(0.115 * f.t)) * distanceScale,
        (10.1 + 0.7 * Math.cos(0.1 * f.t)) * distanceScale,
        (29.4 - 0.5 * Math.sin(f.t * 0.13)) * distanceScale,
      );
      camera.lookAt(0.0, 1.0, 0);
    },
    dispose() {
      abort.abort();
      landscape.dispose();
      light.shadow.dispose();
      sky.dispose();
    },
  };
}
