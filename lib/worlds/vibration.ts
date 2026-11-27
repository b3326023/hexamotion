import * as T from "three";
import {
  group,
  mesh,
  box,
  cyl,
  rod,
  cable,
  bolt,
  shadow,
  metal,
  studio,
  placard,
  compact,
  tau,
  texture,
  panelTexture,
  type XYZ,
} from "./precision-art";
import type { WorldView } from "./types";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const ws = studio(manager, "/worlds/vibration/environment.webp", {
    eye: [3.35, 2.58, 5.0],
    target: [-0.1, 1.17, 0],
    fov: 35,
    rot: -0.38,
    bg: 0.74,
    blur: 0.047,
  });
  const { scene } = ws,
    stand = group(scene),
    graphite = metal("#252d32", 0.55, 0.41),
    slate = metal("#51626a", 0.66, 0.4),
    blue = metal("#305b66", 0.54, 0.35),
    chrome = metal("#b8c7c5", 0.87, 0.22),
    brass = metal("#d0a259", 0.77, 0.3),
    orange = metal("#ba5b38", 0.5, 0.36),
    white = metal("#c4c7b8", 0.37, 0.45),
    rubber = metal("#202324", 0.12, 0.65);
  const map = panelTexture("#8e9ca0", "#28333a", 32);
  map.repeat.set(6, 3);
  box(stand, [7.31, 0.32, 3.58], [0, 0, 0], slate, 0.095);
  const top = mesh(
    stand,
    new T.PlaneGeometry(7.18, 3.45),
    new T.MeshStandardMaterial({ map, metalness: 0.57, roughness: 0.46 }),
    [0, 0.166, 0],
  );
  top.rotation.x = -Math.PI / 2;
  for (const x of [-2.85, 2.85])
    for (const z of [-1.15, 1.15]) {
      box(stand, [0.24, 1.81, 0.24], [x, -0.86, z], graphite, 0.025);
      box(stand, [0.49, 0.12, 0.43], [x, -1.78, z], rubber, 0.027);
    }
  shadow(stand, -0.1, 0, 6.23, 2.95, 0.17, 0.8);
  box(stand, [5.15, 0.26, 2.01], [-0.53, 0.38, 0.05], blue, 0.095);
  for (const x of [-2.79, 1.73])
    for (const z of [-0.72, 0.78]) bolt(stand, [x, 0.54, z], 0.093, chrome, graphite);
  const motor = group(stand, [-1.76, 1.12, 0]);
  const can = (r: number, h: number, x: number, m: T.Material) => {
    const p = cyl(motor, r, r, h, [x, 0, 0], m, 64);
    p.rotation.z = Math.PI / 2;
    return p;
  };
  can(0.674, 1.28, 0, orange);
  can(0.656, 0.18, -0.74, graphite);
  can(0.67, 0.16, 0.74, slate);
  for (let i = 0; i < 11; i++) can(0.706, 0.048, -0.55 + i * 0.108, orange);
  can(0.57, 0.089, 0.86, graphite);
  can(0.4, 0.14, 0.99, chrome);
  can(0.27, 0.24, 1.11, rubber);
  for (let i = 0; i < 10; i++) {
    const a = (i * tau) / 10;
    rod(
      motor,
      [0.82, 0.565 * Math.sin(a), 0.565 * Math.cos(a)],
      [0.89, 0.565 * Math.sin(a), 0.565 * Math.cos(a)],
      0.043,
      brass,
      8,
    );
  }
  box(motor, [1.53, 0.26, 0.97], [0, -0.56, 0], orange, 0.055);
  placard(motor, [-0.02, -0.05, 0.72], 0.96, 0.21, "ED–12   SHAKER", "HORIZONTAL DRIVE");
  const moving = group(stand, [-0.03, 1.12, 0]);
  rod(moving, [-1.0, 0, 0], [-0.23, 0, 0], 0.124, chrome, 36);
  box(moving, [0.15, 0.77, 1.14], [0.02, 0, 0], orange, 0.036);
  box(moving, [1.57, 0.12, 1.27], [0.76, -0.36, 0], slate, 0.032);
  for (const z of [-0.39, 0.39]) rod(moving, [0.09, -0.21, z], [1.48, -0.21, z], 0.064, chrome, 22);
  for (const z of [-0.53, 0.53])
    for (const x of [0.16, 1.38]) bolt(moving, [x, -0.279, z], 0.055, brass, graphite);
  const ruler = texture(512, 70, (c) => {
    c.fillStyle = "#d7d5bc";
    c.fillRect(0, 0, 512, 70);
    c.fillStyle = "#20282b";
    for (let i = 0; i <= 42; i++) {
      const x = 8 + i * 11.8;
      c.fillRect(x, 0, i % 5 === 0 ? 3 : 1, i % 5 === 0 ? 35 : 18);
      if (i % 5 === 0) {
        c.font = "14px monospace";
        c.fillText(String((i - 20) * 2), x - 4, 60);
      }
    }
  });
  mesh(
    moving,
    new T.PlaneGeometry(1.3, 0.122),
    new T.MeshBasicMaterial({ map: ruler }),
    [0.78, -0.33, 0.648],
  );
  const article = group(moving, [0.84, -0.03, 0]);
  box(article, [0.6, 0.38, 0.85], [0, 0, 0], brass, 0.038);
  box(article, [0.63, 0.063, 0.86], [0, -0.2, 0], graphite, 0.019);
  box(article, [0.49, 0.074, 0.71], [0, 0.22, 0], chrome, 0.018);
  for (const x of [-0.17, 0.17])
    for (const z of [-0.24, 0.24]) bolt(article, [x, 0.27, z], 0.045, graphite, chrome);
  const pointerMat = new T.MeshBasicMaterial({ color: 0xe16e39 });
  rod(article, [0, -0.09, 0.44], [0, -0.09, 0.68], 0.015, pointerMat);
  rod(article, [0, -0.09, 0.68], [0, -0.254, 0.68], 0.016, pointerMat);
  box(article, [0.17, 0.094, 0.14], [0.02, 0.309, 0], orange, 0.013);
  const springs: T.Group[] = [];
  for (const z of [-0.29, 0.29]) {
    const spring = group(moving, [0.1, -0.028, z]);
    springs.push(spring);
    let pts: XYZ[] = [];
    for (let n = 0; n <= 112; n++) {
      const a = (n / 112) * tau * 7;
      pts.push([n / 112, 0.083 * Math.cos(a), 0.083 * Math.sin(a)]);
    }
    mesh(
      spring,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p))),
        112,
        0.018,
        7,
        false,
      ),
      chrome,
      [0, 0, 0],
    );
  }
  const osc = group(stand, [2.1, 0.21, -0.55]);
  osc.rotation.y = -0.29;
  box(osc, [1.41, 1.58, 0.77], [0, 0.8, 0], white, 0.085);
  box(osc, [1.28, 1.42, 0.043], [0, 0.81, 0.413], graphite, 0.024);
  box(osc, [0.88, 0.65, 0.046], [-0.123, 1.08, 0.442], rubber, 0.026);
  const display = texture(240, 180, (c) => {
    c.fillStyle = "#0b2d31";
    c.fillRect(0, 0, 240, 180);
    c.strokeStyle = "#337175";
    c.lineWidth = 1;
    for (let x = 0; x < 240; x += 20) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 180);
      c.stroke();
    }
    for (let y = 0; y < 180; y += 20) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(240, y);
      c.stroke();
    }
    c.fillStyle = "#86b7a1";
    c.font = "bold 13px monospace";
    c.fillText("CH1 BASE    CH2 MASS", 11, 20);
  });
  mesh(
    osc,
    new T.PlaneGeometry(0.8, 0.57),
    new T.MeshBasicMaterial({ map: display }),
    [-0.13, 1.08, 0.47],
  );
  const waves = group(osc, [-0.521, 1.04, 0.48]);
  const histories = [new Float32Array(48 * 3), new Float32Array(48 * 3)];
  const curves = histories.map((positions, i) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
    );
    geometry.setDrawRange(0, 0);
    const l = new T.Line(geometry, new T.LineBasicMaterial({ color: i ? 0xffc07a : 0x7fdfc8 }));
    l.frustumCulled = false;
    waves.add(l);
    return geometry;
  });
  for (let i = 0; i < 5; i++) {
    const x = -0.48 + i * 0.23;
    const b = cyl(osc, 0.072, 0.072, 0.06, [x, 0.58, 0.47], slate, 20);
    b.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 6; i++)
    box(
      osc,
      [0.19, 0.036, 0.016],
      [-0.4 + (i % 3) * 0.33, 0.34 - Math.floor(i / 3) * 0.073, 0.45],
      white,
      0.006,
    );
  const dial = cyl(osc, 0.13, 0.13, 0.06, [0.46, 1.15, 0.46], white, 32);
  dial.rotation.x = Math.PI / 2;
  placard(osc, [0, 1.45, 0.454], 0.99, 0.14, "DYNAMIC RESPONSE", "");
  cable(
    stand,
    [
      [0.89, 1.4, -0.05],
      [1.28, 1.66, -0.51],
      [1.35, 0.56, -0.89],
      [1.75, 0.36, -0.71],
      [2.01, 0.43, -0.34],
    ],
    0.025,
    rubber,
  );
  placard(stand, [-0.57, 0.36, 1.075], 1.82, 0.19, "MODAL TEST RIG", "SPRING–MASS RESPONSE");
  compact(stand);
  let last = -1,
    filled = 0;
  return {
    scene,
    camera: ws.camera,
    dispose() {
      ws.dispose();
      curves.forEach((g) => g.dispose());
    },
    update(s, aspect) {
      ws.compose(aspect);
      moving.position.x = -0.03 + s.deckX * 11;
      article.position.x = 0.84 + s.specimen * 11;
      for (const spring of springs) spring.scale.x = Math.max(0.12, article.position.x - 0.4);
      if (s.t < last) {
        last = -1;
        filled = 0;
      }
      if (s.t - last >= 0.045) {
        last = s.t;
        filled = Math.min(48, filled + 1);
        for (let j = 0; j < 2; j++) {
          const arr = histories[j];
          for (let i = 0; i < 47; i++) {
            arr[i * 3] = (i / 47) * 0.78;
            arr[i * 3 + 1] = arr[(i + 1) * 3 + 1];
          }
          arr[141] = 0.78;
          arr[142] =
            (j ? -0.075 : 0.08) +
            Math.max(-0.1, Math.min(0.1, (j ? s.deckX + s.specimen : s.deckX) * 4));
          curves[j].attributes.position.needsUpdate = true;
          curves[j].setDrawRange(48 - filled, filled);
        }
      }
    },
  };
}
