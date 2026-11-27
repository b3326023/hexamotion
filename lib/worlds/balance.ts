import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { WorldFrame, WorldView } from "./types";
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

function aimBone(model: T.Object3D, name: string, tip: string, toward: T.Vector3) {
  const bone = model.getObjectByName(name),
    end = model.getObjectByName(tip);
  if (!bone || !end || !bone.parent) return;
  model.updateWorldMatrix(true, true);
  const direction = end.getWorldPosition(v()).sub(bone.getWorldPosition(v())).normalize();
  const delta = new T.Quaternion().setFromUnitVectors(direction, toward.clone().normalize());
  const transform = bone.parent.getWorldQuaternion(new T.Quaternion());
  bone.quaternion.premultiply(transform.clone().invert().multiply(delta).multiply(transform));
  model.updateWorldMatrix(true, true);
}
function releaseDetached(root: T.Object3D) {
  const gs = new Set<T.BufferGeometry>(),
    mats = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      gs.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        mats.add(m);
        for (const t of Object.values(m)) if (t instanceof T.Texture) textures.add(t);
      }
    }
  });
  gs.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
export function createWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(39, 2, 0.03, 60),
    loader = new T.TextureLoader(manager);
  scene.background = new T.Color("#ccd6db");
  scene.environmentIntensity = 0.64;
  scene.add(new T.HemisphereLight("#f2fbff", "#b1a79b", 1.22));
  sun(scene, [-3.5, 5, 3.5], 2.25, "#fff3d9", 4.6);
  const set = group(scene),
    wall = mat("#c8d0cd", 0.08, 0.84),
    aqua = mat("#307c83", 0.33, 0.56),
    ink = mat("#27373c", 0.46, 0.46),
    dark = mat("#35414a", 0.36, 0.56),
    steel = mat("#b8c5c6", 0.8, 0.29),
    grey = mat("#899498", 0.52, 0.53),
    white = mat("#dce1dd", 0.27, 0.47),
    wood = mat("#b3997d", 0.1, 0.74),
    strap = mat("#263746", 0.11, 0.79),
    seam = mat("#d68454", 0.19, 0.65),
    lime = glow("#74d1b1", 0.4);
  const rubberMap = tex(
    (c, w, h) => {
      c.fillStyle = "#a2aaa5";
      c.fillRect(0, 0, w, h);
      const rnd = seeded(45);
      for (let i = 0; i < 30000; i++) {
        const q = Math.trunc(65 + rnd() * 170);
        c.fillStyle = "rgba(" + q + "," + q + "," + q + ",.4)";
        c.fillRect(rnd() * w, rnd() * h, rnd() * 2 + 0.5, rnd() * 1.5 + 0.5);
      }
    },
    256,
    256,
  );
  rubberMap.wrapS = rubberMap.wrapT = T.RepeatWrapping;
  rubberMap.repeat.set(8, 8);
  const rubber = new T.MeshStandardMaterial({ map: rubberMap, color: "#879b9c", roughness: 0.92 });
  box(set, rubber, [12, 0.19, 10], [0, -0.18, 0]);
  box(set, wall, [12, 3.9, 0.15], [0, 1.81, -3.0]);
  box(set, wall, [0.15, 3.9, 9], [-4.55, 1.81, 0.25]);
  for (const y of [0.17, 1.06, 2.78])
    box(set, y === 1.06 ? wood : white, [10.4, 0.055, 0.09], [0, y, -2.88]);
  // Wall storage, work surface, drawers, rolled exercise mats and daylight clerestory.
  for (let i = 0; i < 5; i++) {
    const x = -3.93 + i * 0.61;
    box(set, white, [0.6, 0.73, 0.51], [x, 0.36, -2.52], 0.012);
    for (let j = 0; j < 2; j++) {
      box(set, grey, [0.5, 0.008, 0.024], [x, 0.28 + j * 0.28, -2.257]);
      tube(
        set,
        steel,
        [x - 0.091, 0.47 + j * 0.22, -2.235],
        [x + 0.091, 0.47 + j * 0.22, -2.235],
        0.011,
      );
    }
  }
  box(set, wood, [3.37, 0.058, 0.68], [-2.78, 0.766, -2.55], 0.012);
  for (let i = 0; i < 3; i++) {
    const m = [aqua, grey, white][i];
    tube(set, m, [-3.44, 0.86 + i * 0.107, -2.57], [-2.89, 0.86 + i * 0.107, -2.57], 0.075, 18);
    ring(set, ink, 0.027, 0.006, "x", [-2.884, 0.86 + i * 0.107, -2.57]);
  }
  const door = group(set, -4.453, 0, -0.95);
  box(door, grey, [0.052, 2.28, 1.07], [0, 1.05, 0], 0.012);
  box(door, wood, [0.061, 2.2, 1.0], [0.012, 1.02, 0], 0.007);
  box(door, ink, [0.067, 0.78, 0.36], [0.028, 1.55, 0]);
  box(
    door,
    new T.MeshStandardMaterial({ color: "#a7b8b4", roughness: 0.23, metalness: 0.17 }),
    [0.069, 0.7, 0.3],
    [0.033, 1.55, 0],
  );
  tube(door, steel, [0.09, 0.98, -0.36], [0.09, 0.98, -0.17], 0.022, 12);
  box(door, grey, [0.045, 0.135, 0.07], [0.057, 0.98, -0.34], 0.01);
  const pad = group(set, -2.21, 0.08, -1.88);
  for (let i = 0; i < 2; i++) {
    const z = i * 0.42;
    const ball = oval(
      pad,
      i ? aqua : mat("#c8885b", 0.1, 0.65),
      [0.295, 0.295, 0.295],
      [-0.25 + i * 0.37, 0.28, z],
    );
    for (let k = -2; k <= 2; k++) {
      const y = k * 0.062,
        r = Math.sqrt(0.295 * 0.295 - y * y);
      ring(pad, i ? grey : wood, r, 0.0037, "y", [ball.position.x, ball.position.y + y, z]);
    }
  }
  const outside = finishTexture(loader.load("/worlds/driving/horizon.jpg"));
  outside.offset.set(0.31, 0.44);
  outside.repeat.set(0.12, 0.16);
  const pane = new T.MeshBasicMaterial({ map: outside, color: "#d9e4d7" });
  const frame = group(set, -2.34, 1.93, -2.87);
  box(frame, ink, [3.24, 1.2, 0.045]);
  box(frame, pane, [3.16, 1.12, 0.047], [0, 0, 0.012]);
  for (const xx of [-1.57, -0.52, 0.52, 1.57])
    box(frame, white, [0.045, 1.13, 0.065], [xx, 0, 0.04]);
  box(frame, white, [3.34, 0.067, 0.23], [0, -0.6, 0.031]);
  // Original printed calibration reference, a quiet but recognizable clinical detail.
  const chart = tex(
    (c, w, h) => {
      c.fillStyle = "#e8ece6";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#315b65";
      c.font = "bold 30px Arial";
      c.fillText("POSTURE", 24, 46);
      c.fillStyle = "#839291";
      for (let y = 78; y < h - 15; y += 18) {
        c.fillRect(22, y, 17, 1.4);
        c.fillRect(w - 38, y, 16, 1.4);
      }
      c.strokeStyle = "#377c82";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(w * 0.5, 126);
      c.lineTo(w * 0.5, 240);
      c.moveTo(w * 0.34, 182);
      c.lineTo(w * 0.5, 156);
      c.lineTo(w * 0.67, 181);
      c.moveTo(w * 0.5, 239);
      c.lineTo(w * 0.39, 301);
      c.moveTo(w * 0.5, 239);
      c.lineTo(w * 0.61, 301);
      c.stroke();
      c.beginPath();
      c.arc(w * 0.5, 113, 15, 0, 2 * Math.PI);
      c.stroke();
    },
    220,
    340,
  );
  box(set, wood, [0.66, 0.95, 0.035], [1.18, 1.77, -2.88]);
  box(set, new T.MeshBasicMaterial({ map: chart }), [0.61, 0.9, 0.036], [1.18, 1.77, -2.857]);
  const monitor = group(set, 1.41, 0, -0.5);
  box(monitor, grey, [0.7, 0.07, 0.53], [0, 0.025, 0], 0.03);
  tube(monitor, steel, [0, 0.045, 0], [0, 1.38, 0], 0.053);
  box(monitor, ink, [1.02, 0.62, 0.061], [0, 1.63, 0], 0.032);
  box(monitor, aqua, [0.83, 0.031, 0.047], [0, 1.288, 0.003], 0.006);
  const displayCanvas = document.createElement("canvas");
  displayCanvas.width = 512;
  displayCanvas.height = 286;
  const display = new T.CanvasTexture(displayCanvas);
  display.colorSpace = T.SRGBColorSpace;
  const displayMat = new T.MeshBasicMaterial({ map: display, toneMapped: false });
  mesh(monitor, new T.PlaneGeometry(0.958, 0.541), displayMat, 0, 1.631, 0.038);
  monitor.rotation.y = -0.23;
  const panel = group(set, 0.23, 0, 0.07);
  box(panel, grey, [1.38, 0.099, 1.22], [0, 0.012, 0], 0.062);
  box(panel, ink, [1.24, 0.115, 1.09], [0, 0.091, 0], 0.053);
  for (const x of [-0.53, 0.53])
    for (const z of [-0.43, 0.43]) {
      tube(panel, steel, [x, 0.118, z], [x, 0.19, z], 0.042, 12);
      tube(panel, dark, [x, 0.133, z], [x, 0.16, z], 0.055, 12);
    }
  placard(panel, "HX  FORCE  PLATE", [0, 0.048, 0.614], 0.38, 0.04, "#afc3c0", "#374447");
  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.54, 0.53]) {
      box(set, grey, [0.198, 0.09, 0.185], [x, 0.0, z], 0.023);
      tube(set, white, [x, 0.02, z], [x, 1.01, z], 0.036, 14);
    }
    wire(
      set,
      steel,
      [
        [x, 0.96, 0.55],
        [x, 1.06, 0.55],
        [x, 1.1, 0.45],
        [x, 1.1, -0.42],
        [x, 1.04, -0.54],
        [x, 0.96, -0.54],
      ],
      0.031,
      28,
    );
  }
  const ruler = tex(
    (c, w, h) => {
      c.fillStyle = "#c4ccca";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#526366";
      for (let j = 1; j < 80; j++) {
        const yy = h - (j * h) / 81;
        c.fillRect(0, yy, j % 5 === 0 ? w * 0.6 : w * 0.27, j % 5 === 0 ? 3 : 1.4);
      }
    },
    50,
    512,
  );
  mesh(
    set,
    new T.PlaneGeometry(0.043, 1.64),
    new T.MeshStandardMaterial({ map: ruler, metalness: 0.27, roughness: 0.54 }),
    -0.84,
    1.32,
    -0.624,
  );
  // Independent overhead rail and belay trolley.
  for (const x of [-0.84, 0.84]) {
    box(set, white, [0.093, 2.37, 0.13], [x, 1.16, -0.71], 0.012);
    box(set, aqua, [0.108, 0.31, 0.14], [x, 0.19, -0.71], 0.012);
    tube(set, steel, [x, 0.06, -1.41], [x, 0.06, -0.59], 0.051);
  }
  box(set, white, [1.78, 0.145, 0.17], [0, 2.37, -0.71], 0.018);
  box(set, grey, [0.1, 0.11, 1.03], [0, 2.39, -0.31]);
  box(set, ink, [0.27, 0.13, 0.23], [0.005, 2.306, -0.004], 0.025);
  ring(set, steel, 0.068, 0.012, "z", [0, 2.217, -0.005]);
  batch(set);
  const deck = group(scene),
    mobile = group(deck, 0.23, 0.213, 0.07),
    upholstery = group(mobile);
  box(upholstery, white, [1.2, 0.07, 1.02], [0, -0.053, 0], 0.047);
  box(upholstery, dark, [1.16, 0.044, 0.976], [0, -0.008, 0], 0.039);
  for (const s of [-1, 1]) {
    box(upholstery, aqua, [0.027, 0.004, 0.79], [s * 0.51, 0.017, 0]);
    box(upholstery, grey, [0.34, 0.004, 0.008], [s * 0.277, 0.017, 0.32]);
  }
  for (let i = -4; i < 5; i++) {
    box(upholstery, grey, [0.012, 0.005, 0.048], [i * 0.102, 0.017, 0.445]);
    box(upholstery, grey, [0.012, 0.005, 0.03], [i * 0.102, 0.017, -0.45]);
  }
  box(upholstery, lime, [0.07, 0.016, 0.011], [0.46, -0.035, 0.51]);
  batch(upholstery);
  const stance = group(mobile, 0.005, 0.015, 0),
    actor = group(stance);
  let disposed = false;
  deck.name = "Measured support platform";
  stance.name = "Participant postural response";
  const avatarLoader = new GLTFLoader(manager);
  avatarLoader.load("/worlds/balance/participant.glb", ({ scene: model }) => {
    if (disposed) {
      releaseDetached(model);
      return;
    }
    actor.add(model);
    model.updateWorldMatrix(true, true);
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        for (const material of Array.isArray(o.material) ? o.material : [o.material])
          if (material instanceof T.MeshStandardMaterial) {
            material.roughness = Math.max(0.67, material.roughness);
            material.metalness = 0;
          }
      }
    });
    const compute = () => {
      scene.updateMatrixWorld(true);
      return new T.Box3().setFromObject(model, true);
    };
    const raw = compute(),
      h = raw.max.y - raw.min.y;
    model.scale.multiplyScalar(1.73 / Math.max(h, 0.0001));
    model.updateWorldMatrix(true, true);
    const l = model.getObjectByName("LeftArm"),
      r = model.getObjectByName("RightArm");
    if (l && r) {
      const side = l.getWorldPosition(v()).sub(r.getWorldPosition(v()));
      model.rotation.y += Math.atan2(side.z, side.x);
    }
    for (const [side, sign] of [
      ["Left", 1],
      ["Right", -1],
    ] as const) {
      aimBone(model, side + "Arm", side + "ForeArm", v(0.27 * sign, -0.94, 0.11));
      aimBone(model, side + "ForeArm", side + "Hand", v(0.205 * sign, -0.88, 0.37));
    }
    model.updateWorldMatrix(true, true);
    const bounds = compute(),
      origin = actor.getWorldPosition(v());
    model.position.sub(
      v(
        (bounds.min.x + bounds.max.x) / 2 - origin.x,
        bounds.min.y - origin.y,
        (bounds.min.z + bounds.max.z) / 2 - origin.z,
      ),
    );
    model.updateWorldMatrix(true, true);
  });
  const belts = group(stance);
  const waist = turnBelt();
  function turnBelt() {
    const band = mesh(
      belts,
      new T.CylinderGeometry(1, 1, 0.118, 30, 1, true),
      strap,
      0,
      0.977,
      0.0,
    );
    band.scale.set(0.215, 1, 0.145);
    return band;
  }
  waist.rotation.y = 0.06;
  for (const s of [-1, 1]) {
    const strapPath: XYZ[] = [
      [s * 0.161, 0.962, 0.122],
      [s * 0.143, 1.131, 0.123],
      [s * 0.149, 1.326, 0.095],
      [s * 0.154, 1.379, -0.004],
      [s * 0.142, 1.272, -0.118],
      [s * 0.102, 1.006, -0.142],
    ];
    wire(belts, strap, strapPath, 0.025, 26);
    wire(
      belts,
      seam,
      strapPath.map(([x, y, z]) => [x + s * 0.016, y, z] as XYZ),
      0.005,
      24,
    );
    ring(belts, steel, 0.035, 0.008, "z", [s * 0.177, 1.11, -0.098]);
  }
  box(belts, grey, [0.096, 0.055, 0.014], [0, 0.978, 0.154], 0.009);
  batch(belts);
  const cableMat = mat("#b88658", 0.38, 0.6);
  const cables = [-1, 1].map((s) => ({
    s,
    rope: mesh(scene, new T.CylinderGeometry(0.0105, 0.0105, 1, 8), cableMat),
  }));
  const ctx = displayCanvas.getContext("2d")!;
  const history: { x: number; y: number; t: number }[] = [];
  let displayTime = -Infinity,
    lastTime = -Infinity,
    prevX = 0,
    prevY = 0,
    tiltX = 0,
    tiltY = 0;
  function graph(f: WorldFrame) {
    const w = displayCanvas.width,
      h = displayCanvas.height;
    ctx.fillStyle = "#162d32";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#8fcbc4";
    ctx.font = "bold 19px Arial";
    ctx.fillText("SUPPORT SURFACE", 20, 29);
    ctx.strokeStyle = "#37555a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const x = 20 + i * 31.5;
      ctx.beginPath();
      ctx.moveTo(x, 47);
      ctx.lineTo(x, 260);
      ctx.stroke();
    }
    for (let j = 0; j <= 6; j++) {
      const y = 48 + j * 35;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(273, y);
      ctx.stroke();
    }
    const coords = (x: number, y: number) => [147 + x * 2.43, 152 - y * 2.35] as const;
    ctx.strokeStyle = "#9dc6ab";
    ctx.lineWidth = 3;
    ctx.beginPath();
    history.forEach((p, i) => {
      const point = coords(p.x, p.y);
      if (i === 0) ctx.moveTo(...point);
      else ctx.lineTo(...point);
    });
    ctx.stroke();
    const dp = coords(f.planeX, f.planeY);
    ctx.fillStyle = "#eab37b";
    ctx.beginPath();
    ctx.arc(...dp, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#e2eee7";
    ctx.font = "bold 49px monospace";
    ctx.fillText(f.metric.toFixed(1), 302, 137);
    ctx.font = "19px monospace";
    ctx.fillStyle = "#9dd3c7";
    ctx.fillText("mm", 307, 166);
    ctx.fillStyle = "#95b1ae";
    ctx.font = "15px Arial";
    ctx.fillText("PLATE TRAVEL", 303, 94);
    ctx.fillText("X / Y   ·   5 s", 303, 235);
    display.needsUpdate = true;
  }
  const from = v(0, 2.21, -0.01),
    target = v(),
    orient = v(0, 1, 0);
  return {
    scene,
    camera,
    update(f, aspect) {
      if (f.t < lastTime) {
        history.length = 0;
        displayTime = -Infinity;
        prevX = f.deckX;
        prevY = f.deckY;
        tiltX = tiltY = 0;
      }
      const dt = Math.min(0.1, Math.max(0, f.t - lastTime));
      if (dt > 0) {
        const avg = 1 - Math.exp(-dt / 0.25);
        tiltX += (((f.deckX - prevX) / dt) * 0.42 - tiltX) * avg;
        tiltY += (((f.deckY - prevY) / dt) * 0.42 - tiltY) * avg;
      }
      prevX = f.deckX;
      prevY = f.deckY;
      lastTime = f.t;
      deck.position.set(f.deckX * 2.2, f.deckZ * 1.5, -f.deckY * 2.2);
      mobile.rotation.set(-f.deckPitch, 0, f.deckRoll);
      stance.rotation.z = T.MathUtils.clamp(tiltX * 3.2, -0.17, 0.17);
      stance.rotation.x = T.MathUtils.clamp(tiltY * 3.2, -0.17, 0.17);
      if (f.t - displayTime >= 1 / 14) {
        displayTime = f.t;
        history.push({ x: f.planeX, y: f.planeY, t: f.t });
        while (history.length && f.t - history[0].t > 5) history.shift();
        graph(f);
      }
      stance.updateWorldMatrix(true, false);
      for (const { s, rope } of cables) {
        target.set(s * 0.178, 1.11, -0.098).applyMatrix4(stance.matrixWorld);
        rope.position.copy(from).lerp(target, 0.5);
        rope.scale.y = target.distanceTo(from);
        rope.quaternion.setFromUnitVectors(orient, target.sub(from).normalize());
      }
      fit(camera, aspect, [2.95, 1.78, 4.36], [0.21, 1.15, -0.16], 34, 1.77);
    },
    dispose() {
      disposed = true;
      display.dispose();
    },
  };
}
