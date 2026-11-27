import * as T from "three";
import {
  group,
  mesh,
  box,
  cyl,
  rod,
  ring,
  bolt,
  cable,
  metal,
  glow,
  studio,
  placard,
  compact,
  tau,
  texture,
  panelTexture,
} from "./precision-art";
import type { WorldView } from "./types";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const ws = studio(manager, "/worlds/machining/environment.webp", {
    eye: [3.65, 3.24, 4.53],
    target: [0.1, 1.9, -0.13],
    fov: 34.5,
    rot: 2.15,
    bg: 0.6,
    blur: 0.045,
    key: 2.9,
  });
  const { scene } = ws,
    cell = group(scene),
    bone = metal("#d4d7cd", 0.42, 0.41),
    blue = metal("#263c46", 0.56, 0.34),
    char = metal("#252b2e", 0.45, 0.34),
    gun = metal("#657379", 0.83, 0.26),
    silver = metal("#c9d2d0", 0.9, 0.25),
    gold = metal("#be944d", 0.77, 0.3),
    orange = metal("#ce692c", 0.37, 0.32),
    teal = metal("#306380", 0.51, 0.3),
    red = glow("#e9763b", 0.48),
    light = glow("#f7efd6", 2.2);
  box(cell, [5.3, 0.4, 3.59], [0, 0.08, 0], blue, 0.12);
  box(cell, [5.52, 0.35, 3.69], [0, 0.38, 0], bone, 0.13);
  // Cast bed with T-slot channels, rear slide guards, raised side doors and work lamp.
  box(cell, [4.77, 0.23, 2.84], [0, 0.63, -0.02], char, 0.055);
  for (let i = 0; i < 8; i++)
    box(cell, [4.46, 0.095, 0.23], [0, 0.786, -1.22 + i * 0.336], gun, 0.015);
  box(cell, [5.12, 2.93, 0.26], [0, 2.01, -1.63], bone, 0.09);
  box(cell, [4.71, 2.47, 0.08], [0, 1.94, -1.459], blue, 0.04);
  for (let i = 0; i < 18; i++)
    box(cell, [4.55, 0.051, 0.05], [0, 1.13 + i * 0.096, -1.38], gun, 0.012);
  for (const sign of [-1, 1]) {
    box(cell, [0.27, 2.97, 2.44], [sign * 2.49, 2.01, -0.38], bone, 0.06);
    box(cell, [0.065, 1.78, 1.64], [sign * 2.31, 2.08, -0.39], blue, 0.025);
  }
  // Keep the near door open so the vice and tool remain visible.
  box(cell, [5.38, 0.37, 1.02], [0, 3.54, -1.16], bone, 0.09);
  box(cell, [4.68, 0.072, 0.14], [0, 3.344, -0.79], char, 0.025);
  box(cell, [4.43, 0.034, 0.094], [0, 3.299, -0.79], light, 0.018);
  const vise = group(cell, [0, 0.85, 0.15]);
  cyl(vise, 1.12, 1.24, 0.22, [0, 0.11, 0], blue, 72);
  ring(vise, 1.12, 0.046, [0, 0.236, 0], silver);
  for (let i = 0; i < 12; i++) {
    const a = (i * tau) / 12;
    bolt(vise, [1.026 * Math.cos(a), 0.235, 1.026 * Math.sin(a)], 0.063, silver, char);
  }
  box(vise, [1.94, 0.18, 1.26], [0, 0.33, 0], gun, 0.04);
  for (const z of [-0.56, 0.56]) {
    box(vise, [1.62, 0.34, 0.26], [0, 0.55, z], blue, 0.04);
    box(vise, [1.61, 0.16, 0.04], [0, 0.655, z - Math.sign(z) * 0.138], silver, 0.012);
  }
  const stockMat = metal("#a3b4b8", 0.82, 0.3),
    stockMap = panelTexture("#c8d2ce", "#363e40", 32, false);
  stockMat.map = stockMap;
  box(vise, [1.49, 0.32, 0.89], [0, 0.55, 0], stockMat, 0.022);
  const bedTop = 1.569;
  const path = group(cell, [0, bedTop, 0.15]);
  const target = ring(
    path,
    1,
    0.025,
    [0, 0, 0],
    new T.MeshBasicMaterial({
      color: 0xf7b646,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    }),
  );
  target.userData.moving = true;
  // A short measured trace accumulates tool-tip positions during the dry run.
  const actualMark = group(path);
  mesh(
    actualMark,
    new T.CircleGeometry(0.041, 32),
    new T.MeshBasicMaterial({ color: 0x33ead0 }),
    [0, 0.013, 0],
  ).rotation.x = -Math.PI / 2;
  const project = new T.MeshBasicMaterial({ color: 0x57e8ce, transparent: true, opacity: 0.62 });
  const probe = rod(actualMark, [0, 0.01, 0], [0, 0.16, 0], 0.006, project);
  const N = 680,
    positions = new Float32Array(N * 3);
  const geom = new T.BufferGeometry();
  const attr = new T.BufferAttribute(positions, 3);
  attr.setUsage(T.DynamicDrawUsage);
  geom.setAttribute("position", attr);
  geom.setDrawRange(0, 0);
  const trace = new T.Line(geom, new T.LineBasicMaterial({ color: 0x27edd2 }));
  trace.frustumCulled = false;
  path.add(trace);
  const slider = group(cell, [0, 0, 0]);
  box(slider, [0.72, 1.29, 0.53], [0, 2.76, -1.02], char, 0.055);
  box(slider, [0.9, 0.4, 1.64], [0, 3.12, -0.54], bone, 0.09);
  box(slider, [0.82, 0.13, 0.9], [0, 2.87, -0.29], blue, 0.036);
  const spindle = group(cell);
  box(spindle, [0.67, 0.64, 0.57], [0, 0.93, 0], bone, 0.082);
  const shaft = group(spindle);
  cyl(shaft, 0.28, 0.3, 0.31, [0, 0.55, 0], gun, 48);
  cyl(shaft, 0.24, 0.15, 0.28, [0, 0.27, 0], silver, 48);
  cyl(shaft, 0.146, 0.107, 0.15, [0, 0.088, 0], char, 32);
  cyl(shaft, 0.057, 0.039, 0.14, [0, -0.056, 0], gold, 24);
  for (let i = 0; i < 6; i++) {
    const a = (i * tau) / 6;
    rod(
      shaft,
      [0.125 * Math.cos(a), 0.092, 0.125 * Math.sin(a)],
      [0.103 * Math.cos(a + 0.22), 0.032, 0.103 * Math.sin(a + 0.22)],
      0.009,
      gun,
      8,
    );
  }
  for (const side of [-1, 1]) {
    const pts: [[number, number, number], [number, number, number], [number, number, number]] = [
      [side * 0.3, 0.83, -0.12],
      [side * 0.46, 0.59, 0.1],
      [side * 0.29, 0.27, 0.16],
    ];
    cable(spindle, pts, 0.063, teal, 15);
    for (let i = 0; i <= 7; i++) {
      const u = i / 7,
        point = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p))).getPoint(u);
      mesh(spindle, new T.SphereGeometry(0.081, 12, 9), teal, [point.x, point.y, point.z]);
    }
    rod(spindle, [side * 0.29, 0.27, 0.16], [side * 0.2, 0.17, 0.11], 0.052, orange, 14);
  }
  const cabinet = group(scene, [2.84, 0.0, 0.39]);
  cabinet.rotation.y = -0.28;
  box(cabinet, [0.32, 1.7, 0.4], [0, 1.02, 0], blue, 0.05);
  box(cabinet, [0.95, 1.23, 0.24], [0, 2.34, 0], bone, 0.07);
  box(cabinet, [0.81, 0.95, 0.029], [0, 2.39, 0.137], char, 0.018);
  const screen = texture(320, 220, (c) => {
    c.fillStyle = "#102e35";
    c.fillRect(0, 0, 320, 220);
    c.strokeStyle = "#37606a";
    for (let i = 0; i < 320; i += 24) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 220);
      c.stroke();
    }
    for (let i = 0; i < 220; i += 24) {
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(320, i);
      c.stroke();
    }
    c.strokeStyle = "#d8bb72";
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(130, 109, 75, 67, 0, 0, tau);
    c.stroke();
    c.fillStyle = "#c1d2bc";
    c.font = "18px monospace";
    c.fillText("G02   XY", 12, 26);
    c.font = "15px monospace";
    c.fillText("DRY RUN", 205, 200);
  });
  mesh(
    cabinet,
    new T.PlaneGeometry(0.7, 0.46),
    new T.MeshBasicMaterial({ map: screen }),
    [0, 2.56, 0.163],
  );
  for (let i = 0; i < 15; i++)
    box(
      cabinet,
      [0.068, 0.054, 0.034],
      [-0.32 + (i % 5) * 0.091, 2.22 - Math.floor(i / 5) * 0.077, 0.17],
      silver,
      0.008,
    );
  const stop = cyl(cabinet, 0.082, 0.064, 0.075, [0.244, 2.14, 0.184], red);
  stop.rotation.x = Math.PI / 2;
  placard(cell, [-1.32, 3.54, -0.63], 1.81, 0.21, "AX–5   CNC", "CONTOUR / MACHINING CENTRE");
  compact(cell);
  compact(cabinet);
  let last = -1,
    count = 0;
  return {
    scene,
    camera: ws.camera,
    dispose() {
      ws.dispose();
      geom.dispose();
    },
    update(s, aspect) {
      ws.compose(aspect);
      const scale = 15.0,
        x = s.planeX * 0.001 * scale,
        z = -s.planeY * 0.001 * scale,
        y = bedTop + 0.24 + s.deckZ * scale;
      actualMark.position.set(x, 0.012, z);
      probe.scale.y = Math.max(0.04, y - bedTop - 0.105) / 0.15;
      spindle.position.set(x, y, z + 0.15);
      spindle.rotation.set(-s.deckRoll, 0, s.deckPitch);
      slider.position.x = x;
      target.scale.setScalar(Math.max(0.001, s.radius) * scale);
      if (s.t < last) {
        last = -1;
        count = 0;
        geom.setDrawRange(0, 0);
      }
      if (s.t - last > 0.026) {
        last = s.t;
        if (count === N) positions.copyWithin(0, 3);
        else count++;
        const i = (count - 1) * 3;
        positions.set([x, 0.009, z], i);
        attr.needsUpdate = true;
        geom.setDrawRange(0, count);
      }
    },
  };
}
