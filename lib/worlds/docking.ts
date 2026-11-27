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
  turn,
  wire,
  type XYZ,
} from "./experience-art";

export function createWorld(manager?: T.LoadingManager): WorldView {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(38, 2, 0.08, 1250);
  scene.background = new T.Color("#020810");
  scene.environmentIntensity = 0.58;
  scene.add(new T.HemisphereLight("#b4d6ff", "#3a5065", 1.5));
  sun(scene, [6, 9, 8], 3.25, "#fff2cf", 8);
  const loader = new T.TextureLoader(manager);
  const globe = mesh(
    scene,
    new T.SphereGeometry(163, 104, 70),
    new T.MeshStandardMaterial({
      map: finishTexture(loader.load("/worlds/docking/earth-day.jpg")),
      roughness: 1,
      metalness: 0,
      emissive: 0x063047,
      emissiveIntensity: 0.15,
    }),
    -54,
    -182,
    -137,
  );
  globe.castShadow = globe.receiveShadow = false;
  globe.rotation.set(0.17, 1.64, -0.28);
  const cloud = mesh(
    scene,
    new T.SphereGeometry(163.7, 96, 64),
    new T.MeshStandardMaterial({
      color: 0xffffff,
      alphaMap: loader.load("/worlds/docking/earth-clouds.jpg"),
      transparent: true,
      opacity: 0.94,
      roughness: 1,
      depthWrite: false,
    }),
    ...(globe.position.toArray() as XYZ),
  );
  cloud.castShadow = cloud.receiveShadow = false;
  cloud.rotation.copy(globe.rotation);
  const atm = mesh(
    scene,
    new T.SphereGeometry(165.1, 96, 64),
    new T.ShaderMaterial({
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader:
        "varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}",
      fragmentShader:
        "varying vec3 n;varying vec3 eye;void main(){float q=pow(1.-abs(dot(normalize(n),normalize(eye))),7.);gl_FragColor=vec4(.12,.58,1.,q*.88);}",
    }),
    ...(globe.position.toArray() as XYZ),
  );
  atm.castShadow = atm.receiveShadow = false;
  const noise = seeded(45),
    stars = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) {
    const phi = noise() * 2 * Math.PI,
      c = 2 * noise() - 1,
      s = Math.sqrt(1 - c * c);
    stars.set([s * Math.cos(phi) * 750, c * 750, s * Math.sin(phi) * 750], 3 * i);
  }
  const sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.BufferAttribute(stars, 3));
  scene.add(
    new T.Points(
      sg,
      new T.PointsMaterial({
        color: 0xc8e2ff,
        size: 0.65,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.76,
      }),
    ),
  );
  const white = mat("#cfcec3", 0.52, 0.44),
    silver = mat("#a3a9a8", 0.82, 0.32),
    metal = mat("#6b7380", 0.83, 0.33),
    grey = mat("#515963", 0.72, 0.5),
    dark = mat("#19212a", 0.61, 0.41),
    ceramic = mat("#dedad1", 0.23, 0.46),
    glass = mat("#182e3e", 0.77, 0.15),
    orange = mat("#c26a31", 0.46, 0.48),
    gold = mat("#b88d44", 0.75, 0.4),
    black = mat("#141924", 0.55, 0.53);
  const foil = tex((c, w, h) => {
    const r = seeded(932);
    c.fillStyle = "#968257";
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 2100; k++) {
      const x = r() * w,
        y = r() * h,
        shade = 65 + r() * 185;
      c.fillStyle = "rgba(" + shade + "," + shade * 0.91 + "," + shade * 0.68 + ",.34)";
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + r() * 37, y - r() * 12);
      c.lineTo(x + r() * 41, y + r() * 18);
      c.fill();
    }
  });
  foil.wrapS = foil.wrapT = T.RepeatWrapping;
  foil.repeat.set(5, 2);
  const blanket = new T.MeshStandardMaterial({
    color: 0xe5bd64,
    map: foil,
    bumpMap: foil,
    bumpScale: 0.04,
    metalness: 0.7,
    roughness: 0.55,
  });
  const arrayMap = tex(
    (c, w, h) => {
      const r = seeded(141);
      c.fillStyle = "#a3a7ac";
      c.fillRect(0, 0, w, h);
      for (let col = 0; col < 16; col++)
        for (let row = 0; row < 8; row++) {
          const x = (col * w) / 16,
            y = (row * h) / 8,
            a = 14 + r() * 22;
          c.fillStyle = "rgb(" + a + "," + (a + 16) + "," + (a + 46) + ")";
          c.fillRect(x + 0.7, y + 0.8, w / 16 - 1.4, h / 8 - 1.5);
          c.fillStyle = "#988367";
          c.fillRect(x + w / 32, y + 1, 0.9, h / 8 - 2);
          c.fillStyle = "#8392aa";
          for (let z = 1; z < 5; z++) c.fillRect(x + 1, y + (z * h) / 40, w / 16 - 2, 0.42);
        }
    },
    512,
    256,
  );
  const photovoltaic = new T.MeshStandardMaterial({
    map: arrayMap,
    roughness: 0.37,
    metalness: 0.56,
  });
  function array(g: T.Group, pos: XYZ, width: number, height: number, angle: number) {
    const frame = group(g, ...pos);
    frame.rotation.y = angle;
    box(frame, silver, [width + 0.08, height + 0.08, 0.065]);
    box(frame, photovoltaic, [width, height, 0.073]);
    for (let j = 1; j < 3; j++)
      box(frame, grey, [0.045, height + 0.1, 0.09], [-width / 2 + (j * width) / 3, 0, 0]);
  }
  function flange(g: T.Group, x: number, r: number) {
    turn(
      g,
      silver,
      [
        [0, x - 0.06],
        [r - 0.1, x - 0.06],
        [r, x - 0.045],
        [r, x + 0.045],
        [r - 0.1, x + 0.06],
        [0, x + 0.06],
      ],
      "x",
      [0, 0, 0],
    );
    ring(g, dark, r * 0.82, 0.033, "x", [x + 0.062, 0, 0]);
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      tube(
        g,
        metal,
        [x - 0.08, r * 0.91 * Math.cos(a), r * 0.91 * Math.sin(a)],
        [x + 0.083, r * 0.91 * Math.cos(a), r * 0.91 * Math.sin(a)],
        0.037,
        6,
      );
    }
  }
  const station = group(scene);
  station.name = "Research station";
  turn(
    station,
    white,
    [
      [0, -8.6],
      [1.05, -8.52],
      [1.22, -8.24],
      [1.24, -3.7],
      [1.02, -3.46],
      [0.78, -3.2],
      [0.77, -2.91],
      [0.7, -2.84],
      [0, -2.82],
    ],
    "x",
    [0, 0.1, 0],
  );
  for (const x of [-8.3, -7.6, -6.6, -5.6, -4.6, -3.7]) {
    ring(station, metal, 1.245, 0.046, "x", [x, 0.1, 0]);
    ring(station, silver, 1.25, 0.022, "x", [x + 0.1, 0.1, 0]);
  }
  for (let j = 0; j < 12; j++) {
    const a = (j * Math.PI) / 6;
    const y = 0.1 + 1.245 * Math.cos(a),
      z = 1.245 * Math.sin(a);
    tube(station, silver, [-8.18, y, z], [-3.78, y, z], 0.02, 6);
  }
  const aft = group(station, -6.1, 0.1, 0);
  for (const side of [-1, 1]) {
    const x = side * 0.32;
    box(aft, gold, [0.47, 1.0, 0.46], [x, side * 1.46, -0.14]);
    tube(aft, metal, [x, side * 1.62, -0.14], [x, side * 4.14, -0.14], 0.11);
    for (let j = 0; j < 2; j++)
      array(aft, [x + (j - 0.5) * 1.74, side * 3.55, -0.17], 1.67, 3.55, -0.19);
  }
  box(station, blanket, [1.78, 0.68, 1.26], [-5.2, 1.22, 0.04], 0.06);
  for (let i = 0; i < 6; i++) {
    box(station, ceramic, [0.078, 0.22, 0.88], [-5.92 + i * 0.27, 1.62, 0.03]);
  }
  for (const z of [0.71, -0.71]) {
    wire(
      station,
      silver,
      [
        [-6.55, 0.96, z],
        [-6.4, 1.36, z],
        [-3.86, 1.31, z],
        [-3.73, 0.93, z],
      ],
      0.037,
    );
  }
  placard(station, "ORBITAL  SCIENCE", [-5.35, 0.24, 1.25], 1.54, 0.24, "#29313a", "#e0ddd4");
  const collar = group(station, -2.78, 0.1, 0);
  turn(
    collar,
    blanket,
    [
      [0.52, -0.51],
      [0.82, -0.46],
      [0.78, -0.22],
      [0.78, 0.52],
      [0.65, 0.68],
      [0.55, 0.65],
    ],
    "x",
    [0, 0, 0],
  );
  for (const x of [-0.42, -0.25, 0.48, 0.63]) flange(collar, x, 0.83);
  tube(collar, black, [0.66, 0, 0], [0.72, 0, 0], 0.62, 48);
  ring(collar, silver, 0.6, 0.07, "x", [0.73, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const paw = box(
      collar,
      gold,
      [0.28, 0.17, 0.26],
      [0.79, 0.58 * Math.cos(a), 0.58 * Math.sin(a)],
      0.04,
    );
    paw.rotation.x = a;
  }
  batch(station);
  const craft = group(scene);
  craft.name = "Approaching research vehicle";
  turn(
    craft,
    ceramic,
    [
      [0, 0],
      [0.55, 0.01],
      [0.6, 0.18],
      [0.6, 0.32],
      [0.76, 0.42],
      [0.92, 0.56],
      [1.08, 0.79],
      [1.25, 1.1],
      [1.38, 1.49],
      [1.49, 2.0],
      [1.49, 2.14],
      [0, 2.14],
    ],
    "x",
    [0, 0, 0],
    80,
  );
  turn(
    craft,
    dark,
    [
      [1.49, 2.1],
      [1.53, 2.16],
      [1.52, 2.26],
      [1.18, 2.34],
      [1.16, 2.42],
      [1.28, 2.49],
      [1.28, 3.55],
      [1.11, 3.62],
      [0, 3.65],
    ],
    "x",
    [0, 0, 0],
  );
  turn(
    craft,
    blanket,
    [
      [1.2, 2.48],
      [1.29, 2.56],
      [1.29, 3.47],
      [1.23, 3.55],
    ],
    "x",
    [0, 0, 0],
  );
  for (const x of [0.1, 0.24]) flange(craft, x, 0.63);
  for (const x of [0.53, 1.51, 2.09, 2.29, 2.55, 3.51])
    ring(
      craft,
      x > 2.55 ? silver : grey,
      x < 0.6 ? 0.89 : x < 1.6 ? 1.39 : x < 2.25 ? 1.49 : x < 2.4 ? 1.24 : 1.29,
      0.023,
      "x",
      [x, 0, 0],
    );
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      rad = (r: number, x: number): XYZ => [x, r * Math.cos(a), r * Math.sin(a)];
    wire(
      craft,
      grey,
      [rad(0.74, 0.42), rad(1.03, 0.75), rad(1.35, 1.44), rad(1.493, 2.05)],
      0.014,
      14,
    );
  }
  for (const z of [-1, 1]) {
    const w = group(craft, 1.14, 0.73, z * 1.01);
    w.rotation.x = -z * 0.49;
    w.rotation.y = z * -0.45;
    box(w, metal, [0.51, 0.35, 0.05], [0, 0, 0], 0.08);
    box(w, glass, [0.43, 0.27, 0.06], [0, 0, z * 0.012], 0.07);
    const arm = group(craft, 3, 0.03, z * 1.24);
    arm.rotation.x = 0.52;
    tube(arm, silver, [0, 0, 0], [0.14, 0.03, z * 0.86], 0.075);
    for (let j = 0; j < 2; j++) {
      const p = group(arm, 0.16, 0, z * (1.52 + j * 1.72));
      p.rotation.y = 1.04;
      p.rotation.x = -0.19;
      p.rotation.z = 0.22;
      array(p, [0, 0, 0], 1.64, 1.65, 0);
    }
  }
  for (const z of [-1, 1]) {
    const hatch = group(craft, 1.72, -0.19, z * 1.438);
    hatch.rotation.y = z * -0.25;
    box(hatch, grey, [0.57, 0.76, 0.055], [0, 0, 0], 0.12);
    box(hatch, white, [0.5, 0.68, 0.061], [0, 0, z * 0.011], 0.095);
    box(hatch, glass, [0.27, 0.19, 0.073], [0, 0.14, z * 0.012], 0.05);
    box(hatch, gold, [0.11, 0.04, 0.076], [0.12, -0.14, z * 0.018], 0.01);
    for (let i = 0; i < 4; i++) {
      const y = 0.75 - i * 0.4;
      const zed = z * Math.sqrt(1.28 ** 2 - y * y);
      tube(craft, metal, [2.57, y, zed], [3.46, y, zed], 0.018, 8);
    }
  }
  for (const z of [-0.54, 0.54])
    for (const y of [-0.57, 0.57]) {
      turn(
        craft,
        grey,
        [
          [0.18, 3.49],
          [0.25, 3.65],
          [0.33, 3.88],
          [0.27, 3.9],
        ],
        "x",
        [0, y, z],
      );
    }
  for (const s of [-1, 1]) {
    box(craft, orange, [0.75, 0.13, 0.05], [1.8, 0.1, s * 1.47]);
    box(craft, silver, [0.51, 0.23, 0.11], [2.88, 0, s * 1.27], 0.03);
  }
  placard(craft, "HX  •  ORBITAL", [1.73, 0.32, 1.43], 0.79, 0.13, "#253643", "#d9d8ce");
  batch(craft);
  const marker = group(scene, -2.01, 0.1, 0);
  const led = glow("#dca552", 1.1);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    oval(marker, led, [0.022, 0.033, 0.033], [0.03, 0.78 * Math.cos(a), 0.78 * Math.sin(a)]);
  }
  batch(marker);
  return {
    scene,
    camera,
    update(f, aspect) {
      const gap = Math.max(0, 0.025 - f.deckZ);
      craft.position.set(-2.01 + gap * 83, 0.1 + f.planeY * 0.045, f.planeX * 0.055);
      craft.rotation.set(f.deckRoll, 0, f.deckPitch);
      led.color.set(f.metric < 3 ? "#4ce9b1" : "#dca552");
      led.emissive.copy(led.color);
      globe.rotation.y = 1.64 + f.t * 0.0008;
      cloud.rotation.y = 1.64 + f.t * 0.00097;
      fit(camera, aspect, [4.4, 3.18, 12.2], [-0.78, 0.21, 0], 36, 1.77);
    },
  };
}
