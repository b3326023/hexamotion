import * as T from "three";
import {
  group,
  mesh,
  box,
  cyl,
  rod,
  cable,
  ring,
  bolt,
  shadow,
  metal,
  glow,
  studio,
  placard,
  compact,
  texture,
} from "./precision-art";
import type { WorldView } from "./types";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const ws = studio(manager, "/worlds/camera/stage-environment.webp", {
    eye: [2.17, 2.78, 6.68],
    target: [0.01, 1.52, -0.22],
    fov: 34,
    rot: 2.02,
    bg: 0.72,
    blur: 0.052,
    key: 3.25,
  });
  const { scene } = ws,
    base = group(scene),
    black = metal("#242527", 0.53, 0.35),
    rubber = metal("#232426", 0.1, 0.53),
    silver = metal("#b9bfbb", 0.86, 0.23),
    red = metal("#b14e39", 0.53, 0.3),
    gold = metal("#ba9a61", 0.8, 0.31),
    wood = metal("#755643", 0.24, 0.55),
    cream = metal("#d7ccba", 0.32, 0.51);
  let deckMap: T.Texture | undefined;
  if (typeof document !== "undefined") {
    deckMap = new T.TextureLoader(manager).load("/worlds/camera/deck.webp");
    deckMap.wrapS = deckMap.wrapT = T.RepeatWrapping;
    deckMap.repeat.set(4, 3);
    deckMap.colorSpace = T.SRGBColorSpace;
    deckMap.anisotropy = 4;
  }
  box(base, [13.6, 0.18, 9.8], [0, -0.13, -0.5], wood, 0.09);
  const deck = mesh(
    base,
    new T.PlaneGeometry(13.48, 9.66),
    new T.MeshStandardMaterial({ map: deckMap, color: 0xa9a598, metalness: 0.16, roughness: 0.6 }),
    [0, -0.035, -0.5],
  );
  deck.rotation.x = -Math.PI / 2;
  shadow(base, -1.45, 0.57, 2.5, 1.85, -0.009, 0.68);
  const center = new T.Vector3(1.16, 2.06, -1.36),
    origin = new T.Vector3(-1.3, 1.57, 0.49);
  const handle = group(base, [origin.x, 0, origin.z]);
  rod(handle, [0, 0.2, 0], [0, 0.94, 0], 0.105, rubber, 32);
  for (let i = 0; i < 16; i++) ring(handle, 0.105, 0.008, [0, 0.26 + i * 0.037, 0], black);
  for (const a of [0.2, 2.3, 4.5]) {
    const x = Math.cos(a) * 0.57,
      z = Math.sin(a) * 0.57;
    rod(handle, [0, 0.23, 0], [x, 0.025, z], 0.05, black);
    box(handle, [0.14, 0.046, 0.12], [x, 0.009, z], rubber, 0.014);
  }
  const rig = group(base, [origin.x, 0.91, origin.z]);
  rig.scale.setScalar(1.24);
  const yaw = Math.atan2(center.x - origin.x, center.z - origin.z);
  const crane = group(rig);
  crane.rotation.y = yaw;
  cyl(crane, 0.19, 0.165, 0.27, [0, 0.105, 0], black, 40);
  ring(crane, 0.174, 0.012, [0, 0.19, 0], red);
  rod(crane, [0, 0.2, 0], [-0.63, 0.43, -0.2], 0.077, black, 20);
  rod(crane, [-0.63, 0.43, -0.2], [-0.63, 0.7, 0.02], 0.082, black, 20);
  const bearing = cyl(crane, 0.149, 0.15, 0.23, [-0.61, 0.7, 0.06], black, 40);
  bearing.rotation.z = Math.PI / 2;
  const metalCap = cyl(crane, 0.107, 0.107, 0.24, [-0.62, 0.7, 0.06], silver, 40);
  metalCap.rotation.z = Math.PI / 2;
  const gimbal = group(rig, [0, 0.61, 0]);
  gimbal.rotation.y = yaw;
  box(gimbal, [1.34, 0.109, 0.35], [0, -0.1, 0], black, 0.036);
  rod(gimbal, [0.59, -0.09, 0], [0.65, 0.16, -0.06], 0.05, black);
  cyl(gimbal, 0.13, 0.13, 0.08, [0.62, 0.13, -0.06], red);
  const camera = group(gimbal, [0, -0.02, 0]);
  ws.model("/worlds/camera/Camera_01.glb", camera, 0.78, 0, (g) => {
    const strap = g.getObjectByName("Camera_01_strap");
    if (strap) {
      strap.removeFromParent();
      strap.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose();
      });
    }
  });
  for (const x of [-0.48, 0.48]) {
    rod(gimbal, [x, -0.075, -0.25], [x, -0.075, 0.43], 0.025, silver);
    bolt(gimbal, [x, -0.046, 0.44], 0.045, black, gold);
  }
  cable(
    crane,
    [
      [-0.6, 0.65, 0.04],
      [-0.76, 0.63, -0.34],
      [-0.38, 0.39, -0.49],
      [-0.18, 0.28, -0.22],
    ],
    0.021,
    rubber,
  );
  // The subject sits on a sweep with a real sculptural silhouette and colour calibration chart.
  const set = group(base, [center.x, 0, center.z]);
  box(set, [1.91, 0.17, 1.68], [0, 0.071, 0], wood, 0.045);
  box(set, [1.66, 0.82, 1.43], [0, 0.55, 0], cream, 0.026);
  box(set, [1.78, 0.094, 1.53], [0, 1.01, 0], black, 0.024);
  ws.model("/worlds/camera/marble_bust_01.glb", group(set, [0, 1.06, 0]), 1.59, -0.53);
  const chart = group(set, [0.92, 0.49, 0.66]);
  chart.rotation.y = -0.34;
  box(chart, [0.83, 0.62, 0.05], [0, 0, 0], black, 0.014);
  const swatches = [
    "#795d4c",
    "#c28970",
    "#647d9e",
    "#627959",
    "#8373a4",
    "#69a6ae",
    "#d99145",
    "#5c6b9e",
    "#bf6a68",
    "#795a80",
    "#98ab56",
    "#d7a94a",
    "#506398",
    "#58855e",
    "#aa4e52",
    "#f1d49a",
    "#a87b9a",
    "#609ba0",
    "#e9e6d9",
    "#bfbdb3",
    "#93938b",
    "#71736a",
    "#484c46",
    "#282c28",
  ];
  swatches.forEach((color, i) =>
    box(
      chart,
      [0.112, 0.113, 0.009],
      [-0.328 + (i % 6) * 0.133, 0.2 - Math.floor(i / 6) * 0.136, 0.032],
      metal(color, 0, 0.9),
    ),
  );
  // A large softbox, C-stand and film slate give an immediate sense of the actual studio.
  function lightstand(x: number, z: number) {
    const std = group(base, [x, 0, z]);
    rod(std, [0, 0.08, 0], [0, 2.72, 0], 0.043, silver);
    for (const a of [0.25, 2.34, 4.44])
      rod(std, [0, 0.43, 0], [0.45 * Math.cos(a), 0.035, 0.45 * Math.sin(a)], 0.029, black);
    return std;
  }
  const light = lightstand(-3.51, -1.91);
  const hood = group(light, [0, 2.74, 0]);
  hood.rotation.z = -0.21;
  hood.rotation.y = 1.02;
  const cone = cyl(hood, 0.53, 0.16, 0.51, [0, 0, 0], black, 8);
  cone.rotation.x = Math.PI / 2;
  const face = cyl(hood, 0.514, 0.514, 0.032, [0, 0, 0.254], glow("#e6dcca", 0.32), 8);
  face.rotation.x = Math.PI / 2;
  const slate = group(base, [-0.02, 0.39, -1.24]);
  slate.rotation.y = 0.06;
  box(slate, [0.95, 0.66, 0.047], [0, 0, 0], black, 0.012);
  placard(slate, [0, 0, 0.032], 0.86, 0.3, "TAKE 04", "OPTICAL STABILISATION");
  box(slate, [0.96, 0.102, 0.055], [0, 0.393, 0], cream, 0.006);
  for (let i = 0; i < 5; i++) {
    const stripe = box(slate, [0.095, 0.11, 0.012], [-0.405 + i * 0.196, 0.393, 0.035], black);
    stripe.rotation.z = -0.45;
  }
  // Render the actual sculptural subject through the stabilised lens onto a practical monitor.
  const monitor = group(base, [0.82, 0, 1.06]);
  monitor.rotation.y = 0.28;
  box(monitor, [1.36, 0.068, 0.58], [0, 0.052, 0], black, 0.025);
  rod(monitor, [0, 0.08, 0], [0, 0.39, 0], 0.058, silver);
  box(monitor, [1.9, 1.01, 0.14], [0, 0.86, 0], black, 0.057);
  box(monitor, [1.77, 0.9, 0.039], [0, 0.85, 0.081], rubber, 0.019);
  const rt = new T.WebGLRenderTarget(512, 384, {
    colorSpace: T.SRGBColorSpace,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
  });
  const offsets = [new T.Vector2(0.2, 0.15), new T.Vector2(0.2, 0.15)];
  for (let i = 0; i < 2; i++) {
    const plate = new T.ShaderMaterial({
      uniforms: { uLens: { value: rt.texture }, uOrigin: { value: offsets[i] } },
      vertexShader:
        "varying vec2 screenUV; void main(){screenUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform sampler2D uLens; uniform vec2 uOrigin; varying vec2 screenUV;
    void main(){vec2 uv=screenUV*vec2(.58,.69)+uOrigin;gl_FragColor=texture2D(uLens,uv);
      #include <colorspace_fragment>
    }`,
    });
    mesh(monitor, new T.PlaneGeometry(0.79, 0.65), plate, [-0.418 + i * 0.837, 0.84, 0.112]);
    const ui = texture(240, 185, (c) => {
      c.strokeStyle = "#e0eadb";
      c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(108, 93);
      c.lineTo(116, 93);
      c.moveTo(124, 93);
      c.lineTo(132, 93);
      c.moveTo(120, 81);
      c.lineTo(120, 89);
      c.moveTo(120, 97);
      c.lineTo(120, 105);
      c.stroke();
      for (const [x, y, dx, dy] of [
        [10, 12, 1, 1],
        [230, 12, -1, 1],
        [10, 172, 1, -1],
        [230, 172, -1, -1],
      ]) {
        c.beginPath();
        c.moveTo(x + dx * 12, y);
        c.lineTo(x, y);
        c.lineTo(x, y + dy * 10);
        c.stroke();
      }
    });
    mesh(
      monitor,
      new T.PlaneGeometry(0.79, 0.65),
      new T.MeshBasicMaterial({ map: ui, transparent: true, depthWrite: false, toneMapped: false }),
      [-0.418 + i * 0.837, 0.84, 0.116],
    );
    placard(
      monitor,
      [-0.418 + i * 0.837, 1.247, 0.109],
      0.79,
      0.126,
      i ? "OIS" : "RAW",
      "",
      i ? "#b3e2bd" : "#ebd1a0",
      "#192628",
    );
  }
  const lens = new T.PerspectiveCamera(29, 512 / 384, 0.015, 50);
  scene.add(lens);
  let rendering = false,
    previous = -1;
  const subject = set.children.find((n) => n instanceof T.Group)!;
  // Render a real optical master frame once the sculptural asset arrives. Both measurements use identical magnification.
  scene.onBeforeRender = (renderer, _scene, cam) => {
    const loaded = subject.children.length;
    if (rendering || cam === lens || previous === loaded || !loaded) return;
    previous = loaded;
    rendering = true;
    const target = renderer.getRenderTarget(),
      prevShadow = renderer.shadowMap.autoUpdate,
      wasVisible = rig.visible;
    rig.visible = false;
    monitor.visible = false;
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, lens);
    } finally {
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate = prevShadow;
      monitor.visible = true;
      rig.visible = wasVisible;
      rendering = false;
    }
  };
  compact(base);
  const baseBearing = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const residual = new T.Quaternion(),
    angles = new T.Euler();
  const lensFrom = origin.clone().add(new T.Vector3(0, 0.48, 0));
  return {
    scene,
    camera: ws.camera,
    dispose() {
      scene.onBeforeRender = () => {};
      ws.dispose();
      rt.dispose();
    },
    update(s, aspect) {
      ws.compose(aspect);
      // Input measured on the carrier shakes the frame. Residual angles after OIS come from 780-pixel focal length.
      rig.rotation.x = s.deckRoll * 2.3;
      rig.rotation.z = -s.deckPitch * 2.3;
      const p = Math.atan(s.planeY / 780),
        q = Math.atan(s.planeX / 780);
      // The hood is mounted on the shaken carrier. Compute the gimbal command in that moving reference frame.
      residual.setFromEuler(angles.set(p * 2.3, -q * 2.3, 0, "YXZ"));
      gimbal.quaternion.copy(rig.quaternion).invert().multiply(baseBearing).multiply(residual);
      lens.position.copy(lensFrom);
      lens.lookAt(center);
      lens.updateMatrixWorld();
      // Measured displacement of a feature on the 780-pixel focal plane. Source texture is a 512-pixel crop.
      offsets[0].set(
        0.21 - (Math.tan(s.deckPitch) * 780) / 512,
        0.155 + (Math.tan(s.deckRoll) * 780) / 384,
      );
      offsets[1].set(0.21 - s.planeX / 512, 0.155 - s.planeY / 384);
    },
  };
}
