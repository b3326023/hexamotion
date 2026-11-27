import * as T from "three";
import {
  group,
  mesh,
  box,
  cyl,
  rod,
  ring,
  bolt,
  metal,
  glow,
  studio,
  placard,
  shadow,
  compact,
  tau,
  texture,
  type XYZ,
} from "./precision-art";
import type { WorldView } from "./types";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const ws = studio(manager, "/worlds/optics/environment.webp", {
    eye: [6.6, 2.55, 8.25],
    target: [0, 2.44, 0],
    fov: 34,
    env: 1.08,
    bg: 0.81,
    key: 1.57,
    rot: 1.92,
    blur: 0,
  });
  const { scene } = ws,
    steel = metal("#c3cbd0", 0.74, 0.27),
    navy = metal("#1b3644", 0.58, 0.34),
    char = metal("#20272e", 0.6, 0.32),
    paint = metal("#b6c5c8", 0.54, 0.32),
    gold = metal("#b78c51", 0.83, 0.28),
    pad = metal("#747c7d", 0.12, 0.8);
  const base = group(scene);
  cyl(base, 4.02, 4.19, 0.39, [0, -0.2, 0], pad, 88);
  ring(base, 3.87, 0.055, [0, 0.016, 0], steel);
  shadow(base, 0, 0, 5.2, 4.6, 0.016, 0.79);
  cyl(base, 1.44, 1.69, 0.39, [0, 0.22, 0], navy, 64);
  cyl(base, 1.5, 1.47, 0.11, [0, 0.46, 0], steel, 72);
  cyl(base, 1.24, 1.43, 0.29, [0, 0.66, 0], paint, 64);
  for (let i = 0; i < 24; i++) {
    const a = (i * tau) / 24;
    bolt(base, [1.37 * Math.cos(a), 0.528, 1.37 * Math.sin(a)], 0.047, char, steel);
  }
  for (const x of [-1.3, 1.3]) {
    rod(base, [x * 0.79, 0.73, 0.59], [x, 2.3, 0], 0.175, paint, 12);
    rod(base, [x * 0.79, 0.73, -0.59], [x, 2.3, 0], 0.175, paint, 12);
    box(base, [0.38, 0.26, 1.36], [x * 0.82, 0.8, 0], navy, 0.05);
    const bearing = cyl(base, 0.4, 0.4, 0.31, [x, 2.3, 0], navy, 48);
    bearing.rotation.z = Math.PI / 2;
    const plate = cyl(base, 0.24, 0.24, 0.33, [x * 1.04, 2.3, 0], steel, 40);
    plate.rotation.z = Math.PI / 2;
  }
  const scope = group(base, [0, 2.3, 0]);
  scope.rotation.x = 0.58;
  scope.rotation.z = -0.13;
  cyl(scope, 1.24, 1.09, 0.49, [0, -0.28, 0], char, 72);
  cyl(scope, 1.28, 1.24, 0.15, [0, -0.08, 0], paint, 72);
  ring(scope, 1.19, 0.062, [0, 0.02, 0], steel);
  // Individual hexagonal primary mirror segments sit in a black-backed cell.
  const mirrors = [0xb2cbd9, 0xc8d3d5, 0xa2b8c8, 0xb3c8cf, 0xaac3bc].map(
    (c) =>
      new T.MeshPhysicalMaterial({
        color: c,
        metalness: 0.74,
        roughness: 0.14,
        clearcoat: 0.7,
        envMapIntensity: 1.44,
      }),
  );
  const rr = 0.265;
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2 || (!q && !r)) continue;
      const x = rr * 1.715 * (q + r / 2),
        z = rr * 1.48 * r,
        rad = Math.hypot(x, z);
      const tile = cyl(
        scope,
        rr * 0.98,
        rr * 0.98,
        0.053,
        [x, 0.002 + rad * rad * 0.09, z],
        mirrors[(q + 2 * r + 9) % 5],
        6,
      );
      tile.rotation.x = z * 0.15;
      tile.rotation.z = -x * 0.15;
    }
  cyl(scope, 0.23, 0.25, 0.13, [0, 0.07, 0], char);
  ring(scope, 0.22, 0.022, [0, 0.15, 0], gold);
  for (let i = 0; i < 8; i++) {
    const a = (i * tau) / 8 + 0.19,
      b = ((i + 1) * tau) / 8 + 0.19,
      x = Math.cos(a),
      z = Math.sin(a),
      u = Math.cos(b),
      v = Math.sin(b);
    rod(scope, [1.18 * x, 0.04, 1.18 * z], [0.85 * u, 2.45, 0.85 * v], 0.048, char);
    rod(scope, [1.18 * u, 0.04, 1.18 * v], [0.85 * x, 2.45, 0.85 * z], 0.039, paint);
    cyl(scope, 0.071, 0.081, 0.105, [1.18 * x, 0.072, 1.18 * z], gold, 16);
    rod(scope, [0.85 * x, 2.43, 0.85 * z], [0, 2.43, 0], 0.023, navy);
    bolt(scope, [0.86 * x, 2.48, 0.86 * z], 0.047, steel, char);
  }
  ring(scope, 0.86, 0.074, [0, 2.44, 0], paint);
  ring(scope, 0.86, 0.033, [0, 2.25, 0], navy);
  const secondary = group(scope, [0, 2.4, 0]);
  cyl(secondary, 0.3, 0.25, 0.22, [0, 0, 0], char, 40);
  cyl(secondary, 0.21, 0.25, 0.09, [0, -0.13, 0], mirrors[0], 36);
  for (let i = 0; i < 3; i++) {
    const a = (i * tau) / 3;
    rod(
      secondary,
      [0.24 * Math.cos(a), 0.05, 0.24 * Math.sin(a)],
      [0.19 * Math.cos(a + 0.5), 0.32, 0.19 * Math.sin(a + 0.5)],
      0.034,
      gold,
    );
  }
  cyl(secondary, 0.19, 0.18, 0.08, [0, 0.31, 0], navy, 32);
  const sensor = group(scope, [0, 0.18, 0]);
  const spot = mesh(sensor, new T.SphereGeometry(0.045, 12, 10), glow("#f9ad61", 2), [0, 0, 0]);
  spot.userData.moving = true;
  // The open observation deck includes shutter rails, a service stair and red night-safe lights.
  for (let i = 0; i < 18; i++) {
    const a = (i / 17) * Math.PI * 1.13 + Math.PI * 0.76;
    const b = a + (Math.PI * 1.13) / 17;
    const point = (k: number, h: number): XYZ => [3.73 * Math.cos(k), h, 3.73 * Math.sin(k)];
    rod(base, point(a, 0), point(a, 0.81), 0.026, steel);
    if (i < 17) {
      rod(base, point(a, 0.81), point(b, 0.81), 0.031, steel);
      rod(base, point(a, 0.44), point(b, 0.44), 0.017, char);
    }
  }
  const cabinet = group(base, [-2.38, 0, -0.6]);
  box(cabinet, [0.72, 0.97, 0.66], [0, 0.51, 0], navy, 0.05);
  box(cabinet, [0.59, 0.77, 0.039], [0, 0.52, 0.345], paint, 0.024);
  for (let i = 0; i < 8; i++)
    box(cabinet, [0.43, 0.023, 0.018], [0, 0.41 + i * 0.045, 0.372], char);
  placard(cabinet, [0, 0.79, 0.372], 0.49, 0.14, "AZ / EL", "SERVO DRIVE");
  for (const z of [-1.1, 1.0]) {
    cyl(base, 0.07, 0.08, 0.43, [-2.62, 0.23, z], char);
    cyl(base, 0.074, 0.074, 0.08, [-2.62, 0.47, z], glow("#d35839", 0.82));
  }
  // Service plaque mounted on the pedestal, below the optical path.
  placard(base, [-0.03, 0.37, 1.54], 1.11, 0.29, "T–04  /  OPTICS", "SEGMENTED REFLECTOR");
  const stars = new Float32Array(390 * 3);
  let seed = 231;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 390; i++) {
    const a = tau * rand(),
      h = 0.16 + rand() * 0.78,
      r = 93;
    stars.set(
      [r * Math.cos(a) * Math.sqrt(1 - h * h), r * h, r * Math.sin(a) * Math.sqrt(1 - h * h)],
      i * 3,
    );
  }
  const sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.BufferAttribute(stars, 3));
  scene.add(
    new T.Points(
      sg,
      new T.PointsMaterial({
        color: 0xc9dcff,
        size: 0.13,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    ),
  );
  const station = group(base, [1.94, 0, 1.07]);
  station.rotation.y = 0.52;
  box(station, [1.43, 0.11, 0.68], [0, 0.09, 0], navy, 0.05);
  rod(station, [0, 0.14, 0], [0, 0.96, 0], 0.086, steel);
  box(station, [1.55, 1.12, 0.16], [0, 1.37, 0], char, 0.055);
  const face = texture(400, 260, (c) => {
    c.fillStyle = "#102529";
    c.fillRect(0, 0, 400, 260);
    c.strokeStyle = "#416266";
    c.lineWidth = 1.5;
    for (const rr of [35, 70, 102]) {
      c.beginPath();
      c.arc(201, 135, rr, 0, tau);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(35, 135);
    c.lineTo(363, 135);
    c.moveTo(201, 18);
    c.lineTo(201, 245);
    c.stroke();
    c.fillStyle = "#c5daca";
    c.font = "bold 20px monospace";
    c.fillText("FOCAL PLANE", 8, 25);
    c.font = "14px monospace";
    c.fillText("M2 / XY", 294, 244);
  });
  mesh(
    station,
    new T.PlaneGeometry(1.38, 0.92),
    new T.MeshBasicMaterial({ map: face }),
    [0, 1.38, 0.09],
  );
  const sensorMark = group(station, [0, 1.38, 0.104]);
  const pinpoint = new T.MeshBasicMaterial({ color: 0xffc179 });
  ring(sensorMark, 0.05, 0.007, [0, 0, 0], pinpoint, "z");
  mesh(sensorMark, new T.CircleGeometry(0.018, 18), pinpoint, [0, 0, 0]);
  // A neighbouring slit dome puts the open engineering telescope in context.
  const dome = group(scene, [-8.7, -0.2, -5.3]);
  const remoteWhite = metal("#b1b9be", 0.43, 0.43);
  cyl(dome, 1.45, 1.57, 1.2, [0, 0.6, 0], navy, 56);
  cyl(dome, 1.53, 1.49, 0.12, [0, 1.24, 0], steel, 60);
  const roof = mesh(
    dome,
    new T.SphereGeometry(1.5, 48, 19, 0.16, Math.PI - 0.24, 0, Math.PI * 0.5),
    remoteWhite,
    [0, 1.28, 0],
  );
  const roofBack = mesh(
    dome,
    new T.SphereGeometry(1.5, 48, 19, Math.PI + 0.16, Math.PI - 0.24, 0, Math.PI * 0.5),
    remoteWhite,
    [0, 1.28, 0],
  );
  roof.rotation.y = roofBack.rotation.y = -0.62;
  ring(dome, 1.49, 0.031, [0, 1.27, 0], char);
  const slit = mesh(
    dome,
    new T.SphereGeometry(1.4, 48, 18, 0, tau, 0, Math.PI * 0.5),
    char,
    [0, 1.26, 0],
  );
  slit.castShadow = false;
  for (let i = 0; i < 6; i++) {
    const a = (i * tau) / 6;
    rod(
      dome,
      [1.43 * Math.cos(a), 0.04, 1.43 * Math.sin(a)],
      [1.43 * Math.cos(a), 1.2, 1.43 * Math.sin(a)],
      0.032,
      steel,
    );
  }
  compact(dome);
  compact(base);
  return {
    scene,
    camera: ws.camera,
    dispose() {
      ws.dispose();
      sg.dispose();
    },
    update(s, aspect) {
      ws.compose(aspect);
      secondary.position.set(s.deckX * 5, 2.4 + s.deckZ * 1.8, s.deckY * 5);
      secondary.rotation.set(-s.deckPitch * 3, 0, s.deckRoll * 3);
      sensorMark.position.set(s.planeX * 0.016, 1.38 + s.planeY * 0.016, 0.104);
      spot.position.x = s.planeX * 0.008;
      spot.position.z = s.planeY * 0.008;
    },
  };
}
