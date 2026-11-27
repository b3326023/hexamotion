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
  shadow,
  compact,
  texture,
  panelTexture,
} from "./precision-art";
import type { WorldView } from "./types";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const ws = studio(manager, "/worlds/camera/environment.webp", {
    eye: [2.57, 2.53, 3.19],
    target: [-0.12, 0.7, 0],
    fov: 35,
    rot: 1.16,
    bg: 0.5,
    blur: 0.13,
  });
  const { scene } = ws,
    base = group(scene),
    iron = metal("#242d34", 0.66, 0.3),
    teal = metal("#285768", 0.63, 0.32),
    nickel = metal("#cfcbc1", 0.89, 0.26),
    black = metal("#161d1f", 0.38, 0.4),
    brass = metal("#d0a14e", 0.83, 0.23),
    ceramic = metal("#d6cec4", 0.2, 0.38),
    orange = metal("#dd7839", 0.35, 0.35);
  const boardMap = panelTexture("#466064", "#1f2729", 32);
  boardMap.repeat.set(5, 4);
  box(base, [10.3, 0.32, 7.3], [0, -0.13, 0], iron, 0.11);
  const surface = mesh(
    base,
    new T.PlaneGeometry(10.1, 7.1),
    new T.MeshStandardMaterial({ map: boardMap, roughness: 0.52, metalness: 0.52 }),
    [0, 0.038, 0],
  );
  surface.rotation.x = -Math.PI / 2;
  surface.castShadow = false;
  shadow(base, -0.05, -0.1, 5.5, 3.2, 0.047, 0.84);
  const fixed = group(base, [0.67, 0.08, 0.0]);
  box(fixed, [2.41, 0.32, 1.88], [0, 0.2, 0], teal, 0.065);
  box(fixed, [2.23, 0.12, 1.73], [0, 0.43, 0], nickel, 0.035);
  for (const x of [-0.96, 0.96])
    for (const z of [-0.7, 0.7]) bolt(fixed, [x, 0.51, z], 0.096, brass, black);
  box(fixed, [1.59, 0.21, 1.37], [0, 0.58, 0], black, 0.045);
  box(fixed, [1.48, 0.085, 1.25], [0, 0.718, 0], ceramic, 0.022);
  const substrate = group(fixed, [0.1, 0.776, 0]);
  box(substrate, [1.3, 0.052, 1.08], [0, 0, 0], brass, 0.02);
  const die = texture(768, 640, (c) => {
    c.fillStyle = "#264852";
    c.fillRect(0, 0, 768, 640);
    c.lineCap = "round";
    for (let j = 0; j < 32; j++) {
      const x = (j % 8) * 87 + 28,
        y = Math.floor(j / 8) * 140 + 27;
      c.fillStyle = ["#325963", "#334f60", "#3c645c"][j % 3];
      c.fillRect(x, y, 71, 115);
      c.strokeStyle = "#928448";
      c.lineWidth = 2;
      c.strokeRect(x + 3, y + 3, 66, 109);
      for (let k = 0; k < 9; k++) {
        c.fillStyle = (k + j) % 3 === 1 ? "#bbaa70" : "#678d91";
        c.fillRect(x + 9, y + 11 + 11 * k, 48 - ((j + k) % 4) * 7, 2.5);
      }
    }
    c.strokeStyle = "#f4cc72";
    c.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.moveTo(0, 280 + i * 7);
      c.lineTo(140 + i * 10, 280 + i * 7);
      c.lineTo(216 + i * 10, 195 + i * 7);
      c.bezierCurveTo(332, 150 + i * 6, 432, 360 + i * 5, 528, 320 + i * 7);
      c.lineTo(764, 320 + i * 7);
      c.stroke();
    }
  });
  const silicon = mesh(
    substrate,
    new T.PlaneGeometry(1.19, 0.97),
    new T.MeshPhysicalMaterial({ map: die, roughness: 0.22, metalness: 0.68, clearcoat: 1 }),
    [0, 0.031, 0],
  );
  silicon.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 16; i++) {
    const x = -0.52 + i * 0.069;
    for (const sign of [-1, 1]) {
      box(substrate, [0.04, 0.018, 0.085], [x, 0.044, sign * 0.515], brass);
      cable(
        substrate,
        [
          [x, 0.041, sign * 0.49],
          [x, 0.121, sign * 0.555],
          [x, 0.088, sign * 0.584],
          [x, 0.02, sign * 0.646],
        ],
        0.0064,
        brass,
        8,
      );
    }
  }
  const source = group(base, [-1.04, 0.07, 0]);
  box(source, [1.63, 0.13, 1.71], [-0.12, 0.1, 0], black, 0.035);
  for (const z of [-0.63, 0.63]) {
    rod(source, [-0.86, 0.22, z], [0.64, 0.22, z], 0.077, nickel);
    for (let i = 0; i < 7; i++)
      box(source, [0.045, 0.019, 0.09], [-0.62 + i * 0.17, 0.295, z], black);
  }
  const stage = group(source);
  box(stage, [1.4, 0.27, 1.28], [-0.15, 0.42, 0], teal, 0.055);
  box(stage, [1.17, 0.18, 1.12], [-0.12, 0.64, 0], iron, 0.03);
  box(stage, [0.54, 0.33, 0.57], [-0.14, 0.88, 0], orange, 0.05);
  for (const z of [-0.42, 0.42])
    for (const x of [-0.52, 0.34]) bolt(stage, [x, 0.754, z], 0.057, nickel, black);
  const ferrule = group(stage, [0, 0.81, 0]);
  for (const [r, len, x] of [
    [0.197, 0.53, -0.21],
    [0.144, 0.28, 0.19],
    [0.097, 0.37, 0.48],
    [0.047, 0.15, 0.74],
  ])
    rod(ferrule, [x - len / 2, 0, 0], [x + len / 2, 0, 0], r, nickel, 40);
  const taper = cyl(ferrule, 0.014, 0.044, 0.23, [0.916, 0, 0], ceramic, 28);
  taper.rotation.z = -Math.PI / 2;
  for (let i = 0; i < 11; i++) ring(ferrule, 0.194, 0.006, [-0.47 + i * 0.029, 0, 0], black, "x");
  const port = group(fixed, [-0.57, 0.8, 0]);
  box(port, [0.1, 0.22, 0.31], [0, 0, 0], iron, 0.02);
  const emitter = glow("#ff5424", 1.3);
  const beam = rod(base, [-0.01, 0.889, 0], [0.11, 0.889, 0], 0.012, emitter);
  beam.userData.moving = true;
  const channelMat = glow("#56d5ad", 0.72);
  cable(
    base,
    [
      [0.122, 0.88, 0],
      [0.243, 0.895, 0],
      [0.44, 0.898, -0.11],
      [0.59, 0.899, -0.15],
      [0.74, 0.899, -0.03],
      [0.88, 0.898, 0.14],
      [1.08, 0.898, 0.1],
      [1.28, 0.898, 0.1],
    ],
    0.007,
    channelMat,
  );
  const spot = group(base, [0.097, 0.88, 0]),
    dot = new T.SpriteMaterial({
      map: texture(64, 64, (c) => {
        const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, "#fffbd0");
        grad.addColorStop(0.22, "rgba(255,157,48,.93)");
        grad.addColorStop(1, "rgba(255,86,12,0)");
        c.fillStyle = grad;
        c.fillRect(0, 0, 64, 64);
      }),
      blending: T.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  const flare = new T.Sprite(dot);
  flare.scale.setScalar(0.19);
  spot.add(flare);
  const wire = group(base);
  cable(
    wire,
    [
      [-1.48, 0.88, 0],
      [-2.13, 1.13, 0.08],
      [-2.57, 0.64, 0.47],
      [-3.44, 0.23, 1.47],
      [-4.21, 0.2, 1.12],
    ],
    0.068,
    orange,
  );
  const knob = group(source, [-0.38, 0.48, 1.06]);
  rod(knob, [0, 0, -0.39], [0, 0, 0.17], 0.112, nickel, 32);
  for (let i = 0; i < 13; i++) ring(knob, 0.116, 0.012, [0, 0, -0.03 + i * 0.018], black, "z");
  const probe = group(base, [2.9, 0.045, -2.02]);
  ws.model("/worlds/photonics/industrial_microscope.glb", probe, 2.8, -1.04);
  const driver = group(base, [-2.36, 0.07, -1.75]);
  box(driver, [1.62, 0.92, 0.89], [0, 0.48, 0], iron, 0.08);
  box(driver, [1.5, 0.75, 0.038], [0, 0.49, 0.46], ceramic, 0.018);
  const readout = glow("#78c997", 0.9);
  box(driver, [0.71, 0.28, 0.027], [-0.22, 0.58, 0.5], black, 0.018);
  for (let i = 0; i < 8; i++)
    box(driver, [0.048, 0.11, 0.013], [-0.482 + i * 0.068, 0.58, 0.521], readout);
  placard(driver, [-0.07, 0.86, 0.49], 1.22, 0.12, "PHOTO RECEIVER", "");
  for (const x of [0.39, 0.57]) {
    const b = cyl(driver, 0.075, 0.075, 0.058, [x, 0.48, 0.51], nickel, 20);
    b.rotation.x = Math.PI / 2;
  }
  placard(fixed, [0, 0.198, 0.955], 1.44, 0.2, "Si–PIC  /  FIBRE", "ACTIVE EDGE COUPLING");
  compact(base);
  return {
    scene,
    camera: ws.camera,
    dispose: ws.dispose,
    update(s, aspect) {
      ws.compose(aspect);
      // Horizontal and vertical offsets move the fibre in its end-face plane. Nominal gap is fixed.
      const dz = s.planeX * 0.012,
        dy = s.planeY * 0.014;
      spot.position.set(0.095, 0.88 + dy, dz);
      channelMat.emissiveIntensity = 0.12 + 0.021 * s.metric;
      stage.position.set(0, dy, dz);
      emitter.emissiveIntensity = 0.35 + (s.metric / 100) * 2.5;
      readout.emissiveIntensity = 0.26 + 0.019 * s.metric;
      const a = new T.Vector3(-0.014, 0.88 + dy, dz),
        b = new T.Vector3(0.097, 0.88 + dy, dz),
        d = b.clone().sub(a);
      beam.position.copy(a).addScaledVector(d, 0.5);
      beam.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
      beam.scale.y = d.length() / 0.12;
    },
  };
}
